// 실행: node --test test/*.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/core.js');

function makePlayers(n, seed = 1) {
  const rnd = C.seededRandom(seed);
  return Array.from({ length: n }, (_, i) => {
    const stats = {};
    C.STATS.forEach((s) => { stats[s.key] = 1 + Math.floor(rnd() * 3); });
    return C.makePlayer('p' + i, '선수' + i, stats);
  });
}

function lineupWith(players, teamCount, mode, seed = 3) {
  const L = C.newLineup('2026-10-11');
  L.teamCount = teamCount;
  L.mode = mode;
  L.attendees = players.map((p) => p.id);
  const r = C.buildTeams(players, teamCount, mode, C.seededRandom(seed));
  L.teams = r.teams;
  L.bench = r.bench;
  return L;
}

test('planTeams: 확정 표와 같은 결과', () => {
  const cases = [
    [9, 2, null, 0], [10, 2, [5, 5], 0], [11, 2, [6, 5], 0], [13, 2, [7, 6], 0],
    [14, 2, [7, 7], 0], [15, 2, [7, 7], 1], [16, 2, [7, 7], 2], [18, 2, [7, 7], 4],
    [23, 2, [7, 7], 9], [14, 3, null, 0], [15, 3, [5, 5, 5], 0], [16, 3, [6, 5, 5], 0],
    [18, 3, [6, 6, 6], 0], [20, 3, [7, 7, 6], 0], [21, 3, [7, 7, 7], 0], [23, 3, [7, 7, 7], 2],
  ];
  for (const [n, k, sizes, bench] of cases) {
    const plan = C.planTeams(n, k);
    if (sizes === null) assert.equal(plan, null, `${n}명 ${k}팀`);
    else assert.deepEqual(plan, { sizes, bench }, `${n}명 ${k}팀`);
  }
});

test('planTeams: 0~40명 전 구간에서 팀당 5~7명, 차이 최대 1명', () => {
  for (const k of C.TEAM_COUNTS) {
    for (let n = 0; n <= 40; n++) {
      const plan = C.planTeams(n, k);
      if (n < 5 * k) { assert.equal(plan, null); continue; }
      assert.equal(plan.sizes.length, k);
      assert.ok(plan.sizes.every((s) => s >= 5 && s <= 7));
      assert.ok(Math.max(...plan.sizes) - Math.min(...plan.sizes) <= 1);
      assert.equal(plan.sizes.reduce((a, b) => a + b, 0) + plan.bench, n);
    }
  }
});

test('planText', () => {
  assert.equal(C.planText(C.planTeams(16, 2)), 'A팀 7명 + B팀 7명 + 교체대기 2명');
  assert.equal(C.planText(C.planTeams(16, 3)), 'A팀 6명 + B팀 5명 + C팀 5명');
});

test('buildTeams: 모든 참석자가 정확히 한 번씩 배정되고 정원은 인원+2', () => {
  for (const mode of ['balanced', 'tiered']) {
    for (const [n, k] of [[18, 2], [16, 3], [23, 3], [10, 2]]) {
      const r = C.buildTeams(makePlayers(n), k, mode, C.seededRandom(n));
      const ids = r.teams.flatMap((t) => t.players.map((p) => p.id)).concat(r.bench.map((p) => p.id));
      assert.equal(ids.length, n);
      assert.equal(new Set(ids).size, n);
      const plan = C.planTeams(n, k);
      assert.deepEqual(r.teams.map((t) => t.players.length), plan.sizes);
      assert.equal(r.bench.length, plan.bench);
      r.teams.forEach((t, i) => assert.equal(t.capacity, plan.sizes[i] + 2));
    }
  }
});

test('buildTeams: 인원 부족이면 예외', () => {
  assert.throws(() => C.buildTeams(makePlayers(9), 2, 'balanced'));
  assert.throws(() => C.buildTeams(makePlayers(14), 3, 'balanced'));
});

test('평준화: 팀 총점 차이가 작다 (같은 인원)', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const r = C.buildTeams(makePlayers(14, seed), 2, 'balanced', C.seededRandom(seed));
    const totals = r.teams.map(C.teamTotal);
    assert.ok(Math.abs(totals[0] - totals[1]) <= 3, `seed ${seed}: ${totals}`);
  }
});

test('평준화: 스네이크 드래프트보다 비용이 크지 않다', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const ps = makePlayers(18, seed);
    const r = C.buildTeams(ps, 3, 'balanced', C.seededRandom(seed));
    const tiered = C.buildTeams(ps, 3, 'tiered', C.seededRandom(seed));
    assert.ok(C.balanceCost(r.teams.map((t) => t.players)) <= C.balanceCost(tiered.teams.map((t) => t.players)));
  }
});

test('전문화: A팀 최저점 >= B팀 최고점 >= ... ', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const r = C.buildTeams(makePlayers(21, seed), 3, 'tiered', C.seededRandom(seed));
    for (let i = 0; i + 1 < r.teams.length; i++) {
      const minA = Math.min(...r.teams[i].players.map(C.total));
      const maxB = Math.max(...r.teams[i + 1].players.map(C.total));
      assert.ok(minA >= maxB);
    }
  }
});

test('교체대기는 무작위로 뽑힌다', () => {
  const ps = makePlayers(18);
  const seen = new Set();
  for (let seed = 1; seed <= 20; seed++) {
    const r = C.buildTeams(ps, 2, 'balanced', C.seededRandom(seed));
    seen.add(r.bench.map((p) => p.id).sort().join(','));
  }
  assert.ok(seen.size > 5);
});

test('movePlayer: 빈 슬롯 이동, 맞바꾸기, 교체대기, 빈 슬롯 없음', () => {
  const L = lineupWith(makePlayers(16), 2, 'balanced');
  const a0 = L.teams[0].players[0].id;
  assert.equal(C.movePlayer(L, a0, { team: 1 }), 'moved');
  assert.equal(L.teams[0].players.length, 6);
  assert.equal(L.teams[1].players.length, 8);
  assert.equal(C.emptySlots(L.teams[0]), 3);
  assert.equal(C.emptySlots(L.teams[1]), 1);
  assert.deepEqual(C.invalidTeams(L), ['B팀']);

  const a2 = L.teams[0].players[0].id;
  assert.equal(C.movePlayer(L, a2, { team: 1 }), 'moved');
  assert.equal(C.emptySlots(L.teams[1]), 0);
  // 빈 슬롯이 없는 팀으로는 이동 불가
  const a1 = L.teams[0].players[1].id;
  assert.equal(C.movePlayer(L, a1, { team: 1 }), 'noSlot');

  // 맞바꾸기
  const target = L.teams[1].players[0].id;
  assert.equal(C.movePlayer(L, a1, { team: 1, swapWith: target }), 'swapped');
  assert.equal(C.locate(L, a1).team, 1);
  assert.equal(C.locate(L, target).team, 0);

  // 교체대기로 이동은 제한 없음
  const before = L.bench.length;
  assert.equal(C.movePlayer(L, a1, { team: null }), 'moved');
  assert.equal(L.bench.length, before + 1);
  // 교체대기 → 팀 선수와 맞바꾸기
  const benchId = L.bench[0].id;
  const teamId = L.teams[0].players[0].id;
  assert.equal(C.movePlayer(L, benchId, { team: 0, swapWith: teamId }), 'swapped');
  assert.equal(C.locate(L, benchId).team, 0);
  assert.equal(C.locate(L, teamId).team, null);

  // 같은 곳에 놓으면 무시
  assert.equal(C.movePlayer(L, teamId, { team: null }), 'ignored');
});

test('movePlayer: 확정 후에는 이동 불가', () => {
  const L = lineupWith(makePlayers(10), 2, 'balanced');
  L.confirmed = true;
  assert.equal(C.movePlayer(L, L.teams[0].players[0].id, { team: 1 }), 'ignored');
});

test('JSON 저장/불러오기 왕복', () => {
  const L = lineupWith(makePlayers(17), 2, 'tiered');
  L.confirmed = true;
  L.confirmedAt = '2026-10-07T12:00:00.000Z';
  const json = JSON.parse(JSON.stringify(C.lineupToJson(L)));
  assert.equal(json.schemaVersion, 1);
  assert.equal(json.matchDate, '2026-10-11');
  assert.equal(json.teams[0].name, 'A팀');
  assert.equal(json.teams[0].totals.sum, C.teamTotal(L.teams[0]));
  const back = C.lineupFromJson(json);
  assert.deepEqual(C.lineupToJson(back), C.lineupToJson(L));
});

test('Flutter 버전 JSON(attendees/teamCount 없음)도 읽는다', () => {
  const json = {
    schemaVersion: 1,
    matchDate: '2026-10-11',
    mode: 'balanced',
    confirmedAt: '2026-10-07T21:00:00+09:00',
    teams: [
      { name: 'A팀', players: [{ id: 'a', name: '가', stats: { stamina: 3, speed: 9 } }] },
      { name: 'B팀', players: [{ id: 'b', name: '나', stats: {} }] },
    ],
    bench: [{ id: 'c', name: '다', stats: { skill: 1 } }],
  };
  const L = C.lineupFromJson(json);
  assert.equal(L.teamCount, 2);
  assert.deepEqual(L.attendees, ['a', 'b', 'c']);
  assert.equal(L.teams[0].capacity, 3);
  assert.equal(L.teams[0].players[0].stats.speed, 3); // 범위 밖 값은 1~3으로
  assert.equal(L.teams[1].players[0].stats.stamina, 2); // 없는 값은 2
  assert.equal(L.confirmed, false);
});

test('잘못된 파일은 예외', () => {
  for (const bad of [null, 1, 'x', {}, { schemaVersion: 2, matchDate: '2026-10-11' },
    { schemaVersion: 1 }, { schemaVersion: 1, matchDate: 'abc' },
    { schemaVersion: 1, matchDate: '2026-10-11', teams: [{ players: [{ name: 'x' }] }] },
    { schemaVersion: 1, matchDate: '2026-10-11', bench: 'x' }]) {
    assert.throws(() => C.lineupFromJson(bad), JSON.stringify(bad));
  }
});

test('날짜 표시', () => {
  assert.equal(C.formatKoreanDate('2026-10-11'), '2026년 10월 11일 (일)');
  assert.equal(C.formatDateKey(new Date(2026, 0, 5)), '2026-01-05');
});

test('새 선수는 모든 능력치 2, 합계 10', () => {
  const p = C.makePlayer('x', '홍길동');
  assert.equal(C.total(p), 10);
  C.STATS.forEach((s) => assert.equal(p.stats[s.key], 2));
});
