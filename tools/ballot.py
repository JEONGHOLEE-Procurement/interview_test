"""결재 메일(체크박스형) HTML 생성.

  python3 tools/ballot.py <spec.json> > ballot.html

spec: {"date": "...", "items": [{"no": "002", "title": "...", "ask": "...", "file": "...",
        "options": [{"key": "A", "label": "...", "desc": "...", "recommended": false}]}]}
각 선택지 버튼은 오너 본인에게 가는 mailto 링크다. 제목 "[결재회신] 결재-002 승인 B" 로 오고,
/approve 가 from:오너 subject:결재회신 으로 수집한다.
"""
import html, json, os, sys
from urllib.parse import quote

OWNER = os.environ.get("OWNER_EMAIL") or next((l.split("=", 1)[1].strip() for l in open(os.path.join(os.path.dirname(__file__), "..", ".env"), encoding="utf-8") if l.startswith("OWNER_EMAIL=")), "")


def mailto(subject, body):
    return f"mailto:{OWNER}?subject={quote(subject)}&body={quote(body)}"


def button(text, href, color):
    return (f'<a href="{href}" style="display:inline-block;padding:7px 14px;border-radius:8px;'
            f'background:{color};color:#fff;text-decoration:none;font-size:13px;font-weight:700">{text}</a>')


def item_html(it):
    no, rows = it["no"], []
    for o in it["options"]:
        rec = o.get("recommended")
        subj = f"[결재회신] 결재-{no} 승인 {o['key']}"
        approve = button("이걸로 승인", mailto(subj, f"결재-{no} 승인 {o['key']}\n코멘트: "), "#2d6cdf" if rec else "#5b6472")
        rows.append(f"""
<tr><td style="padding:10px 12px;border-top:1px solid #e6e8ec;vertical-align:top;width:28px;font-size:20px;color:{'#2d6cdf' if rec else '#9aa1ad'}">{'☑' if rec else '☐'}</td>
<td style="padding:10px 4px;border-top:1px solid #e6e8ec">
<b>{html.escape(o['key'])}안. {html.escape(o['label'])}</b>{' <span style="background:#e8f0fe;color:#2d6cdf;font-size:11px;padding:2px 6px;border-radius:4px">CEO 권고</span>' if rec else ''}
<div style="color:#555;font-size:13px;margin-top:2px">{html.escape(o['desc'])}</div></td>
<td style="padding:10px 12px;border-top:1px solid #e6e8ec;text-align:right;white-space:nowrap">{approve}</td></tr>""")
    hold = button("보류", mailto(f"[결재회신] 결재-{no} 보류", f"결재-{no} 보류\n사유: "), "#9aa1ad")
    reject = button("반려", mailto(f"[결재회신] 결재-{no} 반려", f"결재-{no} 반려\n사유: "), "#d9534f")
    return f"""
<div style="border:1px solid #dfe3e8;border-radius:12px;margin:0 0 18px;overflow:hidden">
<div style="background:#f6f8fa;padding:12px 14px"><div style="font-size:12px;color:#777">결재-{no}</div>
<div style="font-size:16px;font-weight:700">{html.escape(it['title'])}</div>
<div style="font-size:13px;color:#444;margin-top:4px">{html.escape(it['ask'])}</div></div>
<table style="width:100%;border-collapse:collapse;font-size:14px">{''.join(rows)}</table>
<div style="padding:10px 14px;border-top:1px solid #e6e8ec;font-size:12px;color:#777">{hold} {reject} &nbsp; 상세: <code>{html.escape(it['file'])}</code></div>
</div>"""


def main():
    spec = json.load(open(sys.argv[1], encoding="utf-8"))
    bulk = " ".join(f"{i['no']}-{next((o['key'] for o in i['options'] if o.get('recommended')), i['options'][0]['key'])}" for i in spec["items"])
    all_rec = button("권고안 전부 승인", mailto("[결재회신] 일괄 승인", f"일괄 {bulk}\n코멘트: "), "#1f9d55")
    print(f"""<div style="font-family:-apple-system,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;max-width:640px;margin:0 auto;color:#111">
<h2 style="margin:0 0 4px">결재 요청 {len(spec['items'])}건</h2>
<div style="color:#666;font-size:13px;margin-bottom:16px">{html.escape(spec['date'])} · CEO 상신 · ☑ 표시는 CEO 권고안</div>
<div style="background:#f0f7f2;border:1px solid #cfe8d6;border-radius:10px;padding:12px 14px;margin-bottom:18px;font-size:13px">
<b>결재 방법</b> — 원하는 선택지의 버튼을 누르면 회신 메일이 자동 작성됩니다. 코멘트를 적고 보내기만 하면 됩니다.<br>
여러 건을 한 번에: 이 메일에 <code>002-B 003-A 004-B</code> 처럼 회신해도 됩니다.<br><br>{all_rec} <span style="color:#666">({html.escape(bulk)})</span></div>
{''.join(item_html(i) for i in spec['items'])}
<div style="font-size:12px;color:#888">Discord 연결 전까지 결재는 이 메일로 받습니다. 회신은 오너 본인 주소에서 보낸 것만 결재로 처리합니다.</div></div>""")


main()
