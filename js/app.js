/*
 * 화면 동작: 상태 관리, 저장(localStorage), 이벤트 처리.
 */
(function () {
  'use strict';

  var C = window.Core;
  var O = window.Output;

  // ---------------- 저장소 ----------------

  var PLAYERS_KEY = 'futsal.players.v1';
  var LINEUP_PREFIX = 'futsal.lineup.v1.';

  var store = (function () {
    var mem = {};
    var ok = true;
    try {
      var probe = '__futsal_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
    } catch (e) {
      ok = false;
    }
    return {
      ok: ok,
      get: function (k) {
        if (!ok) return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;
        try { return window.localStorage.getItem(k); } catch (e) { return null; }
      },
      set: function (k, v) {
        if (!ok) { mem[k] = v; return; }
        try { window.localStorage.setItem(k, v); } catch (e) { toast('저장 공간이 부족해 저장하지 못했습니다.', true); }
      },
    };
  })();

  function loadPlayers() {
    try {
      var raw = JSON.parse(store.get(PLAYERS_KEY) || '[]');
      return Array.isArray(raw) ? raw.map(C.playerFromJson) : [];
    } catch (e) {
      return [];
    }
  }

  function savePlayers() {
    store.set(PLAYERS_KEY, JSON.stringify(state.players));
  }

  function loadLineup(dateKey) {
    var raw = store.get(LINEUP_PREFIX + dateKey);
    if (!raw) return null;
    try {
      return C.lineupFromJson(JSON.parse(raw));
    } catch (e) {
      return null;
    }
  }

  function saveLineup() {
    store.set(LINEUP_PREFIX + state.lineup.date, JSON.stringify(C.lineupToJson(state.lineup)));
  }

  // ---------------- 상태 ----------------

  var state = {
    tab: 'match',
    players: loadPlayers(),
    lineup: null,
    editingId: null,
    attFilter: '',
    playerFilter: '',
  };

  function today() {
    return C.formatDateKey(new Date());
  }

  function openDate(key) {
    state.lineup = loadLineup(key) || C.newLineup(key);
  }

  function locked() {
    return state.lineup.confirmed;
  }

  function hasTeams() {
    return state.lineup.teams.length > 0;
  }

  function attending() {
    var ids = state.lineup.attendees;
    return state.players.filter(function (p) { return ids.indexOf(p.id) >= 0; });
  }

  function currentPlan() {
    return C.planTeams(attending().length, state.lineup.teamCount);
  }

  function clearTeams() {
    state.lineup.teams = [];
    state.lineup.bench = [];
  }

  function changed() {
    saveLineup();
    render();
  }

  // ---------------- 선수 관리 ----------------

  function nameTaken(name, exceptId) {
    return state.players.some(function (p) { return p.id !== exceptId && p.name === name; });
  }

  function addPlayer(name) {
    name = name.trim();
    if (!name) return 'empty';
    if (nameTaken(name)) return 'dup';
    state.players.push(C.makePlayer(C.newId(), name));
    savePlayers();
    render();
    return 'ok';
  }

  function renamePlayer(id, name) {
    name = name.trim();
    var p = findPlayer(id);
    if (!p || !name) return 'empty';
    if (nameTaken(name, id)) return 'dup';
    p.name = name;
    savePlayers();
    return 'ok';
  }

  function setStat(id, key, level) {
    var p = findPlayer(id);
    if (!p) return;
    p.stats[key] = C.clampLevel(level);
    savePlayers();
    render();
  }

  function deletePlayer(id) {
    state.players = state.players.filter(function (p) { return p.id !== id; });
    var att = state.lineup.attendees;
    if (!locked() && att.indexOf(id) >= 0) {
      state.lineup.attendees = att.filter(function (x) { return x !== id; });
      clearTeams();
      saveLineup();
    }
    savePlayers();
    render();
  }

  function findPlayer(id) {
    for (var i = 0; i < state.players.length; i++) if (state.players[i].id === id) return state.players[i];
    return null;
  }

  // ---------------- 경기 편성 ----------------

  function selectDate(key) {
    if (!C.parseDateKey(key)) return;
    openDate(key);
    render();
  }

  function shiftDate(days) {
    var d = C.parseDateKey(state.lineup.date);
    d.setDate(d.getDate() + days);
    selectDate(C.formatDateKey(d));
  }

  function setTeamCount(k) {
    if (locked() || C.TEAM_COUNTS.indexOf(k) < 0 || state.lineup.teamCount === k) return;
    state.lineup.teamCount = k;
    clearTeams();
    changed();
  }

  function setMode(mode) {
    if (locked() || state.lineup.mode === mode) return;
    state.lineup.mode = mode;
    if (hasTeams() && currentPlan()) build();
    else changed();
  }

  function setAttending(id, on) {
    if (locked()) return;
    var att = state.lineup.attendees.filter(function (x) { return x !== id; });
    if (on) att.push(id);
    state.lineup.attendees = att;
    clearTeams();
    changed();
  }

  function setAllAttending(on) {
    if (locked()) return;
    state.lineup.attendees = on ? state.players.map(function (p) { return p.id; }) : [];
    clearTeams();
    changed();
  }

  function build() {
    if (locked()) return false;
    if (!currentPlan()) {
      toast(state.lineup.teamCount + '팀 경기 불가 (최소 ' + C.MIN_TEAM * state.lineup.teamCount + '명 필요)', true);
      return false;
    }
    var result = C.buildTeams(attending().map(C.copyPlayer), state.lineup.teamCount, state.lineup.mode);
    state.lineup.teams = result.teams;
    state.lineup.bench = result.bench;
    changed();
    return true;
  }

  function move(playerId, target) {
    var r = C.movePlayer(state.lineup, playerId, target);
    if (r === 'noSlot') toast('빈 슬롯이 없습니다. 선수 위에 놓아 맞바꾸세요.', true);
    if (r === 'moved' || r === 'swapped') changed();
  }

  function confirmLineup() {
    if (locked() || !hasTeams()) return;
    var bad = C.invalidTeams(state.lineup);
    if (bad.length) {
      showDialog('확정할 수 없습니다',
        bad.join(', ') + '의 인원이 ' + C.MIN_TEAM + '~' + C.MAX_TEAM + '명이 아닙니다.\n선수를 옮겨 인원을 맞춘 뒤 다시 확정하세요.',
        [{ label: '확인', primary: true }]);
      return;
    }
    state.lineup.confirmed = true;
    state.lineup.confirmedAt = new Date().toISOString();
    changed();
    downloadJson(C.lineupToJson(state.lineup), 'futsal_teams_' + state.lineup.date + '.json');
    toast('팀을 확정하고 futsal_teams_' + state.lineup.date + '.json 파일을 저장했습니다.');
  }

  function unlock() {
    if (!locked()) return;
    state.lineup.confirmed = false;
    changed();
    toast('편집할 수 있습니다. 수정 후 다시 [팀 확정]을 누르세요.');
  }

  /** 불러온 편성으로 교체한다. 명단에 없는 선수는 파일의 능력치로 추가한다. */
  function importLineup(imported) {
    var known = {};
    state.players.forEach(function (p) { known[p.id] = true; });
    var added = 0;
    imported.teams.forEach(function (t) {
      t.players.forEach(addUnknown);
    });
    imported.bench.forEach(addUnknown);

    function addUnknown(p) {
      if (known[p.id]) return;
      known[p.id] = true;
      var copy = C.copyPlayer(p);
      // 다른 선수가 같은 이름을 쓰고 있으면 이름 뒤에 표시를 붙인다.
      var base = copy.name;
      var n = 2;
      while (nameTaken(copy.name, copy.id)) copy.name = base + ' (' + n++ + ')';
      state.players.push(copy);
      added++;
    }

    imported.attendees = imported.attendees.filter(function (id) { return known[id]; });
    state.lineup = imported;
    if (added) savePlayers();
    saveLineup();
    render();
    return added;
  }

  // ---------------- 파일 ----------------

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function downloadJson(obj, filename) {
    downloadBlob(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }), filename);
  }

  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result)); };
      r.onerror = function () { reject(r.error); };
      r.readAsText(file, 'utf-8');
    });
  }

  function openLineupFile() {
    var input = $('lineupFile');
    input.value = '';
    input.click();
  }

  $('lineupFile').addEventListener('change', function () {
    var file = this.files && this.files[0];
    if (!file) return;
    readFile(file).then(function (text) {
      var lineup = C.lineupFromJson(JSON.parse(text.replace(/^﻿/, '')));
      var added = importLineup(lineup);
      showTab('match');
      var msg = C.formatKoreanDate(lineup.date) + ' 편성을 불러왔습니다.';
      if (added) msg += ' 명단에 없던 선수 ' + added + '명을 추가했습니다.';
      toast(msg);
    }).catch(function (e) {
      showDialog('파일을 읽을 수 없습니다',
        '팀 확정 때 저장한 futsal_teams_날짜.json 파일인지 확인하세요.\n(' + (e && e.message ? e.message : '알 수 없는 오류') + ')',
        [{ label: '확인', primary: true }]);
    });
  });

  function exportPlayers() {
    if (!state.players.length) {
      toast('내보낼 선수가 없습니다.', true);
      return;
    }
    downloadJson({ schemaVersion: 1, kind: 'players', exportedAt: new Date().toISOString(), players: state.players },
      'futsal_players_' + today() + '.json');
    toast('선수 ' + state.players.length + '명을 파일로 내보냈습니다.');
  }

  $('playersFile').addEventListener('change', function () {
    var file = this.files && this.files[0];
    if (!file) return;
    readFile(file).then(function (text) {
      var j = JSON.parse(text.replace(/^﻿/, ''));
      var list = Array.isArray(j) ? j : j && Array.isArray(j.players) ? j.players : null;
      if (!list) throw new Error('선수 명단 파일이 아닙니다.');
      var incoming = list.map(C.playerFromJson);
      var added = 0, updated = 0, skipped = 0;
      incoming.forEach(function (p) {
        var cur = findPlayer(p.id);
        if (cur) {
          if (!nameTaken(p.name, p.id)) cur.name = p.name;
          cur.stats = p.stats;
          updated++;
        } else if (nameTaken(p.name)) {
          skipped++;
        } else {
          state.players.push(p);
          added++;
        }
      });
      savePlayers();
      render();
      var msg = '추가 ' + added + '명, 갱신 ' + updated + '명';
      if (skipped) msg += ', 같은 이름이 있어 건너뜀 ' + skipped + '명';
      toast(msg);
    }).catch(function (e) {
      showDialog('파일을 읽을 수 없습니다',
        '[명단 내보내기]로 저장한 futsal_players_날짜.json 파일인지 확인하세요.\n(' + (e && e.message ? e.message : '알 수 없는 오류') + ')',
        [{ label: '확인', primary: true }]);
    });
  });

  function downloadPdf() {
    if (!locked()) {
      toast('팀을 확정한 뒤 출력할 수 있습니다.', true);
      return;
    }
    downloadBlob(O.lineupPdf(state.lineup), 'futsal_teams_' + state.lineup.date + '.pdf');
    toast('futsal_teams_' + state.lineup.date + '.pdf 파일을 저장했습니다.');
  }

  // ---------------- 공유 ----------------

  var shareBlob = null;
  var shareUrl = null;

  function openShare() {
    if (!locked()) {
      toast('팀을 확정한 뒤 공유할 수 있습니다.', true);
      return;
    }
    O.canvasToBlob(O.renderShareImage(state.lineup)).then(function (blob) {
      shareBlob = blob;
      if (shareUrl) URL.revokeObjectURL(shareUrl);
      shareUrl = URL.createObjectURL(blob);
      $('shareImg').src = shareUrl;
      setShareMsg('[이미지 복사] 후 카카오톡 대화창에 Ctrl+V로 붙여 넣으세요.', '');
      openModal('shareModal');
    }).catch(function () {
      toast('이미지를 만들 수 없습니다.', true);
    });
  }

  function setShareMsg(text, cls) {
    var el = $('shareMsg');
    el.textContent = text;
    el.className = 'hint' + (cls ? ' ' + cls : '');
  }

  function copyShareImage() {
    if (!shareBlob) return;
    var canClip = navigator.clipboard && typeof navigator.clipboard.write === 'function' &&
      typeof window.ClipboardItem === 'function';
    var attempt = canClip
      ? navigator.clipboard.write([new window.ClipboardItem({ 'image/png': shareBlob })])
      : Promise.reject(new Error('clipboard'));
    attempt.then(function () {
      setShareMsg('복사했습니다. 카카오톡 대화창에 Ctrl+V로 붙여 넣으세요.', 'ok');
    }).catch(function () {
      var file = new File([shareBlob], 'futsal_teams_' + state.lineup.date + '.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file] }).then(function () {
          setShareMsg('공유했습니다.', 'ok');
        }).catch(function () {
          setShareMsg('이미지 복사를 할 수 없습니다. [이미지 저장]으로 PNG 파일을 받으세요.', 'bad');
        });
      } else {
        setShareMsg('이 브라우저는 이미지 복사를 지원하지 않습니다. [이미지 저장]으로 PNG 파일을 받으세요.', 'bad');
      }
    });
  }

  function saveShareImage() {
    if (!shareBlob) return;
    downloadBlob(shareBlob, 'futsal_teams_' + state.lineup.date + '.png');
    setShareMsg('futsal_teams_' + state.lineup.date + '.png 파일을 저장했습니다.', 'ok');
  }

  // ---------------- 창과 알림 ----------------

  function $(id) { return document.getElementById(id); }

  var toastTimer = null;
  function toast(text, bad) {
    var el = $('toast');
    el.textContent = text;
    el.className = 'toast on' + (bad ? ' bad' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = 'toast' + (bad ? ' bad' : ''); }, 3200);
  }

  var lastFocus = null;
  function openModal(id) {
    lastFocus = document.activeElement;
    $(id).hidden = false;
    var focusable = $(id).querySelector('.btn.primary') || $(id).querySelector('button');
    if (focusable) focusable.focus();
  }

  function closeModal(id) {
    $(id).hidden = true;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function openModalId() {
    var ids = ['dialog', 'shareModal', 'helpModal'];
    for (var i = 0; i < ids.length; i++) if (!$(ids[i]).hidden) return ids[i];
    return null;
  }

  /** actions: [{ label, primary, danger, run }] */
  function showDialog(title, body, actions) {
    $('dialogTitle').textContent = title;
    $('dialogBody').textContent = body;
    var box = $('dialogActions');
    box.innerHTML = '';
    actions.forEach(function (a) {
      var b = document.createElement('button');
      b.className = 'btn' + (a.primary ? ' primary' : '') + (a.danger ? ' danger solid' : '');
      b.textContent = a.label;
      b.addEventListener('click', function () {
        closeModal('dialog');
        if (a.run) a.run();
      });
      box.appendChild(b);
    });
    openModal('dialog');
    var def = box.querySelector('.primary, .danger') || box.querySelector('button');
    if (def) def.focus();
  }

  document.querySelectorAll('.modal').forEach(function (m) {
    m.addEventListener('click', function (e) {
      if (e.target === m || (e.target.closest && e.target.closest('[data-close]'))) closeModal(m.id);
    });
  });

  // ---------------- 그리기 ----------------

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function matches(name, filter) {
    return !filter || name.toLowerCase().indexOf(filter.toLowerCase()) >= 0;
  }

  function render() {
    renderMatch();
    renderPlayers();
    if (state.tab === 'preview') renderPreview();
  }

  function renderMatch() {
    var L = state.lineup;
    var isLocked = locked();
    var plan = currentPlan();
    var n = attending().length;

    $('date').value = L.date;
    $('dateLabel').textContent = C.formatKoreanDate(L.date);
    setSeg('teamCount', 'k', String(L.teamCount), isLocked);
    setSeg('mode', 'm', L.mode, isLocked);
    $('screen-match').classList.toggle('locked', isLocked);

    // 참석 체크
    $('attCount').textContent = n + '/' + state.players.length;
    $('allOn').disabled = isLocked || !state.players.length;
    $('allOff').disabled = isLocked || !n;
    var list = state.players.filter(function (p) { return matches(p.name, state.attFilter); });
    if (!state.players.length) {
      $('attList').innerHTML = '<div class="empty">[선수 관리]에서 선수를 먼저 등록하세요.</div>';
    } else if (!list.length) {
      $('attList').innerHTML = '<div class="empty">검색 결과가 없습니다.</div>';
    } else {
      $('attList').innerHTML = list.map(function (p) {
        var on = L.attendees.indexOf(p.id) >= 0;
        return '<label><input type="checkbox" data-id="' + esc(p.id) + '"' + (on ? ' checked' : '') +
          (isLocked ? ' disabled' : '') + '> ' + esc(p.name) + '<small>' + C.total(p) + '점</small></label>';
      }).join('');
    }

    // 상태 안내
    var st = $('status');
    if (!plan) {
      st.className = 'status bad';
      st.textContent = '참석 ' + n + '명 · ' + L.teamCount + '팀 경기 불가 (최소 ' + C.MIN_TEAM * L.teamCount + '명 필요)';
    } else {
      st.className = 'status';
      st.innerHTML = esc('참석 ' + n + '명 → ' + C.planText(plan)) +
        (hasTeams() ? '<span class="diff">' + esc(diffText()) + '</span>' : '');
    }
    if (isLocked && hasTeams()) {
      st.className = 'status';
      st.innerHTML = esc('참석 ' + n + '명') + '<span class="diff">' + esc(diffText()) + '</span>';
    }

    // 확정 안내
    $('lockedBanner').hidden = !isLocked;
    if (isLocked) {
      var at = L.confirmedAt ? new Date(L.confirmedAt) : null;
      $('lockedBanner').textContent = '확정된 편성입니다' +
        (at && !isNaN(at.getTime()) ? ' (' + at.toLocaleString('ko-KR') + ')' : '') +
        '. 바꾸려면 [수정]을 누르세요.';
    }

    // 버튼
    $('buildBtn').disabled = isLocked || !plan;
    $('buildBtn').textContent = hasTeams() && !isLocked ? '다시 구성' : '팀 구성';
    $('confirmBtn').hidden = isLocked;
    $('confirmBtn').disabled = !hasTeams();
    $('unlockBtn').hidden = !isLocked;
    $('printBtn').disabled = !isLocked;
    $('shareBtn').disabled = !isLocked;
    $('dragHelp').hidden = isLocked || !hasTeams();

    renderTeams();
  }

  function diffText() {
    var totals = state.lineup.teams.map(C.teamTotal);
    if (totals.length < 2) return '';
    return '팀 총점 ' + totals.join(' / ') + ' (차이 ' + (Math.max.apply(null, totals) - Math.min.apply(null, totals)) + '점)';
  }

  function setSeg(id, attr, value, disabled) {
    $(id).querySelectorAll('button').forEach(function (b) {
      b.classList.toggle('on', b.dataset[attr] === value);
      b.disabled = disabled;
    });
  }

  function renderTeams() {
    var L = state.lineup;
    var isLocked = locked();
    if (!hasTeams()) {
      $('teams').innerHTML = '';
      return;
    }
    var html = L.teams.map(function (t, i) {
      return teamCard(t.players, C.teamName(i), 'var(--team' + 'ABC'.charAt(i) + ')', String(i),
        isLocked ? 0 : C.emptySlots(t), !C.sizeValid(t), true);
    }).join('');
    if (L.bench.length || !isLocked) {
      html += teamCard(L.bench, '교체대기', 'var(--bench)', 'bench', 0, false, false);
    }
    $('teams').innerHTML = html;
  }

  function teamCard(players, title, color, key, slots, warn, showStats) {
    var isLocked = locked();
    var total = players.reduce(function (a, p) { return a + C.total(p); }, 0);
    var items = players.map(function (p) {
      return '<li class="player" draggable="' + !isLocked + '" data-id="' + esc(p.id) + '" title="' +
        esc(C.STATS.map(function (s) { return s.label + ' ' + p.stats[s.key]; }).join(' · ')) + '">' +
        '<span>' + esc(p.name) + '</span><span class="score">' + C.total(p) + '</span></li>';
    }).join('');
    for (var i = 0; i < slots; i++) items += '<li class="slot">빈 슬롯</li>';
    if (key === 'bench' && !players.length && !isLocked) {
      items += '<li class="drop-hint">여기에 놓으면 교체대기로 이동</li>';
    }
    var stats = '';
    if (showStats) {
      stats = '<div class="stats">' + C.STATS.map(function (s) {
        var sum = players.reduce(function (a, p) { return a + p.stats[s.key]; }, 0);
        return '<div><b>' + sum + '</b>' + s.label + '</div>';
      }).join('') + '</div>';
    }
    return '<div class="team" style="--tc:' + color + '" data-key="' + key + '">' +
      '<h3><b>' + title + '</b><span>' + players.length + '명' + (showStats ? ' · 총점 ' + total : '') + '</span></h3>' +
      (warn ? '<div class="warn">팀 인원은 ' + C.MIN_TEAM + '~' + C.MAX_TEAM + '명이어야 합니다</div>' : '') +
      '<ul>' + items + '</ul>' + stats + '</div>';
  }

  function renderPlayers() {
    var list = state.players.filter(function (p) { return matches(p.name, state.playerFilter); });
    $('playerCount').textContent = state.players.length + '명';
    $('playersEmpty').hidden = state.players.length > 0;
    $('playersEmpty').textContent = '등록된 선수가 없습니다. 위에서 이름을 입력해 선수를 추가하세요.';
    if (state.players.length && !list.length) {
      $('playersEmpty').hidden = false;
      $('playersEmpty').textContent = '검색 결과가 없습니다.';
    }
    $('playerRows').innerHTML = list.map(function (p) {
      var no = state.players.indexOf(p) + 1;
      var name = state.editingId === p.id
        ? '<input class="input" data-edit="' + esc(p.id) + '" value="' + esc(p.name) + '" maxlength="20">'
        : esc(p.name);
      var cells = C.STATS.map(function (s) {
        var btns = [1, 2, 3].map(function (v) {
          return '<button class="' + (p.stats[s.key] === v ? 'on' : '') + '" data-id="' + esc(p.id) +
            '" data-k="' + s.key + '" data-v="' + v + '" aria-label="' + esc(p.name + ' ' + s.label + ' ' + v) +
            '" aria-pressed="' + (p.stats[s.key] === v) + '">' + v + '</button>';
        }).join('');
        return '<td><span class="lv">' + btns + '</span></td>';
      }).join('');
      var act = state.editingId === p.id
        ? '<button class="btn small primary" data-save="' + esc(p.id) + '">저장</button><button class="btn small" data-cancel="1">취소</button>'
        : '<button class="btn small" data-rename="' + esc(p.id) + '">수정</button><button class="btn small danger" data-del="' + esc(p.id) + '">삭제</button>';
      return '<tr data-row="' + esc(p.id) + '"><td class="col-no">' + no + '</td><td class="name" data-name="' + esc(p.id) + '">' + name + '</td>' +
        cells + '<td class="sum">' + C.total(p) + '</td><td class="act">' + act + '</td></tr>';
    }).join('');
    var editing = document.querySelector('[data-edit]');
    if (editing && document.activeElement !== editing) {
      editing.focus();
      editing.select();
    }
  }

  function renderPreview() {
    var box = $('preview');
    $('previewPdfBtn').disabled = !locked();
    if (!locked()) {
      box.innerHTML = '<p class="empty">[경기 편성]에서 팀 구성 → 팀 확정을 누르면 여기에 편성표가 표시됩니다.<br>' +
        '현재 경기일: ' + esc(C.formatKoreanDate(state.lineup.date)) + '</p>';
      return;
    }
    box.innerHTML = '';
    O.renderLineupPages(state.lineup).forEach(function (c) { box.appendChild(c); });
  }

  // ---------------- 탭 ----------------

  function showTab(tab) {
    state.tab = tab;
    document.querySelectorAll('.tabs button').forEach(function (b) {
      var on = b.dataset.tab === tab;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on);
    });
    document.querySelectorAll('.screen').forEach(function (s) {
      s.classList.toggle('on', s.id === 'screen-' + tab);
    });
    if (tab === 'preview') renderPreview();
  }

  document.querySelectorAll('.tabs button').forEach(function (b) {
    b.addEventListener('click', function () { showTab(b.dataset.tab); });
  });

  // ---------------- 이벤트: 경기 편성 ----------------

  $('date').addEventListener('change', function () {
    if (this.value) selectDate(this.value);
  });
  $('todayBtn').addEventListener('click', function () { selectDate(today()); });
  $('teamCount').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (b) setTeamCount(Number(b.dataset.k));
  });
  $('mode').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (b) setMode(b.dataset.m);
  });
  $('attList').addEventListener('change', function (e) {
    if (e.target.dataset.id) setAttending(e.target.dataset.id, e.target.checked);
  });
  $('attSearch').addEventListener('input', function () {
    state.attFilter = this.value.trim();
    renderMatch();
  });
  $('allOn').addEventListener('click', function () { setAllAttending(true); });
  $('allOff').addEventListener('click', function () { setAllAttending(false); });
  $('buildBtn').addEventListener('click', build);
  $('confirmBtn').addEventListener('click', confirmLineup);
  $('unlockBtn').addEventListener('click', unlock);
  $('loadBtn').addEventListener('click', openLineupFile);
  $('printBtn').addEventListener('click', downloadPdf);
  $('previewPdfBtn').addEventListener('click', downloadPdf);
  $('shareBtn').addEventListener('click', openShare);
  $('copyImg').addEventListener('click', copyShareImage);
  $('saveImg').addEventListener('click', saveShareImage);

  // 드래그 앤 드롭
  var dragId = null;
  var teamsEl = $('teams');

  function dropTarget(e) {
    var card = e.target.closest && e.target.closest('.team');
    if (!card) return null;
    var li = e.target.closest('li');
    var key = card.dataset.key;
    return {
      card: card,
      li: li && (li.classList.contains('player') || li.classList.contains('slot')) ? li : null,
      team: key === 'bench' ? null : Number(key),
      swapWith: li && li.classList.contains('player') ? li.dataset.id : null,
    };
  }

  function clearOver() {
    teamsEl.querySelectorAll('.over').forEach(function (el) { el.classList.remove('over'); });
  }

  teamsEl.addEventListener('dragstart', function (e) {
    var li = e.target.closest && e.target.closest('li.player');
    if (!li || locked()) {
      e.preventDefault();
      return;
    }
    dragId = li.dataset.id;
    li.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', dragId); } catch (err) { /* 일부 브라우저 */ }
  });
  teamsEl.addEventListener('dragend', function () {
    dragId = null;
    clearOver();
    teamsEl.querySelectorAll('.dragging').forEach(function (el) { el.classList.remove('dragging'); });
  });
  teamsEl.addEventListener('dragover', function (e) {
    if (!dragId) return;
    var t = dropTarget(e);
    if (!t) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    clearOver();
    t.card.classList.add('over');
    if (t.li && t.li.dataset.id !== dragId) t.li.classList.add('over');
  });
  teamsEl.addEventListener('dragleave', function (e) {
    if (!teamsEl.contains(e.relatedTarget)) clearOver();
  });
  teamsEl.addEventListener('drop', function (e) {
    if (!dragId) return;
    var t = dropTarget(e);
    e.preventDefault();
    clearOver();
    if (!t) return;
    var id = dragId;
    dragId = null;
    move(id, { team: t.team, swapWith: t.swapWith });
  });

  // ---------------- 이벤트: 선수 관리 ----------------

  $('addForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var input = $('newName');
    var r = addPlayer(input.value);
    if (r === 'dup') toast('이미 같은 이름의 선수가 있습니다.', true);
    if (r === 'ok') {
      toast(input.value.trim() + ' 선수를 추가했습니다.');
      input.value = '';
    }
    input.focus();
  });
  $('playerSearch').addEventListener('input', function () {
    state.playerFilter = this.value.trim();
    renderPlayers();
  });
  $('exportPlayers').addEventListener('click', exportPlayers);
  $('importPlayers').addEventListener('click', function () {
    var input = $('playersFile');
    input.value = '';
    input.click();
  });

  function startEdit(id) {
    state.editingId = id;
    renderPlayers();
  }

  function finishEdit(save) {
    var input = document.querySelector('[data-edit]');
    if (save && input) {
      var r = renamePlayer(input.dataset.edit, input.value);
      if (r === 'dup') {
        toast('이미 같은 이름의 선수가 있습니다.', true);
        input.focus();
        return;
      }
      if (r === 'empty') {
        toast('이름을 입력하세요.', true);
        input.focus();
        return;
      }
    }
    state.editingId = null;
    render();
  }

  $('playerRows').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    var d = b.dataset;
    if (d.v) setStat(d.id, d.k, Number(d.v));
    else if (d.rename) startEdit(d.rename);
    else if (d.save) finishEdit(true);
    else if (d.cancel) finishEdit(false);
    else if (d.del) {
      var p = findPlayer(d.del);
      if (!p) return;
      showDialog('선수 삭제', p.name + ' 선수를 삭제할까요?\n삭제하면 참석 체크에서도 빠집니다.', [
        { label: '취소' },
        { label: '삭제', danger: true, run: function () { deletePlayer(p.id); toast(p.name + ' 선수를 삭제했습니다.'); } },
      ]);
    }
  });
  $('playerRows').addEventListener('dblclick', function (e) {
    var td = e.target.closest('td.name');
    if (td && !state.editingId) startEdit(td.dataset.name);
  });
  $('playerRows').addEventListener('keydown', function (e) {
    if (!e.target.dataset.edit) return;
    if (e.key === 'Enter') { e.preventDefault(); finishEdit(true); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finishEdit(false); }
  });

  // ---------------- 단축키 ----------------

  function typing(el) {
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'F1') {
      e.preventDefault();
      window.open('manual.html', '_blank', 'noopener');
      return;
    }
    var modal = openModalId();
    if (e.key === 'Escape' && modal) {
      e.preventDefault();
      closeModal(modal);
      return;
    }
    if (modal) return;

    var ctrl = e.ctrlKey || e.metaKey;
    if (e.altKey && !ctrl && ['1', '2', '3'].indexOf(e.key) >= 0) {
      e.preventDefault();
      showTab(['match', 'players', 'preview'][Number(e.key) - 1]);
      return;
    }
    if (ctrl && !e.altKey) {
      var k = e.key.toLowerCase();
      if (e.key === 'Enter') {
        e.preventDefault();
        showTab('match');
        build();
      } else if (k === 's') {
        e.preventDefault();
        if (locked()) toast('이미 확정된 편성입니다.');
        else if (!hasTeams()) toast('먼저 팀을 구성하세요.', true);
        else confirmLineup();
      } else if (k === 'o') {
        e.preventDefault();
        openLineupFile();
      } else if (k === 'p') {
        e.preventDefault();
        downloadPdf();
      }
      return;
    }
    if (typing(e.target) || e.altKey) return;
    if (e.key === '?') {
      e.preventDefault();
      openModal('helpModal');
    } else if (e.key === '/') {
      e.preventDefault();
      if (state.tab === 'players') $('playerSearch').focus();
      else { showTab('match'); $('attSearch').focus(); }
    } else if (e.key === '[' && state.tab === 'match') {
      shiftDate(-1);
    } else if (e.key === ']' && state.tab === 'match') {
      shiftDate(1);
    }
  });

  $('helpBtn').addEventListener('click', function () { openModal('helpModal'); });

  // 다른 창(탭)에서 바꾼 내용 반영
  window.addEventListener('storage', function (e) {
    if (e.key === PLAYERS_KEY) state.players = loadPlayers();
    if (e.key === LINEUP_PREFIX + state.lineup.date) openDate(state.lineup.date);
    if (e.key === PLAYERS_KEY || e.key === LINEUP_PREFIX + state.lineup.date) render();
  });

  // ---------------- 시작 ----------------

  $('storageNotice').hidden = store.ok;
  openDate(today());
  render();

  // 자동 점검(테스트)용으로 내부 상태를 노출한다.
  window.FutsalApp = { state: state, render: render };
})();
