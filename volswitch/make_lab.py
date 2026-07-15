#!/usr/bin/env python3
"""볼스위칭 실험실(volswitch-lab.html) 생성기.

data/qqq.csv, data/tqqq.csv를 내장한 단일 HTML을 저장소 루트에 만든다.
데이터 갱신 후 재실행하면 최신 데이터로 다시 구워짐:
    python3 make_lab.py
"""
import json
import os

import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "volswitch-lab.html")


def load(name):
    df = pd.read_csv(os.path.join(HERE, "data", f"{name}.csv"),
                     parse_dates=["Date"]).sort_values("Date")
    return {"d": [d.strftime("%Y-%m-%d") for d in df["Date"]],
            "c": [round(float(x), 4) for x in df["Close"]]}


DATA = {"qqq": load("qqq"), "tqqq": load("tqqq")}

HTML = r"""<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>볼스위칭 실험실</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<style>
:root{--bg:#0a0c0f;--card:#12151b;--card2:#0e1116;--line:rgba(255,255,255,.055);
 --ink:#eceef2;--sub:#8b93a1;--mut:#5b6270;--up:#2fbf71;--dn:#e0555a;--brass:#c9a353;
 --mono:"SF Mono",SFMono-Regular,Consolas,monospace}
*{box-sizing:border-box;margin:0}
body{background:var(--bg);color:var(--ink);max-width:860px;margin:0 auto;padding:26px 18px 60px;
 font:14px/1.6 "Pretendard Variable",Pretendard,"Malgun Gothic",system-ui,sans-serif}
.num{font-family:var(--mono);font-variant-numeric:tabular-nums}
header{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:16px}
.wordmark{font-size:13px;font-weight:800;letter-spacing:.32em;color:var(--brass)}
.wordmark small{color:var(--mut);font-weight:500;letter-spacing:.1em;margin-left:8px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px 20px;margin-bottom:12px}
.eyebrow{font-size:10px;font-weight:700;letter-spacing:.18em;color:var(--mut);text-transform:uppercase;margin-bottom:12px}
.controls{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px}
.ctl label{display:block;font-size:11px;color:var(--sub);margin-bottom:4px}
.ctl output{color:var(--brass);font-weight:700;font-family:var(--mono)}
input[type=range]{width:100%;accent-color:#c9a353}
select,input[type=date],input[type=text]{width:100%;background:var(--card2);color:var(--ink);border:1px solid var(--line);
 border-radius:8px;padding:7px 9px;font:600 12.5px Pretendard,sans-serif;color-scheme:dark}
td.gcell{text-align:center;cursor:pointer;line-height:1.35}
td.gcell:hover{outline:1px solid var(--brass)}
td.gcell.best{outline:2px solid var(--brass)}
button{font:700 13px Pretendard,sans-serif;color:var(--ink);background:var(--card2);
 border:1px solid var(--line);border-radius:9px;padding:10px 18px;cursor:pointer}
button:hover{background:#1a2029}
button.primary{color:var(--brass);border-color:rgba(201,163,83,.4)}
.btnrow{display:flex;gap:8px;margin-top:16px;flex-wrap:wrap}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px}
.tile{background:var(--card2);border:1px solid var(--line);border-radius:10px;padding:10px 12px}
.tile .k{font-size:10px;color:var(--mut)}.tile .v{font-size:18px;font-weight:800;margin-top:2px}
.tile .s{font-size:11px;color:var(--sub)}
.pos{color:var(--up)}.neg{color:var(--dn)}
table{width:100%;border-collapse:collapse;font-size:12px}
th{font-size:10px;color:var(--mut);text-align:right;padding:4px 8px;border-bottom:1px solid var(--line);letter-spacing:.06em}
th:first-child,td:first-child{text-align:left}
td{padding:5px 8px;border-bottom:1px solid var(--line);text-align:right;font-family:var(--mono);font-size:12px}
tr:last-child td{border-bottom:0}
tr.best td{color:var(--brass);font-weight:700}
.tablewrap{overflow-x:auto;max-height:340px;overflow-y:auto}
.note{font-size:11px;color:var(--mut);margin-top:10px;line-height:1.7}
#chart{width:100%;height:240px}
.legend{display:flex;gap:16px;font-size:11px;color:var(--sub);margin-top:4px}
.legend i{display:inline-block;width:14px;border-top:2px solid;margin-right:5px;vertical-align:middle}
</style></head><body>
<header><div class="wordmark">VOL·SWITCH<small>실험실</small></div>
 <div style="font-size:11px;color:var(--mut)">데이터: __DATA_RANGE__</div></header>

<div class="card"><div class="eyebrow">파라미터</div>
 <div class="controls">
  <div class="ctl"><label>추세 이동평균 <output id="o-ma">150</output>일</label>
   <input type="range" id="p-ma" min="50" max="300" step="5" value="150"></div>
  <div class="ctl"><label>진입 변동성 &lt; <output id="o-vin">32</output>%</label>
   <input type="range" id="p-vin" min="16" max="45" step="1" value="32"></div>
  <div class="ctl"><label>청산 변동성 &gt; <output id="o-vout">36</output>%</label>
   <input type="range" id="p-vout" min="20" max="55" step="1" value="36"></div>
  <div class="ctl"><label>MA 버퍼 ±<output id="o-buf">0.5</output>%</label>
   <input type="range" id="p-buf" min="0" max="2" step="0.1" value="0.5"></div>
  <div class="ctl"><label>매매자산</label>
   <select id="p-asset"><option value="tqqq">TQQQ 실측 (2010~)</option>
    <option value="syn">합성 3x (1999~, 닷컴 포함)</option></select></div>
  <div class="ctl"><label>시작일</label><input type="date" id="p-start" value="2010-02-11"></div>
 </div>
 <div class="controls" style="margin-top:14px">
  <div class="ctl" style="grid-column:span 2"><label>그리드: MA 목록 (쉼표 구분)</label>
   <input type="text" id="p-malist" value="100,125,150,175,200,225,250"></div>
  <div class="ctl"><label>진입 vol 목록</label>
   <input type="text" id="p-vollist" value="24,28,32,36"></div>
  <div class="ctl"><label>청산 vol = 진입 + <output id="o-voloff">4</output></label>
   <input type="range" id="p-voloff" min="0" max="10" step="1" value="4"></div>
 </div>
 <div class="btnrow">
  <button class="primary" onclick="runAndRender()">백테스트 실행</button>
  <button class="primary" onclick="gridScan()">그리드 스캔 (MA × vol 일괄)</button>
  <button onclick="maScan()">MA 50~300 스캔</button>
  <button onclick="preset()">운영값 리셋 (MA150 · 32/36 · ±0.5%)</button>
 </div>
</div>

<div class="card"><div class="eyebrow">결과</div>
 <div class="tiles" id="tiles"><span style="color:var(--mut)">실행을 눌러주세요</span></div>
 <svg id="chart" viewBox="0 0 820 240" preserveAspectRatio="none"></svg>
 <div class="legend"><span><i style="border-color:var(--brass)"></i>볼스위칭</span>
  <span><i style="border-color:#5b6270"></i>Buy&amp;Hold</span>
  <span style="color:var(--mut)">(로그 스케일 · 배경 = 보유/현금 레짐)</span></div>
</div>

<div class="card"><div class="eyebrow" id="scanhdr">연도별 수익률</div>
 <div class="tablewrap" id="table"></div>
 <div class="note">체결: 신호일 종가(봇의 LOC와 동일) · 비용 편도 5bp · 현금 연 4% ·
  합성 3x는 QQQ×3 − 드래그 3%/년 근사(실측 대비 ~1.4%p 낙관) ·
  운영 스펙 변경은 서약 절차(전 구간 검증 후 분기 1회)를 따를 것 — 이 페이지는 놀이터입니다.</div>
</div>

<script>
const RAW=__DATA__;
const cost=5e-4/10*10, cashY=0.04; // 편도 5bp, 현금 연4%
// QQQ 지표 사전계산 구조
function prep(){
  const q=RAW.qqq, n=q.c.length;
  const ret=new Array(n).fill(0);
  for(let i=1;i<n;i++)ret[i]=q.c[i]/q.c[i-1]-1;
  return {dates:q.d, close:q.c, ret, n};
}
const Q=prep();
function sma(arr,len,i){ if(i<len-1)return NaN; let s=0; for(let k=i-len+1;k<=i;k++)s+=arr[k]; return s/len; }
function volAt(i,win){ if(i<win)return NaN; let m=0; for(let k=i-win+1;k<=i;k++)m+=Q.ret[k]; m/=win;
  let v=0; for(let k=i-win+1;k<=i;k++)v+=(Q.ret[k]-m)**2; return Math.sqrt(v/(win-1))*Math.sqrt(252)*100; }
function tradeSeries(kind){
  if(kind==='tqqq')return RAW.tqqq;
  // 합성 3x: QQQ 수익률×3 − 3%/252
  const c=[100], d=[Q.dates[0]];
  for(let i=1;i<Q.n;i++){ c.push(c[i-1]*(1+Math.max(-1,3*Q.ret[i]-0.03/252))); d.push(Q.dates[i]); }
  return {d, c};
}
function run(p){
  // QQQ 인덱스 매핑
  const maArr=new Array(Q.n).fill(NaN), volArr=new Array(Q.n).fill(NaN);
  // 러닝 SMA/vol (O(n))
  let s=0; const buf=p.ma;
  for(let i=0;i<Q.n;i++){ s+=Q.close[i]; if(i>=buf)s-=Q.close[i-buf]; if(i>=buf-1)maArr[i]=s/buf; }
  const w=20; let rs=0, rs2=0;
  for(let i=0;i<Q.n;i++){ rs+=Q.ret[i]; rs2+=Q.ret[i]**2;
    if(i>=w){ rs-=Q.ret[i-w]; rs2-=Q.ret[i-w]**2; }
    if(i>=w){ const m=rs/w, va=(rs2-w*m*m)/(w-1); volArr[i]=Math.sqrt(Math.max(va,0))*Math.sqrt(252)*100; } }
  // 히스테리시스 신호
  const sig=new Array(Q.n).fill(0); let on=false; const bf=p.buf/100;
  for(let i=0;i<Q.n;i++){ const m=maArr[i], v=volArr[i];
    if(!isNaN(m)&&!isNaN(v)){ if(!on&&Q.close[i]>m*(1+bf)&&v<p.vin)on=true;
      else if(on&&(Q.close[i]<m*(1-bf)||v>p.vout))on=false; }
    sig[i]=on?1:0; }
  const sigMap={}; Q.dates.forEach((d,i)=>sigMap[d]=sig[i]);
  // 매매자산에 적용
  const T=tradeSeries(p.asset);
  const dcash=Math.pow(1+cashY,1/252)-1;
  let eq=1, bh=1, pos=0, peakS=1, peakB=1, mddS=0, mddB=0, sw=0, inDays=0, nD=0;
  const curveS=[], curveB=[], regime=[], dts=[], yearly={};
  let started=false;
  for(let i=1;i<T.d.length;i++){
    const d=T.d[i]; if(d<p.start)continue;
    const prevSig=sigMap[T.d[i-1]]??0;
    if(!started){ started=true; pos=prevSig; }
    const r=T.c[i]/T.c[i-1]-1;
    const newPos=prevSig;
    const chg=Math.abs(newPos-pos); sw+=chg; pos=newPos;
    const sr=pos*r+(1-pos)*dcash-chg*5e-4;
    eq*=(1+sr); bh*=(1+r);
    peakS=Math.max(peakS,eq); mddS=Math.min(mddS,eq/peakS-1);
    peakB=Math.max(peakB,bh); mddB=Math.min(mddB,bh/peakB-1);
    if(pos>0)inDays++; nD++;
    const y=d.slice(0,4);
    (yearly[y]=yearly[y]||{s:1,b:1}); yearly[y].s*=(1+sr); yearly[y].b*=(1+r);
    curveS.push(eq); curveB.push(bh); regime.push(pos); dts.push(d);
  }
  const yrs=nD/252;
  const st=x=>({mult:x, cagr:(Math.pow(x,1/yrs)-1)*100});
  const S=st(eq), B=st(bh);
  return {S:{...S,mdd:mddS*100,mar:S.cagr/Math.abs(mddS*100)},
          B:{...B,mdd:mddB*100,mar:B.cagr/Math.abs(mddB*100)},
          yrs, sw:sw/2/yrs, exp:inDays/nD*100, curveS, curveB, regime, dts, yearly};
}
const $=id=>document.getElementById(id);
function params(){ return {ma:+$('p-ma').value, vin:+$('p-vin').value, vout:+$('p-vout').value,
  buf:+$('p-buf').value, asset:$('p-asset').value, start:$('p-start').value}; }
['ma','vin','vout','buf','voloff'].forEach(k=>$('p-'+k).oninput=()=>{$('o-'+k).textContent=$('p-'+k).value});
$('p-asset').onchange=()=>{ $('p-start').value=$('p-asset').value==='syn'?'1999-10-12':'2010-02-11'; };
function preset(){ $('p-ma').value=150;$('p-vin').value=32;$('p-vout').value=36;$('p-buf').value=0.5;
  ['ma','vin','vout','buf'].forEach(k=>$('o-'+k).textContent=$('p-'+k).value); runAndRender(); }
function fmt(v,d=1){return v.toFixed(d)}
function runAndRender(){
  const r=run(params());
  $('tiles').innerHTML=[
   ['CAGR',fmt(r.S.cagr)+'%','B&H '+fmt(r.B.cagr)+'%',r.S.cagr>=r.B.cagr],
   ['MDD',fmt(r.S.mdd)+'%','B&H '+fmt(r.B.mdd)+'%',true],
   ['MAR',fmt(r.S.mar,2),'B&H '+fmt(r.B.mar,2),r.S.mar>=r.B.mar],
   ['총 배수','×'+fmt(r.S.mult,1),'B&H ×'+fmt(r.B.mult,1),null],
   ['회전/년',fmt(r.sw,1),'노출 '+fmt(r.exp,0)+'%',null],
   ['기간',fmt(r.yrs,1)+'년',r.dts[0]+'~',null],
  ].map(([k,v,s,good])=>`<div class="tile"><div class="k">${k}</div>
   <div class="v num ${good===true?'pos':good===false?'neg':''}">${v}</div><div class="s num">${s}</div></div>`).join('');
  drawCurve(r);
  $('scanhdr').textContent='연도별 수익률 (%)';
  const ys=Object.keys(r.yearly).sort().reverse();
  $('table').innerHTML='<table><tr><th>연도</th><th>볼스위칭</th><th>B&H</th><th>차이</th></tr>'
   +ys.map(y=>{const a=(r.yearly[y].s-1)*100,b=(r.yearly[y].b-1)*100;
    return `<tr><td>${y}</td><td class="${a>=0?'pos':'neg'}">${fmt(a)}</td>
     <td class="${b>=0?'pos':'neg'}">${fmt(b)}</td><td>${fmt(a-b)}</td></tr>`}).join('')+'</table>';
}
function drawCurve(r){
  const W=820,H=240,PB=16,n=r.curveS.length; if(n<2)return;
  const lo=Math.log(Math.min(...r.curveS,...r.curveB)), hi=Math.log(Math.max(...r.curveS,...r.curveB));
  const X=i=>i/(n-1)*W, Y=v=>6+(1-(Math.log(v)-lo)/(hi-lo))*(H-PB-6);
  let rects='',s=0;
  for(let i=1;i<=n;i++) if(i===n||r.regime[i]!==r.regime[s]){
    rects+=`<rect x="${X(s).toFixed(1)}" y="0" width="${(X(Math.min(i,n-1))-X(s)).toFixed(1)}" height="${H-PB}"
     fill="${r.regime[s]?'rgba(47,191,113,.08)':'rgba(224,85,90,.05)'}"/>`; s=i; }
  const path=a=>a.map((v,i)=>(i?'L':'M')+X(i).toFixed(1)+' '+Y(v).toFixed(1)).join(' ');
  $('chart').innerHTML=rects
   +`<path d="${path(r.curveB)}" fill="none" stroke="#5b6270" stroke-width="1.5"/>`
   +`<path d="${path(r.curveS)}" fill="none" stroke="#c9a353" stroke-width="2"/>`
   +`<text x="${W-4}" y="${Y(r.curveS[n-1])-6}" text-anchor="end" font-size="11" fill="#c9a353" font-weight="700">×${r.curveS[n-1].toFixed(1)}</text>`
   +`<text x="${W-4}" y="${Y(r.curveB[n-1])+14}" text-anchor="end" font-size="11" fill="#5b6270">×${r.curveB[n-1].toFixed(1)}</text>`;
}
function gridScan(){
  const base=params();
  const mas=$('p-malist').value.split(',').map(s=>+s.trim()).filter(x=>x>=20);
  const vins=$('p-vollist').value.split(',').map(s=>+s.trim()).filter(x=>x>=5);
  const off=+$('p-voloff').value;
  if(!mas.length||!vins.length){alert('MA/vol 목록을 확인하세요');return}
  const rows=[]; let best=null;
  for(const ma of mas){
    const cells=[];
    for(const vin of vins){
      const r=run({...base,ma,vin,vout:vin+off});
      const c={ma,vin,cagr:r.S.cagr,mdd:r.S.mdd,mar:r.S.mar};
      if(!best||c.mar>best.mar)best=c;
      cells.push(c);
    }
    rows.push({ma,cells});
  }
  const mars=rows.flatMap(r=>r.cells.map(c=>c.mar));
  const lo=Math.min(...mars),hi=Math.max(...mars);
  const shade=m=>`rgba(47,191,113,${(0.05+0.32*(m-lo)/(hi-lo+1e-9)).toFixed(3)})`;
  $('scanhdr').textContent=`그리드 스캔 — 행=MA · 열=진입vol (청산=진입+${off} · 버퍼 ±${base.buf}%) · 셀 = MAR / CAGR·MDD · 클릭=적용`;
  $('table').innerHTML='<table><tr><th style="text-align:left">MA＼vol</th>'
   +vins.map(v=>`<th style="text-align:center">&lt;${v}%</th>`).join('')+'</tr>'
   +rows.map(r=>`<tr><td>${r.ma}일</td>`+r.cells.map(c=>
     `<td class="gcell ${c===best?'best':''}" style="background:${shade(c.mar)}"
       onclick="applyCell(${c.ma},${c.vin},${off})"><b>${c.mar.toFixed(2)}</b><br>
       <span style="font-size:10px;color:var(--sub)">${c.cagr.toFixed(0)}%·${c.mdd.toFixed(0)}%</span></td>`
    ).join('')+'</tr>').join('')+'</table>';
}
function applyCell(ma,vin,off){
  $('p-ma').value=ma;$('p-vin').value=vin;$('p-vout').value=vin+off;
  ['ma','vin','vout'].forEach(k=>$('o-'+k).textContent=$('p-'+k).value);
  runAndRender();
  window.scrollTo({top:0,behavior:'smooth'});
}
function maScan(){
  const base=params(); const rows=[];
  for(let ma=50;ma<=300;ma+=10){ const r=run({...base,ma});
    rows.push({ma,cagr:r.S.cagr,mdd:r.S.mdd,mar:r.S.mar}); }
  const best=Math.max(...rows.map(r=>r.mar));
  $('scanhdr').textContent=`MA 스캔 (vol ${base.vin}/${base.vout} · 버퍼 ±${base.buf}% 고정)`;
  $('table').innerHTML='<table><tr><th>MA</th><th>CAGR %</th><th>MDD %</th><th>MAR</th></tr>'
   +rows.map(r=>`<tr class="${r.mar===best?'best':''}"><td>${r.ma}일</td>
    <td>${fmt(r.cagr)}</td><td>${fmt(r.mdd)}</td><td>${fmt(r.mar,2)}</td></tr>`).join('')+'</table>';
}
preset();
</script></body></html>"""

DATA_JS = os.path.join(os.path.dirname(HERE), "volswitch-data.js")
open(DATA_JS, "w").write("window.VS_DATA=" + json.dumps(DATA, separators=(",", ":")) + ";")
print(f"OK → {DATA_JS}")

rng = f"QQQ {DATA['qqq']['d'][0]}~{DATA['qqq']['d'][-1]} · TQQQ {DATA['tqqq']['d'][0]}~"
html = HTML.replace("__DATA__", json.dumps(DATA, separators=(",", ":")))
html = html.replace("__DATA_RANGE__", rng)
open(OUT, "w", encoding="utf-8").write(html)
print(f"OK → {OUT}  ({os.path.getsize(OUT)//1024} KB)")
