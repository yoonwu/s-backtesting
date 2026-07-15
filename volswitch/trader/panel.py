#!/usr/bin/env python3
"""볼스위칭 조종석 v4 — 로컬 웹 대시보드 (http://127.0.0.1:8756).

panel.bat 실행 → 브라우저 자동 오픈. 조회 전용 + 봇 스위치. 주문 기능 없음.
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
    """마지막 실행 = 로그 파일의 최종 수정 시각 (인코딩 무관, 항상 정확)."""
    if not os.path.exists(LOG_PATH):
        return "기록 없음"
    import datetime
    mt = datetime.datetime.fromtimestamp(os.path.getmtime(LOG_PATH))
    return mt.strftime("%Y-%m-%d %H:%M")


def log_tail(n=60) -> str:
    if not os.path.exists(LOG_PATH):
        return "아직 실행 기록이 없습니다."
    return "".join(open(LOG_PATH, encoding="utf-8", errors="ignore").readlines()[-n:])


def fnum(v, default=0.0):
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def env_state() -> dict:
    env = read_env()
    return {"enabled": env.get("TRADER_ENABLED", "0") == "1",
            "dry": env.get("DRY_RUN", "1") != "0"}


def spark_series():
    """최근 ~6개월 QQQ 종가 + MA150 + 레짐(히스테리시스) — 히어로 차트용."""
    import numpy as np
    import yfinance as yf
    df = yf.download("QQQ", period="2y", auto_adjust=True, progress=False)
    df.columns = [c[0] if isinstance(c, tuple) else c for c in df.columns]
    close = df["Close"].dropna()
    ma = close.rolling(150).mean()
    vol = close.pct_change().rolling(20).std() * np.sqrt(252) * 100
    on, regime = False, []
    for c, m, v in zip(close, ma, vol):
        if not (np.isnan(m) or np.isnan(v)):
            if not on and c > m * 1.005 and v < 32:
                on = True
            elif on and (c < m * 0.995 or v > 36):
                on = False
        regime.append(on)
    n = 130
    return {
        "dates": [d.strftime("%m/%d") for d in close.index[-n:]],
        "close": [round(float(x), 2) for x in close[-n:]],
        "ma": [round(float(x), 2) for x in ma[-n:]],
        "regime": regime[-n:],
    }


def build_status(force=False) -> dict:
    now = time.time()
    if not force and _cache["data"] and now - _cache["t"] < 300:
        d = dict(_cache["data"])
        d["env"], d["last_run"] = env_state(), last_run()
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
        out["spark"] = spark_series()
    except Exception:
        out["spark"] = None

    try:
        from toss_client import TossClient
        c = TossClient()
        raw = c.holdings()
        res = raw.get("result", {}) or {}
        it = next((i for i in res.get("items", []) if i.get("symbol") == symbol), {})
        pl, dpl = it.get("profitLoss") or {}, it.get("dailyProfitLoss") or {}
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
                "qty": o.get("quantity") or o.get("qty"), "price": o.get("price"),
                "status": o.get("status") or o.get("orderStatus"),
            } for o in olist[:6]]
        except Exception:
            out["orders"] = []
    except Exception as e:
        out["account_error"] = str(e)[:150]

    _cache["t"], _cache["data"] = now, out
    return out


def build_history() -> dict:
    """체결 내역(토스 주문 API) + 자체 장부(journal.jsonl)."""
    os.environ.update(read_env())
    out = {"journal": [], "trades": [], "trades_error": None}
    jp = os.path.join(HERE, "journal.jsonl")
    if os.path.exists(jp):
        for ln in open(jp, encoding="utf-8", errors="ignore"):
            try:
                out["journal"].append(json.loads(ln))
            except Exception:
                pass
        out["journal"] = out["journal"][-500:]
    try:
        from toss_client import TossClient
        c = TossClient()
        items = []
        for q in ("?status=CLOSED", "?status=DONE", ""):
            try:
                r = c._req("GET", f"/api/v1/orders{q}")
                lst = r.get("result", r) or []
                if isinstance(lst, dict):
                    lst = lst.get("items") or lst.get("orders") or []
                if lst:
                    items = lst
                    break
            except Exception as e:
                out["trades_error"] = str(e)[:150]
        def g(o, *keys):
            for k in keys:
                if o.get(k) is not None:
                    return o.get(k)
            return None
        out["trades"] = [{
            "date": g(o, "orderedAt", "createdAt", "orderDateTime", "dateTime", "timestamp"),
            "side": g(o, "side"),
            "symbol": g(o, "symbol"),
            "qty": g(o, "filledQuantity", "executedQuantity", "quantity", "qty"),
            "price": g(o, "filledPrice", "executedPrice", "averagePrice", "price"),
            "status": g(o, "status", "orderStatus"),
        } for o in items[:60]]
        if items:
            out["trades_error"] = None
    except Exception as e:
        out["trades_error"] = str(e)[:150]
    return out


HTML = r"""<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>볼스위칭 조종석</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<style>
:root{
 --bg:#0a0c0f;--card:#12151b;--card2:#0e1116;--line:rgba(255,255,255,.055);
 --ink:#eceef2;--sub:#8b93a1;--mut:#5b6270;
 --up:#2fbf71;--up-dim:rgba(47,191,113,.10);--dn:#e0555a;--dn-dim:rgba(224,85,90,.08);
 --brass:#c9a353;
 --mono:"SF Mono",SFMono-Regular,Consolas,"Cascadia Mono",monospace;
}
*{box-sizing:border-box;margin:0}
html{-webkit-text-size-adjust:100%}
body{background:var(--bg);color:var(--ink);
 font:14px/1.6 "Pretendard Variable",Pretendard,"Malgun Gothic",system-ui,sans-serif;
 max-width:700px;margin:0 auto;padding:26px 18px 56px}
.num{font-family:var(--mono);font-variant-numeric:tabular-nums;letter-spacing:-.02em}
header{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:16px}
.wordmark{font-size:13px;font-weight:800;letter-spacing:.32em;color:var(--brass)}
.wordmark small{color:var(--mut);font-weight:500;letter-spacing:.1em;margin-left:8px}
.asof{font-size:11px;color:var(--mut)}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;
 padding:18px 20px;margin-bottom:12px}
.eyebrow{font-size:10px;font-weight:700;letter-spacing:.18em;color:var(--mut);
 text-transform:uppercase;margin-bottom:10px}
/* --- hero --- */
#hero{padding:20px 20px 12px}
.staterow{display:flex;align-items:center;gap:12px;margin-bottom:4px}
.pulse{width:10px;height:10px;border-radius:50%;position:relative}
.pulse::after{content:"";position:absolute;inset:-5px;border-radius:50%;opacity:.35;
 animation:pp 2.4s ease-out infinite}
@keyframes pp{0%{transform:scale(.4);opacity:.5}80%{transform:scale(1.5);opacity:0}100%{opacity:0}}
@media (prefers-reduced-motion:reduce){.pulse::after{animation:none}}
.state{font-size:24px;font-weight:800;letter-spacing:.02em}
.hold .pulse{background:var(--up)}.hold .pulse::after{background:var(--up)}
.hold .state{color:var(--up)}
.cash .pulse{background:var(--dn)}.cash .pulse::after{background:var(--dn)}
.cash .state{color:var(--dn)}
.statedesc{color:var(--sub);font-size:12.5px;margin-bottom:12px}
.exchip{background:rgba(217,161,60,.12);color:#d9a13c;border:1px solid rgba(217,161,60,.3);
 border-radius:999px;padding:2px 10px;font-size:12px;font-weight:700;margin-left:6px}
#chartwrap{position:relative;margin:2px -6px 8px}
#tip{position:absolute;display:none;background:#1b202a;border:1px solid var(--line);
 border-radius:8px;padding:6px 10px;font-size:11px;color:var(--sub);pointer-events:none;
 white-space:nowrap;z-index:2}
#tip b{color:var(--ink)}
.legend{display:flex;gap:16px;font-size:11px;color:var(--sub);margin-top:2px}
.legend i{display:inline-block;width:14px;height:0;border-top:2px solid;margin-right:5px;
 vertical-align:middle}
.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:10px 14px;border-top:1px solid var(--line);margin-top:10px;padding-top:12px}
.metric{min-width:0}
.metric .k{font-size:10px;color:var(--mut);letter-spacing:.08em}
.metric .v{font-size:14px;font-weight:700;margin-top:1px}
/* --- account --- */
.heronum{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap}
.heronum .big{font-size:34px;font-weight:800}
.delta{font-size:14px;font-weight:700}
.delta.up{color:var(--up)}.delta.dn{color:var(--dn)}
.subline{color:var(--sub);font-size:12px;margin-top:2px}
.tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:16px}
@media(max-width:520px){.tiles{grid-template-columns:repeat(2,1fr)}}
.tile{background:var(--card2);border:1px solid var(--line);border-radius:10px;padding:10px 12px}
.tile .k{font-size:10px;color:var(--mut);letter-spacing:.06em}
.tile .v{font-size:15px;font-weight:700;margin-top:2px}
.krwwarn{margin-top:10px;font-size:12px;color:#d9a13c}
/* --- orders / bot --- */
.order{display:flex;justify-content:space-between;align-items:center;padding:8px 0;
 border-bottom:1px solid var(--line);font-size:13px}
.order:last-child{border-bottom:0}
.badge{font-size:11px;font-weight:800;border-radius:6px;padding:2px 7px;margin-right:8px}
.badge.BUY{background:var(--up-dim);color:var(--up)}
.badge.SELL{background:var(--dn-dim);color:var(--dn)}
.ostatus{color:var(--mut);font-size:11.5px}
.empty{color:var(--mut);font-size:12.5px}
.botline{display:flex;align-items:center;gap:14px;flex-wrap:wrap;font-size:13px;color:var(--sub)}
.botline b{color:var(--ink)}
.chip{border-radius:999px;padding:2px 10px;font-size:11.5px;font-weight:700;border:1px solid}
.chip.on{color:var(--up);border-color:rgba(47,191,113,.35);background:var(--up-dim)}
.chip.off{color:var(--dn);border-color:rgba(224,85,90,.35);background:var(--dn-dim)}
.chip.dry{color:var(--sub);border-color:var(--line);background:var(--card2)}
.chip.live{color:var(--brass);border-color:rgba(201,163,83,.4);background:rgba(201,163,83,.08)}
.actions{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}
button{font:600 12.5px "Pretendard Variable",Pretendard,sans-serif;color:var(--ink);
 background:var(--card2);border:1px solid var(--line);border-radius:9px;
 padding:9px 15px;cursor:pointer;transition:background .15s}
button:hover{background:#1a1f28}
button:focus-visible{outline:2px solid var(--brass);outline-offset:1px}
button.stop{color:#f0a3a6;border-color:rgba(224,85,90,.3)}
button.golive{color:var(--brass);border-color:rgba(201,163,83,.35)}
.tabs{display:flex;gap:6px;margin-bottom:14px}
.tab{border:1px solid var(--line);border-radius:999px;padding:6px 16px;font-size:12.5px;
 font-weight:700;color:var(--sub);cursor:pointer;background:var(--card2)}
.tab.active{color:var(--brass);border-color:rgba(201,163,83,.4);background:rgba(201,163,83,.08)}
table{width:100%;border-collapse:collapse;font-size:12.5px}
th{font-size:10px;color:var(--mut);letter-spacing:.08em;text-align:left;font-weight:600;
 padding:4px 8px 8px 0;border-bottom:1px solid var(--line)}
td{padding:7px 8px 7px 0;border-bottom:1px solid var(--line);vertical-align:top}
tr:last-child td{border-bottom:0}
.tag{font-size:10.5px;font-weight:700;border-radius:6px;padding:1px 7px}
.tag.dep{background:rgba(91,141,239,.12);color:#7ea3f5}
.tag.wd{background:var(--dn-dim);color:var(--dn)}
.tag.trade{background:var(--up-dim);color:var(--up)}
.tag.manual{background:rgba(217,161,60,.12);color:#d9a13c}
.note{font-size:11px;color:var(--mut);margin-top:10px;line-height:1.6}
.tablewrap{overflow-x:auto}
footer{color:var(--mut);font-size:11px;text-align:center;margin-top:20px;line-height:1.8}
pre{background:var(--card2);border:1px solid var(--line);border-radius:10px;padding:12px 14px;
 font:11px/1.7 var(--mono);color:var(--sub);overflow-x:auto;white-space:pre-wrap;
 display:none;margin-top:10px}
.skel{color:var(--mut)}
</style></head><body>
<header><div class="wordmark">VOL·SWITCH<small>조종석</small></div>
 <div class="asof num" id="asof"></div></header>
<div class="tabs">
 <span class="tab active" id="tab-dash" onclick="showTab('dash')">대시보드</span>
 <span class="tab" id="tab-hist" onclick="showTab('hist')">히스토리</span>
</div>
<div id="view-dash">

<div class="card" id="hero">
 <div class="staterow" id="staterow"><span class="pulse"></span>
  <span class="state skel">불러오는 중…</span></div>
 <div class="statedesc" id="statedesc"></div>
 <div id="chartwrap"><svg id="chart" width="100%" height="150" viewBox="0 0 660 150"
   preserveAspectRatio="none" role="img" aria-label="QQQ 6개월 추이와 전략 레짐"></svg>
  <div id="tip"></div></div>
 <div class="legend"><span><i style="border-color:#aeb6c4"></i>QQQ</span>
  <span><i style="border-color:#5b6270;border-top-style:dashed"></i>MA150</span>
  <span><i style="border-color:var(--up)"></i>보유 구간</span>
  <span><i style="border-color:var(--dn)"></i>현금 구간</span></div>
 <div class="metrics" id="metrics"></div>
</div>

<div class="card"><div class="eyebrow">내 계좌</div>
 <div class="heronum"><span class="big num" id="value">—</span>
  <span class="delta num" id="pl"></span></div>
 <div class="subline" id="acctsub"></div>
 <div class="tiles" id="tiles"></div>
 <div class="krwwarn" id="krwwarn"></div>
</div>

<div class="card"><div class="eyebrow">진행 중 주문</div><div id="orders">
 <span class="skel">조회 중…</span></div></div>

<div class="card"><div class="eyebrow">봇</div>
 <div class="botline" id="botline"></div>
 <div class="actions" id="actions"></div>
</div>

</div>

<div id="view-hist" style="display:none">
 <div class="card"><div class="eyebrow">체결 내역 (토스)</div>
  <div class="tablewrap" id="trades"><span class="skel">조회 중…</span></div></div>
 <div class="card"><div class="eyebrow">자산 일지 (봇 기록)</div>
  <svg id="equity" width="100%" height="70" viewBox="0 0 660 70" preserveAspectRatio="none"
   style="display:none;margin-bottom:10px"></svg>
  <div class="tablewrap" id="ledger"><span class="skel">조회 중…</span></div>
  <div class="note">입출금은 토스 API에 조회 기능이 없어 봇의 일일 스냅샷으로 추정합니다 —
   매매 없이 현금이 변한 날을 <span class="tag dep">입금 추정</span>/<span class="tag wd">출금 추정</span>으로 표시.
   기록은 봇 가동일부터 쌓입니다.</div></div>
</div>

<footer>조회 전용 · 5분 캐시 · 10분 자동 갱신 · 이 페이지는 내 컴퓨터 안에서만 열립니다<br>
 <a href="#" onclick="toggleLog();return false" style="color:var(--mut)">실행 로그 보기</a></footer>
<pre id="log"></pre>

<script>
const $=id=>document.getElementById(id);
const money=(v,d=2)=>v==null?'—':'$'+Number(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const pct=v=>(v>=0?'+':'')+Number(v).toFixed(2)+'%';

function drawChart(sp){
  if(!sp||!sp.close||sp.close.length<2){$('chart').innerHTML='';return}
  const W=660,H=150,PT=8,PB=18,n=sp.close.length;
  const all=sp.close.concat(sp.ma.filter(v=>v!=null));
  const lo=Math.min(...all)*0.995,hi=Math.max(...all)*1.005;
  const X=i=>i/(n-1)*W, Y=v=>PT+(1-(v-lo)/(hi-lo))*(H-PT-PB);
  let rects='';let s=0;
  for(let i=1;i<=n;i++){
    if(i===n||sp.regime[i]!==sp.regime[s]){
      const c=sp.regime[s]?'rgba(47,191,113,.10)':'rgba(224,85,90,.07)';
      rects+=`<rect x="${X(s)}" y="0" width="${X(Math.min(i,n-1))-X(s)}" height="${H-PB+4}" fill="${c}"/>`;
      s=i;}}
  const path=a=>a.map((v,i)=>v==null?'':(i===0||a[i-1]==null?'M':'L')+X(i).toFixed(1)+' '+Y(v).toFixed(1)).join(' ');
  const area=path(sp.close)+` L ${W} ${H-PB} L 0 ${H-PB} Z`;
  const last=sp.close[n-1];
  $('chart').innerHTML=rects
   +`<path d="${area}" fill="rgba(174,182,196,.06)"/>`
   +`<path d="${path(sp.ma)}" fill="none" stroke="#5b6270" stroke-width="1.5" stroke-dasharray="4 4"/>`
   +`<path d="${path(sp.close)}" fill="none" stroke="#aeb6c4" stroke-width="2"/>`
   +`<circle cx="${X(n-1)}" cy="${Y(last)}" r="3.5" fill="#eceef2"/>`
   +`<text x="${X(n-1)-6}" y="${Y(last)-8}" text-anchor="end" font-size="11" fill="#eceef2" font-weight="700">${last}</text>`
   +`<line id="xh" y1="0" y2="${H-PB}" stroke="rgba(255,255,255,.25)" stroke-width="1" visibility="hidden"/>`;
  const svg=$('chart'),tip=$('tip');
  svg.onmousemove=e=>{
    const r=svg.getBoundingClientRect();
    const i=Math.max(0,Math.min(n-1,Math.round((e.clientX-r.left)/r.width*(n-1))));
    const xh=$('xh');xh.setAttribute('x1',X(i));xh.setAttribute('x2',X(i));
    xh.setAttribute('visibility','visible');
    tip.style.display='block';
    tip.innerHTML=`${sp.dates[i]} · <b>${sp.close[i]}</b>${sp.ma[i]?` · MA ${sp.ma[i]}`:''} · ${sp.regime[i]?'보유':'현금'}`;
    const px=(X(i)/W)*r.width;
    tip.style.left=Math.min(px+10,r.width-tip.offsetWidth-4)+'px';tip.style.top='4px';};
  svg.onmouseleave=()=>{tip.style.display='none';$('xh').setAttribute('visibility','hidden')};
}

async function load(force){
  const d=await(await fetch('/api/status'+(force?'?force=1':''))).json();
  const s=d.signal;
  if(s){
    const hold=s.signal_aggressive==='HOLD';
    $('hero').classList.toggle('hold',hold);$('hero').classList.toggle('cash',!hold);
    $('staterow').className='staterow '+(hold?'hold':'cash');
    $('staterow').querySelector('.state').innerHTML=(hold?'HOLD':'CASH')
      +(s.exception_buy?'<span class="exchip">⚠ 예외매수 발동</span>':'');
    $('staterow').querySelector('.state').classList.remove('skel');
    $('statedesc').textContent=hold?'보유 구간 — 봇이 TQQQ 포지션을 유지합니다'
      :'현금 대기 구간 — 봇이 시장 밖에서 재진입 조건을 기다립니다';
    $('asof').textContent='기준일 '+s.asof;
    $('metrics').innerHTML=[
      ['QQQ',s.qqq],['MA150 밴드',(s.ma150*0.995).toFixed(0)+'–'+(s.ma150*1.005).toFixed(0)],
      ['변동성 20일',s.vol20+'%'],['진입 · 청산','<32% · >36%'],
      ['RSI14',s.rsi14],['고점대비',s.dd_from_ath+'%']]
      .map(([k,v])=>`<div class="metric"><div class="k">${k}</div><div class="v num">${v}</div></div>`).join('');
  }
  drawChart(d.spark);
  const a=d.account;
  if(a){
    $('value').textContent=money(a.value);
    $('pl').className='delta num '+(a.pl>=0?'up':'dn');
    $('pl').textContent=`${a.pl>=0?'▲':'▼'} ${money(Math.abs(a.pl))} (${pct(a.pl_rate)})`;
    $('acctsub').innerHTML=`${d.symbol} ${a.qty}주 · 오늘 <span class="num" style="color:${a.day>=0?'var(--up)':'var(--dn)'}">${money(a.day)} (${pct(a.day_rate)})</span>`;
    $('tiles').innerHTML=[['평단가',money(a.avg)],['현재가',money(a.last)],
      ['달러 현금',money(d.usd)],['수량',a.qty+'주']]
      .map(([k,v])=>`<div class="tile"><div class="k">${k}</div><div class="v num">${v}</div></div>`).join('');
    $('krwwarn').textContent=(d.krw>=100000)?`⚠ 환전 대기 원화 ₩${Number(d.krw).toLocaleString()} — 토스 앱에서 환전해야 봇이 사용합니다`:'';
  } else if(d.account_error){$('value').textContent='조회 실패';$('acctsub').textContent=d.account_error}
  $('orders').innerHTML=(d.orders&&d.orders.length)?d.orders.map(o=>
    `<div class="order"><span><span class="badge ${o.side}">${o.side==='BUY'?'매수':'매도'}</span>
     ${o.symbol} <span class="num">${o.qty}주${o.price?' @ '+money(o.price):''}</span></span>
     <span class="ostatus">${o.status??''}</span></div>`).join('')
    :'<span class="empty">진행 중 주문 없음 — 신호가 바뀌는 날에만 주문이 생깁니다</span>';
  const e=d.env;
  $('botline').innerHTML=
    `<span class="chip ${e.enabled?'on':'off'}">${e.enabled?'● 작동 중':'○ 꺼짐'}</span>
     <span class="chip ${e.dry?'dry':'live'}">${e.dry?'모의 모드':'⚡ 실전'}</span>
     <span>마지막 실행 <b class="num">${d.last_run}</b></span>
     <span>다음 매일 <b class="num">04:40</b></span>`;
  $('actions').innerHTML=
    `<button class="${e.enabled?'stop':''}" onclick="act('bot')">${e.enabled?'봇 끄기':'봇 켜기'}</button>
     <button class="${e.dry?'golive':''}" onclick="act('mode')">${e.dry?'실전 전환':'모의로 복귀'}</button>
     <button onclick="load(true)">새로고침</button>`;
}
async function act(kind){
  const e=(await(await fetch('/api/status')).json()).env;
  if(kind==='bot'&&e.enabled&&!confirm('봇을 끄면 신호가 와도 아무것도 하지 않습니다.\n(서약의 중단 기준에 해당하나요?)\n\n정말 끌까요?'))return;
  if(kind==='mode'&&e.dry&&!confirm('⚡ 다음 실행부터 실제 주문이 나갑니다.\n주문테스트 + 스케줄 확인을 마쳤나요?'))return;
  await fetch('/api/toggle-'+kind,{method:'POST'});load();
}
async function toggleLog(){
  const p=$('log');
  if(p.style.display==='block'){p.style.display='none';return}
  p.textContent=await(await fetch('/api/log')).text();p.style.display='block';
}
let histLoaded=false;
function showTab(t){
  $('view-dash').style.display=t==='dash'?'':'none';
  $('view-hist').style.display=t==='hist'?'':'none';
  $('tab-dash').classList.toggle('active',t==='dash');
  $('tab-hist').classList.toggle('active',t==='hist');
  if(t==='hist'&&!histLoaded){histLoaded=true;loadHistory()}
}
async function loadHistory(){
  const d=await(await fetch('/api/history')).json();
  // 체결 내역
  if(d.trades&&d.trades.length){
    $('trades').innerHTML='<table><tr><th>일시</th><th>구분</th><th>수량</th><th>가격</th><th>상태</th></tr>'
      +d.trades.map(t=>`<tr><td class="num">${(t.date??'').toString().slice(0,16).replace('T',' ')}</td>
       <td><span class="badge ${t.side}">${t.side==='BUY'?'매수':t.side==='SELL'?'매도':t.side??'?'}</span></td>
       <td class="num">${t.qty??'—'}주</td><td class="num">${t.price?'$'+Number(t.price).toFixed(2):'—'}</td>
       <td style="color:var(--sub)">${t.status??''}</td></tr>`).join('')+'</table>';
  } else {
    $('trades').innerHTML='<span class="empty">'+(d.trades_error?'조회 실패: '+d.trades_error
      :'체결 내역이 아직 없습니다 (봇 매매가 생기면 여기 쌓입니다)')+'</span>';
  }
  // 자산 일지: 일별 마지막 스냅샷 + 변동 추정
  const snaps=(d.journal||[]).filter(j=>j.type==='snapshot'&&j.cash!=null);
  const tradesTs=new Set((d.journal||[]).filter(j=>j.type==='trade').map(j=>(j.ts||'').slice(0,10)));
  const byday={};snaps.forEach(sn=>byday[(sn.ts||'').slice(0,10)]=sn);
  const days=Object.keys(byday).sort();
  let rows='',prev=null;const eq=[];
  for(const day of days){
    const sn=byday[day];
    const val=(sn.qty||0)*(sn.price||0)+(sn.cash||0);
    if(sn.price)eq.push(val);
    let tag='';
    if(prev){
      const dc=sn.cash-prev.cash,dq=(sn.qty||0)-(prev.qty||0);
      if(tradesTs.has(day)) tag='<span class="tag trade">봇 매매</span>';
      else if(Math.abs(dq)>0.001) tag='<span class="tag manual">수동 매매?</span>';
      else if(dc>1) tag=`<span class="tag dep">입금 추정 +$${dc.toFixed(2)}</span>`;
      else if(dc<-1) tag=`<span class="tag wd">출금 추정 -$${Math.abs(dc).toFixed(2)}</span>`;
    }
    rows=`<tr><td class="num">${day}</td><td>${sn.signal??''}</td>
      <td class="num">${sn.qty??'—'}주</td><td class="num">$${(sn.cash??0).toFixed(2)}</td>
      <td class="num">${sn.price?'$'+val.toFixed(0):'—'}</td><td>${tag}
      ${sn.mode==='dry'?'<span style="color:var(--mut);font-size:10px">모의</span>':''}</td></tr>`+rows;
    prev=sn;
  }
  $('ledger').innerHTML=rows?'<table><tr><th>날짜</th><th>신호</th><th>보유</th><th>현금</th><th>슬리브 자산</th><th>변동</th></tr>'+rows+'</table>'
    :'<span class="empty">아직 스냅샷이 없습니다 — 매일 새벽 봇이 한 줄씩 기록합니다</span>';
  // 자산 추이 스파크라인
  if(eq.length>=2){
    const W=660,Hh=70,lo=Math.min(...eq)*0.99,hi=Math.max(...eq)*1.01;
    const X=i=>i/(eq.length-1)*W,Y=v=>6+(1-(v-lo)/(hi-lo))*(Hh-14);
    const pth=eq.map((v,i)=>(i?'L':'M')+X(i).toFixed(1)+' '+Y(v).toFixed(1)).join(' ');
    $('equity').innerHTML=`<path d="${pth} L ${W} ${Hh} L 0 ${Hh} Z" fill="rgba(47,191,113,.08)"/>
      <path d="${pth}" fill="none" stroke="var(--up)" stroke-width="2"/>
      <circle cx="${X(eq.length-1)}" cy="${Y(eq[eq.length-1])}" r="3" fill="#eceef2"/>`;
    $('equity').style.display='block';
  }
}
load();setInterval(()=>load(),600000);
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
        elif self.path.startswith("/api/history"):
            self._send(json.dumps(build_history()))
        elif self.path.startswith("/api/log"):
            self._send(log_tail(), "text/plain")
        else:
            self._send(HTML, "text/html")

    def do_POST(self):
        if self.path == "/api/toggle-bot":
            set_env_key("TRADER_ENABLED", "0" if env_state()["enabled"] else "1")
        elif self.path == "/api/toggle-mode":
            set_env_key("DRY_RUN", "1" if not env_state()["dry"] else "0")
        self._send("{}")


if __name__ == "__main__":
    url = f"http://127.0.0.1:{PORT}"
    try:
        srv = ThreadingHTTPServer(("127.0.0.1", PORT), H)
    except OSError:
        webbrowser.open(url)
        sys.exit(0)
    threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    srv.serve_forever()
