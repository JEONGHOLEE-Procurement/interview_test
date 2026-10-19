/**
 * 앱에서 "결과 JSON 내보내기"로 받은 파일을 Notion 데이터베이스에 바로 기록한다 (서버 배포 없이 사용 가능).
 *   NOTION_TOKEN=secret_xxx NOTION_SESSIONS_DB=<DB ID> SESSIONS_TITLE_PROP=<제목 열> node import-json.mjs ~/Downloads/pt-session-*.json
 * 오너가 직접 올리는 파일이므로 저장 동의로 처리한다. 지원자 파일을 대신 올릴 때는 본인 동의를 먼저 받을 것.
 */
import { readFile } from "node:fs/promises";
import worker from "./worker.js";
const env = { ...process.env, EDIT_SECRET: process.env.EDIT_SECRET || "local-import", ALLOWED_ORIGINS: "local" };
env.NOTION_SESSIONS_DB = (String(env.NOTION_SESSIONS_DB || "").match(/[0-9a-f]{32}/i) || [env.NOTION_SESSIONS_DB])[0];
if (!env.NOTION_TOKEN || !env.NOTION_SESSIONS_DB || process.argv.length < 3) { console.error("사용법: NOTION_TOKEN=... NOTION_SESSIONS_DB=... node import-json.mjs <파일.json> [...]"); process.exit(1); }
let ok = 0;
for (const file of process.argv.slice(2)) {
  const body = { ...JSON.parse(await readFile(file, "utf8")), consent: true };
  const res = await worker.fetch(new Request("https://local/api/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), env);
  const out = await res.json();
  console.log(res.ok ? `기록 완료: ${file}` : `실패: ${file} → ${out.error}`); if (res.ok) ok++;
}
console.log(`${ok}/${process.argv.length - 2}건 기록`);
