"""Discord 결재 채널 연동.

  python3 tools/discord.py send <파일.md> [--title 제목]   결재문서·브리핑을 채널에 텍스트로 전송
  python3 tools/discord.py inbox [--after 메시지ID]         오너가 보낸 결재 회신 조회 (JSON 출력)

설정은 프로젝트 루트의 .env (.env.example 참고).
결재 회신 형식: "결재-002 승인 A 코멘트..." / "결재-002 반려 사유" / "결재-002 보류"
"""
import json, os, re, sys, urllib.request, urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LIMIT = 1900  # Discord 메시지 2000자 제한
DECISION = re.compile(r"결재-?(\d{3})\s*(승인|반려|보류)\s*(.*)", re.S)


def load_env():
    env = {}
    p = ROOT / ".env"
    if p.exists():
        for line in p.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    env.update({k: v for k, v in os.environ.items() if k.startswith("DISCORD_")})
    return env


def request(url, method="GET", data=None, token=None):
    headers = {"Content-Type": "application/json", "User-Agent": "jobprep-ceo/1.0"}
    if token:
        headers["Authorization"] = f"Bot {token}"
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        sys.exit(f"Discord API 오류 {e.code}: {e.read().decode(errors='replace')}")


def chunks(text):
    out, cur = [], ""
    for line in text.splitlines(keepends=True):
        pieces = [line[i:i + LIMIT] for i in range(0, len(line), LIMIT)] or [line]
        for piece in pieces:
            if len(cur) + len(piece) > LIMIT:
                out.append(cur)
                cur = ""
            cur += piece
    out.append(cur)
    return [c for c in out if c.strip()]


def send(path, title=None):
    env = load_env()
    url = env.get("DISCORD_WEBHOOK_URL")
    if not url:
        sys.exit("DISCORD_WEBHOOK_URL 이 .env 에 없습니다.")
    text = Path(path).read_text(encoding="utf-8")
    text = re.sub(r"^---\n.*?\n---\n", "", text, flags=re.S)  # frontmatter 제외
    if title:
        text = f"**{title}**\n{text}"
    parts = chunks(text)
    for i, part in enumerate(parts, 1):
        suffix = f"\n`({i}/{len(parts)})`" if len(parts) > 1 else ""
        request(url + "?wait=true", "POST", {"content": part + suffix, "allowed_mentions": {"parse": []}})
    print(f"전송 완료: {path} ({len(parts)}개 메시지)")


def inbox(after=None):
    env = load_env()
    token, channel, owner = (env.get(k) for k in ("DISCORD_BOT_TOKEN", "DISCORD_CHANNEL_ID", "DISCORD_OWNER_ID"))
    if not (token and channel and owner):
        sys.exit("DISCORD_BOT_TOKEN / DISCORD_CHANNEL_ID / DISCORD_OWNER_ID 가 .env 에 필요합니다.")
    url = f"https://discord.com/api/v10/channels/{channel}/messages?limit=100"
    if after:
        url += f"&after={after}"
    decisions = []
    for m in request(url, token=token):
        if m["author"]["id"] != owner:  # 오너 외 메시지는 결재로 인정하지 않음
            continue
        hit = DECISION.search(m.get("content", ""))
        if hit:
            decisions.append({"message_id": m["id"], "timestamp": m["timestamp"],
                              "number": f"결재-{hit[1]}", "decision": hit[2], "comment": hit[3].strip()})
    print(json.dumps(sorted(decisions, key=lambda d: d["timestamp"]), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    args = sys.argv[1:]
    if args[:1] == ["send"] and len(args) >= 2:
        send(args[1], args[args.index("--title") + 1] if "--title" in args else None)
    elif args[:1] == ["inbox"]:
        inbox(args[args.index("--after") + 1] if "--after" in args else None)
    else:
        sys.exit(__doc__)
