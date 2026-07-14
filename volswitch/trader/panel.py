#!/usr/bin/env python3
"""볼스위칭 조종석 v3 — 로컬 웹 대시보드.

panel.bat 실행 → 브라우저가 열림 (http://127.0.0.1:8756).
조회 전용 서버 + 봇 스위치/모드 토글. 주문 기능 없음.
"""
import json
import os
import re
import sys
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.path.join(HERE, ".env")
LOG_PATH = os.path.join(HERE, "trader.log")
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))

PORT = 8756
_cache = {"t": 0.0, "data": None}


def read_env() -> dict:
    d = {}
    if os.path.exists(ENV_PATH):
        for line in open(ENV_PATH, encoding="utf-8"):
            m = re.match(r"^\s*([^#][^=]*)=(.*)$", line)
            if m:
                d[m.group(1).strip()] = m.group(2).strip()
    return d


def set_env_key(key: str, val: str):
    lines = open(ENV_PATH, encoding="utf-8").read().splitlines()
    out, done = [], False
    for ln in lines:
        if re.match(rf"^\s*{key}\s*=", ln):
            out.append(f"{key}={val}")
            done = True
        else:
            out.append(ln)
    if not done:
        out.append(f"{key}={val}")
    open(ENV_PATH, "w", encoding="utf-8").write("\n".join(out) + "\n")


def last_run() -> str:
    if not os.path.exists(LOG_PATH):
        return "기록 없음"
    for ln in reversed(open(LOG_PATH, encoding="utf-8", errors="ignore").readlines()):
        if "----- 실행" in ln:
            return ln.replace("----- 실행 -----", "").strip("[] -\n")
    return "기록 없음"


def log_tail(n=40) -> str:
    if not os.path.exists(LOG_PATH):
        return "아직 실행 기록이 없습니다."
    lines = open(LOG_PATH, encoding="utf-8", errors="ignore").readlines()
    return "".join(lines[-n:])


def fnum(v, default=0.0):
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def build_status(force=False) -> dict:
    now = time.time()
    if not force and _cache["data"] and now - _cache["t"] < 300:
        d = dict(_cache["data"])
        d["env"] = env_state()
        d["last_run"] = last_run()
        return d

    os.environ.update(read_env())
    symbol = os.environ.get("SYMBOL", "TQQQ")
    out = {"symbol": symbol, "env": env_state(), "last_run": last_run()}

    try:
        from daily_signal import compute_state
        out["signal"] = compute_state(None)
    except Exception as e:
        out["signal_error"] = str(e)[:120]

    try:
        from toss_client import TossClient
        c = TossClient()
        raw = c.holdings()
        res = raw.get("result", {}) or {}
        it = next((i for i in res.get("items", []) if i.get("symbol") == symbol), {})
        pl = it.get("profitLoss") or {}
        dpl = it.get("dailyProfitLoss") or {}
        out["account"] = {
            "qty": fnum(it.get("quantity")),
            "avg": fnum(it.get("averagePurchasePrice")),
            "last": fnum(it.get("lastPrice")),
            "value": fnum((it.get("marketValue") or {}).get("amount")),
            "pl": fnum(pl.get("amount")), "pl_rate": fnum(pl.get("rate")) * 100,
            "day": fnum(dpl.get("amount")), "day_rate": fnum(dpl.get("rate")) * 100,
        }
        try:
            out["usd"] = c.usd_cash()
        except Exception:
            out["usd"] = None
        try:
            out["krw"] = c.krw_cash()
        except Exception:
            out["krw"] = 0
        try:
            odata = None
            for q in ("?status=OPEN", ""):
                try:
                    odata = c._req("GET", f"/api/v1/orders{q}")
                    break
                except Exception:
                    continue
            olist = (odata or {}).get("result", odata) or []
            if isinstance(olist, dict):
                olist = olist.get("items") or olist.get("orders") or []
            out["orders"] = [{
                "symbol": o.get("symbol"), "side": o.get("side"),
                "qty": o.get("quantity") or o.get("qty"),
                "price": o.get("price"),
                "status": o.get("status") or o.get("orderStatus"),
            } for o in olist[:6]]
        except Exception:
            out["orders"] = []
    except Exception as e:
        out["account_error"] = str(e)[:150]

    _cache["t"], _cache["data"] = now, out
    return out


def env_state() -> dict:
    env = read_env()
    return {"enabled": env.get("TRADER_ENABLED", "0") == "1",
            "dry": env.get("DRY_RUN", "1") != "0"}


HTML = """<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>볼스위칭 조종석</title>
<style>
:root{--bg:#111318;--card:#1a1e25;--line:#282d37;--ink:#e8eaef;--sub:#9aa3b2;
 --mut:#6b7280;--good:#3fb96b;--good-bg:#12281a;--bad:#e05252;--bad-bg:#2a1517;
 --warn:#d9a13c;--warn-bg:#2a2210;--accent:#5b8def}
*{box-sizing:border-box;margin:0}
body{background:var(--bg);color:var(--ink);font:14px/1.55 'Malgun Gothic',system-ui,sans-serif;
 max-width:680px;margin:0 auto;padding:28px 20px 60px}
h1{font-size:15px;color:var(--sub);font-weight:600;letter-spacing:.4px;margin-bottom:14px;
 display:flex;justify-content:space-between;align-items:center}
h1 .t{color:var(--mut);font-size:11px;font-weight:400}
.banner{border-radius:14px;padding:22px 24px;margin-bottom:14px;border:1px solid var(--line)}
.banner.hold{background:var(--good-bg);border-color:#1e4a2c}
.banner.cash{background:var(--bad-bg);border-color:#4a2222}
.banner .state{font-size:26px;font-weight:800;letter-spacing:.5px}
.banner.hold .state{color:var(--good)}.banner.cash .state{color:var(--bad)}
.banner .desc{color:var(--sub);margin-top:2px;font-size:13px}
.banner .metrics{display:flex;gap:18px;flex-wrap:wrap;margin-top:14px;padding-top:12px;
 border-top:1px solid rgba(255,255,255,.06)}
.metric .k{font-size:11px;color:var(--mut)}.metric .v{font-size:14px;font-weight:700}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;
 padding:18px 20px;margin-bottom:14px}
.card h2{font-size:11px;color:var(--mut);font-weight:600;letter-spacing:1px;margin-bottom:12px}
.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.tile .k{font-size:11px;color:var(--mut)}
.tile .v{font-size:17px;font-weight:750;margin-top:1px;font-variant-numeric:tabular-nums}
.tile .s{font-size:11px;color:var(--sub)}
.pos{color:var(--good)}.neg{color:var(--bad)}
.cashline{margin-top:14px;padding-top:12px;border-top:1px solid var(--line);
 color:var(--sub);font-size:13px}
.warnchip{display:inline-block;background:var(--warn-bg);color:var(--warn);
 border:1px solid #4a3a12;border-radius:8px;padding:2px 8px;font-size:12px;margin-left:8px}
.order{display:flex;justify-content:space-between;padding:7px 0;font-size:13px;
 border-bottom:1px solid var(--line)}
.order:last-child{border-bottom:0}
.order .side-BUY{color:var(--good);font-weight:700}.order .side-SELL{color:var(--bad);font-weight:700}
.empty{color:var(--mut);font-size:13px}
.botrow{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.dot{width:9px;height:9px;border-radius:50%;display:inline-block;margin-right:6px}
.btn{background:#262c36;color:var(--ink);border:1px solid var(--line);border-radius:10px;
 padding:9px 16px;font:600 13px 'Malgun Gothic',sans-serif;cursor:pointer}
.btn:hover{background:#303845}
.btn.danger{background:#3a1d1d;border-color:#5a2b2b;color:#f0a0a0}
.btn.live{background:#3a3212;border-color:#5a4d1d;color:#e8c96a}
.foot{color:var(--mut);font-size:11px;text-align:center;margin-top:22px}
pre{background:#0d0f13;border:1px solid var(--line);border-radius:10px;padding:12px;
 font-size:11px;color:var(--sub);overflow-x:auto;white-space:pre-wrap;display:none}
.skel{color:var(--mut)}
</style></head><body>
<h1>볼스위칭 조종석 <span class="t" id="asof"></span></h1>
<div class="banner" id="banner"><div class="state skel">신호 불러오는 중…</div>
 <div class="desc" id="sigdesc"></div><div class="metrics" id="sigmetrics"></div></div>
<div class="card"><h2>내 계좌</h2><div class="tiles" id="tiles"><span class="skel">조회 중…</span></div>
 <div class="cashline" id="cashline"></div></div>
<div class="card"><h2>진행 중 주문</h2><div id="orders"><span class="skel">조회 중…</span></div></div>
<div class="card"><h2>봇</h2><div class="botrow" id="botrow"></div></div>
<div style="display:flex;gap:10px;justify-content:center;margin-top:6px">
 <button class="btn" onclick="load(true)">새로고침</button>
 <button class="btn" onclick="toggleLog()">로그</button></div>
<pre id="log"></pre>
<div class="foot">조회 전용 · 5분 캐시 · 10분 자동 갱신 · 멈추려면 [봇 끄기] 하나면 됩니다</div>
<script>
const $=id=>document.getElementById(id);
const money=(v,d=2)=>v==null?'—':'$'+Number(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const pct=v=>(v>=0?'+':'')+Number(v).toFixed(2)+'%';
const cls=v=>v>=0?'pos':'neg';
async function load(force){
  const r=await fetch('/api/status'+(force?'?force=1':'')); const d=await r.json();
  const s=d.signal;
  if(s){
    const hold=s.signal_aggressive==='HOLD';
    $('banner').className='banner '+(hold?'hold':'cash');
    $('banner').querySelector('.state').textContent=(hold?'● HOLD':'● CASH')+(s.exception_buy?'  ⚠ 예외매수 발동':'');
    $('banner').querySelector('.state').classList.remove('skel');
    $('sigdesc').textContent=hold?'TQQQ 보유 구간 — 봇이 포지션을 유지합니다':'현금 대기 구간 — 봇이 시장 밖에 있습니다';
    $('asof').textContent='기준일 '+s.asof;
    const m=[['QQQ',s.qqq],['MA150 ±0.5%',(s.ma150*0.995).toFixed(1)+'–'+(s.ma150*1.005).toFixed(1)],
      ['20일 변동성',s.vol20+'%  (진입<32 · 청산>36)'],['RSI14',s.rsi14],['고점대비',s.dd_from_ath+'%']];
    $('sigmetrics').innerHTML=m.map(([k,v])=>`<div class="metric"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
  } else if(d.signal_error){$('banner').querySelector('.state').textContent='신호 오류: '+d.signal_error}
  const a=d.account;
  if(a){
    $('tiles').innerHTML=[
      ['보유',a.qty+'주',d.symbol],
      ['평단가',money(a.avg),''],
      ['현재가',money(a.last),''],
      ['평가금액',money(a.value),''],
      ['총손익',`<span class="${cls(a.pl)}">${money(a.pl)}</span>`,`<span class="${cls(a.pl)}">${pct(a.pl_rate)}</span>`],
      ['오늘',`<span class="${cls(a.day)}">${money(a.day)}</span>`,`<span class="${cls(a.day)}">${pct(a.day_rate)}</span>`],
    ].map(([k,v,s])=>`<div class="tile"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`).join('');
    let cl='달러 현금 <b>'+money(d.usd)+'</b>';
    if(d.krw>=100000) cl+=`<span class="warnchip">⚠ 원화 ₩${Number(d.krw).toLocaleString()} — 앱에서 환전 필요</span>`;
    $('cashline').innerHTML=cl;
  } else if(d.account_error){$('tiles').innerHTML='<span class="empty">계좌 조회 실패: '+d.account_error+'</span>'}
  $('orders').innerHTML=(d.orders&&d.orders.length)?d.orders.map(o=>
    `<div class="order"><span><span class="side-${o.side}">${o.side==='BUY'?'매수':'매도'}</span> ${o.symbol} ${o.qty}주 @ ${o.price??'시장가'}</span><span style="color:var(--sub)">${o.status??''}</span></div>`).join('')
    :'<span class="empty">진행 중 주문 없음</span>';
  const e=d.env;
  $('botrow').innerHTML=
    `<span><span class="dot" style="background:${e.enabled?'var(--good)':'var(--bad)'}"></span>${e.enabled?'작동 중':'꺼짐'}</span>
     <span style="color:var(--sub)">모드 <b style="color:${e.dry?'var(--ink)':'var(--warn)'}">${e.dry?'모의':'⚡실전'}</b></span>
     <span style="color:var(--sub)">마지막 실행 ${d.last_run}</span>
     <span style="color:var(--sub)">다음 매일 04:40</span>
     <button class="btn ${e.enabled?'danger':''}" onclick="act('bot')">${e.enabled?'봇 끄기':'봇 켜기'}</button>
     <button class="btn ${e.dry?'':'live'}" onclick="act('mode')">${e.dry?'실전 전환':'모의로 복귀'}</button>`;
}
async function act(kind){
  const e=(await (await fetch('/api/status')).json()).env;
  if(kind==='bot'&&e.enabled&&!confirm('봇을 끄면 신호가 와도 아무것도 하지 않습니다.\\n(서약의 중단 기준에 해당하나요?)\\n\\n정말 끌까요?'))return;
  if(kind==='mode'&&e.dry&&!confirm('⚡ 다음 실행부터 실제 주문이 나갑니다.\\n주문테스트 + 스케줄 확인을 마쳤나요?'))return;
  await fetch('/api/toggle-'+kind,{method:'POST'}); load();
}
async function toggleLog(){
  const p=$('log');
  if(p.style.display==='block'){p.style.display='none';return}
  p.textContent=await (await fetch('/api/log')).text(); p.style.display='block';
}
load(); setInterval(()=>load(),600000);
</script></body></html>"""


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, body, ctype="application/json"):
        data = body.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", f"{ctype}; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path.startswith("/api/status"):
            self._send(json.dumps(build_status(force="force" in self.path)))
        elif self.path.startswith("/api/log"):
            self._send(log_tail(), "text/plain")
        else:
            self._send(HTML, "text/html")

    def do_POST(self):
        if self.path == "/api/toggle-bot":
            e = env_state()
            set_env_key("TRADER_ENABLED", "0" if e["enabled"] else "1")
        elif self.path == "/api/toggle-mode":
            e = env_state()
            set_env_key("DRY_RUN", "1" if not e["dry"] else "0")
        self._send("{}")


if __name__ == "__main__":
    url = f"http://127.0.0.1:{PORT}"
    try:
        srv = ThreadingHTTPServer(("127.0.0.1", PORT), H)
    except OSError:
        webbrowser.open(url)  # 이미 떠 있음 → 브라우저만 열기
        sys.exit(0)
    threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    srv.serve_forever()
