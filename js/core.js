/*
 * 풋살 팀 밸런서 — 순수 로직 (화면, 저장소와 무관).
 * 브라우저에서는 window.Core, Node 테스트에서는 require()로 사용한다.
 * file:// 로 열어도 동작하도록 ES 모듈 대신 일반 스크립트로 작성한다.
 */
(function (root) {
  'use strict';

  var STATS = [
    { key: 'stamina', label: '활동량' },
    { key: 'speed', label: '스피드' },
    { key: 'skill', label: '개인기' },
    { key: 'teamwork', label: '협동력' },
    { key: 'condition', label: '컨디션' },
  ];
  var MIN_LEVEL = 1;
  var MAX_LEVEL = 3;
  var DEFAULT_LEVEL = 2;
  var MIN_TEAM = 5;
  var MAX_TEAM = 7;
  var EMPTY_SLOTS = 2;
  var TEAM_COUNTS = [2, 3];
  var SCHEMA_VERSION = 1;
  var MODES = { balanced: '평준화', tiered: '전문화' };
  var WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

  function teamName(i) {
    return 'ABC'.charAt(i) + '팀';
  }

  // ---------------- 선수 ----------------

  function clampLevel(v) {
    v = Math.round(Number(v));
    if (!isFinite(v)) return DEFAULT_LEVEL;
    return Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, v));
  }

  function makePlayer(id, name, stats) {
    var s = {};
    STATS.forEach(function (st) {
      s[st.key] = stats && stats[st.key] != null ? clampLevel(stats[st.key]) : DEFAULT_LEVEL;
    });
    return { id: String(id), name: String(name), stats: s };
  }

  function copyPlayer(p) {
    return makePlayer(p.id, p.name, p.stats);
  }

  function total(p) {
    return STATS.reduce(function (a, st) { return a + p.stats[st.key]; }, 0);
  }

  function playerFromJson(j) {
    if (!j || typeof j !== 'object' || j.id == null || typeof j.name !== 'string') {
      throw new Error('선수 데이터 형식이 올바르지 않습니다.');
    }
    return makePlayer(j.id, j.name, j.stats || {});
  }

  function newId() {
    if (root.crypto && typeof root.crypto.randomUUID === 'function') {
      try { return root.crypto.randomUUID(); } catch (e) { /* file:// 등에서 막히면 아래로 */ }
    }
    return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  // ---------------- 팀 수와 인원 ----------------

  /** 참석 n명을 k팀으로 나눈다. 팀당 5~7명, 차이 최대 1명, 넘는 인원은 교체대기. 부족하면 null. */
  function planTeams(n, k) {
    if (n < MIN_TEAM * k) return null;
    var onTeams = Math.min(n, MAX_TEAM * k);
    var base = Math.floor(onTeams / k);
    var extra = onTeams % k;
    var sizes = [];
    for (var i = 0; i < k; i++) sizes.push(base + (i < extra ? 1 : 0));
    return { sizes: sizes, bench: n - onTeams };
  }

  function planText(plan) {
    var s = plan.sizes.map(function (n, i) { return teamName(i) + ' ' + n + '명'; }).join(' + ');
    return plan.bench ? s + ' + 교체대기 ' + plan.bench + '명' : s;
  }

  // ---------------- 편성 ----------------

  function shuffle(list, rnd) {
    for (var i = list.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = list[i]; list[i] = list[j]; list[j] = t;
    }
    return list;
  }

  /** 섞은 뒤 안정 정렬하므로 점수가 같은 선수끼리는 매번 순서가 달라진다. */
  function sortByTotalDesc(list) {
    var indexed = list.map(function (p, i) { return { p: p, i: i, t: total(p) }; });
    indexed.sort(function (a, b) { return b.t - a.t || a.i - b.i; });
    return indexed.map(function (x) { return x.p; });
  }

  function tiered(sorted, sizes) {
    var groups = [];
    var i = 0;
    sizes.forEach(function (size) {
      groups.push(sorted.slice(i, i + size));
      i += size;
    });
    return groups;
  }

  /** 평준화 비용 = 팀 1인당 평균 총점 차이 × 10 + 항목별 1인당 평균 차이의 합. */
  function balanceCost(groups) {
    function spread(values) {
      return Math.max.apply(null, values) - Math.min.apply(null, values);
    }
    function avg(g, f) {
      if (!g.length) return 0;
      return g.reduce(function (a, p) { return a + f(p); }, 0) / g.length;
    }
    var cost = spread(groups.map(function (g) { return avg(g, total); })) * 10;
    STATS.forEach(function (st) {
      cost += spread(groups.map(function (g) {
        return avg(g, function (p) { return p.stats[st.key]; });
      }));
    });
    return cost;
  }

  function balanced(sorted, sizes) {
    var k = sizes.length;
    var groups = sizes.map(function () { return []; });
    var forward = true;
    var idx = 0;
    while (idx < sorted.length) {
      for (var n = 0; n < k && idx < sorted.length; n++) {
        var t = forward ? n : k - 1 - n;
        if (groups[t].length < sizes[t]) groups[t].push(sorted[idx++]);
      }
      forward = !forward;
    }

    var improved = true;
    var guard = 0;
    while (improved && guard++ < 200) {
      improved = false;
      for (var a = 0; a < k; a++) {
        for (var b = a + 1; b < k; b++) {
          for (var i = 0; i < groups[a].length; i++) {
            for (var j = 0; j < groups[b].length; j++) {
              var before = balanceCost(groups);
              swap(groups, a, i, b, j);
              if (balanceCost(groups) < before - 1e-9) improved = true;
              else swap(groups, a, i, b, j);
            }
          }
        }
      }
    }
    return groups;
  }

  function swap(g, a, i, b, j) {
    var t = g[a][i]; g[a][i] = g[b][j]; g[b][j] = t;
  }

  /** 교체대기를 무작위로 뽑은 뒤 mode에 따라 팀을 편성한다. */
  function buildTeams(attendees, teamCount, mode, rnd) {
    var plan = planTeams(attendees.length, teamCount);
    if (!plan) throw new Error('참석 인원이 부족합니다.');
    rnd = rnd || Math.random;
    var pool = shuffle(attendees.slice(), rnd);
    var bench = pool.slice(0, plan.bench);
    var playing = sortByTotalDesc(pool.slice(plan.bench));
    var groups = mode === 'tiered' ? tiered(playing, plan.sizes) : balanced(playing, plan.sizes);
    return {
      teams: groups.map(function (players, i) {
        return { players: players, capacity: plan.sizes[i] + EMPTY_SLOTS };
      }),
      bench: bench,
    };
  }

  /** 시드로 재현 가능한 난수 (테스트용). */
  function seededRandom(seed) {
    var s = seed >>> 0 || 1;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------------- 팀 계산 ----------------

  function teamSum(team, key) {
    return team.players.reduce(function (a, p) { return a + p.stats[key]; }, 0);
  }

  function teamTotal(team) {
    return team.players.reduce(function (a, p) { return a + total(p); }, 0);
  }

  function emptySlots(team) {
    return Math.max(0, team.capacity - team.players.length);
  }

  function sizeValid(team) {
    return team.players.length >= MIN_TEAM && team.players.length <= MAX_TEAM;
  }

  function invalidTeams(lineup) {
    var bad = [];
    lineup.teams.forEach(function (t, i) { if (!sizeValid(t)) bad.push(teamName(i)); });
    return bad;
  }

  // ---------------- 편성 상태 (Lineup) ----------------

  function newLineup(dateKey) {
    return {
      date: dateKey,
      mode: 'balanced',
      teamCount: 2,
      attendees: [],
      teams: [],
      bench: [],
      confirmed: false,
      confirmedAt: null,
    };
  }

  function locate(lineup, id) {
    for (var t = 0; t < lineup.teams.length; t++) {
      var i = indexOfId(lineup.teams[t].players, id);
      if (i >= 0) return { team: t, index: i };
    }
    var b = indexOfId(lineup.bench, id);
    return b >= 0 ? { team: null, index: b } : null;
  }

  function indexOfId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return i;
    return -1;
  }

  function listOf(lineup, team) {
    return team == null ? lineup.bench : lineup.teams[team].players;
  }

  /**
   * 선수 이동. target = { team: 번호 또는 null(교체대기), swapWith: 선수 id 또는 null }.
   * 결과: 'moved' | 'swapped' | 'noSlot' | 'ignored'
   */
  function movePlayer(lineup, playerId, target) {
    if (lineup.confirmed || !lineup.teams.length) return 'ignored';
    var from = locate(lineup, playerId);
    if (!from) return 'ignored';
    var src = listOf(lineup, from.team);
    var toTeam = target.team == null ? null : target.team;

    if (target.swapWith != null && target.swapWith !== playerId) {
      var to = locate(lineup, target.swapWith);
      if (!to) return 'ignored';
      var other = listOf(lineup, to.team);
      var tmp = src[from.index];
      src[from.index] = other[to.index];
      other[to.index] = tmp;
      return 'swapped';
    }
    if (from.team === toTeam) return 'ignored';
    if (toTeam != null && emptySlots(lineup.teams[toTeam]) === 0) return 'noSlot';
    listOf(lineup, toTeam).push(src.splice(from.index, 1)[0]);
    return 'moved';
  }

  function lineupToJson(lineup) {
    return {
      schemaVersion: SCHEMA_VERSION,
      matchDate: lineup.date,
      mode: lineup.mode,
      teamCount: lineup.teamCount,
      confirmed: lineup.confirmed,
      confirmedAt: lineup.confirmedAt,
      attendees: lineup.attendees.slice(),
      teams: lineup.teams.map(function (t, i) {
        var totals = {};
        STATS.forEach(function (st) { totals[st.key] = teamSum(t, st.key); });
        totals.sum = teamTotal(t);
        return {
          name: teamName(i),
          capacity: t.capacity,
          players: t.players.map(copyPlayer),
          totals: totals,
        };
      }),
      bench: lineup.bench.map(copyPlayer),
    };
  }

  /** Flutter 버전과 같은 JSON 형식(schemaVersion 1)을 읽는다. 형식이 틀리면 예외. */
  function lineupFromJson(j) {
    if (!j || typeof j !== 'object') throw new Error('파일 형식이 올바르지 않습니다.');
    if (typeof j.schemaVersion !== 'number' || j.schemaVersion > SCHEMA_VERSION) {
      throw new Error('지원하지 않는 파일 형식입니다.');
    }
    if (typeof j.matchDate !== 'string' || !parseDateKey(j.matchDate)) {
      throw new Error('경기 날짜가 올바르지 않습니다.');
    }
    function players(list) {
      if (list == null) return [];
      if (!Array.isArray(list)) throw new Error('선수 목록 형식이 올바르지 않습니다.');
      return list.map(playerFromJson);
    }
    var teams = (Array.isArray(j.teams) ? j.teams : []).map(function (t) {
      var ps = players(t && t.players);
      var cap = Number(t && t.capacity);
      return { players: ps, capacity: isFinite(cap) && cap > 0 ? cap : ps.length + EMPTY_SLOTS };
    });
    if (teams.length > TEAM_COUNTS[TEAM_COUNTS.length - 1]) throw new Error('팀 수가 올바르지 않습니다.');
    var bench = players(j.bench);
    var attendees = Array.isArray(j.attendees)
      ? j.attendees.map(String)
      : teams.reduce(function (a, t) { return a.concat(t.players); }, []).concat(bench)
          .map(function (p) { return p.id; });
    var count = Number(j.teamCount) || teams.length;
    return {
      date: formatDateKey(parseDateKey(j.matchDate)),
      mode: j.mode === 'tiered' ? 'tiered' : 'balanced',
      teamCount: TEAM_COUNTS.indexOf(count) >= 0 ? count : 2,
      attendees: unique(attendees),
      teams: teams,
      bench: bench,
      confirmed: j.confirmed === true,
      confirmedAt: typeof j.confirmedAt === 'string' ? j.confirmedAt : null,
    };
  }

  function unique(list) {
    var seen = {};
    return list.filter(function (x) {
      if (seen[x]) return false;
      seen[x] = true;
      return true;
    });
  }

  // ---------------- 날짜 ----------------

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function formatDateKey(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function parseDateKey(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
    if (!m) return null;
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(d.getTime()) ? null : d;
  }

  /** "2026년 10월 11일 (일)" */
  function formatKoreanDate(key) {
    var d = parseDateKey(key);
    if (!d) return String(key);
    return d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일 (' +
      WEEKDAYS[d.getDay()] + ')';
  }

  var Core = {
    STATS: STATS,
    MIN_LEVEL: MIN_LEVEL,
    MAX_LEVEL: MAX_LEVEL,
    DEFAULT_LEVEL: DEFAULT_LEVEL,
    MIN_TEAM: MIN_TEAM,
    MAX_TEAM: MAX_TEAM,
    EMPTY_SLOTS: EMPTY_SLOTS,
    TEAM_COUNTS: TEAM_COUNTS,
    SCHEMA_VERSION: SCHEMA_VERSION,
    MODES: MODES,
    teamName: teamName,
    clampLevel: clampLevel,
    makePlayer: makePlayer,
    copyPlayer: copyPlayer,
    playerFromJson: playerFromJson,
    total: total,
    newId: newId,
    planTeams: planTeams,
    planText: planText,
    buildTeams: buildTeams,
    balanceCost: balanceCost,
    seededRandom: seededRandom,
    teamSum: teamSum,
    teamTotal: teamTotal,
    emptySlots: emptySlots,
    sizeValid: sizeValid,
    invalidTeams: invalidTeams,
    newLineup: newLineup,
    locate: locate,
    movePlayer: movePlayer,
    lineupToJson: lineupToJson,
    lineupFromJson: lineupFromJson,
    formatDateKey: formatDateKey,
    parseDateKey: parseDateKey,
    formatKoreanDate: formatKoreanDate,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Core;
  else root.Core = Core;
})(typeof window !== 'undefined' ? window : globalThis);
