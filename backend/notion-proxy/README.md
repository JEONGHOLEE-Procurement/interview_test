# Notion 백엔드 (중계 서버)

앱(`app/app.html`)의 면접 결과를 Notion 데이터베이스에 기록한다. 브라우저에 Notion 토큰을 두지 않기 위해 이 서버를 거친다.

## Notion에 저장되는 데이터 (면접 1회 = 1행)
| 열 | 내용 |
|---|---|
| 세션(제목) | 지원자 · 직무 · 시작 시각 |
| 발제 / 기업 / 직무 | 어떤 발제를 어떤 직무로 했는지 |
| 지원자 / 전형 단계 / 면접 예정일 | 입장 화면 입력값 (단계·예정일은 선택) |
| 시작 / 종료 / 발표 시간(초) / 제한 시간 준수 | 시간 관리 |
| 슬라이드 제목 / 슬라이드 내용 | 내 1장 PPT의 글자 (도형 배치는 본문 JSON) |
| 발표 스크립트 / 스크립트 방식 | 타이핑 또는 음성 받아쓰기 |
| 반박 부서 / 반박 내용 / 반박 답변 | 압박 상황 대응 |
| 질의응답 | 꼬리질문과 답변, 답변 시간 |
| 방문한 자리 | 회의실에서 다가가 본 다른 부서 |
| 화두 적합성 · 근거·수치 · 타 부서 고려 · 리스크·대안 · 구조·전달 | 자가 점검 점수(1~5) |
| 만족도 / 실제 결과 | 결과 화면에서 나중에 입력 |
| 저장 동의 | 동의한 경우만 저장 |
| 본문 | 앱이 보낸 원본 JSON 전체 (슬라이드 요소·회의록 포함) |

저장하지 않는 것: 카메라 영상, 음성 원본.

## 방법 1 — 내보낸 JSON 파일을 바로 올리기 (서버 없이)
1. https://www.notion.so/my-integrations 에서 내부 통합 생성 → 토큰 복사
2. 대상 데이터베이스 페이지 `•••` → 연결 → 방금 만든 통합 추가
3. 열 준비 (빠진 열만 추가):
   `NOTION_TOKEN=secret_xxx node setup.mjs <데이터베이스 URL>`
4. 기록:
   `NOTION_TOKEN=secret_xxx NOTION_SESSIONS_DB=<데이터베이스 URL> SESSIONS_TITLE_PROP=<3에서 출력된 제목 열> node import-json.mjs ~/Downloads/pt-session-*.json`

## 방법 2 — 앱에서 자동 저장 (Cloudflare Worker 배포)
1. `wrangler.toml`의 `NOTION_SESSIONS_DB`, `ALLOWED_ORIGINS` 수정 (다른 DB를 쓰면 `SESSIONS_TITLE_PROP`, `SCENARIO_PAGES="{}"`도)
2. `npx wrangler secret put NOTION_TOKEN`, `npx wrangler secret put EDIT_SECRET`
3. `npx wrangler deploy` → 나온 주소를 `app/config.js`의 `backendUrl`에 넣기
4. 결과 화면에 "결과 저장"(동의 체크) → 만족도·실제 결과 입력이 나타난다

## API
- `POST /api/sessions` — 결과 JSON + `consent: true` → `{ sessionId, editToken }`
- `PATCH /api/sessions/:id/outcome` — `{ satisfaction 1~5, actualResult 합격|불합격|미정, editToken }`
- `POST /api/waitlist` — `{ email, name?, company?, job?, interviewDate?, channel?, consent: true }`
