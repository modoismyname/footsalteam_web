// 브라우저 자동 점검 (Playwright + Chromium). index.html을 file:// 로 직접 연다.
// 실행: NODE_PATH=<playwright가 설치된 node_modules> node test/e2e.js [스크린샷 폴더]
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { chromium } = require('playwright');

const INDEX = 'file://' + path.resolve(__dirname, '..', 'index.html');
const SHOTS = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'futsal-e2e-'));
const NAMES = ['김민수', '이준호', '박지훈', '최영진', '정우성', '강동원', '조현우', '윤성민', '장재원',
  '임도현', '한승우', '오세훈', '서진우', '신태양', '권혁준', '황보람', '송민재', '유재석'];

let failures = 0;
function check(cond, label) {
  console.log((cond ? 'ok   ' : 'FAIL ') + label);
  if (!cond) failures++;
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    locale: 'ko-KR', viewport: { width: 1440, height: 900 }, acceptDownloads: true,
  });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(INDEX);
  check(await page.locator('#dateLabel').innerText() !== '', 'B-1 경기일 표시');

  // A. 선수 관리
  await page.click('[data-tab=players]');
  for (const n of NAMES) {
    await page.fill('#newName', n);
    await page.press('#newName', 'Enter');
  }
  check(await page.locator('#playerRows tr').count() === NAMES.length, 'A-1 선수 18명 등록');
  check(await page.locator('#playerRows tr').first().locator('td.sum').innerText() === '10', 'A-1 새 선수 합계 10');
  await page.fill('#newName', '김민수');
  await page.press('#newName', 'Enter');
  check(await page.locator('#playerRows tr').count() === NAMES.length, 'A-2 중복 이름 거부');
  check((await page.locator('#toast').innerText()).includes('이미 같은 이름'), 'A-2 중복 안내');
  await page.fill('#newName', '   ');
  await page.press('#newName', 'Enter');
  check(await page.locator('#playerRows tr').count() === NAMES.length, 'A-3 빈 이름 거부');

  // 능력치를 다양하게
  const levels = [3, 1, 2];
  for (let i = 0; i < NAMES.length; i++) {
    for (let s = 0; s < 5; s++) {
      const v = levels[(i * 7 + s * 3 + (i % 4)) % 3];
      if (v !== 2) await page.click(`button[aria-label="${NAMES[i]} ${['활동량', '스피드', '개인기', '협동력', '컨디션'][s]} ${v}"]`);
    }
  }
  const firstSum = await page.locator('#playerRows tr').first().locator('td.sum').innerText();
  check(firstSum !== '10', 'A-4 능력치 변경 시 합계 갱신 (' + firstSum + ')');

  // A-5 이름 수정 (중복 거부 포함)
  await page.locator('#playerRows tr').nth(17).locator('[data-rename]').click();
  await page.fill('[data-edit]', '김민수');
  await page.press('[data-edit]', 'Enter');
  check(await page.locator('[data-edit]').count() === 1, 'A-5 수정 시 중복 이름 거부');
  await page.fill('[data-edit]', '유재석2');
  await page.press('[data-edit]', 'Enter');
  check((await page.locator('#playerRows tr').nth(17).locator('td.name').innerText()) === '유재석2', 'A-5 이름 수정');

  // A-7 새로고침 후 유지
  await page.reload();
  await page.click('[data-tab=players]');
  check(await page.locator('#playerRows tr').count() === NAMES.length, 'A-7 새로고침 후 명단 유지');
  check(await page.locator('#playerRows tr').first().locator('td.sum').innerText() === firstSum, 'A-7 능력치 유지');
  await page.screenshot({ path: path.join(SHOTS, '1-players.png'), fullPage: true });

  // B/C. 참석과 인원 규칙
  await page.keyboard.press('Alt+1');
  const boxes = page.locator('#attList input[type=checkbox]');
  for (let i = 0; i < 9; i++) await boxes.nth(i).check();
  check((await page.locator('#status').innerText()).includes('2팀 경기 불가'), 'C-1 9명 2팀 경기 불가');
  check(await page.locator('#buildBtn').isDisabled(), 'C-1 팀 구성 비활성');
  await boxes.nth(9).check();
  check((await page.locator('#status').innerText()).includes('A팀 5명 + B팀 5명'), 'C-2 10명');
  await boxes.nth(10).check();
  check((await page.locator('#status').innerText()).includes('A팀 6명 + B팀 5명'), 'C-3 11명');
  for (let i = 11; i < 16; i++) await boxes.nth(i).check();
  check((await page.locator('#status').innerText()).includes('A팀 7명 + B팀 7명 + 교체대기 2명'), 'C-4 16명');
  check((await page.locator('#attCount').innerText()) === '16/18', 'B-4 참석 수');
  await page.click('#teamCount [data-k="3"]');
  check((await page.locator('#status').innerText()).includes('A팀 6명 + B팀 5명 + C팀 5명'), 'C-6 3팀 16명');
  await boxes.nth(15).uncheck();
  await boxes.nth(14).uncheck();
  check((await page.locator('#status').innerText()).includes('3팀 경기 불가'), 'C-5 3팀 14명 불가');
  await page.click('#allOn');
  check((await page.locator('#attCount').innerText()) === '18/18', 'B-5 전체 선택');
  check((await page.locator('#status').innerText()).includes('A팀 6명 + B팀 6명 + C팀 6명'), '3팀 18명');

  // D. 팀 구성 (단축키)
  await page.keyboard.press('Control+Enter');
  check(await page.locator('.team').count() === 4, 'D-1 3팀 + 교체대기 카드');
  check(await page.locator('.team[data-key="0"] li.slot').count() === 2, 'D-6 빈 슬롯 2개');
  check(await page.locator('.team[data-key="0"] .stats > div').count() === 5, 'D-6 항목별 합계 5개');
  check((await page.locator('#buildBtn').innerText()) === '다시 구성', 'D 다시 구성 버튼');
  await page.click('#teamCount [data-k="2"]');
  check(await page.locator('.team').count() === 0, 'C-8 팀 수 변경 시 초기화');
  await page.click('#buildBtn');
  check(await page.locator('.team').count() === 3, '2팀 + 교체대기');
  check(await page.locator('.team[data-key="bench"] li.player').count() === 4, '교체대기 4명');
  await page.click('#mode [data-m="tiered"]');
  const tieredTotals = await page.evaluate(() => {
    const L = window.FutsalApp.state.lineup;
    return L.teams.map((t) => t.players.map((p) => Object.values(p.stats).reduce((a, b) => a + b, 0)));
  });
  check(Math.min(...tieredTotals[0]) >= Math.max(...tieredTotals[1]), 'D-2/D-4 전문화로 즉시 재구성');
  await page.click('#mode [data-m="balanced"]');
  await page.screenshot({ path: path.join(SHOTS, '2-teams.png'), fullPage: true });

  // E. 드래그
  async function drag(from, to) {
    const a = await from.boundingBox();
    const b = await to.boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) {
      await page.mouse.move(a.x + a.width / 2 + (b.x + b.width / 2 - a.x - a.width / 2) * i / 8,
        a.y + a.height / 2 + (b.y + b.height / 2 - a.y - a.height / 2) * i / 8);
    }
    await page.mouse.up();
  }
  // Playwright의 마우스 드래그는 HTML5 DnD를 지원한다.
  const countOf = (k) => page.locator(`.team[data-key="${k}"] li.player`).count();
  await drag(page.locator('.team[data-key="0"] li.player').first(), page.locator('.team[data-key="1"] li.slot').first());
  check(await countOf(0) === 6 && await countOf(1) === 8, 'E-1 빈 슬롯으로 이동');
  check(await page.locator('.team[data-key="1"] .warn').count() === 1, 'E-5 인원 경고');
  const aName = await page.locator('.team[data-key="0"] li.player').first().getAttribute('data-id');
  const bName = await page.locator('.team[data-key="1"] li.player').first().getAttribute('data-id');
  await drag(page.locator('.team[data-key="0"] li.player').first(), page.locator('.team[data-key="1"] li.player').first());
  check(await page.locator(`.team[data-key="1"] li[data-id="${aName}"]`).count() === 1 &&
    await page.locator(`.team[data-key="0"] li[data-id="${bName}"]`).count() === 1, 'E-2 맞바꾸기');
  // F-1 확정 불가
  await page.click('#confirmBtn');
  check(!(await page.locator('#dialog').isHidden()) &&
    (await page.locator('#dialogBody').innerText()).includes('B팀'), 'F-1 확정 불가 창');
  await page.keyboard.press('Escape');
  // 교체대기로 이동
  await drag(page.locator('.team[data-key="1"] li.player').first(), page.locator('.team[data-key="bench"] h3'));
  check(await countOf('bench') === 5 && await countOf(1) === 7, 'E-3 교체대기로 이동');
  // B팀 빈 슬롯 0개 만들기: A→B 로 1명 이동해서 B=8, 정원 9 → 1개, 한번 더 → 0개
  await drag(page.locator('.team[data-key="0"] li.player').first(), page.locator('.team[data-key="1"] li.slot').first());
  await drag(page.locator('.team[data-key="0"] li.player').first(), page.locator('.team[data-key="1"] li.slot').first());
  check(await page.locator('.team[data-key="1"] li.slot').count() === 0, 'B팀 빈 슬롯 0개');
  await drag(page.locator('.team[data-key="0"] li.player').first(), page.locator('.team[data-key="1"] h3'));
  check((await page.locator('#toast').innerText()).includes('빈 슬롯이 없습니다'), 'E-4 빈 슬롯 없음 안내');
  // 원상복구 (현재 A4/B9/대기5): B에서 교체대기로 2명, 교체대기에서 A로 3명
  await drag(page.locator('.team[data-key="1"] li.player').first(), page.locator('.team[data-key="bench"] h3'));
  await drag(page.locator('.team[data-key="1"] li.player').first(), page.locator('.team[data-key="bench"] h3'));
  for (let i = 0; i < 3; i++) {
    await drag(page.locator('.team[data-key="bench"] li.player').first(), page.locator('.team[data-key="0"] li.slot').first());
  }
  check(await countOf(0) === 7 && await countOf(1) === 7 && await countOf('bench') === 4, '인원 원상복구 7/7/4');

  // F. 확정 (Ctrl+S)
  const [dl] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Control+s')]);
  const dateKey = await page.inputValue('#date');
  check(dl.suggestedFilename() === `futsal_teams_${dateKey}.json`, 'F-2 JSON 파일 이름');
  const jsonPath = path.join(SHOTS, dl.suggestedFilename());
  await dl.saveAs(jsonPath);
  const saved = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  check(saved.schemaVersion === 1 && saved.teams.length === 2 && saved.bench.length === 4, 'F-2 JSON 내용');
  check(!(await page.locator('#lockedBanner').isHidden()), 'F-2 확정 안내');
  check(await page.locator('#attList input:disabled').count() === 18, 'F-2 참석 체크 잠김');
  check(await page.locator('li.slot').count() === 0, 'F-2 빈 슬롯 숨김');
  check(!(await page.locator('#unlockBtn').isHidden()) && !(await page.locator('#printBtn').isDisabled()) &&
    !(await page.locator('#shareBtn').isDisabled()), 'F-3 수정/출력/공유 버튼');
  await page.screenshot({ path: path.join(SHOTS, '3-confirmed.png'), fullPage: true });

  // G. PDF
  const [pdf] = await Promise.all([page.waitForEvent('download'), page.click('#printBtn')]);
  check(pdf.suggestedFilename() === `futsal_teams_${dateKey}.pdf`, 'G-1 PDF 파일 이름');
  const pdfPath = path.join(SHOTS, pdf.suggestedFilename());
  await pdf.saveAs(pdfPath);
  const pdfHead = fs.readFileSync(pdfPath).subarray(0, 8).toString('latin1');
  check(pdfHead.startsWith('%PDF-1.4'), 'G-1 PDF 형식');
  await page.keyboard.press('Alt+3');
  check(await page.locator('#preview canvas').count() >= 1, 'G-3 미리보기');
  await page.screenshot({ path: path.join(SHOTS, '4-preview.png'), fullPage: true });
  await page.keyboard.press('Alt+1');

  // H. 공유
  await page.click('#shareBtn');
  await page.waitForSelector('#shareModal:not([hidden])');
  check(true, 'H-1 공유 창');
  await page.waitForFunction(() => document.getElementById('shareImg').naturalWidth > 0);
  await page.screenshot({ path: path.join(SHOTS, '5-share.png') });
  await page.click('#copyImg');
  await page.waitForFunction(() => document.getElementById('shareMsg').className !== 'hint');
  console.log('     복사 결과: ' + await page.locator('#shareMsg').innerText());
  const [png] = await Promise.all([page.waitForEvent('download'), page.click('#saveImg')]);
  check(png.suggestedFilename() === `futsal_teams_${dateKey}.png`, 'H-3 PNG 저장');
  await png.saveAs(path.join(SHOTS, png.suggestedFilename()));
  await page.keyboard.press('Escape');
  check(await page.locator('#shareModal').isHidden(), 'Esc로 창 닫기');

  // F-4 수정
  await page.click('#unlockBtn');
  check(await page.locator('#printBtn').isDisabled() && await page.locator('li.slot').count() > 0, 'F-4 수정 시 잠금 해제');

  // B-3 날짜별 보관
  await page.keyboard.press(']');
  check(await page.locator('.team').count() === 0 && (await page.locator('#attCount').innerText()) === '0/18', 'B-2 새 날짜는 비어 있음');
  await page.keyboard.press('[');
  check(await page.locator('.team').count() === 3, 'B-3 날짜별 편성 복원');

  // F-6 다른 브라우저(빈 명단)에서 불러오기
  const page2 = await (await browser.newContext({ locale: 'ko-KR', viewport: { width: 1440, height: 900 } })).newPage();
  page2.on('pageerror', (e) => errors.push(e.message));
  await page2.goto(INDEX);
  const [chooser] = await Promise.all([page2.waitForEvent('filechooser'), page2.keyboard.press('Control+o')]);
  await chooser.setFiles(jsonPath);
  await page2.waitForSelector('.team');
  check((await page2.locator('#toast').innerText()).includes('18명을 추가'), 'F-5/F-6 불러오기 + 선수 추가 안내');
  check(await page2.inputValue('#date') === dateKey, 'F-5 파일 날짜로 이동');
  check(!(await page2.locator('#lockedBanner').isHidden()), 'F-5 확정 편성 그대로');
  // F-8 잘못된 파일
  const badPath = path.join(SHOTS, 'bad.json');
  fs.writeFileSync(badPath, '{"hello": 1}');
  const [chooser2] = await Promise.all([page2.waitForEvent('filechooser'), page2.click('#loadBtn')]);
  await chooser2.setFiles(badPath);
  await page2.waitForSelector('#dialog:not([hidden])');
  check((await page2.locator('#dialogTitle').innerText()) === '파일을 읽을 수 없습니다', 'F-8 잘못된 파일 안내');
  check(await page2.locator('.team').count() === 3, 'F-8 기존 편성 유지');

  // 명단 내보내기/가져오기
  await page.click('[data-tab=players]');
  const [exp] = await Promise.all([page.waitForEvent('download'), page.click('#exportPlayers')]);
  const expPath = path.join(SHOTS, exp.suggestedFilename());
  await exp.saveAs(expPath);
  const page3 = await (await browser.newContext({ locale: 'ko-KR' })).newPage();
  await page3.goto(INDEX);
  await page3.click('[data-tab=players]');
  const [chooser3] = await Promise.all([page3.waitForEvent('filechooser'), page3.click('#importPlayers')]);
  await chooser3.setFiles(expPath);
  await page3.waitForFunction(() => document.querySelectorAll('#playerRows tr').length === 18);
  check(true, '명단 가져오기 18명');

  // A-6 삭제
  await page.locator('#playerRows tr').first().locator('[data-del]').click();
  await page.click('#dialogActions .danger');
  check(await page.locator('#playerRows tr').count() === 17, 'A-6 선수 삭제');
  await page.click('[data-tab=match]');
  check((await page.locator('#attCount').innerText()) === '17/17' && await page.locator('.team').count() === 0,
    'A-6/B-6 참석에서 빠지고 편성 초기화');

  // 사용자 설명서 링크
  const [manualTab] = await Promise.all([context.waitForEvent('page'), page.click('#manualLink')]);
  await manualTab.waitForLoadState();
  check((await manualTab.title()).includes('사용자 설명서'), '설명서 링크로 새 탭 열림');
  check(await manualTab.locator('img').count() > 15 &&
    await manualTab.evaluate(() => Array.from(document.images).every((i) => i.naturalWidth > 0)), '설명서 그림 표시');
  const pdfHref = await manualTab.locator('.bar a').first().getAttribute('href');
  check(fs.existsSync(path.resolve(__dirname, '..', pdfHref)), '설명서 PDF 파일 존재');
  await manualTab.close();
  const [f1Tab] = await Promise.all([context.waitForEvent('page'), page.keyboard.press('F1')]);
  check(f1Tab.url().endsWith('manual.html'), 'F1로 설명서 열기');
  await f1Tab.close();

  // 좁은 화면
  await page.setViewportSize({ width: 820, height: 900 });
  await page.screenshot({ path: path.join(SHOTS, '6-narrow.png'), fullPage: true });

  check(errors.length === 0, '스크립트 오류 없음 ' + (errors.length ? JSON.stringify(errors) : ''));
  await browser.close();
  console.log('\n스크린샷/파일: ' + SHOTS);
  console.log(failures ? `실패 ${failures}건` : '모두 통과');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
