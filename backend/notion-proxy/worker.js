/**
 * 첫무대 Notion 중계 서버 (Cloudflare Worker)
 *
 *   POST  /api/sessions               면접 세션 저장 → Notion "면접 세션" DB에 1행
 *   PATCH /api/sessions/:id/outcome   만족도·실제 결과 기록 (저장 때 받은 editToken 필요)
 *   POST  /api/waitlist               출시 알림 신청 → Notion "대기자" DB
 *
 * 브라우저가 Notion 토큰을 갖지 않도록 이 서버만 Notion API를 호출한다.
 */
const NOTION_VERSION = "2022-06-28";
const MAX_TEXT = 2000;          // Notion rich_text 1개 조각 최대 길이
const MAX_FIELD = 6000;         // 속성 하나에 담을 최대 글자 수 (넘으면 자름, 원본은 본문 JSON에 있음)
const MAX_BODY = 200_000;       // 요청 본문 최대 크기
const TEAMS = ["원가팀", "구매팀", "생산관리팀", "생산기술팀", "품질팀", "해외영업팀", "미국영업팀", "재무팀", "연구개발팀", "상품기획팀", "물류SCM팀", "법인영업팀", "서비스팀"];
const STAGES = ["서류합격", "1차면접", "최종면접"];
const COMPANIES = ["현대자동차", "기아"];

export const SESSION_SCHEMA = {
  "발제": { select: {} }, "기업": { select: {} }, "직무": { select: {} }, "지원자": { rich_text: {} },
  "전형 단계": { select: {} }, "면접 예정일": { date: {} }, "시작": { date: {} }, "종료": { date: {} },
  "발표 시간(초)": { number: {} }, "제한 시간 준수": { checkbox: {} }, "슬라이드 제목": { rich_text: {} },
  "슬라이드 내용": { rich_text: {} }, "발표 스크립트": { rich_text: {} }, "스크립트 방식": { select: {} },
  "반박 부서": { rich_text: {} }, "반박 내용": { rich_text: {} }, "반박 답변": { rich_text: {} }, "질의응답": { rich_text: {} },
  "방문한 자리": { multi_select: {} }, "화두 적합성": { number: {} }, "근거·수치": { number: {} }, "타 부서 고려": { number: {} },
  "리스크·대안": { number: {} }, "구조·전달": { number: {} }, "만족도": { select: {} }, "실제 결과": { select: {} },
  "저장 동의": { checkbox: {} }, "AI 평가": { rich_text: {} },
};

export default {
  async fetch(req, env) {
    const cors = corsHeaders(req, env);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const url = new URL(req.url);
    try {
      if (req.method === "POST" && url.pathname === "/api/sessions") return json(await createSession(await readBody(req), env), 201, cors);
      const m = url.pathname.match(/^\/api\/sessions\/([0-9a-f-]{32,36})\/outcome$/);
      if (req.method === "PATCH" && m) return json(await updateOutcome(m[1], await readBody(req), env), 200, cors);
      if (req.method === "POST" && url.pathname === "/api/waitlist") return json(await addWaitlist(await readBody(req), env), 201, cors);
      return json({ error: "not_found" }, 404, cors);
    } catch (e) {
      const status = e.status || 500;
      if (status >= 500) console.error(e);
      return json({ error: status >= 500 ? "server_error" : e.message }, status, cors);
    }
  },
};

/* ---------- 세션 저장 ---------- */
async function createSession(b, env) {
  if (b.consent !== true) throw bad("consent_required");
  const scenarios = JSON.parse(env.SCENARIO_PAGES || "{}");
  if (!/^[a-z0-9-]{3,60}$/.test(b.scenarioId || "")) throw bad("unknown_scenario");
  if (!TEAMS.includes(b.teamName)) throw bad("unknown_team");

  const slideText = (b.slide?.text || []).map(String);
  const qa = (b.qa || []).map((q, i) => `Q${i + 1}. ${q.question}\nA. ${q.answer || "(무응답)"} (${q.seconds ?? "?"}초)`).join("\n\n");
  const score = b.selfScore || {};
  const name = clip(b.applicant?.displayName || "익명", 40);
  const props = {
    [env.SESSIONS_TITLE_PROP || "세션"]: title(`${name} · ${b.teamName} · ${(b.startedAt || "").slice(0, 16).replace("T", " ")}`),
    // 발제 DB가 있으면 관계형으로 연결, 없으면 선택 항목으로 기록
    "발제": scenarios[b.scenarioId] ? { relation: [{ id: scenarios[b.scenarioId] }] } : select(clip(b.scenarioTitle || b.scenarioId, 90).replace(/,/g, " ")),
    "직무": select(b.teamName),
    "지원자": text(name),
    "전형 단계": select(STAGES.includes(b.applicant?.stage) ? b.applicant.stage : "미입력"),
    "시작": date(b.startedAt), "종료": date(b.endedAt),
    "발표 시간(초)": num(b.script?.seconds),
    "제한 시간 준수": { checkbox: !!b.withinTime },
    "슬라이드 제목": text(b.slideTitle || slideText[1] || ""),
    "슬라이드 내용": text(slideText.join("\n")),
    "발표 스크립트": text(b.script?.text || ""),
    "스크립트 방식": select(b.script?.source === "speech" ? "음성" : "타이핑"),
    "반박 부서": text(b.rebuttal?.fromName || ""),
    "반박 내용": text(b.rebuttal?.prompt || ""),
    "반박 답변": text(b.rebuttal?.answer || ""),
    "질의응답": text(qa),
    "방문한 자리": { multi_select: (b.visitedSeatNames || []).filter(t => TEAMS.includes(t)).map(n => ({ name: n })) },
    "화두 적합성": num(score.fit), "근거·수치": num(score.evidence), "타 부서 고려": num(score.collab),
    "리스크·대안": num(score.risk), "구조·전달": num(score.structure),
    "저장 동의": { checkbox: true },
  };
  if (COMPANIES.includes(b.companyName)) props["기업"] = select(b.companyName);
  if (isDate(b.applicant?.interviewDate)) props["면접 예정일"] = date(b.applicant.interviewDate);

  const page = await notion(env, "POST", "/pages", {
    parent: { database_id: env.NOTION_SESSIONS_DB },
    properties: props,
    children: [
      heading("원본 데이터 (앱 전송 JSON)"),
      codeBlock(JSON.stringify(b, null, 2).slice(0, 190_000)),
    ],
  });
  return { sessionId: page.id, editToken: await sign(page.id, env) };
}

/* ---------- 만족도·실제 결과 ---------- */
async function updateOutcome(pageId, b, env) {
  if (b.editToken !== await sign(pageId.replace(/-/g, ""), env) && b.editToken !== await sign(pageId, env)) throw bad("invalid_token", 403);
  const props = {};
  if (["1", "2", "3", "4", "5"].includes(String(b.satisfaction))) props["만족도"] = select(String(b.satisfaction));
  if (["합격", "불합격", "미정"].includes(b.actualResult)) props["실제 결과"] = select(b.actualResult);
  if (!Object.keys(props).length) throw bad("nothing_to_update");
  await notion(env, "PATCH", `/pages/${pageId}`, { properties: props });
  return { ok: true };
}

/* ---------- 대기자 ---------- */
async function addWaitlist(b, env) {
  if (b.consent !== true) throw bad("consent_required");
  const email = String(b.email || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) throw bad("invalid_email");
  const props = {
    "이름": title(clip(b.name || email.split("@")[0], 40)),
    "이메일": { email },
    "관심 기업": text(clip(b.company || "", 200)),
    "지원 직무": text(clip(b.job || "", 200)),
    "개인정보 동의": { checkbox: true },
  };
  if (["인스타그램", "스레드", "네이버", "지인", "기타"].includes(b.channel)) props["유입 채널"] = select(b.channel);
  if (isDate(b.interviewDate)) props["면접 예정일"] = date(b.interviewDate);
  await notion(env, "POST", "/pages", { parent: { database_id: env.NOTION_WAITLIST_DB }, properties: props });
  return { ok: true };
}

/* ---------- Notion 헬퍼 ---------- */
async function notion(env, method, path, body) {
  if (!env.NOTION_TOKEN) throw Object.assign(new Error("NOTION_TOKEN not set"), { status: 500 });
  const res = await fetch("https://api.notion.com/v1" + path, {
    method,
    headers: { Authorization: `Bearer ${env.NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw Object.assign(new Error(`notion ${res.status}: ${await res.text()}`), { status: 502 });
  return res.json();
}
const chunks = (s, n = MAX_TEXT) => { const out = []; for (let i = 0; i < s.length && out.length < 100; i += n) out.push({ type: "text", text: { content: s.slice(i, i + n) } }); return out; };
const clip = (s, n) => String(s).slice(0, n);
const title = s => ({ title: chunks(clip(s, 200)) });
const text = s => ({ rich_text: chunks(clip(s, MAX_FIELD)) });
const select = name => ({ select: { name } });
const num = v => ({ number: Number.isFinite(+v) ? +v : null });
const isDate = v => typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v);
const date = v => ({ date: isDate(v) ? { start: v } : null });
const heading = s => ({ object: "block", type: "heading_3", heading_3: { rich_text: chunks(s) } });
const codeBlock = s => ({ object: "block", type: "code", code: { language: "json", rich_text: chunks(s) } });

/* ---------- 공통 ---------- */
async function readBody(req) {
  const raw = await req.text();
  if (raw.length > MAX_BODY) throw bad("too_large", 413);
  try { return JSON.parse(raw); } catch { throw bad("invalid_json"); }
}
async function sign(id, env) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.EDIT_SECRET || ""), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(id.replace(/-/g, "")));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/[+/=]/g, c => ({ "+": "-", "/": "_", "=": "" }[c]));
}
function corsHeaders(req, env) {
  const origin = req.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim());
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0] || "",
    "Access-Control-Allow-Methods": "POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}
const json = (o, status, headers) => new Response(JSON.stringify(o), { status, headers: { ...headers, "Content-Type": "application/json" } });
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
