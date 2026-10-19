/**
 * 기존 Notion 데이터베이스를 "면접 세션" 저장용으로 준비한다 (빠진 열만 추가, 기존 열·데이터는 건드리지 않음).
 *   NOTION_TOKEN=secret_xxx node setup.mjs <데이터베이스 ID 또는 URL>
 * 출력되는 제목 열 이름을 SESSIONS_TITLE_PROP 로 쓴다.
 */
import { SESSION_SCHEMA } from "./worker.js";
const token = process.env.NOTION_TOKEN, arg = process.argv[2] || "";
const id = (arg.match(/[0-9a-f]{32}/i) || [arg.replace(/-/g, "")])[0];
if (!token || !/^[0-9a-f]{32}$/i.test(id)) { console.error("사용법: NOTION_TOKEN=... node setup.mjs <데이터베이스 ID/URL>"); process.exit(1); }
const api = async (method, path, body) => {
  const r = await fetch("https://api.notion.com/v1" + path, { method, headers: { Authorization: `Bearer ${token}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
  const j = await r.json(); if (!r.ok) { console.error(`Notion ${r.status}: ${j.message}`); process.exit(1); } return j;
};
const db = await api("GET", `/databases/${id}`);
const existing = db.properties, titleProp = Object.keys(existing).find(k => existing[k].type === "title");
const add = {}, conflicts = [];
for (const [name, def] of Object.entries(SESSION_SCHEMA)) {
  if (!existing[name]) add[name] = def;
  else if (existing[name].type !== Object.keys(def)[0]) conflicts.push(`${name} (현재 ${existing[name].type}, 필요 ${Object.keys(def)[0]})`);
}
if (Object.keys(add).length) await api("PATCH", `/databases/${id}`, { properties: add });
console.log(`데이터베이스: ${db.title.map(t => t.plain_text).join("") || id}`);
console.log(`추가한 열 ${Object.keys(add).length}개: ${Object.keys(add).join(", ") || "없음"}`);
if (conflicts.length) console.log(`종류가 달라 건너뛴 열: ${conflicts.join(", ")} → 해당 열 이름을 바꾸거나 지운 뒤 다시 실행하세요`);
console.log(`제목 열: "${titleProp}"  →  SESSIONS_TITLE_PROP="${titleProp}"`);
