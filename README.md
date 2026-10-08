# footsalteam_web — 풋살 팀 밸런서 v1.0

풋살팀 편성 웹페이지 서비스 (로컬 PC 웹 버전, HTML/JS)

제작자 : modoismodo

기존 Flutter 웹 버전과 같은 기능을 **순수 HTML·CSS·JavaScript**로 다시 만든 별도 버전입니다.
DB, WAS, 웹 서버가 필요 없습니다. 폴더를 PC에 두고 `index.html`을 더블클릭하면 브라우저에서 바로 실행됩니다.

## 사용자 설명서

- 화면용: [manual.html](manual.html) — 앱 오른쪽 위 [사용설명서] 버튼, 화면 맨 아래 링크, 또는 `F1` 키로 언제든 열 수 있습니다.
- PDF(인쇄용): [manual/futsal_user_manual.pdf](manual/futsal_user_manual.pdf)

## 실행 방법

1. 이 저장소를 내려받아(초록색 [Code] → [Download ZIP]) 압축을 풀고, `footsalteam_web` 폴더를 통째로 PC에 둡니다 (예: `C:\futsal\footsalteam_web`).
2. `index.html`을 더블클릭합니다. Chrome 또는 Edge를 권장합니다.
3. 자주 쓰면 브라우저 즐겨찾기에 추가하거나 바탕화면에 바로가기를 만들어 두세요.

- 설치, 빌드, 인터넷 연결이 필요 없습니다. 외부 라이브러리, 폰트 파일, CDN을 쓰지 않습니다.
- 글꼴은 PC에 있는 한글 글꼴(맑은 고딕 등)을 씁니다.

## 데이터 보관

| 데이터 | 보관 위치 |
|---|---|
| 선수 명단, 날짜별 참석·편성 | 브라우저 저장소(localStorage)에 자동 저장 |
| 확정한 편성표 | [팀 확정] 때 내려받는 `futsal_teams_YYYY-MM-DD.json` |
| 선수 명단 백업 | [선수 관리] → [명단 내보내기] 로 받는 `futsal_players_YYYY-MM-DD.json` |

- 브라우저 저장소는 **브라우저마다 따로**입니다. Chrome에서 입력한 명단은 Edge에서 보이지 않습니다. 한 브라우저를 정해서 쓰세요.
- 브라우저 기록(사이트 데이터)을 지우면 저장소도 지워집니다. 가끔 [명단 내보내기]로 백업해 두세요.
- 다른 PC로 옮길 때는 [명단 가져오기]로 명단을, [불러오기]로 편성표를 옮깁니다.
- JSON 파일 형식은 Flutter 버전과 같아서 서로 불러올 수 있습니다.

## 기능

- **선수 관리**: 등록(Enter), 이름 수정(더블클릭 또는 [수정]), 삭제, 능력치 5항목 × 레벨 1~3, 이름 검색, 명단 내보내기/가져오기
- **경기 편성**: 경기일 선택(날짜별로 따로 보관), 참석 체크(검색, 전체 선택/해제), 2팀/3팀, 평준화/전문화, 팀 구성/다시 구성
- **드래그 앤 드롭**: 빈 슬롯으로 이동, 선수 위에 놓아 맞바꾸기, 교체대기로 이동. 팀 인원이 5~7명을 벗어나면 경고
- **팀 확정**: JSON 저장 후 편집 잠금, [수정]으로 잠금 해제, [불러오기]로 복원
- **출력**: A4 PDF 내려받기, [PDF 미리보기] 탭
- **공유**: 팀별 이름만 담은 PNG 이미지 복사(카카오톡에 Ctrl+V) 또는 저장

### PC 단축키

| 키 | 동작 |
|---|---|
| `Alt`+`1` / `2` / `3` | 경기 편성 / 선수 관리 / PDF 미리보기 |
| `Ctrl`+`Enter` | 팀 구성 / 다시 구성 |
| `Ctrl`+`S` | 팀 확정 (JSON 저장) |
| `Ctrl`+`O` | 불러오기 |
| `Ctrl`+`P` | PDF 출력 (확정 후) |
| `[` / `]` | 경기일 하루 전 / 하루 뒤 |
| `/` | 이름 검색 칸으로 이동 |
| `Esc` | 창 닫기, 이름 수정 취소 |
| `?` | 단축키 도움말 |

## Flutter 버전과 다른 점

| 항목 | Flutter 버전 | 이 버전 |
|---|---|---|
| 실행 | 빌드 후 웹 서버에 배포 (약 54MB) | `index.html` 더블클릭 (약 100KB) |
| PDF | 한글 폰트를 넣은 텍스트 PDF | 화면에 그린 A4 페이지를 이미지로 넣은 PDF (글자 선택은 안 됨, 인쇄 품질 150dpi) |
| 글꼴 | Noto Sans KR 내장 | PC의 한글 글꼴 사용 |
| 추가 기능 | – | 단축키, 이름 검색, 명단 내보내기/가져오기, 팀 총점 차이 표시 |

## 파일 구조

```
footsalteam_web/
├─ index.html        # 화면 구조 (시작 파일)
├─ manual.html       # 사용자 설명서 (화면용)
├─ manual/           # 설명서 PDF와 화면 사진
├─ css/style.css     # 디자인 (라이트/다크 모드)
├─ js/core.js        # 순수 로직: 인원 규칙, 평준화/전문화, 드래그 이동, JSON 형식
├─ js/output.js      # PDF(캔버스 → JPEG → PDF)와 공유 PNG 그리기
├─ js/app.js         # 화면 동작, 저장소, 단축키
├─ docs/TEST_SCENARIOS.md  # 테스트 시나리오 (최종 확정)
└─ test/
   ├─ core.test.js   # 로직 단위 테스트 (node --test test/core.test.js)
   ├─ e2e.js         # 브라우저 자동 점검 (Playwright, file:// 로 실행)
   └─ build_manual.js # 설명서 화면 사진 촬영 + PDF 생성
```

`file://`로 열어도 동작하도록 ES 모듈 대신 일반 `<script>`를 씁니다.

## 개발자용 테스트

저장소 루트에서 실행합니다.

```bash
node --test test/core.test.js                     # 단위 테스트 16개
NODE_PATH=<playwright 설치 경로>/node_modules node test/e2e.js            # 브라우저 점검 60여 항목
NODE_PATH=<playwright 설치 경로>/node_modules node test/build_manual.js   # 설명서 사진과 PDF 다시 만들기 (--pdf-only: PDF만)
```
