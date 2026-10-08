// 사용자 설명서용 화면 사진을 찍고 manual.html을 PDF로 만든다.
// 실행: NODE_PATH=<playwright가 설치된 node_modules> node test/build_manual.js
//   --pdf-only  화면 사진은 그대로 두고 PDF만 다시 만든다.
'use strict';

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const INDEX = 'file://' + path.join(ROOT, 'index.html');
const MANUAL = 'file://' + path.join(ROOT, 'manual.html');
const IMG = path.join(ROOT, 'manual', 'img');
const PDF = path.join(ROOT, 'manual', 'futsal_user_manual.pdf');
const DATE = '2026-10-11';

const STAT_KEYS = ['stamina', 'speed', 'skill', 'teamwork', 'condition'];
const ROSTER = [
  ['김민수', [3, 3, 2, 2, 3]], ['이준호', [2, 3, 3, 2, 2]], ['박지훈', [1, 2, 2, 3, 2]],
  ['최영진', [3, 2, 3, 3, 3]], ['정우성', [2, 2, 1, 2, 2]], ['강동원', [3, 3, 3, 2, 2]],
  ['조현우', [2, 1, 2, 3, 3]], ['윤성민', [1, 1, 2, 2, 2]], ['장재원', [2, 3, 2, 1, 2]],
  ['임도현', [3, 2, 2, 3, 2]], ['한승우', [2, 2, 3, 3, 1]], ['오세훈', [1, 2, 1, 2, 3]],
  ['서진우', [3, 3, 3, 3, 2]], ['신태양', [2, 2, 2, 2, 2]], ['권혁준', [1, 1, 1, 2, 2]],
  ['황보람', [2, 3, 2, 2, 3]], ['송민재', [3, 1, 2, 2, 2]], ['유재석', [2, 2, 3, 1, 2]],
];

function players() {
  return ROSTER.map(([name, lv], i) => ({
    id: 'player-' + (i + 1),
    name,
    stats: Object.fromEntries(STAT_KEYS.map((k, j) => [k, lv[j]])),
  }));
}

async function newPage(browser, opts = {}) {
  const ctx = await browser.newContext({
    locale: 'ko-KR', viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5, acceptDownloads: true, ...opts,
  });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  // 매번 같은 편성이 나오도록 난수를 고정한다 (설명서 그림 설명과 맞추기 위해).
  await ctx.addInitScript(() => {
    let s = 20261011;
    Math.random = () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { throw e; });
  return page;
}

async function seed(page, attendees) {
  await page.goto(INDEX);
  await page.evaluate(({ ps, date, att }) => {
    localStorage.clear();
    localStorage.setItem('futsal.players.v1', JSON.stringify(ps));
    localStorage.setItem('futsal.lineup.v1.' + date, JSON.stringify({
      schemaVersion: 1, matchDate: date, mode: 'balanced', teamCount: 2, confirmed: false,
      attendees: att, teams: [], bench: [],
    }));
  }, { ps: players(), date: DATE, att: attendees });
  await page.reload();
  await page.fill('#date', DATE);
  await page.dispatchEvent('#date', 'change');
  await page.evaluate(() => document.activeElement.blur());
}

async function hideToast(page) {
  await page.evaluate(() => {
    document.getElementById('toast').className = 'toast';
    document.getElementById('attList').scrollTop = 0;
  });
  await page.waitForTimeout(250);
}

async function shot(target, name, opts = {}) {
  await target.screenshot({ path: path.join(IMG, name), ...opts });
  console.log('  ' + name);
}

/** 화면 요소 위에 번호 표시를 붙인다. */
async function badges(page, items) {
  await page.evaluate((list) => {
    list.forEach(([selector, label, dx, dy]) => {
      const el = document.querySelector(selector);
      if (!el) return;
      const r = el.getBoundingClientRect();
      const b = document.createElement('div');
      b.className = 'manual-badge';
      b.textContent = label;
      Object.assign(b.style, {
        position: 'absolute', left: (r.left + window.scrollX + (dx || 0) - 11) + 'px',
        top: (r.top + window.scrollY + (dy || 0) - 11) + 'px', width: '22px', height: '22px',
        borderRadius: '50%', background: '#e11d48', color: '#fff', font: '700 13px sans-serif',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99,
        boxShadow: '0 0 0 2px #fff',
      });
      document.body.appendChild(b);
    });
  }, items);
}

async function clearBadges(page) {
  await page.evaluate(() => document.querySelectorAll('.manual-badge').forEach((b) => b.remove()));
}

async function drag(page, from, to, release = true) {
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(a.x + a.width / 2 + (b.x + b.width / 2 - a.x - a.width / 2) * i / 10,
      a.y + a.height / 2 + (b.y + b.height / 2 - a.y - a.height / 2) * i / 10);
  }
  if (release) await page.mouse.up();
}

async function screenshots(browser) {
  fs.mkdirSync(IMG, { recursive: true });
  const ids = players().map((p) => p.id);

  // 첫 화면 (빈 명단)
  let page = await newPage(browser);
  await page.goto(INDEX);
  await page.fill('#date', DATE);
  await page.dispatchEvent('#date', 'change');
  await page.evaluate(() => document.activeElement.blur());
  await badges(page, [
    ['.tabs', '1', -8, 0], ['#manualLink', '2', -6, 0], ['#screen-match .toolbar .group', '3', -6, 0],
    ['#teamCount', '4', -6, 0], ['#mode', '5', -6, 0], ['#screen-match .toolbar .group.right', '6', -6, 0],
    ['.attendance', '7', 0, 0], ['#status', '8', 0, 0],
  ]);
  await shot(page, '01-overview.png');
  await clearBadges(page);

  // 선수 관리
  await page.click('[data-tab=players]');
  await page.fill('#newName', '김민수');
  await shot(page.locator('#screen-players .toolbar'), '02-add-player.png');
  await page.close();

  page = await newPage(browser);
  await seed(page, ids.slice(0, 16));
  await page.click('[data-tab=players]');
  await badges(page, [
    ['#addForm', '1', -6, 0], ['#playerSearch', '2', -6, 0], ['#exportPlayers', '3', -6, 0],
    ['.players th:nth-child(3)', '4', 0, 0], ['.players th:nth-child(8)', '5', 0, 0],
    ['.players th.col-act', '6', 30, 0],
  ]);
  await shot(page, '03-players.png');
  await clearBadges(page);
  await page.locator('#playerRows tr').nth(2).locator('[data-rename]').click();
  await shot(page.locator('.table-wrap'), '04-rename.png', { clip: undefined });
  await page.keyboard.press('Escape');
  await page.locator('#playerRows tr').nth(2).locator('[data-del]').click();
  await shot(page.locator('#dialog .box'), '05-delete.png');
  await page.keyboard.press('Escape');

  // 경기 편성: 참석 체크
  await page.click('[data-tab=match]');
  await hideToast(page);
  await shot(page, '06-attendance.png');

  // 인원 부족: 14명 참석, 3팀
  await page.locator('#attList input').nth(14).uncheck();
  await page.locator('#attList input').nth(15).uncheck();
  await page.click('#teamCount [data-k="3"]');
  await shot(page.locator('#status'), '07-not-enough.png');
  await page.click('#teamCount [data-k="2"]');
  await page.locator('#attList input').nth(14).check();
  await page.locator('#attList input').nth(15).check();

  // 팀 구성 (2팀, 16명)
  await page.click('#buildBtn');
  await hideToast(page);
  await badges(page, [
    ['.team[data-key="0"] h3', '1', 0, 0], ['.team[data-key="0"] li.player', '2', 0, 0],
    ['.team[data-key="0"] li.slot', '3', 0, 0], ['.team[data-key="0"] .stats', '4', 0, 0],
    ['.team[data-key="bench"] h3', '5', 0, 0], ['#status .diff', '6', -14, -12],
  ]);
  await shot(page, '08-teams-2.png');
  await clearBadges(page);
  await shot(page.locator('.team[data-key="0"]'), '09-team-card.png');

  // 드래그 중 화면
  await drag(page, page.locator('.team[data-key="0"] li.player').nth(1),
    page.locator('.team[data-key="1"] li.player').nth(2), false);
  await page.waitForTimeout(150);
  await shot(page.locator('#teams'), '10-dragging.png');
  await page.mouse.up();
  await hideToast(page);

  // 인원 경고
  await drag(page, page.locator('.team[data-key="0"] li.player').first(), page.locator('.team[data-key="1"] li.slot').first());
  await hideToast(page);
  await shot(page.locator('#teams'), '11-warning.png');
  await page.click('#confirmBtn');
  await shot(page.locator('#dialog .box'), '12-cannot-confirm.png');
  await page.keyboard.press('Escape');
  await drag(page, page.locator('.team[data-key="1"] li.player').first(), page.locator('.team[data-key="0"] li.slot').first());

  // 3팀 18명
  await page.click('#allOn');
  await page.click('#teamCount [data-k="3"]');
  await page.click('#buildBtn');
  await hideToast(page);
  await shot(page, '13-teams-3.png');
  await page.click('#teamCount [data-k="2"]');
  await page.locator('#attList input').nth(16).uncheck();
  await page.locator('#attList input').nth(17).uncheck();
  await page.click('#buildBtn');

  // 확정
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#confirmBtn')]);
  const jsonPath = path.join(IMG, '..', 'sample.json');
  await dl.saveAs(jsonPath);
  await page.waitForTimeout(200);
  await shot(page, '14-confirmed.png');
  await hideToast(page);
  await shot(page.locator('#screen-match .toolbar .group.right'), '15-confirmed-buttons.png');

  // PDF 미리보기
  await page.click('[data-tab=preview]');
  await shot(page, '16-preview.png');
  await page.click('[data-tab=match]');

  // 공유
  await page.click('#shareBtn');
  await page.waitForSelector('#shareModal:not([hidden])');
  await page.waitForFunction(() => document.getElementById('shareImg').naturalWidth > 0);
  await page.click('#copyImg');
  await page.waitForFunction(() => document.getElementById('shareMsg').className !== 'hint');
  await shot(page, '17-share.png');
  await page.keyboard.press('Escape');

  // 단축키
  await page.click('#helpBtn');
  await shot(page.locator('#helpModal .box'), '18-shortcuts.png');
  await page.keyboard.press('Escape');

  // 불러오기 (빈 브라우저)
  const page2 = await newPage(browser);
  await page2.goto(INDEX);
  const [chooser] = await Promise.all([page2.waitForEvent('filechooser'), page2.click('#loadBtn')]);
  await chooser.setFiles(jsonPath);
  await page2.waitForSelector('.team');
  await page2.waitForTimeout(200);
  await shot(page2, '19-loaded.png');
  const [chooser2] = await Promise.all([page2.waitForEvent('filechooser'), page2.click('#loadBtn')]);
  const bad = path.join(IMG, '..', 'bad.json');
  fs.writeFileSync(bad, '{"hello":1}');
  await chooser2.setFiles(bad);
  await page2.waitForSelector('#dialog:not([hidden])');
  await shot(page2.locator('#dialog .box'), '20-bad-file.png');
  fs.unlinkSync(bad);
  fs.unlinkSync(jsonPath);
}

async function buildPdf(browser) {
  const page = await newPage(browser, { deviceScaleFactor: 1 });
  await page.goto(MANUAL);
  await page.emulateMedia({ media: 'print' });
  await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete));
  await page.pdf({
    path: PDF,
    format: 'A4',
    printBackground: true,
    margin: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' },
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: '<div style="width:100%;font-size:8px;color:#888;text-align:center;font-family:sans-serif">' +
      '풋살 팀 밸런서 사용자 설명서 · 제작자 : modoismodo · ' +
      '<span class="pageNumber"></span> / <span class="totalPages"></span></div>',
  });
  console.log('  ' + path.relative(ROOT, PDF) + ' (' + Math.round(fs.statSync(PDF).size / 1024) + 'KB)');
}

(async () => {
  const browser = await chromium.launch({ args: ['--lang=ko-KR'] });
  try {
    if (!process.argv.includes('--pdf-only')) {
      console.log('화면 사진:');
      await screenshots(browser);
    }
    console.log('PDF:');
    await buildPdf(browser);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
