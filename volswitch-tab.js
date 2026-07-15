/* 볼스위칭 전수조사 탭 — 엔진은 실계좌 봇과 동일 로직 (히스테리시스 + 신호일 종가 체결) */
(function(){
"use strict";
const D = window.VS_DATA;
if(!D){ console.warn("volswitch-data.js 없음"); return; }

const $id = s=>document.getElementById(s);
const OP = {ma:150, vin:32, voff:4, buf:0.5}; // 실계좌 운영 스펙

/* --- QQQ 지표 사전 준비 --- */
const Q = (()=>{ const q=D.qqq, n=q.c.length, ret=new Array(n).fill(0);
  for(let i=1;i<n;i++) ret[i]=q.c[i]/q.c[i-1]-1;
  return {d:q.d, c:q.c, ret, n}; })();

function tradeSeries(kind){
  if(kind==="tqqq") return D.tqqq;
  const c=[100], d=[Q.d[0]];
  for(let i=1;i<Q.n;i++){ c.push(c[i-1]*(1+Math.max(-1,3*Q.ret[i]-0.03/252))); d.push(Q.d[i]); }
  return {d,c};
}

function run(p, T){
  const maArr=new Array(Q.n).fill(NaN), volArr=new Array(Q.n).fill(NaN);
  let s=0;
  for(let i=0;i<Q.n;i++){ s+=Q.c[i]; if(i>=p.ma)s-=Q.c[i-p.ma]; if(i>=p.ma-1)maArr[i]=s/p.ma; }
  const w=20; let rs=0, rs2=0;
  for(let i=0;i<Q.n;i++){ rs+=Q.ret[i]; rs2+=Q.ret[i]*Q.ret[i];
    if(i>=w){ rs-=Q.ret[i-w]; rs2-=Q.ret[i-w]*Q.ret[i-w];
      const m=rs/w, va=(rs2-w*m*m)/(w-1);
      volArr[i]=Math.sqrt(Math.max(va,0))*Math.sqrt(252)*100; } }
  const sig=new Array(Q.n).fill(0); let on=false; const bf=p.buf/100, vout=p.vin+p.voff;
  for(let i=0;i<Q.n;i++){ const m=maArr[i], v=volArr[i];
    if(!isNaN(m)&&!isNaN(v)){
      if(!on && Q.c[i]>m*(1+bf) && v<p.vin) on=true;
      else if(on && (Q.c[i]<m*(1-bf) || v>vout)) on=false; }
    sig[i]=on?1:0; }
  const sigMap={}; for(let i=0;i<Q.n;i++) sigMap[Q.d[i]]=sig[i];

  const dcash=Math.pow(1.04,1/252)-1;
  let eq=1, bh=1, pos=0, pkS=1, pkB=1, mddS=0, mddB=0, sw=0, inD=0, nD=0, started=false;
  const cS=[], cB=[], dts=[];
  for(let i=1;i<T.d.length;i++){
    const dt=T.d[i]; if(dt<p.start) continue; if(p.end && dt>p.end) break;
    const prevSig=sigMap[T.d[i-1]]??0;
    if(!started){ started=true; pos=prevSig; }
    const r=T.c[i]/T.c[i-1]-1, chg=Math.abs(prevSig-pos);
    sw+=chg; pos=prevSig;
    const sr=pos*r+(1-pos)*dcash-chg*5e-4;
    eq*=1+sr; bh*=1+r;
    if(eq>pkS)pkS=eq; if(eq/pkS-1<mddS)mddS=eq/pkS-1;
    if(bh>pkB)pkB=bh; if(bh/pkB-1<mddB)mddB=bh/pkB-1;
    if(pos>0)inD++; nD++;
    cS.push(eq); cB.push(bh); dts.push(dt);
  }
  const yrs=nD/252;
  const cagr=(Math.pow(eq,1/yrs)-1)*100, bcagr=(Math.pow(bh,1/yrs)-1)*100;
  return {cagr, mdd:mddS*100, mar:cagr/Math.abs(mddS*100||1e-9), mult:eq,
          bcagr, bmdd:mddB*100, bmar:bcagr/Math.abs(mddB*100||1e-9), bmult:bh,
          sw:sw/2/yrs, exp:inD/nD*100, yrs, cS, cB, dts};
}

/* --- 전수조사 --- */
let ROWS=[], SORT={k:"mar", d:-1}, BENCH=null, LASTP=null, chart=null;

function sweep(){
  const btn=$id("vw_run"); btn.disabled=true; btn.textContent="계산 중…";
  setTimeout(()=>{
    const asset=$id("vw_asset").value, start=$id("vw_start").value, end=$id("vw_end").value;
    const T=tradeSeries(asset);
    BENCH=null;
    const ma0=+$id("vw_ma0").value, ma1=+$id("vw_ma1").value, mas=Math.max(1,+$id("vw_mas").value);
    const v0=+$id("vw_v0").value, v1=+$id("vw_v1").value, vs=Math.max(1,+$id("vw_vs").value);
    const voff=+$id("vw_voff").value, buf=+$id("vw_buf").value;
    ROWS=[];
    for(let ma=ma0; ma<=ma1; ma+=mas)
      for(let vin=v0; vin<=v1; vin+=vs){
        const r=run({ma,vin,voff,buf,start,end}, T);
        ROWS.push({ma,vin,vout:vin+voff,cagr:r.cagr,mdd:r.mdd,mar:r.mar,mult:r.mult,sw:r.sw,exp:r.exp});
        if(!BENCH) BENCH={cagr:r.bcagr,mdd:r.bmdd,mar:r.bmar,mult:r.bmult,yrs:r.yrs};
      }
    LASTP={voff,buf,start,end,asset};
    SORT={k:"mar",d:-1};
    render();
    btn.disabled=false; btn.textContent="전수조사 실행";
  }, 30);
}

function render(){
  const rows=[...ROWS].sort((a,b)=>(a[SORT.k]-b[SORT.k])*SORT.d);
  const best=rows.reduce((m,r)=>r.mar>m.mar?r:m, rows[0]);
  const b=BENCH;
  $id("vw_count").textContent=`(${ROWS.length}개 조합 · ${b.yrs.toFixed(1)}년)`;
  $id("vw_best").style.display="";
  $id("vw_best").innerHTML=
    `🏆 <b>가장 유리했던 조합: MA${best.ma} · 진입&lt;${best.vin}% · 청산&gt;${best.vout}%</b>
     — CAGR ${best.cagr.toFixed(1)}% · MDD ${best.mdd.toFixed(1)}% · MAR ${best.mar.toFixed(2)}
     &nbsp;|&nbsp; 같은 기간 <b>Buy&amp;Hold</b>: CAGR ${b.cagr.toFixed(1)}% · MDD ${b.mdd.toFixed(1)}% · MAR ${b.mar.toFixed(2)}
     &nbsp;|&nbsp; B&amp;H보다 MAR 높은 조합 <b>${ROWS.filter(r=>r.mar>b.mar).length}/${ROWS.length}개</b>`;
  const arw=k=>SORT.k===k?(SORT.d<0?" ▼":" ▲"):"";
  const H=(k,t)=>`<th data-k="${k}" style="cursor:pointer">${t}${arw(k)}</th>`;
  let h="<thead><tr><th>#</th><th style='text-align:left'>조합</th>"
    +H("cagr","CAGR")+H("mdd","MDD")+H("mar","MAR")+H("mult","배수")+H("sw","회전/년")+H("exp","노출")+"</tr></thead><tbody>";
  rows.forEach((r,i)=>{
    const isOp=r.ma===OP.ma&&r.vin===OP.vin&&LASTP.voff===OP.voff&&Math.abs(LASTP.buf-OP.buf)<1e-9;
    const isBest=r===best;
    h+=`<tr data-i="${ROWS.indexOf(r)}" style="cursor:pointer${isBest?';background:rgba(16,185,129,.10)':''}">
      <td>${i+1}</td>
      <td style="text-align:left;font-weight:700">MA${r.ma} · &lt;${r.vin}/&gt;${r.vout}%${isOp?' <span style="color:var(--amber)">⚙운영값</span>':''}${isBest?' 🏆':''}</td>
      <td>${r.cagr.toFixed(1)}%</td>
      <td style="color:${r.mdd<-60?'var(--red)':'inherit'}">${r.mdd.toFixed(1)}%</td>
      <td style="font-weight:800;color:${r.mar>b.mar?'var(--green)':'var(--ink-dim)'}">${r.mar.toFixed(2)}</td>
      <td>×${r.mult.toFixed(1)}</td><td>${r.sw.toFixed(1)}</td><td>${r.exp.toFixed(0)}%</td></tr>`;
  });
  h+=`<tr><td></td><td style="text-align:left;color:var(--ink-dim)">Buy&amp;Hold (기준)</td>
    <td>${b.cagr.toFixed(1)}%</td><td style="color:var(--red)">${b.mdd.toFixed(1)}%</td>
    <td>${b.mar.toFixed(2)}</td><td>×${b.mult.toFixed(1)}</td><td>0</td><td>100%</td></tr></tbody>`;
  const tbl=$id("vw_table"); tbl.innerHTML=h;
  tbl.querySelectorAll("th[data-k]").forEach(th=>th.onclick=()=>{
    const k=th.dataset.k;
    SORT = SORT.k===k ? {k, d:-SORT.d} : {k, d: k==="mdd"?-1:-1};
    render();
  });
  tbl.querySelectorAll("tr[data-i]").forEach(tr=>tr.onclick=()=>showCurve(ROWS[+tr.dataset.i]));
  showCurve(best);
}

function showCurve(row){
  if(typeof Chart==="undefined"){ $id("vw_chartbox").style.display="none"; return; }
  const T=tradeSeries(LASTP.asset);
  const r=run({ma:row.ma,vin:row.vin,voff:LASTP.voff,buf:LASTP.buf,start:LASTP.start,end:LASTP.end}, T);
  const step=Math.max(1,Math.floor(r.dts.length/900));
  const labels=[], dS=[], dB=[];
  for(let i=0;i<r.dts.length;i+=step){ labels.push(r.dts[i]); dS.push(r.cS[i]); dB.push(r.cB[i]); }
  $id("vw_chartbox").style.display="";
  if(chart) chart.destroy();
  chart=new Chart($id("vw_chart"),{type:"line",
    data:{labels,datasets:[
      {label:`MA${row.ma} · <${row.vin}/>${row.vout}%`,data:dS,borderColor:"#0f9d6b",borderWidth:2,pointRadius:0,tension:.1},
      {label:"Buy&Hold",data:dB,borderColor:"#93a69d",borderWidth:1.5,pointRadius:0,tension:.1}]},
    options:{animation:false,interaction:{mode:"index",intersect:false},
      plugins:{legend:{labels:{boxWidth:18,font:{family:"DM Sans",weight:"700"}}}},
      scales:{y:{type:"logarithmic",grid:{color:"#e8f1ec"}},
        x:{ticks:{maxTicksLimit:8},grid:{display:false}}}}});
}

$id("vw_run").onclick=sweep;
$id("vw_asset").onchange=()=>{ $id("vw_start").value = $id("vw_asset").value==="syn" ? "1999-10-12" : "2010-02-11"; $id("vw_end").value=""; BENCH=null; };
})();
