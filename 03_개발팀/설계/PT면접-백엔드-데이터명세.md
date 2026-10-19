# PT 면접 시뮬레이터 — 백엔드 데이터 명세 (v0.1, 2026-10-19)

프론트 프로토타입: `app/index.html`(랜딩), `app/app.html`(회의실).
지금은 `app/data/scenario-hyundai-india.js`를 정적으로 읽는다. 이 파일의 형태가 곧 `GET /api/scenarios/:id`의 응답이다.
결과 화면의 "결과 JSON 내보내기"가 `POST /api/sessions/:id/complete` 요청 본문과 같다.

## 1. 전체 흐름

```
[뉴스 수집] → [발제 초안 생성(AI)] → [콘텐츠팀 검수] → [시나리오 게시]
                                                         ↓
[지원자] 프로필 입력 → 직무 선택 → 세션 진행(발표·반박·질의) → 결과 저장 → [AI 평가] → 리포트
                                                         ↓
                                    (면접 후) 실제 결과 회신 → 효과 측정
```

## 2. 백엔드가 받는 데이터 (사용자 → 서버)

| 구분 | 필드 | 필수 | 시점 | 용도 |
|---|---|---|---|---|
| 지원자 | displayName | ✓ | 입장 | 화면 표시 |
| 지원자 | email | 대기자·회원만 | 가입 | 결과 리포트, 알림 |
| 지원 정보 | companyId, jobTeam | ✓ | 입장 | 시나리오·화두 배정 |
| 지원 정보 | stage (`서류합격`/`1차면접`/`최종면접`) | ✓ | 입장 | 핵심 고객 확인 (결재-001 B안) |
| 지원 정보 | interviewDate | 선택 | 입장 | 남은 기간 맞춤 추천, 리마인드 |
| 세션 | slide {title, points[3], risk, ask} | ✓ | 준비 | 평가, 다시 보기 |
| 세션 | script {text, source: typed\|speech, seconds} | ✓ | 발표 | 평가, 시간 관리 피드백 |
| 세션 | audio (webm) | 선택·동의 시 | 발표 | 말 속도·군말 분석 (2단계) |
| 세션 | rebuttal {from, prompt, answer, seconds} | ✓ | 반박 | 조율 능력 평가 |
| 세션 | qa[] {by, question, answer, seconds} | ✓ | 질의 | 꼬리질문 대응 평가 |
| 세션 | visitedSeats[] | 자동 | 회의실 | 다른 부서 의견 탐색 행동 (참여 지표) |
| 세션 | selfScore {fit, evidence, collab, risk, structure} | 자동 | 결과 | 규칙 기반 점수 (AI 평가와 비교) |
| 세션 | transcript[] {at, speakerId, kind, text} | 자동 | 전 과정 | 회의록, 평가 근거 |
| 사후 | satisfaction (1~5), comment | 선택 | 결과 화면 | 제품 개선 |
| 사후 | actualResult (`합격`/`불합격`/`미정`) | 선택 | 면접 후 | 서비스 효과 측정 (홍보 근거) |

**저장하지 않는 것**: 카메라 영상(브라우저 안에서만 표시), 동의 없는 음성.

## 3. 백엔드가 주는 데이터 (서버 → 사용자)

- 기업 목록과 기업별 면접 유형
- 시나리오: 발제(제목·상황·질문·사실·출처), 참여/제외 팀, 팀별 화두·NPC 주장·슬라이드, 반박 구도(conflicts), 꼬리질문, 평가 기준
- 평가 리포트: 항목별 점수, 근거 문장 인용, 개선 문장 예시, 다른 직무로 다시 하기 추천

## 4. 데이터 모델

```
companies       id, name, interview_types[], active
news_articles   id, company_id, title, outlet, url, published_at, summary, collected_at, source_type(rss|search_api|newsroom)
                -- 기사 본문 전문은 저장·재게시하지 않는다. 제목·링크·요약만.
scenarios       id, company_id, status(draft|review|published|archived), agenda(json), teams(json),
                excluded_teams(json), conflicts(json), follow_ups(json), rubric(json),
                article_ids[], created_by(ai|staff), reviewed_by, published_at
users           id, email, display_name, created_at, consent_marketing, consent_audio
applications    id, user_id, company_id, job_team, stage, interview_date
sessions        id, user_id?, scenario_id, team, started_at, ended_at, phase_durations(json),
                slide(json), script(json), rebuttal(json), qa(json), visited_seats[], self_score(json), transcript(json)
evaluations     id, session_id, model, scores(json), feedback(json), created_at
outcomes        id, session_id, actual_result, reported_at
waitlist        id, email, company_interest, job_team, interview_date, consent, created_at
```

## 5. API

| 메서드 | 경로 | 요청 | 응답 |
|---|---|---|---|
| GET | `/api/companies` | — | `[{id, name, interviewTypes}]` |
| GET | `/api/companies/:id/scenarios?status=published` | — | `[{id, agenda.title, createdAt}]` |
| GET | `/api/scenarios/:id` | — | `scenario-hyundai-india.js`의 `SCENARIO`와 동일 |
| POST | `/api/sessions` | `{scenarioId, team, applicant:{displayName, stage, interviewDate}}` | `{sessionId}` |
| PATCH | `/api/sessions/:id` | 단계별 부분 저장 `{slide}` / `{script}` / `{rebuttal}` / `{qa}` | `204` |
| POST | `/api/sessions/:id/audio` | `multipart/form-data` (동의 시) | `{transcript}` |
| POST | `/api/sessions/:id/complete` | 결과 JSON 전체 (프론트 "내보내기"와 동일) | `{evaluationId}` |
| GET | `/api/evaluations/:id` | — | `{scores, feedback[{criterion, quote, suggestion}]}` |
| POST | `/api/sessions/:id/outcome` | `{actualResult}` | `204` |
| POST | `/api/waitlist` | `{email, companyInterest, jobTeam, interviewDate, consent:true}` | `201` |
| 관리자 | `POST /api/admin/news/collect?company=` | — | 수집 작업 ID |
| 관리자 | `POST /api/admin/scenarios/draft` | `{companyId, articleIds[]}` | AI 초안 시나리오 (status=draft) |
| 관리자 | `POST /api/admin/scenarios/:id/publish` | `{reviewedBy}` | 게시 |

## 6. 뉴스 수집 → 발제 생성

1. **수집**: 기업 공식 뉴스룸 RSS, 네이버 검색 API(뉴스), 주요 언론사 RSS. 하루 1회. 크롤링 대신 공식 API·RSS 우선 (약관·저작권).
2. **선별**: 기업당 최근 30일 기사 중 "부서 간 이해관계가 갈리는 주제"를 고른다 (투자·증설·규제·신사업·공급망).
3. **발제 초안 (AI)**: 주제 → 관련 직무 선정과 제외 사유 → 직무별 화두 → NPC 주장 → 반박 구도 → 꼬리질문. 모든 사실에 `source` 인덱스 필수, 수치 가정은 "(가정)" 표기 강제.
4. **검수 (콘텐츠팀)**: 사실·출처 대조, 특정 기업 비방이나 내부 정보 추정 표현 제거 → `published`.

## 7. AI 평가

- 입력: 시나리오(화두·사실·rubric) + 세션 결과 JSON
- 출력: rubric 5개 항목 점수(1~5), 항목마다 근거로 인용한 지원자 문장과 개선 문장 예시
- 규칙 기반 `selfScore`와 함께 저장해 두 점수 차이를 품질 지표로 쓴다
- 모델은 Claude 계열을 쓴다. 요금은 사용량에 비례하므로 결재-002에서 승인받는다

## 8. 개인정보

- 이메일·면접 답변은 민감할 수 있는 정보로 보고 암호화해 저장하고, 보관 기간을 정한다 (제안: 세션 180일, 탈퇴 즉시 삭제)
- 음성은 기본 저장하지 않는다. 동의하면 받아쓰기 후 원본을 삭제한다
- 배포 전 `/cso` 보안 점검 필수

## 9. 2단계: 실시간 다인원 회의실

여러 지원자가 같은 회의실에 들어가는 스터디 모드. WebSocket 이벤트: `room.join`, `avatar.move {x,y}`, `speaker.start/stop`, `slide.update`, `chat.message`. 1단계(현재)는 1인 + NPC로 검증한다.
