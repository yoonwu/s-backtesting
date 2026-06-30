/* ============================================================
   공통: 카탈로그 · 상수 · 유틸
   ============================================================ */
const CATALOG = [
  {id:"TQQQ", name:"TQQQ — 나스닥100 3배",      base:"^ndx",   yahoo:"^NDX",  lev:3, er:0.95, inception:"2010-02"},
  {id:"QLD",  name:"QLD — 나스닥100 2배",        base:"^ndx",   yahoo:"^NDX",  lev:2, er:0.95, inception:"2006-06"},
  {id:"UPRO", name:"UPRO — S&P500 3배",          base:"^spx",   yahoo:"^GSPC", lev:3, er:0.91, inception:"2009-06"},
  {id:"SSO",  name:"SSO — S&P500 2배",           base:"^spx",   yahoo:"^GSPC", lev:2, er:0.89, inception:"2006-06"},
  {id:"SOXL", name:"SOXL — 반도체(SOXX) 3배",    base:"soxx.us",yahoo:"SOXX",  lev:3, er:0.75, inception:"2010-03"},
  {id:"QQQ",  name:"QQQ — 나스닥100 (1배)",      base:"qqq.us", yahoo:"QQQ",   lev:1, er:0.20, inception:"1999-03"},
  {id:"SPY",  name:"SPY — S&P500 (1배)",         base:"spy.us", yahoo:"SPY",   lev:1, er:0.09, inception:"1993-01"},
  {id:"SOXX", name:"SOXX — 반도체 (1배)",        base:"soxx.us",yahoo:"SOXX",  lev:1, er:0.35, inception:"2001-07"},
  {id:"NDX",  name:"^NDX — 나스닥100 지수",      base:"^ndx",   yahoo:"^NDX",  lev:1, er:0.00, inception:"1985-10"},
  {id:"SPX",  name:"^SPX — S&P500 지수",         base:"^spx",   yahoo:"^GSPC", lev:1, er:0.00, inception:"1957-03"},
  {id:"CUSTOM",name:"⚙ 직접 입력 (커스텀)",     custom:true},
];
const COLORS = ["#10b981","#06b6d4","#f59e0b","#8b5cf6","#ec4899","#0ea5e9"];
const PROXY = "https://s-backtesting.thdghkstlr.workers.dev";
const CSV_FILES = [
  {file:"gold-m5.csv",                                       sym:"XAUUSD", tf:"M5",    raw:true},
  {file:"XAUUSD.b_M1_202603170926_202606290351.csv",         sym:"XAUUSD", tf:"M1"},
  {file:"XAUUSD.b_M2_202512021250_202606290350.csv",         sym:"XAUUSD", tf:"M2"},
  {file:"XAUUSD.b_M10_202407010000_202606290350.csv",        sym:"XAUUSD", tf:"M10"},
  {file:"XAUUSD.b_M12_202407010000_202606290348.csv",        sym:"XAUUSD", tf:"M12"},
  {file:"XAUUSD.b_M15_202407010000_202606290345.csv",        sym:"XAUUSD", tf:"M15"},
  {file:"XAUUSD.b_M30_202407010000_202606290330.csv",        sym:"XAUUSD", tf:"M30"},
  {file:"XAUUSD.b_H1_202407010000_202606290300.csv",         sym:"XAUUSD", tf:"H1"},
  {file:"XAUUSD.b_H2_202407010000_202606290200.csv",         sym:"XAUUSD", tf:"H2"},
  {file:"XAUUSD.b_H4_202407010000_202606290000.csv",         sym:"XAUUSD", tf:"H4"},
  {file:"XAUUSD.b_H8_202407010000_202606290000.csv",         sym:"XAUUSD", tf:"H8"},
  {file:"XAUUSD.b_Daily_202407010000_202606290000.csv",      sym:"XAUUSD", tf:"Daily"},
  {file:"US100.b_M1_202606290100_202606290347.csv",          sym:"US100",  tf:"M1"},
  {file:"US100.b_M2_202512011442_202606290348.csv",          sym:"US100",  tf:"M2"},
  {file:"US100.b_M3_202508190742_202606290348.csv",          sym:"US100",  tf:"M3"},
  {file:"US100.b_M4_202505080932_202606290348.csv",          sym:"US100",  tf:"M4"},
  {file:"US100.b_M5_202501240655_202606290345.csv",          sym:"US100",  tf:"M5"},
  {file:"US100.b_M10_202407010100_202606290340.csv",         sym:"US100",  tf:"M10"},
  {file:"US100.b_M12_202407010100_202606290348.csv",         sym:"US100",  tf:"M12"},
  {file:"US100.b_M15_202407010100_202606290345.csv",         sym:"US100",  tf:"M15"},
  {file:"US100.b_M30_202407010100_202606290330.csv",         sym:"US100",  tf:"M30"},
  {file:"US100.b_H1_202407010100_202606290300.csv",          sym:"US100",  tf:"H1"},
  {file:"US100.b_H2_202407010000_202606290200.csv",          sym:"US100",  tf:"H2"},
  {file:"US100.b_H4_202407010000_202606290000.csv",          sym:"US100",  tf:"H4"},
  {file:"US100.b_H8_202407010000_202606290000.csv",          sym:"US100",  tf:"H8"},
  {file:"US100.b_H12_202407010000_202606290000.csv",         sym:"US100",  tf:"H12"},
  {file:"US100.b_Daily_202407010000_202606290000.csv",       sym:"US100",  tf:"Daily"},
];
const $ = s=>document.querySelector(s);
const $$ = s=>document.querySelectorAll(s);
const today = ()=>new Date().toISOString().slice(0,10);

let SAVED_SORT={key:"months",dir:1};
const StrategyStore = {
  KEY: "leverageLab_savedStrategies_v1",
  _sig(s){ return [s.data,s.strategy,s.direction,s.entry,s.slK,s.tpK,s.tpMode,s.trend||"없음",s.confW,s.months||0].join("|"); },
  getAll(){ try{ return JSON.parse(localStorage.getItem(this.KEY)||"[]"); }catch(e){ return []; } },
  _save(arr){ try{ localStorage.setItem(this.KEY, JSON.stringify(arr)); }catch(e){} },
  add(s){
    const arr=this.getAll();
    if(arr.some(x=>this._sig(x)===this._sig(s)))return false;
    arr.push({...s, savedAt:Date.now()});
    this._save(arr);
    return true;
  },
  remove(i){ const arr=this.getAll(); arr.splice(i,1); this._save(arr); },
  clear(){ this._save([]); },
};
function savedBadge(){
  const b=$("#tab_saved_badge"); if(!b)return;
  const n=StrategyStore.getAll().length;
  b.textContent=n?String(n):""; b.style.display=n?"":"none";
}
function renderSavedStrategies(){
  const wrap=$("#saved_results"); if(!wrap)return;
  const arr=StrategyStore.getAll();
  savedBadge();
  if(!arr.length){ wrap.innerHTML=`<div class="placeholder"><div class="big">아직 저장된 전략이 없어요</div><div class="mono" style="font-size:12px">더블비 결과표에서 <span class="amb">저장</span> 버튼을 눌러 좋은 전략을 모아보세요</div></div>`; return; }
  const pf=x=>(x>=0?"+":"")+(x*100).toFixed(1)+"%";
  const mar=x=>x===Infinity||x>=99?"∞":(+x).toFixed(2);
  const periodLabel=m=>(!m||m<=0)?"전체":`최근 ${m}개월`;
  const idx=arr.map((s,i)=>i);
  const SK=SAVED_SORT.key, SD=SAVED_SORT.dir;
  const val=s=>({
    months:(s.months||0), data:s.data||"", strategy:s.strategy||"", direction:s.direction||"",
    entry:s.entry||"", slK:+s.slK, tpK:+s.tpK, tpMode:s.tpMode||"", trend:s.trend||"없음",
    trades:+s.trades, winrate:+s.winrate, payoff:+s.payoff, totalRet:+s.totalRet, mdd:+s.mdd, mar:(s.mar===Infinity?1e9:+s.mar),
  }[SK]);
  idx.sort((a,b)=>{
    const va=val(arr[a]), vb=val(arr[b]);
    const c=(typeof va==="string")?va.localeCompare(vb,"ko"):(va-vb);
    return SD*c;
  });
  const rows=idx.map(i=>{ const s=arr[i]; return `<tr>
    <td class="mono">${periodLabel(s.months)}</td>
    <td class="mono dimv">${s.data||""}</td>
    <td class="mono">${s.strategy||""}</td>
    <td>${s.direction||""}</td>
    <td>${s.entry||""}</td>
    <td class="num">${s.slK}</td>
    <td class="num">${s.tpK}</td>
    <td class="dimv">${s.tpMode||""}</td>
    <td class="mono dimv">${s.trend||"없음"}</td>
    <td class="num">${s.trades}</td>
    <td class="num">${(s.winrate*100).toFixed(0)}%</td>
    <td class="num ${s.payoff>=1?'pos':'neg'}">${(+s.payoff).toFixed(2)}</td>
    <td class="num ${s.totalRet>=0?'pos':'neg'}">${pf(s.totalRet)}</td>
    <td class="num neg">${(s.mdd*100).toFixed(1)}%</td>
    <td class="num cy">${mar(s.mar)}</td>
    <td class="num"><button class="saved-del" data-i="${i}" title="삭제">✕</button></td>
  </tr>`; }).join("");
  const arrow=k=>SK===k?(SD>0?" ▲":" ▼"):"";
  const h=(k,main,sub)=>`<th class="saved-sort" data-k="${k}" style="cursor:pointer"><span class="th-main">${main}${arrow(k)}</span><span class="th-sub">${sub}</span></th>`;
  wrap.innerHTML=`
    <div class="db-best">저장된 전략 <b class="amb">${arr.length}개</b> · 자동매매 후보로 모아둔 목록 (브라우저에 저장됨) · 헤더 클릭 정렬 (기간별 소팅 가능)
      <button id="saved_clear" style="float:right;padding:4px 10px;border:1px solid var(--border);background:var(--input-bg);color:var(--ink-dim);border-radius:6px;font-size:11px;cursor:pointer">전체 비우기</button></div>
    <div class="ctable-wrap"><table class="ctable"><thead><tr>
      ${h("months","기간","PERIOD")}
      ${h("data","데이터","CSV")}
      ${h("strategy","전략","TYPE")}
      ${h("direction","방향","DIR")}
      ${h("entry","진입","ENTRY")}
      ${h("slK","손절","×TR")}
      ${h("tpK","익절","×TR")}
      ${h("tpMode","익절기준","TP")}
      ${h("trend","추세","MA")}
      ${h("trades","거래","TRADES")}
      ${h("winrate","승률","WIN")}
      ${h("payoff","손익비","PAYOFF")}
      ${h("totalRet","총수익","RETURN")}
      ${h("mdd","최대낙폭","MDD")}
      ${h("mar","위험대비","MAR")}
      <th><span class="th-main">삭제</span><span class="th-sub">DEL</span></th>
    </tr></thead><tbody>${rows}</tbody></table></div>
    <div class="note" style="margin-top:14px">이 목록은 이 브라우저에 저장돼요(localStorage). 같은 전략도 기간(전체/최근 N개월)이 다르면 따로 저장됩니다. <b>기간</b> 헤더를 누르면 기간끼리 모아 정렬돼요. ✕로 개별 삭제, 전체 비우기로 초기화.</div>`;
  wrap.querySelectorAll(".saved-sort").forEach(th=>th.onclick=()=>{
    const k=th.dataset.k;
    if(SAVED_SORT.key===k)SAVED_SORT.dir*=-1;
    else SAVED_SORT={key:k, dir:(k==="mdd"||k==="months"||k==="data"||k==="strategy"||k==="direction"||k==="entry"||k==="tpMode"||k==="trend")?1:-1};
    renderSavedStrategies();
  });
  wrap.querySelectorAll(".saved-del").forEach(btn=>btn.onclick=()=>{ StrategyStore.remove(+btn.dataset.i); renderSavedStrategies(); });
  const clr=$("#saved_clear"); if(clr)clr.onclick=()=>{ if(confirm("저장된 전략을 모두 지울까요?")){ StrategyStore.clear(); renderSavedStrategies(); } };
}
const csvLabel = cf => `${cf.sym} · ${cf.tf} (${cf.file})`;
function renderCsvChecks(prefix, defaultIdx){
  const list=$("#"+prefix+"_csv_list"), all=$("#"+prefix+"_csv_all"), clear=$("#"+prefix+"_csv_clear");
  const gold=$("#"+prefix+"_csv_gold"), us100=$("#"+prefix+"_csv_us100");
  if(!list||!all)return;
  list.innerHTML=CSV_FILES.map((cf,i)=>`
    <label class="csv-check">
      <input type="checkbox" data-idx="${i}" ${i===defaultIdx?"checked":""}>
      <span class="csv-name">${csvLabel(cf)}</span>
    </label>`).join("");
  const boxes=()=>Array.from(list.querySelectorAll('input[type="checkbox"]'));
  const sync=()=>{
    const bs=boxes(), n=bs.filter(b=>b.checked).length;
    all.checked=bs.length>0 && n===bs.length;
    all.indeterminate=n>0 && n<bs.length;
  };
  boxes().forEach(b=>b.onchange=sync);
  all.onchange=()=>{ boxes().forEach(b=>{b.checked=all.checked;}); all.indeterminate=false; };
  const selectKind=kind=>{
    boxes().forEach(b=>{
      const cf=CSV_FILES[+b.dataset.idx];
      const hay=`${cf?.sym||""} ${cf?.file||""}`.toUpperCase();
      b.checked = kind==="gold" ? (hay.includes("XAUUSD")||hay.includes("GOLD")) : hay.includes("US100");
    });
    sync();
  };
  if(gold)gold.onclick=()=>selectKind("gold");
  if(us100)us100.onclick=()=>selectKind("us100");
  if(clear)clear.onclick=()=>{ boxes().forEach(b=>{b.checked=false;}); sync(); };
  sync();
}
function selectedCsvFiles(prefix){
  return Array.from($$("#"+prefix+"_csv_list input[type='checkbox']:checked"))
    .map(b=>CSV_FILES[+b.dataset.idx])
    .filter(Boolean);
}
function pauseUI(){ return new Promise(resolve=>setTimeout(resolve,0)); }

["c_end","r_end","s_end","u_end","t_end","p_end","sh_end","a_end","rs_end"].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=today(); });
setInterval(()=>{ $("#clock").textContent = new Date().toLocaleTimeString("ko-KR",{hour12:false}); },1000);

const LAB_TABS=["compare","allstrat","projection","rolling","signal","underwater","tranche","shannon","rsirev"];
let activeLabTab="compare";
$$("#tabbar button").forEach(b=>b.onclick=()=>{
  const t=b.dataset.tab;
  $$("#tabbar button").forEach(x=>x.classList.toggle("on", x===b));
  if(t==="lab"){
    $$(".tabpane").forEach(p=>p.hidden=true);
    const lab=document.getElementById("pane-lab"); if(lab)lab.hidden=false;
    const sub=document.getElementById("pane-"+activeLabTab); if(sub)sub.hidden=false;
  }else{
    $$(".tabpane").forEach(p=>p.hidden = p.id!=="pane-"+t);
    if(t==="saved")renderSavedStrategies();
  }
});
$$("#lab_tabbar button").forEach(b=>b.onclick=()=>{
  activeLabTab=b.dataset.labtab;
  $$("#lab_tabbar button").forEach(x=>x.classList.toggle("on", x===b));
  LAB_TABS.forEach(id=>{ const p=document.getElementById("pane-"+id); if(p)p.hidden = id!==activeLabTab; });
});
savedBadge();

$$(".quickrange").forEach(qr=>{
  const pfx=qr.dataset.qr;
  qr.querySelectorAll("button").forEach(b=>b.onclick=()=>{
    const endEl=$("#"+pfx+"_end"), startEl=$("#"+pfx+"_start");
    const end=endEl.value||today(); const y=+b.dataset.y;
    if(y===0) startEl.value="1970-01-01";
    else { const d=new Date(end); d.setFullYear(d.getFullYear()-y); startEl.value=d.toISOString().slice(0,10); }
    qr.querySelectorAll("button").forEach(x=>x.classList.remove("on")); b.classList.add("on");
  });
});
["c","r","s","u","t","p","sh","a","rs"].forEach(pfx=>{
  const clear=()=>{ const qr=document.querySelector(`.quickrange[data-qr="${pfx}"]`); if(qr)qr.querySelectorAll("button").forEach(x=>x.classList.remove("on")); };
  const s=$("#"+pfx+"_start"), e=$("#"+pfx+"_end");
  if(s)s.addEventListener("input",clear); if(e)e.addEventListener("input",clear);
});

function clip(series,start,end){ return series.filter(r=>r.date>=start && r.date<=end); }
function synth(series, lev, erPct, finPct){
  if(lev===1 && erPct===0) return series.map(r=>({date:r.date,close:r.close}));
  const dailyCost = ((erPct/100) + (lev-1)*(finPct/100))/252;
  const out=[{date:series[0].date, close:100}];
  for(let i=1;i<series.length;i++){
    const r = series[i].close/series[i-1].close - 1;
    out.push({date:series[i].date, close: out[i-1].close*(1+lev*r-dailyCost)});
  }
  return out;
}
function metrics(series){
  const p0=series[0].close, pN=series[series.length-1].close;
  const years=(new Date(series[series.length-1].date)-new Date(series[0].date))/86400000/365.25;
  const cagr=Math.pow(pN/p0,1/years)-1;
  let curPeak=p0, curPeakDate=series[0].date, mdd=0, mddDate="", peakDate="";
  for(const r of series){
    if(r.close>curPeak){curPeak=r.close;curPeakDate=r.date;}
    const dd=r.close/curPeak-1;
    if(dd<mdd){mdd=dd;mddDate=r.date;peakDate=curPeakDate;}
  }
  return {cagr, mdd, mar: mdd!==0?cagr/Math.abs(mdd):0, years, mddDate, peakDate, totMult:pN/p0};
}
function portfolio(series, lumpWon, monthlyWon){
  let units=0, invested=0; const cf=[], eqCurve=[], invCurve=[]; let curMonth="";
  for(let i=0;i<series.length;i++){
    const r=series[i], mk=r.date.slice(0,7);
    if(i===0 && lumpWon>0){ units+=lumpWon/r.close; invested+=lumpWon; cf.push({amt:-lumpWon,date:r.date}); }
    if(mk!==curMonth){ curMonth=mk; if(i>0 && monthlyWon>0){ units+=monthlyWon/r.close; invested+=monthlyWon; cf.push({amt:-monthlyWon,date:r.date}); } }
    eqCurve.push(units*r.close); invCurve.push(invested);
  }
  const finalVal=units*series[series.length-1].close;
  cf.push({amt:finalVal, date:series[series.length-1].date});
  return {invested, finalVal, profit:finalVal-invested, mult:finalVal/invested, xirr:xirr(cf), eqCurve, invCurve};
}
function xirr(cf){
  if(cf.length<2) return NaN;
  const t0=new Date(cf[0].date), yr=d=>(new Date(d)-t0)/(365*86400000);
  let rate=0.1;
  for(let k=0;k<200;k++){
    let f=0,df=0;
    for(const c of cf){ const t=yr(c.date), b=Math.pow(1+rate,t); f+=c.amt/b; df+=-t*c.amt/Math.pow(1+rate,t+1); }
    if(Math.abs(df)<1e-12) break;
    const nr=rate-f/df; if(!isFinite(nr)) break;
    if(Math.abs(nr-rate)<1e-7){rate=nr;break;}
    rate=Math.max(nr,-0.9999);
  }
  return rate;
}
function yearly(series, eqCurve){
  const map=new Map();
  for(let i=0;i<series.length;i++){
    const y=series[i].date.slice(0,4);
    if(!map.has(y)) map.set(y,{first:series[i].close,last:series[i].close,eq:eqCurve?eqCurve[i]:0});
    const o=map.get(y); o.last=series[i].close; if(eqCurve)o.eq=eqCurve[i];
  }
  const years=[...map.keys()].sort(); const rows=[]; let prev=null;
  for(const y of years){ const o=map.get(y), base=prev!==null?prev:o.first; rows.push({year:y, ret:o.last/base-1, eq:o.eq}); prev=o.last; }
  return rows;
}
function rollingReturns(series, holdYears){
  const out=[]; let j=0;
  for(let i=0;i<series.length;i++){
    const d=new Date(series[i].date); d.setFullYear(d.getFullYear()+holdYears); const target=d.toISOString().slice(0,10);
    if(j<i) j=i;
    while(j<series.length && series[j].date < target) j++;
    if(j>=series.length) break;
    out.push({date:series[i].date, endDate:series[j].date, cagr:Math.pow(series[j].close/series[i].close,1/holdYears)-1});
  }
  return out;
}
function stats(arr){
  if(!arr.length) return null;
  const s=[...arr].sort((a,b)=>a-b);
  const q=p=>s[Math.floor(p*(s.length-1))];
  return {n:s.length,min:s[0],q25:q(.25),median:q(.5),mean:s.reduce((a,b)=>a+b,0)/s.length,q75:q(.75),max:s[s.length-1],lossProb:s.filter(x=>x<0).length/s.length};
}
function smaArr(closes,n){ const out=new Array(closes.length).fill(null); let sum=0; for(let i=0;i<closes.length;i++){ sum+=closes[i]; if(i>=n)sum-=closes[i-n]; if(i>=n-1)out[i]=sum/n; } return out; }
function backtestSignal(tradeSeries, signalSeries, shortN, longN){
  const sc=signalSeries.map(r=>r.close);
  const sS=smaArr(sc,shortN), sL=smaArr(sc,longN);
  let val=100, prevIn=false, trades=0, daysIn=0; const curve=[]; let curIn=false;
  for(let i=0;i<tradeSeries.length;i++){
    let inMkt=false;
    if(i>0 && sS[i-1]!=null && sL[i-1]!=null) inMkt = sS[i-1] > sL[i-1];
    if(i>0 && inMkt) val *= tradeSeries[i].close/tradeSeries[i-1].close;
    if(inMkt) daysIn++;
    if(inMkt!==prevIn) trades++;
    prevIn=inMkt; curIn=inMkt;
    curve.push({date:tradeSeries[i].date, close:val});
  }
  const li=signalSeries.length-1;
  const curSignal = (sS[li]!=null && sL[li]!=null) ? (sS[li]>sL[li]?"gold":"dead") : "n/a";
  return {curve, trades, timeIn:daysIn/tradeSeries.length, curSignal, holding:curIn};
}
function underwaterSeries(series){
  let peak=-Infinity; return series.map(r=>{ if(r.close>peak)peak=r.close; return {date:r.date, dd:(r.close/peak-1)*100}; });
}
function underwaterEvents(series){
  let peak=series[0].close, peakDate=series[0].date;
  let inDD=false, troughVal=0, troughDate="", ddStart="";
  const events=[];
  for(let i=0;i<series.length;i++){
    const r=series[i];
    if(r.close>=peak){
      if(inDD){ events.push({start:ddStart,trough:troughDate,recover:r.date,depth:troughVal/peak-1,
        days:Math.round((new Date(r.date)-new Date(ddStart))/86400000),
        toTrough:Math.round((new Date(troughDate)-new Date(ddStart))/86400000)}); inDD=false; }
      peak=r.close; peakDate=r.date;
    } else {
      if(!inDD){ inDD=true; ddStart=peakDate; troughVal=r.close; troughDate=r.date; }
      if(r.close<troughVal){ troughVal=r.close; troughDate=r.date; }
    }
  }
  if(inDD) events.push({start:ddStart,trough:troughDate,recover:null,depth:troughVal/peak-1,
    days:Math.round((new Date(series[series.length-1].date)-new Date(ddStart))/86400000),
    toTrough:Math.round((new Date(troughDate)-new Date(ddStart))/86400000),ongoing:true});
  return events.sort((a,b)=>a.depth-b.depth);
}
function trancheStrategy(series, initialWon, cashWon, tranches){
  let units=initialWon/series[0].close, cash=cashWon, peak=series[0].close, costBasis=initialWon;
  const fired=tranches.map(t=>({...t,done:false})); const buys=[]; const curve=[];
  for(let i=0;i<series.length;i++){
    const px=series[i].close; if(px>peak)peak=px;
    const dd=px/peak-1;
    for(const t of fired){
      if(!t.done && dd<=-t.drop && cash>0){
        const amt=Math.min(cash, cashWon*t.deploy);
        if(amt>0){ units+=amt/px; cash-=amt; costBasis+=amt; t.done=true; buys.push({date:series[i].date, amt, px, dd}); }
      }
    }
    curve.push({date:series[i].date, value:units*px+cash});
  }
  const finalVal=units*series[series.length-1].close+cash;
  const invested=initialWon+(cashWon-cash);
  return {curve, buys, finalVal, cashLeft:cash, invested, units, avgCost:costBasis/units};
}
function shannon(series, totalWon, target, mode, band, cashAnnualR){
  const rmCash = cashAnnualR? Math.pow(1+cashAnnualR/100,1/252)-1 : 0;
  let units=(totalWon*target)/series[0].close, cash=totalWon*(1-target);
  let rebals=0; const curve=[]; const events=[];
  let curMonth=series[0].date.slice(0,7), curYear=series[0].date.slice(0,4);
  function rebalance(px,date,reason){
    const total=units*px+cash; units=(total*target)/px; cash=total*(1-target); rebals++;
    events.push({date,reason,total});
  }
  for(let i=0;i<series.length;i++){
    const px=series[i].close;
    if(i>0 && rmCash) cash*=(1+rmCash);
    const total=units*px+cash, stockW=(units*px)/total;
    const mk=series[i].date.slice(0,7), yk=series[i].date.slice(0,4);
    if(i>0){
      if(mode==="monthly" && mk!==curMonth) rebalance(px,series[i].date,"월");
      else if(mode==="yearly" && yk!==curYear) rebalance(px,series[i].date,"연");
      else if(mode==="band" && (stockW>target+band || stockW<target-band)) rebalance(px,series[i].date,"밴드");
    }
    curMonth=mk; curYear=yk;
    curve.push({date:series[i].date, value:units*px+cash});
  }
  const finalVal=units*series[series.length-1].close+cash;
  return {curve, finalVal, rebals, events};
}
function backtestMABand(tradeSeries, signalSeries, maLen, upBuf, downBuf){
  const sc=signalSeries.map(r=>r.close), ma=smaArr(sc,maLen);
  const want=new Array(tradeSeries.length).fill(false); let st=false;
  for(let i=0;i<tradeSeries.length;i++){
    if(ma[i]!=null){ const px=sc[i];
      if(st && px < ma[i]*(1-downBuf)) st=false;
      else if(!st && px > ma[i]*(1+upBuf)) st=true; }
    want[i]=st;
  }
  let val=100, prevIn=false, trades=0, daysIn=0; const curve=[];
  for(let i=0;i<tradeSeries.length;i++){
    const inMkt = i>0 ? want[i-1] : false;
    if(i>0 && inMkt) val *= tradeSeries[i].close/tradeSeries[i-1].close;
    if(inMkt) daysIn++; if(inMkt!==prevIn) trades++; prevIn=inMkt;
    curve.push({date:tradeSeries[i].date, close:val});
  }
  const li=tradeSeries.length-1;
  return {curve, trades, timeIn:daysIn/tradeSeries.length, curSignal:want[li]?"gold":"dead", holding:want[li]};
}
function rsiArr(closes, period){
  const out=new Array(closes.length).fill(null); let avgGain=0, avgLoss=0;
  for(let i=1;i<closes.length;i++){
    const ch=closes[i]-closes[i-1], gain=ch>0?ch:0, loss=ch<0?-ch:0;
    if(i<=period){ avgGain+=gain/period; avgLoss+=loss/period; if(i===period) out[i]=avgLoss===0?100:100-100/(1+avgGain/avgLoss); }
    else { avgGain=(avgGain*(period-1)+gain)/period; avgLoss=(avgLoss*(period-1)+loss)/period; out[i]=avgLoss===0?100:100-100/(1+avgGain/avgLoss); }
  }
  return out;
}
function backtestRSI(series, total, period, buyTh, sellTh, tranches){
  const closes=series.map(r=>r.close), rsi=rsiArr(closes,period);
  const trAmt=total/tranches;
  let cash=total, units=0, used=0; const curve=[]; const trades=[]; let prevRsi=null;
  for(let i=0;i<series.length;i++){
    const px=series[i].close;
    if(i>0 && prevRsi!=null){
      if(prevRsi<buyTh && used<tranches && cash>0){ const amt=Math.min(cash,trAmt); units+=amt/px; cash-=amt; used++; trades.push({date:series[i].date,type:"매수",amt,rsi:prevRsi}); }
      else if(prevRsi>sellTh && units>0){ const amt=units*px; cash+=amt; units=0; used=0; trades.push({date:series[i].date,type:"매도",amt,rsi:prevRsi}); }
    }
    if(rsi[i]!=null) prevRsi=rsi[i];
    curve.push({date:series[i].date, value:units*px+cash});
  }
  return {curve, finalVal:units*series[series.length-1].close+cash, trades};
}

function pct(x){ return (x>=0?"+":"")+(x*100).toFixed(1)+"%"; }
function pctRaw(x){ return (x*100).toFixed(1)+"%"; }
function fmtWon(won){
  won=Math.round(won);
  const eok=Math.floor(won/1e8), man=Math.floor((won%1e8)/1e4), rest=won%1e4;
  let s=""; if(eok>0)s+=eok+"억 "; if(man>0)s+=man.toLocaleString()+"만 ";
  if(eok===0&&man===0)s+=rest.toLocaleString()+"원"; else if(rest>0)s+=rest.toLocaleString()+"원"; else s=s.trim()+"원";
  return s.trim();
}
function fmtShort(v){ if(Math.abs(v)>=1e8)return (v/1e8).toFixed(2)+"억"; if(Math.abs(v)>=1e4)return Math.round(v/1e4).toLocaleString()+"만"; return Math.round(v); }
function fmtDays(d){ if(d<60)return d+"일"; if(d<730)return (d/30.4).toFixed(0)+"개월"; return (d/365.25).toFixed(1)+"년"; }
function downsample(len, max=460){ if(len<=max) return Array.from({length:len},(_,i)=>i); const step=len/max, idx=[]; for(let i=0;i<max;i++)idx.push(Math.floor(i*step)); idx.push(len-1); return [...new Set(idx)]; }

const peakLabelPlugin = {
  id:"peakLabels",
  afterDatasetsDraw(chart, args, opts){
    if(!opts || !opts.enabled) return;
    const {ctx}=chart; const isWon=opts.isWon, suffix=opts.suffix||"";
    chart.data.datasets.forEach((ds,di)=>{
      const meta=chart.getDatasetMeta(di);
      if(meta.hidden || !ds.data || !ds.data.length || ds._noPeak) return;
      let maxI=0,minI=0;
      for(let i=0;i<ds.data.length;i++){ const v=ds.data[i]; if(v==null)continue; if(v>ds.data[maxI])maxI=i; if(v<ds.data[minI])minI=i; }
      [{i:maxI,up:true},{i:minI,up:false}].forEach(({i,up})=>{
        const el=meta.data[i]; if(!el)return; const val=ds.data[i]; if(val==null)return;
        const txt=(up?"▲":"▼")+(isWon?fmtShort(val):(typeof val==="number"?val.toFixed(0):val))+suffix;
        ctx.save(); ctx.font='700 10px "JetBrains Mono", monospace';
        const w=ctx.measureText(txt).width+10;
        let x=el.x-w/2, y=up?el.y-17:el.y+9;
        x=Math.max(chart.chartArea.left,Math.min(x,chart.chartArea.right-w));
        y=Math.max(chart.chartArea.top,Math.min(y,chart.chartArea.bottom-15));
        ctx.fillStyle="rgba(255,255,255,.95)"; ctx.strokeStyle=ds.borderColor; ctx.lineWidth=1;
        rrect(ctx,x,y,w,15,4); ctx.fill(); ctx.stroke();
        ctx.fillStyle=ds.borderColor; ctx.textBaseline="middle"; ctx.textAlign="left"; ctx.fillText(txt,x+5,y+8);
        ctx.restore();
      });
    });
  }
};
function rrect(ctx,x,y,w,h,r){ ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath(); }
Chart.register(peakLabelPlugin);

const GRIDC="#e7f1eb", TICKC="#7e9389";
const TIP={backgroundColor:"#ffffff",borderColor:"#e3efe9",borderWidth:1,titleColor:"#7e9389",bodyColor:"#16271f",titleFont:{family:"JetBrains Mono",size:11},bodyFont:{family:"JetBrains Mono",size:12},padding:10};
let CHARTS={};
function setChart(id,cfg){ if(CHARTS[id])CHARTS[id].destroy(); CHARTS[id]=new Chart($("#"+id),cfg); return CHARTS[id]; }

const DATA={};
async function getData(yahoo, base, from, to){
  const key=`${yahoo}|${base}|${from}|${to}`;
  if(DATA[key]) return DATA[key];
  const res=await fetch(`${PROXY}/?yahoo=${encodeURIComponent(yahoo)}&stooq=${encodeURIComponent(base)}&from=${from}&to=${to}`);
  const j=await res.json();
  if(!res.ok || !j.data) throw new Error(j.error||("프록시 오류 "+res.status));
  DATA[key]={data:j.data, source:j.source}; return DATA[key];
}
function resolveInstr(instrId, cSym, cLev, cER){
  const c=CATALOG.find(x=>x.id===instrId);
  if(c && c.custom){ const sym=(cSym||"").trim(); if(!sym)return null; return {id:sym.toUpperCase(),base:sym,yahoo:sym,lev:cLev||1,er:cER||0,custom:true}; }
  return c?{...c}:null;
}

function SlotManager(pfx, max, defaults){
  let slots=[], seq=1;
  const wrap=$("#"+pfx+"_slots"), countEl=$("#"+pfx+"_count"), addEl=$("#"+pfx+"_add");
  function add(p){ if(slots.length>=max)return; slots.push({uid:seq++,instrId:"TQQQ",cSym:"",cLev:3,cER:0.95,...(p||{})}); render(); }
  function rm(uid){ slots=slots.filter(s=>s.uid!==uid); render(); }
  function render(){
    wrap.innerHTML="";
    slots.forEach((s,i)=>{
      const color=COLORS[i%COLORS.length];
      const c=CATALOG.find(x=>x.id===s.instrId)||CATALOG[0];
      const div=document.createElement("div");
      div.className="slot"+(c.custom?" custom-open":"");
      div.innerHTML=`<span class="cdot" style="background:${color};color:${color}"></span>
        <select data-uid="${s.uid}" class="slotSel">${CATALOG.map(o=>`<option value="${o.id}" ${o.id===s.instrId?"selected":""}>${o.name}</option>`).join("")}</select>
        <button class="rm" data-uid="${s.uid}">×</button>
        ${c.custom?`<div class="custom-fields"><input class="cSym" data-uid="${s.uid}" placeholder="티커" value="${s.cSym||""}" style="flex:2"><input class="cLev" data-uid="${s.uid}" type="number" step="0.5" value="${s.cLev}" style="flex:1"><input class="cER" data-uid="${s.uid}" type="number" step="0.01" value="${s.cER}" style="flex:1"></div>`:""}`;
      wrap.appendChild(div);
    });
    countEl.textContent=`(${slots.length}/${max})`;
    addEl.disabled=slots.length>=max;
    wrap.querySelectorAll(".slotSel").forEach(el=>el.onchange=e=>{slots.find(x=>x.uid==e.target.dataset.uid).instrId=e.target.value;render();});
    wrap.querySelectorAll(".rm").forEach(el=>el.onclick=e=>rm(+e.target.dataset.uid));
    wrap.querySelectorAll(".cSym").forEach(el=>{
      el.oninput=e=>{slots.find(x=>x.uid==e.target.dataset.uid).cSym=e.target.value;};
      attachSearch(el, q=>{ const s=slots.find(x=>x.uid==el.dataset.uid); if(s){s.cSym=q.symbol;s.cName=q.name;} el.value=q.symbol; el.title=q.name; });
    });
    wrap.querySelectorAll(".cLev").forEach(el=>el.oninput=e=>{slots.find(x=>x.uid==e.target.dataset.uid).cLev=parseFloat(e.target.value)||1;});
    wrap.querySelectorAll(".cER").forEach(el=>el.oninput=e=>{slots.find(x=>x.uid==e.target.dataset.uid).cER=parseFloat(e.target.value)||0;});
  }
  addEl.onclick=()=>add();
  (defaults||[]).forEach(d=>add(d));
  return {get:()=>slots, add, load:(arr)=>{slots=arr.map(s=>({uid:seq++,instrId:s.instrId,cSym:s.cSym||"",cLev:s.cLev||3,cER:s.cER||0.95}));render();}};
}

function fillSelect(id){ const sel=$("#"+id); CATALOG.forEach(c=>{const o=document.createElement("option");o.value=c.id;o.textContent=c.name;sel.appendChild(o);}); }
function bindCustomToggle(selId, customWrapId){
  const sel=$("#"+selId), wrap=$("#"+customWrapId);
  sel.onchange=()=>{ const c=CATALOG.find(x=>x.id===sel.value); wrap.style.display=c.custom?"grid":"none"; };
}
function scrollTopSmooth(){ window.scrollTo({top:0,behavior:"smooth"}); }

function esc(s){ return (s||"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
let _ddRepos=null;
window.addEventListener("scroll",()=>{ if(_ddRepos)_ddRepos(); },true);
window.addEventListener("resize",()=>{ if(_ddRepos)_ddRepos(); });
function attachSearch(input, onPick){
  let dd=null, timer=null, items=[], sel=-1, loadEl=null;
  function position(){ if(!dd)return; const r=input.getBoundingClientRect(); dd.style.left=(r.left+window.scrollX)+"px"; dd.style.top=(r.bottom+window.scrollY+4)+"px"; dd.style.width=Math.max(r.width,260)+"px"; }
  function spinOff(){ if(loadEl){loadEl.remove();loadEl=null;} }
  function close(){ if(dd){dd.remove();dd=null;} sel=-1; spinOff(); if(_ddRepos===position)_ddRepos=null; }
  function ensure(){ if(!dd){ dd=document.createElement("div"); dd.className="searchdd"; document.body.appendChild(dd); _ddRepos=position; } position(); }
  function spinOn(){ if(!loadEl){ loadEl=document.createElement("div"); loadEl.className="searchloading"; const p=input.parentElement; if(getComputedStyle(p).position==="static")p.style.position="relative"; p.appendChild(loadEl); } }
  function render(){ ensure();
    dd.innerHTML = items.length
      ? items.map((q,i)=>`<div class="sr ${i===sel?'on':''}" data-i="${i}"><b>${esc(q.symbol)}</b><span>${esc(q.name)}</span><em>${esc(q.exch)}</em></div>`).join("")
      : `<div class="sr msg">결과 없음</div>`;
    dd.querySelectorAll(".sr[data-i]").forEach(el=>el.onmousedown=e=>{ e.preventDefault(); pick(items[+el.dataset.i]); });
  }
  function pick(q){ if(q)onPick(q); close(); }
  async function run(q){ spinOn();
    try{ const r=await fetch(`${PROXY}/search?q=${encodeURIComponent(q)}`); const j=await r.json(); items=(j.quotes||[]).slice(0,12); sel=-1; spinOff(); if(document.activeElement===input)render(); }
    catch(e){ spinOff(); items=[]; ensure(); dd.innerHTML=`<div class="sr msg">검색 불가 · Worker 업데이트 필요</div>`; }
  }
  input.setAttribute("autocomplete","off");
  input.addEventListener("input",()=>{ const v=input.value.trim(); clearTimeout(timer); if(v.length<1){close();return;} timer=setTimeout(()=>run(v),250); });
  input.addEventListener("blur",()=>setTimeout(close,180));
  input.addEventListener("keydown",e=>{ if(!dd||!items.length)return;
    if(e.key==="ArrowDown"){sel=Math.min(sel+1,items.length-1);render();e.preventDefault();}
    else if(e.key==="ArrowUp"){sel=Math.max(sel-1,0);render();e.preventDefault();}
    else if(e.key==="Enter"){if(sel>=0){pick(items[sel]);e.preventDefault();}}
    else if(e.key==="Escape")close();
  });
}

const BOARD_LS="leveragelab.board.v1";
let boardSort={key:"mar",dir:-1};
function getBoard(){ try{return JSON.parse(localStorage.getItem(BOARD_LS)||"[]");}catch{return[];} }
function saveBoard(a){ localStorage.setItem(BOARD_LS,JSON.stringify(a)); renderBoard(); }
function addBoard(e){
  const mar=(e.mar!=null)?e.mar:(e.mdd?e.cagr/Math.abs(e.mdd):0);
  const a=getBoard();
  a.push({id:"b"+Date.now()+Math.random().toString(36).slice(2,5), label:e.label, cagr:e.cagr, mdd:e.mdd, mar, finalVal:e.finalVal});
  saveBoard(a);
}
function removeBoard(id){ saveBoard(getBoard().filter(x=>x.id!==id)); }
function bArrow(k){ return boardSort.key===k?(boardSort.dir<0?" ▼":" ▲"):""; }
function renderBoard(){
  const list=getBoard();
  const badge=$("#tab_board_badge"); if(badge) badge.textContent=list.length?`(${list.length})`:"";
  const body=$("#board_body"); if(!body) return;
  if(!list.length){ body.innerHTML=`<div class="placeholder"><div class="big">아직 담은 전략이 없어요</div><div class="mono" style="font-size:12px">비교·신호매매·분할매수·도깨비 탭에서 결과를 낸 뒤 <span class="cy">⊕ 비교함에 담기</span>를 누르세요</div></div>`; return; }
  const sorted=[...list].sort((a,b)=>{ const k=boardSort.key; let av=a[k],bv=b[k]; if(k==="mdd"){av=Math.abs(av);bv=Math.abs(bv);} return (av-bv)*boardSort.dir; });
  const best={cagr:Math.max(...list.map(x=>x.cagr)), mar:Math.max(...list.map(x=>x.mar)), final:Math.max(...list.map(x=>x.finalVal))};
  const worstMdd=Math.min(...list.map(x=>x.mdd));
  const rows=sorted.map(e=>`<tr>
    <td class="name">${esc(e.label)}</td>
    <td class="num ${e.cagr===best.cagr?'hl-good':(e.cagr>=0?'pos':'neg')}">${pct(e.cagr)}</td>
    <td class="num ${e.mdd===worstMdd?'hl-bad':'neg'}">${(e.mdd*100).toFixed(1)}%</td>
    <td class="num ${e.mar===best.mar?'hl-good':'cy'}">${e.mar.toFixed(2)}</td>
    <td class="num ${e.finalVal===best.final?'hl-good':''}">${fmtWon(e.finalVal)}</td>
    <td><button class="brm" data-id="${e.id}">×</button></td></tr>`).join("");
  body.innerHTML=`<div class="ctable-wrap"><table class="ctable"><thead><tr>
    <th>전략</th>
    <th class="bsort" data-k="cagr"><span class="th-main">연평균 수익률${bArrow('cagr')}</span><span class="th-sub">CAGR</span></th>
    <th class="bsort" data-k="mdd"><span class="th-main">최대 낙폭률${bArrow('mdd')}</span><span class="th-sub">MDD</span></th>
    <th class="bsort" data-k="mar"><span class="th-main">위험대비 수익${bArrow('mar')}</span><span class="th-sub">MAR</span></th>
    <th class="bsort" data-k="finalVal"><span class="th-main">최종 평가금액${bArrow('finalVal')}</span></th>
    <th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="note" style="margin-top:14px"><b class="hl-good">초록</b>=항목별 최고(낙폭은 작을수록 좋음) · <b class="hl-bad">빨강</b>=가장 큰 낙폭 · 헤더 클릭 정렬 · 같은 전략을 파라미터만 바꿔 여러 번 담아 비교할 수 있어요.</div>
    <button class="board-clear" id="board_clear">🗑 전체 비우기</button>`;
  body.querySelectorAll(".bsort").forEach(th=>th.onclick=()=>{ const k=th.dataset.k; if(boardSort.key===k)boardSort.dir*=-1; else{boardSort.key=k;boardSort.dir=(k==="mdd"?1:-1);} renderBoard(); });
  body.querySelectorAll(".brm").forEach(b=>b.onclick=()=>removeBoard(b.dataset.id));
  $("#board_clear").onclick=()=>{ if(confirm("비교 보드를 전부 비울까요?")) saveBoard([]); };
}
function boardAddButtons(containerId, entries){
  const c=$("#"+containerId); if(!c) return;
  c.innerHTML=`<span class="badd-label">⊕ 비교함에 담기:</span>`+entries.map((e,i)=>`<button class="badd-btn" data-i="${i}">${esc(e.short)}</button>`).join("");
  c.querySelectorAll(".badd-btn").forEach(btn=>btn.onclick=()=>{
    addBoard(entries[+btn.dataset.i]); const t=btn.textContent; btn.textContent="✓ 담김"; btn.classList.add("done");
    setTimeout(()=>{ btn.textContent=t; btn.classList.remove("done"); },1200);
  });
}

/* ===== COMPARE ===== */
const cSlots=SlotManager("c",6,[{instrId:"TQQQ"},{instrId:"QLD"},{instrId:"QQQ"}]);
let cRun=null, cEqMode="value", cEqLog=false, cYearMode="ret", cHidden=new Set();

$("#c_run").onclick=async ()=>{
  $("#c_err").textContent="";
  const slots=cSlots.get();
  if(!slots.length){ $("#c_err").textContent="종목을 1개 이상 추가하세요."; return; }
  const d1=$("#c_start").value, d2=$("#c_end").value;
  if(!d1||!d2||d1>=d2){ $("#c_err").textContent="기간을 확인하세요."; return; }
  const lump=(parseFloat($("#c_lump").value)||0)*1e4, monthly=(parseFloat($("#c_monthly").value)||0)*1e4;
  if(lump<=0&&monthly<=0){ $("#c_err").textContent="투자금을 입력하세요."; return; }
  const fin=parseFloat($("#c_fin").value)||0;
  const instrs=[];
  for(const s of slots){ const it=resolveInstr(s.instrId,s.cSym,s.cLev,s.cER); if(!it){$("#c_err").textContent="커스텀 티커를 입력하세요.";return;} instrs.push(it); }

  const btn=$("#c_run"); btn.disabled=true; const o=btn.textContent; btn.textContent="⟳ 수신 중...";
  $("#c_results").innerHTML=`<div class="card"><div class="loading"><span class="spin"></span> ${instrs.length}종목 불러오는 중...</div></div>`;
  const results=[], errors=[];
  try{
    const uniq=[...new Map(instrs.map(it=>[`${it.yahoo}|${it.base}`,it])).values()];
    await Promise.all(uniq.map(it=>getData(it.yahoo,it.base,d1,d2).catch(e=>errors.push(`${it.id}: ${e.message}`))));
    instrs.forEach((it,idx)=>{
      const cd=DATA[`${it.yahoo}|${it.base}|${d1}|${d2}`]; if(!cd)return;
      const cl=clip(cd.data,d1,d2); if(cl.length<10){errors.push(`${it.id}: 데이터 부족`);return;}
      const series=synth(cl,it.lev,it.er,it.custom?0:fin);
      const pf=portfolio(series,lump,monthly);
      results.push({instr:it,color:COLORS[idx%COLORS.length],series,mtr:metrics(series),pf,yr:yearly(series,pf.eqCurve),simulated:it.lev>1});
    });
    if(!results.length){ $("#c_results").innerHTML=`<div class="card"><div class="err">데이터 실패.<br>${errors.join("<br>")}</div></div>`; return; }
    cHidden=new Set(); cRun={results,settings:{d1,d2,lump,monthly},errors};
    renderCompare();
  }catch(e){ $("#c_results").innerHTML=`<div class="card"><div class="err">오류: ${e.message}</div></div>`; }
  finally{ btn.disabled=false; btn.textContent=o; }
};

function renderCompare(){
  const {results,settings,errors}=cRun;
  const best={cagr:Math.max(...results.map(r=>r.mtr.cagr)),mar:Math.max(...results.map(r=>r.mtr.mar)),final:Math.max(...results.map(r=>r.pf.finalVal))};
  const worst={mdd:Math.min(...results.map(r=>r.mtr.mdd))};
  const us=results[0].series[0].date, ue=results[0].series[results[0].series.length-1].date;
  const rows=results.map(r=>{
    const m=r.mtr,p=r.pf;
    return `<tr><td class="name"><span class="namecell"><span class="cdot" style="background:${r.color};color:${r.color}"></span>${r.instr.id}${r.simulated?` <span class="dimv" style="font-size:10px">×${r.instr.lev}합성</span>`:""}</span></td>
      <td class="num ${m.cagr===best.cagr?"hl-good":(m.cagr>=0?"pos":"neg")}">${pct(m.cagr)}</td>
      <td class="num ${m.mdd===worst.mdd?"hl-bad":"neg"}">${(m.mdd*100).toFixed(1)}%</td>
      <td class="num ${m.mar===best.mar?"hl-good":"cy"}">${m.mar.toFixed(2)}</td>
      <td class="num">${m.totMult.toFixed(1)}배</td>
      <td class="num ${p.finalVal===best.final?"hl-good":(p.finalVal>=p.invested?"pos":"neg")}">${fmtWon(p.finalVal)}</td>
      <td class="num ${p.xirr>=0?"pos":"neg"}">${pct(p.xirr)}</td></tr>`;
  }).join("");
  const allY=[...new Set(results.flatMap(r=>r.yr.map(y=>y.year)))].sort();
  const yh=`<th>연도</th>`+results.map(r=>`<th><span class="nm"><span class="cdot" style="background:${r.color}"></span>${r.instr.id}</span></th>`).join("");
  const yb=allY.map(y=>`<tr><td>${y}</td>`+results.map(r=>{const row=r.yr.find(x=>x.year===y);if(!row)return`<td class="dimv">·</td>`;return cYearMode==="ret"?`<td class="${row.ret>=0?"cellpos":"cellneg"}">${pct(row.ret)}</td>`:`<td>${fmtShort(row.eq)}</td>`;}).join("")+`</tr>`).join("");
  const yf=`<tr><td>전체</td>`+results.map(r=>cYearMode==="ret"?`<td class="${r.mtr.totMult>=1?"cellpos":"cellneg"}">${pct(r.mtr.totMult-1)}</td>`:`<td>${fmtShort(r.pf.finalVal)}</td>`).join("")+`</tr>`;
  const eb=(errors&&errors.length)?`<div class="fallback" style="margin-bottom:18px"><h3>⚠ 일부 제외</h3><p>${errors.join("<br>")}</p></div>`:"";

  $("#c_results").innerHTML=`
    <div class="card" style="margin-bottom:20px">
      <h2>비교 결과 · ${us} → ${ue}</h2>
      <div style="font-size:12.5px;color:var(--ink-dim);margin:-8px 0 16px;font-family:'JetBrains Mono',monospace">투자원금 ${fmtWon(results[0].pf.invested)} ${settings.monthly>0?`(거치 ${fmtWon(settings.lump)} + 월 ${fmtWon(settings.monthly)})`:"(거치식)"} · ${results.length}종목</div>
      ${eb}
      <div class="ctable-wrap"><table class="ctable"><thead><tr><th>종목</th>
        <th><span class="th-main">연평균 수익률</span><span class="th-sub">CAGR</span></th>
        <th><span class="th-main">최대 낙폭률</span><span class="th-sub">MDD</span></th>
        <th><span class="th-main">위험대비 수익</span><span class="th-sub">MAR</span></th>
        <th><span class="th-main">원금의 몇 배</span><span class="th-sub">총배수</span></th>
        <th><span class="th-main">최종 평가금액</span></th>
        <th><span class="th-main">실질 연수익률</span><span class="th-sub">XIRR</span></th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="note" style="margin-top:14px"><b class="hl-good">초록</b>=항목별 최고 · <b class="hl-bad">빨강</b>=가장 큰 낙폭.<br>
        <b>연평균 수익률</b> = 복리로 환산한 1년 평균 수익률 · <b>최대 낙폭률</b> = 고점에서 가장 크게 떨어졌던 폭(–가 클수록 더 깊이 하락) · <b>위험대비 수익</b> = 수익률 ÷ 낙폭, 높을수록 덜 출렁이며 번 것 · <b>실질 연수익률</b> = 적립 시점까지 반영한 내 돈 기준 실제 수익률(거치식만 하면 연평균 수익률과 거의 같음).</div>
      <div class="boardadd" id="c_boardadd"></div>
    </div>
    <div class="card chartcard">
      <div class="charthead"><h3>자산 곡선</h3><div style="display:flex;gap:10px;flex-wrap:wrap"><div class="toggle"><button id="c_mVal" class="${cEqMode==="value"?"on":""}">평가금액</button><button id="c_mGro" class="${cEqMode==="growth"?"on":""}">성장배수</button></div><div class="toggle"><button id="c_lin" class="${cEqLog?"":"on"}">선형</button><button id="c_log" class="${cEqLog?"on":""}">로그</button></div></div></div>
      <div class="legend" id="c_legEq"></div><div class="chartbox"><canvas id="c_eq"></canvas></div>
      <div class="note" style="margin-top:10px">각 선의 <b>▲최고 ▼최저</b>가 숫자로 표시. 범례 클릭으로 켜고 끄기.</div>
    </div>
    <div class="card chartcard"><div class="charthead"><h3>낙폭 곡선 (%)</h3></div><div class="legend" id="c_legDd"></div><div class="chartbox short"><canvas id="c_dd"></canvas></div></div>
    <div class="card"><div class="sectitle">연도별 수익률</div><div class="subtabs"><button id="c_yRet" class="${cYearMode==="ret"?"on":""}">연 수익률</button><button id="c_yEq" class="${cYearMode==="eq"?"on":""}">연말 평가금액</button></div>
      <div class="ytable-wrap"><table class="ytable"><thead><tr>${yh}</tr></thead><tbody>${yb}</tbody><tfoot>${yf}</tfoot></table></div></div>`;

  drawCompare();
  cLegends();
  boardAddButtons("c_boardadd", results.map(r=>({label:`${r.instr.id} 단순보유`, short:r.instr.id, cagr:r.mtr.cagr, mdd:r.mtr.mdd, mar:r.mtr.mar, finalVal:r.pf.finalVal})));
  $("#c_mVal").onclick=()=>{cEqMode="value";drawCompare();cTog();};
  $("#c_mGro").onclick=()=>{cEqMode="growth";drawCompare();cTog();};
  $("#c_lin").onclick=()=>{cEqLog=false;drawCompare();cTog();};
  $("#c_log").onclick=()=>{cEqLog=true;drawCompare();cTog();};
  $("#c_yRet").onclick=()=>{cYearMode="ret";renderCompare();};
  $("#c_yEq").onclick=()=>{cYearMode="eq";renderCompare();};
}
function cTog(){ $("#c_mVal").classList.toggle("on",cEqMode==="value");$("#c_mGro").classList.toggle("on",cEqMode==="growth");$("#c_lin").classList.toggle("on",!cEqLog);$("#c_log").classList.toggle("on",cEqLog); }
function drawCompare(){
  const {results}=cRun;
  const ref=results.reduce((a,b)=>b.series.length>a.series.length?b:a,results[0]);
  const idx=downsample(ref.series.length); const labels=idx.map(i=>ref.series[i].date);
  const dsEq=results.map((r,di)=>{ const arr=cEqMode==="growth"?r.series.map(p=>p.close/r.series[0].close):r.pf.eqCurve;
    return {label:r.instr.id,data:idx.map(i=>arr[Math.min(i,arr.length-1)]),borderColor:r.color,backgroundColor:"transparent",borderWidth:2,pointRadius:0,tension:.06,hidden:cHidden.has(di)}; });
  const dsDd=results.map((r,di)=>{ let pk=-Infinity; const dd=r.series.map(p=>{if(p.close>pk)pk=p.close;return (p.close/pk-1)*100;});
    return {label:r.instr.id,data:idx.map(i=>dd[Math.min(i,dd.length-1)]),borderColor:r.color,backgroundColor:"transparent",borderWidth:1.6,pointRadius:0,tension:.06,hidden:cHidden.has(di)}; });
  setChart("c_eq",{type:"line",data:{labels,datasets:dsEq},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},
    plugins:{legend:{display:false},tooltip:{...TIP,callbacks:{label:c=>` ${c.dataset.label}: ${cEqMode==="growth"?c.parsed.y.toFixed(2)+"배":fmtWon(c.parsed.y)}`}},peakLabels:{enabled:true,isWon:cEqMode!=="growth",suffix:cEqMode==="growth"?"x":""}},
    scales:{x:{grid:{color:GRIDC,drawTicks:false},ticks:{color:TICKC,maxTicksLimit:8,font:{family:"JetBrains Mono",size:10}}},
      y:cEqLog?{type:"logarithmic",grid:{color:GRIDC},ticks:{color:TICKC,font:{family:"JetBrains Mono",size:10},callback:v=>cEqMode==="growth"?v+"x":fmtShort(v)}}:{grid:{color:GRIDC},ticks:{color:TICKC,font:{family:"JetBrains Mono",size:10},callback:v=>cEqMode==="growth"?v+"x":fmtShort(v)}}}}});
  setChart("c_dd",{type:"line",data:{labels,datasets:dsDd},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},
    plugins:{legend:{display:false},tooltip:{...TIP,bodyColor:"#dc2626",callbacks:{label:c=>` ${c.dataset.label}: ${c.parsed.y.toFixed(1)}%`}},peakLabels:{enabled:true,isWon:false,suffix:"%"}},
    scales:{x:{grid:{color:GRIDC},ticks:{color:TICKC,maxTicksLimit:8,font:{family:"JetBrains Mono",size:10}}},y:{grid:{color:GRIDC},ticks:{color:TICKC,font:{family:"JetBrains Mono",size:10},callback:v=>v+"%"},max:0}}}});
}
function cLegends(){ const {results}=cRun; ["c_legEq","c_legDd"].forEach(eid=>{ const el=$("#"+eid); el.innerHTML="";
  results.forEach((r,di)=>{ const sp=document.createElement("span"); sp.className=cHidden.has(di)?"off":""; sp.innerHTML=`<i style="background:${r.color}"></i>${r.instr.id}`;
    sp.onclick=()=>{ cHidden.has(di)?cHidden.delete(di):cHidden.add(di); drawCompare(); cLegends(); }; el.appendChild(sp); }); }); }

const LS="leveragelab.saved.v1";
function getSaved(){ try{return JSON.parse(localStorage.getItem(LS)||"[]");}catch{return[];} }
function setSaved(a){ localStorage.setItem(LS,JSON.stringify(a)); renderSaved(); }
function renderSaved(){ const list=getSaved(),el=$("#c_saved"); el.innerHTML="";
  if(!list.length){ el.innerHTML=`<span class="dimv" style="font-size:11.5px;font-family:'JetBrains Mono',monospace">저장된 구성 없음</span>`; return; }
  list.forEach((s,i)=>{ const chip=document.createElement("span"); chip.className="saved-chip";
    chip.innerHTML=`<span class="lbl">${s.name}</span><span class="x">×</span>`;
    chip.querySelector(".lbl").onclick=()=>loadCfg(s);
    chip.querySelector(".x").onclick=e=>{e.stopPropagation();const a=getSaved();a.splice(i,1);setSaved(a);};
    el.appendChild(chip); }); }
$("#c_saveBtn").onclick=()=>{ const name=($("#c_saveName").value||"").trim()||`구성 ${new Date().toLocaleDateString("ko-KR")}`;
  const cfg={name,start:$("#c_start").value,end:$("#c_end").value,lump:$("#c_lump").value,monthly:$("#c_monthly").value,fin:$("#c_fin").value,slots:cSlots.get().map(s=>({instrId:s.instrId,cSym:s.cSym,cLev:s.cLev,cER:s.cER}))};
  const a=getSaved(); const ex=a.findIndex(x=>x.name===name); if(ex>=0)a[ex]=cfg;else a.push(cfg); setSaved(a); $("#c_saveName").value=""; };
function loadCfg(cfg){ $("#c_start").value=cfg.start;$("#c_end").value=cfg.end;$("#c_lump").value=cfg.lump;$("#c_monthly").value=cfg.monthly;$("#c_fin").value=cfg.fin||0;
  cSlots.load(cfg.slots); $("#c_err").textContent=""; scrollTopSmooth(); }
renderSaved();

/* ===== ROLLING ===== */
const rSlots=SlotManager("r",6,[{instrId:"TQQQ"},{instrId:"QQQ"}]);
let rHold=3;
$$("#r_hold button").forEach(b=>b.onclick=()=>{ rHold=+b.dataset.h; $$("#r_hold button").forEach(x=>x.classList.toggle("on",x===b)); });

$("#r_run").onclick=async ()=>{
  $("#r_err").textContent="";
  const slots=rSlots.get(); if(!slots.length){$("#r_err").textContent="종목을 추가하세요.";return;}
  const d1=$("#r_start").value,d2=$("#r_end").value; if(!d1||!d2||d1>=d2){$("#r_err").textContent="기간 확인.";return;}
  const fin=parseFloat($("#r_fin").value)||0;
  const instrs=[]; for(const s of slots){const it=resolveInstr(s.instrId,s.cSym,s.cLev,s.cER);if(!it){$("#r_err").textContent="커스텀 티커 입력.";return;}instrs.push(it);}
  const btn=$("#r_run");btn.disabled=true;const o=btn.textContent;btn.textContent="⟳ 분석 중...";
  $("#r_results").innerHTML=`<div class="card"><div class="loading"><span class="spin"></span> 롤링 계산 중...</div></div>`;
  const results=[],errors=[];
  try{
    const uniq=[...new Map(instrs.map(it=>[`${it.yahoo}|${it.base}`,it])).values()];
    await Promise.all(uniq.map(it=>getData(it.yahoo,it.base,d1,d2).catch(e=>errors.push(`${it.id}: ${e.message}`))));
    instrs.forEach((it,idx)=>{ const cd=DATA[`${it.yahoo}|${it.base}|${d1}|${d2}`];if(!cd)return;
      const cl=clip(cd.data,d1,d2);if(cl.length<60){errors.push(`${it.id}: 데이터 부족`);return;}
      const series=synth(cl,it.lev,it.er,it.custom?0:fin);
      const roll=rollingReturns(series,rHold);
      if(!roll.length){errors.push(`${it.id}: 보유기간보다 데이터가 짧음`);return;}
      results.push({instr:it,color:COLORS[idx%COLORS.length],roll,st:stats(roll.map(r=>r.cagr))});
    });
    if(!results.length){$("#r_results").innerHTML=`<div class="card"><div class="err">분석 불가.<br>${errors.join("<br>")}</div></div>`;return;}
    renderRolling(results,errors,d1,d2);
  }catch(e){$("#r_results").innerHTML=`<div class="card"><div class="err">오류: ${e.message}</div></div>`;}
  finally{btn.disabled=false;btn.textContent=o;}
};
function renderRolling(results,errors,d1,d2){
  const eb=(errors&&errors.length)?`<div class="fallback" style="margin-bottom:18px"><h3>⚠ 일부 제외</h3><p>${errors.join("<br>")}</p></div>`:"";
  const bestMin=Math.max(...results.map(r=>r.st.min)), bestLoss=Math.min(...results.map(r=>r.st.lossProb));
  const rows=results.map(r=>{const s=r.st;
    return `<tr><td class="name"><span class="namecell"><span class="cdot" style="background:${r.color};color:${r.color}"></span>${r.instr.id}</span></td>
      <td class="num ${s.min===bestMin?"hl-good":(s.min>=0?"pos":"neg")}">${pct(s.min)}</td>
      <td class="num">${pct(s.q25)}</td><td class="num cy">${pct(s.median)}</td><td class="num">${pct(s.q75)}</td>
      <td class="num ${s.max>=0?"pos":"neg"}">${pct(s.max)}</td>
      <td class="num ${s.lossProb===bestLoss?"hl-good":"neg"}">${(s.lossProb*100).toFixed(1)}%</td>
      <td class="num dimv">${s.n.toLocaleString()}</td></tr>`;
  }).join("");
  $("#r_results").innerHTML=`
    <div class="card" style="margin-bottom:20px">
      <h2>롤링 수익률 · ${rHold}년 보유 · ${d1}~${d2}</h2>
      <div style="font-size:12.5px;color:var(--ink-dim);margin:-8px 0 16px;font-family:'JetBrains Mono',monospace">"아무 날에나 사서 ${rHold}년 들고 있었다면"의 연평균 수익률 분포</div>
      ${eb}
      <div class="ctable-wrap"><table class="ctable"><thead><tr><th>종목</th><th><span class="th-main">최저</span></th><th><span class="th-main">하위 25%</span></th><th><span class="th-main">중앙값</span></th><th><span class="th-main">상위 25%</span></th><th><span class="th-main">최고</span></th><th><span class="th-main">손실 확률</span></th><th><span class="th-main">케이스</span></th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="note" style="margin-top:14px">표의 모든 값은 <b>${rHold}년 보유 시 연평균 수익률</b>. <b>최저</b>=가장 운 나쁜 시점에 산 경우 · <b>중앙값</b>=딱 중간 운 · <b>손실확률</b>=${rHold}년 뒤 원금보다 마이너스였던 비율. <b class="hl-good">초록</b>=최저값이 가장 높고/손실확률이 가장 낮은 종목.</div>
    </div>
    <div class="card chartcard"><div class="charthead"><h3>진입 시점별 ${rHold}년 보유 연평균 수익률</h3></div>
      <div class="legend" id="r_leg"></div><div class="chartbox"><canvas id="r_chart"></canvas></div>
      <div class="note" style="margin-top:10px">x축=매수한 날, y축=그날 사서 ${rHold}년 뒤의 연평균 수익률. 0선(회색 점선) 아래는 손실 구간.</div></div>`;
  const ref=results.reduce((a,b)=>b.roll.length>a.roll.length?b:a,results[0]);
  const idx=downsample(ref.roll.length); const labels=idx.map(i=>ref.roll[i]?ref.roll[i].date:"");
  const ds=results.map(r=>({label:r.instr.id,data:idx.map(i=>r.roll[i]?+(r.roll[i].cagr*100).toFixed(2):null),borderColor:r.color,backgroundColor:"transparent",borderWidth:1.8,pointRadius:0,tension:.05,spanGaps:true}));
  ds.push({label:"0%",data:labels.map(()=>0),borderColor:"rgba(120,147,137,.5)",borderWidth:1,borderDash:[4,4],pointRadius:0,_noPeak:true});
  setChart("r_chart",{type:"line",data:{labels,datasets:ds},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},
    plugins:{legend:{display:false},tooltip:{...TIP,callbacks:{label:c=>c.dataset.label==="0%"?null:` ${c.dataset.label}: ${c.parsed.y>=0?"+":""}${c.parsed.y}%`}},peakLabels:{enabled:true,isWon:false,suffix:"%"}},
    scales:{x:{grid:{color:GRIDC,drawTicks:false},ticks:{color:TICKC,maxTicksLimit:8,font:{family:"JetBrains Mono",size:10}}},y:{grid:{color:GRIDC},ticks:{color:TICKC,font:{family:"JetBrains Mono",size:10},callback:v=>v+"%"}}}}});
  const el=$("#r_leg"); el.innerHTML=""; results.forEach(r=>{const sp=document.createElement("span");sp.innerHTML=`<i style="background:${r.color}"></i>${r.instr.id}`;el.appendChild(sp);});
}

/* ===== SIGNAL ===== */
fillSelect("s_instr"); bindCustomToggle("s_instr","s_custom");
let sMethod="cross";
$$("#s_method button").forEach(b=>b.onclick=()=>{
  sMethod=b.dataset.m; $$("#s_method button").forEach(x=>x.classList.toggle("on",x===b));
  $("#s_crossFields").style.display = sMethod==="cross"?"grid":"none";
  $("#s_bandFields").style.display = sMethod==="band"?"block":"none";
});
$("#s_run").onclick=async ()=>{
  $("#s_err").textContent="";
  const it=resolveInstr($("#s_instr").value,$("#s_cSym").value,parseFloat($("#s_cLev").value),parseFloat($("#s_cER").value));
  if(!it){$("#s_err").textContent="커스텀 티커를 입력하세요.";return;}
  const d1=$("#s_start").value,d2=$("#s_end").value; if(!d1||!d2||d1>=d2){$("#s_err").textContent="기간 확인.";return;}
  let needLen, methodLabel, shortN, longN, maLen, upBuf, downBuf;
  if(sMethod==="cross"){
    shortN=parseInt($("#s_short").value)||3; longN=parseInt($("#s_long").value)||160;
    if(shortN>=longN){$("#s_err").textContent="단기 이평 < 장기 이평이어야 합니다.";return;}
    needLen=longN+10; methodLabel=`${shortN}/${longN}일 교차`;
  } else {
    maLen=parseInt($("#s_maLen").value)||200;
    upBuf=(parseFloat($("#s_upBuf").value)||0)/100; downBuf=(parseFloat($("#s_downBuf").value)||0)/100;
    needLen=maLen+10; methodLabel=`${maLen}일선 +${(upBuf*100).toFixed(1)}/−${(downBuf*100).toFixed(1)}%`;
  }
  const lump=(parseFloat($("#s_lump").value)||1000)*1e4, fin=parseFloat($("#s_fin").value)||0;
  const btn=$("#s_run");btn.disabled=true;const o=btn.textContent;btn.textContent="⟳ 실행 중...";
  $("#s_results").innerHTML=`<div class="card"><div class="loading"><span class="spin"></span> 신호 매매 계산 중...</div></div>`;
  try{
    const cd=await getData(it.yahoo,it.base,d1,d2);
    const cl=clip(cd.data,d1,d2); if(cl.length<needLen){$("#s_results").innerHTML=`<div class="card"><div class="err">데이터가 기준선(${needLen-10}일)보다 짧습니다.</div></div>`;return;}
    const tradeSeries=synth(cl,it.lev,it.er,it.custom?0:fin);
    const signalSeries=cl.map(r=>({date:r.date,close:r.close}));
    const sig = sMethod==="cross" ? backtestSignal(tradeSeries,signalSeries,shortN,longN) : backtestMABand(tradeSeries,signalSeries,maLen,upBuf,downBuf);
    const u0=lump/tradeSeries[0].close;
    const holdCurve=tradeSeries.map(r=>({date:r.date,value:u0*r.close}));
    const sigCurve=sig.curve.map(c=>({date:c.date,value:lump*(c.close/100)}));
    const holdM=metrics(tradeSeries);
    const sigSeries=sig.curve.map(c=>({date:c.date,close:c.close}));
    const sigM=metrics(sigSeries);
    renderSignal(it,d1,d2,methodLabel,lump,holdCurve,sigCurve,holdM,sigM,sig);
  }catch(e){$("#s_results").innerHTML=`<div class="card"><div class="err">오류: ${e.message}</div></div>`;}
  finally{btn.disabled=false;btn.textContent=o;}
};
function renderSignal(it,d1,d2,methodLabel,lump,holdCurve,sigCurve,holdM,sigM,sig){
  const holdFinal=holdCurve[holdCurve.length-1].value, sigFinal=sigCurve[sigCurve.length-1].value;
  const pill=sig.curSignal==="gold"?`<span class="pill gold">● 골든크로스 (보유 신호)</span>`:(sig.curSignal==="dead"?`<span class="pill dead">● 데드크로스 (현금 신호)</span>`:`<span class="pill">신호 없음</span>`);
  $("#s_results").innerHTML=`
    <div class="card" style="margin-bottom:20px">
      <h2>${it.id} · ${methodLabel} · ${d1}~${d2}</h2>
      <div style="margin:-6px 0 18px">${pill} <span class="dimv mono" style="font-size:12px;margin-left:8px">현재 ${sig.curSignal==="gold"?"보유 중":"현금 중"}</span></div>
      <div class="metrics">
        <div class="metric green"><div class="k">신호 매매 최종</div><div class="v pos">${fmtWon(sigFinal)}</div><div class="s">연수익률 ${pct(sigM.cagr)}</div></div>
        <div class="metric"><div class="k">단순 보유 최종</div><div class="v">${fmtWon(holdFinal)}</div><div class="s">연수익률 ${pct(holdM.cagr)}</div></div>
        <div class="metric red"><div class="k">신호 최대낙폭</div><div class="v neg">${(sigM.mdd*100).toFixed(1)}%</div><div class="s">보유 ${(holdM.mdd*100).toFixed(1)}%</div></div>
        <div class="metric cyan"><div class="k">거래 횟수</div><div class="v cy">${sig.trades}</div><div class="s">시장참여 ${(sig.timeIn*100).toFixed(0)}%</div></div>
      </div>
      <div class="ctable-wrap"><table class="ctable"><thead><tr><th>전략</th>
        <th><span class="th-main">최종 평가금액</span></th>
        <th><span class="th-main">연평균 수익률</span><span class="th-sub">CAGR</span></th>
        <th><span class="th-main">최대 낙폭률</span><span class="th-sub">MDD</span></th>
        <th><span class="th-main">위험대비 수익</span><span class="th-sub">MAR</span></th></tr></thead><tbody>
        <tr><td class="name"><span class="namecell"><span class="cdot" style="background:#10b981;color:#10b981"></span>신호 매매</span></td><td class="num ${sigFinal>=holdFinal?"hl-good":"pos"}">${fmtWon(sigFinal)}</td><td class="num">${pct(sigM.cagr)}</td><td class="num ${Math.abs(sigM.mdd)<Math.abs(holdM.mdd)?"hl-good":"neg"}">${(sigM.mdd*100).toFixed(1)}%</td><td class="num cy">${sigM.mar.toFixed(2)}</td></tr>
        <tr><td class="name"><span class="namecell"><span class="cdot" style="background:#9aa7a0;color:#9aa7a0"></span>단순 보유</span></td><td class="num ${holdFinal>sigFinal?"hl-good":""}">${fmtWon(holdFinal)}</td><td class="num">${pct(holdM.cagr)}</td><td class="num">${(holdM.mdd*100).toFixed(1)}%</td><td class="num cy">${holdM.mar.toFixed(2)}</td></tr>
      </tbody></table></div>
      <div class="note" style="margin-top:14px">신호는 기초지수(${it.base}) ${methodLabel}로 ${it.id}를 매매. 현금 구간 수익률 0 가정. 거래비용·세금 미반영.</div>
      <div class="boardadd" id="s_boardadd"></div>
    </div>
    <div class="card chartcard"><div class="charthead"><h3>신호 매매 vs 단순 보유</h3><div class="toggle"><button id="s_lin" class="on">선형</button><button id="s_log">로그</button></div></div>
      <div class="legend"><span><i style="background:#10b981"></i>신호 매매</span><span><i style="background:#9aa7a0"></i>단순 보유</span></div>
      <div class="chartbox"><canvas id="s_eq"></canvas></div>
      <div class="note" style="margin-top:10px">신호 매매가 단순 보유보다 <b>MDD(낙폭)를 줄이는 대신</b> 강세장 수익 일부를 포기하는 트레이드오프를 봅니다.</div></div>`;
  drawSignal(holdCurve,sigCurve,false);
  boardAddButtons("s_boardadd", [
    {label:`${it.id} 신호 ${methodLabel}`, short:"신호매매", cagr:sigM.cagr, mdd:sigM.mdd, mar:sigM.mar, finalVal:sigFinal},
    {label:`${it.id} 단순보유`, short:"단순보유", cagr:holdM.cagr, mdd:holdM.mdd, mar:holdM.mar, finalVal:holdFinal}
  ]);
  $("#s_lin").onclick=()=>{drawSignal(holdCurve,sigCurve,false);$("#s_lin").classList.add("on");$("#s_log").classList.remove("on");};
  $("#s_log").onclick=()=>{drawSignal(holdCurve,sigCurve,true);$("#s_log").classList.add("on");$("#s_lin").classList.remove("on");};
}
function drawSignal(holdCurve,sigCurve,log){
  const idx=downsample(holdCurve.length); const labels=idx.map(i=>holdCurve[i].date);
  setChart("s_eq",{type:"line",data:{labels,datasets:[
    {label:"신호 매매",data:idx.map(i=>sigCurve[i].value),borderColor:"#10b981",backgroundColor:"transparent",borderWidth:2,pointRadius:0,tension:.06},
    {label:"단순 보유",data:idx.map(i=>holdCurve[i].value),borderColor:"#9aa7a0",borderWidth:1.6,borderDash:[5,4],pointRadius:0,tension:.06}
  ]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},
    plugins:{legend:{display:false},tooltip:{...TIP,callbacks:{label:c=>` ${c.dataset.label}: ${fmtWon(c.parsed.y)}`}},peakLabels:{enabled:true,isWon:true}},
    scales:{x:{grid:{color:GRIDC,drawTicks:false},ticks:{color:TICKC,maxTicksLimit:8,font:{family:"JetBrains Mono",size:10}}},
      y:log?{type:"logarithmic",grid:{color:GRIDC},ticks:{color:TICKC,font:{family:"JetBrains Mono",size:10},callback:v=>fmtShort(v)}}:{grid:{color:GRIDC},ticks:{color:TICKC,font:{family:"JetBrains Mono",size:10},callback:v=>fmtShort(v)}}}}});
}

/* ===== UNDERWATER ===== */
const uSlots=SlotManager("u",6,[{instrId:"TQQQ"},{instrId:"QQQ"}]);
$("#u_run").onclick=async ()=>{
  $("#u_err").textContent="";
  const slots=uSlots.get(); if(!slots.length){$("#u_err").textContent="종목을 추가하세요.";return;}
  const d1=$("#u_start").value,d2=$("#u_end").value; if(!d1||!d2||d1>=d2){$("#u_err").textContent="기간 확인.";return;}
  const fin=parseFloat($("#u_fin").value)||0;
  const instrs=[]; for(const s of slots){const it=resolveInstr(s.instrId,s.cSym,s.cLev,s.cER);if(!it){$("#u_err").textContent="커스텀 티커 입력.";return;}instrs.push(it);}
  const btn=$("#u_run");btn.disabled=true;const o=btn.textContent;btn.textContent="⟳ 분석 중...";
  $("#u_results").innerHTML=`<div class="card"><div class="loading"><span class="spin"></span> 회복 기간 계산 중...</div></div>`;
  const results=[],errors=[];
  try{
    const uniq=[...new Map(instrs.map(it=>[`${it.yahoo}|${it.base}`,it])).values()];
    await Promise.all(uniq.map(it=>getData(it.yahoo,it.base,d1,d2).catch(e=>errors.push(`${it.id}: ${e.message}`))));
    instrs.forEach((it,idx)=>{const cd=DATA[`${it.yahoo}|${it.base}|${d1}|${d2}`];if(!cd)return;
      const cl=clip(cd.data,d1,d2);if(cl.length<10){errors.push(`${it.id}: 데이터 부족`);return;}
      const series=synth(cl,it.lev,it.er,it.custom?0:fin);
      results.push({instr:it,color:COLORS[idx%COLORS.length],series,uw:underwaterSeries(series),events:underwaterEvents(series),mtr:metrics(series)});
    });
    if(!results.length){$("#u_results").innerHTML=`<div class="card"><div class="err">분석 불가.<br>${errors.join("<br>")}</div></div>`;return;}
    renderUnderwater(results,errors,d1,d2);
  }catch(e){$("#u_results").innerHTML=`<div class="card"><div class="err">오류: ${e.message}</div></div>`;}
  finally{btn.disabled=false;btn.textContent=o;}
};
function renderUnderwater(results,errors,d1,d2){
  const eb=(errors&&errors.length)?`<div class="fallback" style="margin-bottom:18px"><h3>⚠ 일부 제외</h3><p>${errors.join("<br>")}</p></div>`:"";
  const cards=results.map(r=>{
    const ongoing=r.events.find(e=>e.ongoing);
    const maxRecover=Math.max(...r.events.filter(e=>!e.ongoing).map(e=>e.days),0);
    const top=r.events.slice(0,5);
    const trows=top.map((e,i)=>`<tr><td class="num dimv">#${i+1}</td><td class="num neg">${(e.depth*100).toFixed(1)}%</td><td class="num">${e.start}</td><td class="num">${e.trough}</td><td class="num">${e.recover||'<span class="amb">미회복</span>'}</td><td class="num">${fmtDays(e.days)}${e.ongoing?' <span class="amb">진행</span>':''}</td></tr>`).join("");
    return `<div class="card" style="margin-bottom:20px">
      <h2><span class="namecell" style="display:inline-flex"><span class="cdot" style="background:${r.color};color:${r.color}"></span>${r.instr.id}</span></h2>
      <div class="metrics">
        <div class="metric red"><div class="k">최대 낙폭</div><div class="v neg">${(r.mtr.mdd*100).toFixed(1)}%</div><div class="s">${r.mtr.mddDate}</div></div>
        <div class="metric"><div class="k">최장 회복 기간</div><div class="v amb">${fmtDays(maxRecover)}</div><div class="s">전고점 복귀까지</div></div>
        <div class="metric ${ongoing?"red":"green"}"><div class="k">현재 상태</div><div class="v ${ongoing?"neg":"pos"}">${ongoing?(ongoing.depth*100).toFixed(1)+"%":"전고점"}</div><div class="s">${ongoing?fmtDays(ongoing.days)+" 물림":"신고가 근처"}</div></div>
      </div>
      <div class="ctable-wrap"><table class="ctable"><thead><tr><th>순위</th><th>낙폭</th><th>고점</th><th>저점</th><th>회복</th><th>물린 기간</th></tr></thead><tbody>${trows}</tbody></table></div>
    </div>`;
  }).join("");
  $("#u_results").innerHTML=`
    <div class="card" style="margin-bottom:20px">
      <h2>언더워터 곡선 · ${d1}~${d2}</h2>
      <div class="legend" id="u_leg"></div><div class="chartbox"><canvas id="u_chart"></canvas></div>
      <div class="note" style="margin-top:10px">곡선이 0 아래에 머무는 동안 = 전고점 회복 못 한 "물려있는" 기간. 0으로 올라오면 신고가 갱신.</div>
    </div>${eb}${cards}`;
  const ref=results.reduce((a,b)=>b.uw.length>a.uw.length?b:a,results[0]);
  const idx=downsample(ref.uw.length); const labels=idx.map(i=>ref.uw[i].date);
  const ds=results.map(r=>({label:r.instr.id,data:idx.map(i=>r.uw[Math.min(i,r.uw.length-1)].dd),borderColor:r.color,backgroundColor:"transparent",borderWidth:1.6,pointRadius:0,tension:.05}));
  setChart("u_chart",{type:"line",data:{labels,datasets:ds},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},
    plugins:{legend:{display:false},tooltip:{...TIP,callbacks:{label:c=>` ${c.dataset.label}: ${c.parsed.y.toFixed(1)}%`}},peakLabels:{enabled:true,isWon:false,suffix:"%"}},
    scales:{x:{grid:{color:GRIDC},ticks:{color:TICKC,maxTicksLimit:8,font:{family:"JetBrains Mono",size:10}}},y:{grid:{color:GRIDC},ticks:{color:TICKC,font:{family:"JetBrains Mono",size:10},callback:v=>v+"%"},max:0}}}});
  const el=$("#u_leg");el.innerHTML="";results.forEach(r=>{const sp=document.createElement("span");sp.innerHTML=`<i style="background:${r.color}"></i>${r.instr.id}`;el.appendChild(sp);});
}

/* ===== TRANCHE ===== */
fillSelect("t_instr"); bindCustomToggle("t_instr","t_custom");
$("#t_run").onclick=async ()=>{
  $("#t_err").textContent="";
  const it=resolveInstr($("#t_instr").value,$("#t_cSym").value,parseFloat($("#t_cLev").value),parseFloat($("#t_cER").value));
  if(!it){$("#t_err").textContent="커스텀 티커를 입력하세요.";return;}
  const d1=$("#t_start").value,d2=$("#t_end").value; if(!d1||!d2||d1>=d2){$("#t_err").textContent="기간 확인.";return;}
  const init=(parseFloat($("#t_init").value)||0)*1e4, cash=(parseFloat($("#t_cash").value)||0)*1e4;
  if(init+cash<=0){$("#t_err").textContent="초기 투입금 또는 대기 현금을 입력하세요.";return;}
  const fin=parseFloat($("#t_fin").value)||0;
  const tr=[
    {drop:(parseFloat($("#t_d1").value)||0)/100, deploy:(parseFloat($("#t_p1").value)||0)/100},
    {drop:(parseFloat($("#t_d2").value)||0)/100, deploy:(parseFloat($("#t_p2").value)||0)/100},
    {drop:(parseFloat($("#t_d3").value)||0)/100, deploy:(parseFloat($("#t_p3").value)||0)/100},
  ].filter(t=>t.drop>0&&t.deploy>0);
  const btn=$("#t_run");btn.disabled=true;const o=btn.textContent;btn.textContent="⟳ 실행 중...";
  $("#t_results").innerHTML=`<div class="card"><div class="loading"><span class="spin"></span> 분할매수 계산 중...</div></div>`;
  try{
    const cd=await getData(it.yahoo,it.base,d1,d2);
    const cl=clip(cd.data,d1,d2); if(cl.length<10){$("#t_results").innerHTML=`<div class="card"><div class="err">데이터 부족.</div></div>`;return;}
    const series=synth(cl,it.lev,it.er,it.custom?0:fin);
    const tranche=trancheStrategy(series,init,cash,tr);
    const lumpAll=trancheStrategy(series,init+cash,0,[]);
    renderTranche(it,d1,d2,init,cash,tr,series,tranche,lumpAll);
  }catch(e){$("#t_results").innerHTML=`<div class="card"><div class="err">오류: ${e.message}</div></div>`;}
  finally{btn.disabled=false;btn.textContent=o;}
};
function renderTranche(it,d1,d2,init,cash,tr,series,tranche,lumpAll){
  const tFinal=tranche.finalVal, lFinal=lumpAll.finalVal;
  const trM=metrics(tranche.curve.map(c=>({date:c.date,close:c.value})));
  const luM=metrics(lumpAll.curve.map(c=>({date:c.date,close:c.value})));
  const buyRows=tranche.buys.length?tranche.buys.map((b,i)=>`<tr><td class="num dimv">#${i+1}</td><td class="num">${b.date}</td><td class="num neg">${(b.dd*100).toFixed(0)}%</td><td class="num">${fmtWon(b.amt)}</td></tr>`).join(""):`<tr><td colspan="4" class="dimv" style="text-align:center;padding:18px">발동된 분할매수 없음 (해당 하락이 없었음)</td></tr>`;
  $("#t_results").innerHTML=`
    <div class="card" style="margin-bottom:20px">
      <h2>${it.id} 분할매수 · ${d1}~${d2}</h2>
      <div class="metrics">
        <div class="metric ${tFinal>=lFinal?"green":""}"><div class="k">분할매수 최종</div><div class="v ${tFinal>=lFinal?"pos":""}">${fmtWon(tFinal)}</div><div class="s">투입 ${fmtWon(tranche.invested)}</div></div>
        <div class="metric ${lFinal>tFinal?"green":""}"><div class="k">일괄투자 최종</div><div class="v ${lFinal>tFinal?"pos":""}">${fmtWon(lFinal)}</div><div class="s">처음 전액 투입</div></div>
        <div class="metric cyan"><div class="k">분할 vs 일괄</div><div class="v ${tFinal>=lFinal?"pos":"neg"}">${tFinal>=lFinal?"+":""}${fmtWon(tFinal-lFinal)}</div><div class="s">${((tFinal/lFinal-1)*100).toFixed(1)}% 차이</div></div>
        <div class="metric"><div class="k">남은 현금</div><div class="v">${fmtWon(tranche.cashLeft)}</div><div class="s">미투입 대기금</div></div>
      </div>
      <div class="sectitle" style="margin-top:8px">분할매수 발동 내역</div>
      <div class="ctable-wrap"><table class="ctable"><thead><tr><th>회차</th><th>날짜</th><th>고점대비</th><th>투입금액</th></tr></thead><tbody>${buyRows}</tbody></table></div>
      <div class="note" style="margin-top:14px">규칙: ${tr.map(t=>`-${(t.drop*100).toFixed(0)}%→${(t.deploy*100).toFixed(0)}%`).join(" · ")} · 초기 ${fmtWon(init)} + 대기 ${fmtWon(cash)}. 현금 보유 구간 이자 미반영.</div>
      <div class="boardadd" id="t_boardadd"></div>
    </div>
    <div class="card chartcard"><div class="charthead"><h3>총자산 추이 (현금 포함)</h3><div class="toggle"><button id="t_lin" class="on">선형</button><button id="t_log">로그</button></div></div>
      <div class="legend"><span><i style="background:#10b981"></i>분할매수</span><span><i style="background:#9aa7a0"></i>일괄투자</span></div>
      <div class="chartbox"><canvas id="t_eq"></canvas></div>
      <div class="note" style="margin-top:10px">분할매수는 현금을 들고 있어 <b>하락장에서 평단가를 낮추지만</b>, 상승장에선 대기 현금만큼 기회비용이 생깁니다.</div></div>`;
  drawTranche(tranche,lumpAll,false);
  boardAddButtons("t_boardadd", [
    {label:`${it.id} 분할매수`, short:"분할매수", cagr:trM.cagr, mdd:trM.mdd, mar:trM.mar, finalVal:tFinal},
    {label:`${it.id} 일괄투자`, short:"일괄투자", cagr:luM.cagr, mdd:luM.mdd, mar:luM.mar, finalVal:lFinal}
  ]);
  $("#t_lin").onclick=()=>{drawTranche(tranche,lumpAll,false);$("#t_lin").classList.add("on");$("#t_log").classList.remove("on");};
  $("#t_log").onclick=()=>{drawTranche(tranche,lumpAll,true);$("#t_log").classList.add("on");$("#t_lin").classList.remove("on");};
}
function drawTranche(tranche,lumpAll,log){
  const idx=downsample(tranche.curve.length); const labels=idx.map(i=>tranche.curve[i].date);
  setChart("t_eq",{type:"line",data:{labels,datasets:[
    {label:"분할매수",data:idx.map(i=>tranche.curve[i].value),borderColor:"#10b981",backgroundColor:"transparent",borderWidth:2,pointRadius:0,tension:.06},
    {label:"일괄투자",data:idx.map(i=>lumpAll.curve[i].value),borderColor:"#9aa7a0",borderWidth:1.6,borderDash:[5,4],pointRadius:0,tension:.06}
  ]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},
    plugins:{legend:{display:false},tooltip:{...TIP,callbacks:{label:c=>` ${c.dataset.label}: ${fmtWon(c.parsed.y)}`}},peakLabels:{enabled:true,isWon:true}},
    scales:{x:{grid:{color:GRIDC,drawTicks:false},ticks:{color:TICKC,maxTicksLimit:8,font:{family:"JetBrains Mono",size:10}}},
      y:log?{type:"logarithmic",grid:{color:GRIDC},ticks:{color:TICKC,font:{family:"JetBrains Mono",size:10},callback:v=>fmtShort(v)}}:{grid:{color:GRIDC},ticks:{color:TICKC,font:{family:"JetBrains Mono",size:10},callback:v=>fmtShort(v)}}}}});
}

/* ===== PROJECTION ===== */
fillSelect("p_instr"); bindCustomToggle("p_instr","p_custom");
let pState=null, pYears=20;
$$("#p_years button").forEach(b=>b.onclick=()=>{
  $$("#p_years button").forEach(x=>x.classList.toggle("on",x===b));
  if(b.dataset.y==="custom"){ $("#p_yearsCustom").style.display="block"; pYears=Math.min(50,Math.max(1,parseInt($("#p_yearsInput").value)||25)); }
  else { $("#p_yearsCustom").style.display="none"; pYears=+b.dataset.y; }
  if(pState)renderProjection();
});
$("#p_yearsInput").addEventListener("input",()=>{ pYears=Math.min(50,Math.max(1,parseInt($("#p_yearsInput").value)||1)); if(pState)renderProjection(); });
$("#p_run").onclick=async ()=>{
  $("#p_err").textContent="";
  const it=resolveInstr($("#p_instr").value,$("#p_cSym").value,parseFloat($("#p_cLev").value),parseFloat($("#p_cER").value));
  if(!it){$("#p_err").textContent="종목 티커를 입력하거나 검색하세요.";return;}
  const d1=$("#p_start").value,d2=$("#p_end").value; if(!d1||!d2||d1>=d2){$("#p_err").textContent="과거 기준 기간을 확인하세요.";return;}
  const fin=parseFloat($("#p_fin").value)||0;
  const btn=$("#p_run");btn.disabled=true;const o=btn.textContent;btn.textContent="⟳ 계산 중...";
  $("#p_results").innerHTML=`<div class="card"><div class="loading"><span class="spin"></span> 과거 수익률 계산 중...</div></div>`;
  try{
    const cd=await getData(it.yahoo,it.base,d1,d2);
    const cl=clip(cd.data,d1,d2); if(cl.length<30){$("#p_results").innerHTML=`<div class="card"><div class="err">과거 데이터가 부족합니다(최소 30일).</div></div>`;return;}
    const series=synth(cl,it.lev,it.er,it.custom?0:fin);
    const m=metrics(series);
    pState={instr:it, pastCAGR:+(m.cagr*100).toFixed(1), years:m.years, mdd:m.mdd};
    $("#p_cagr").value=pState.pastCAGR;
    $("#p_cagrSrc").textContent=`과거 ${m.years.toFixed(1)}년 = 연 ${pState.pastCAGR}%`;
    renderProjection();
  }catch(e){$("#p_results").innerHTML=`<div class="card"><div class="err">오류: ${e.message}</div></div>`;}
  finally{btn.disabled=false;btn.textContent=o;}
};
$$("#p_preset button").forEach(b=>b.onclick=()=>{
  if(!pState){$("#p_err").textContent="먼저 [예측 실행]을 눌러 과거 수익률을 계산하세요.";return;}
  const p=b.dataset.p; let v;
  if(p==="past")v=pState.pastCAGR; else if(p==="half")v=+(pState.pastCAGR*0.7).toFixed(1); else if(p==="ten")v=10; else v=7;
  $("#p_cagr").value=v; $$("#p_preset button").forEach(x=>x.classList.toggle("on",x===b)); renderProjection();
});
["p_cagr","p_lump","p_monthly"].forEach(id=>$("#"+id).addEventListener("input",()=>{ if(pState)renderProjection(); }));

function projectSeries(lump, monthly, annualR, years){
  const rm=Math.pow(1+annualR,1/12)-1; const rows=[]; let val=lump, principal=lump;
  for(let y=1;y<=years;y++){ for(let mo=0;mo<12;mo++){ val=val*(1+rm)+monthly; principal+=monthly; } rows.push({year:y, principal, value:val, profit:val-principal, mult:val/Math.max(principal,1)}); }
  return rows;
}
function renderProjection(){
  const lump=(parseFloat($("#p_lump").value)||0)*1e4, monthly=(parseFloat($("#p_monthly").value)||0)*1e4;
  const r=(parseFloat($("#p_cagr").value)||0)/100;
  const rows=projectSeries(lump,monthly,r,pYears);
  const it=pState.instr;
  let ms=[...new Set([5,10,pYears].filter(y=>y>=1&&y<=pYears))].sort((a,b)=>a-b);
  const cards=ms.map((y,i)=>{ const x=rows[y-1]; const last=i===ms.length-1, mid=(i===ms.length-2)&&ms.length>1;
    return `<div class="metric ${last?"green":(mid?"cyan":"")}"><div class="k">${y}년 뒤</div><div class="v ${last?"pos":(mid?"cy":"")}">${fmtWon(x.value)}</div><div class="s">원금 ${fmtWon(x.principal)}</div></div>`;
  }).join("");
  const tbody=rows.map(x=>`<tr><td>${x.year}년</td><td class="num">${fmtWon(x.principal)}</td><td class="num pos">${fmtWon(x.value)}</td><td class="num ${x.profit>=0?"pos":"neg"}">${fmtWon(x.profit)}</td><td class="num cy">${x.mult.toFixed(2)}배</td></tr>`).join("");
  const warn=Math.abs(r)>0.25?`<div class="fallback" style="margin-bottom:18px"><h3>⚠ 매우 높은 수익률 가정</h3><p>연 ${(r*100).toFixed(1)}%가 ${pYears}년 내내 이어진다는 건 현실에서 거의 일어나지 않습니다. 과거 ${it.id}의 최대 낙폭은 ${pState.mdd!=null?(pState.mdd*100).toFixed(0)+"%":"매우 큼"}였어요. 아래 [보수 10%]/[안전 7%]도 꼭 같이 보세요.</p></div>`:"";
  $("#p_results").innerHTML=`
    <div class="card" style="margin-bottom:20px">
      <h2>${it.id} 미래 예측 · 연 ${(r*100).toFixed(1)}% 가정 · ${pYears}년</h2>
      ${warn}
      <div class="metrics">${cards}</div>
      <div class="ctable-wrap"><table class="ctable"><thead><tr><th>경과</th><th><span class="th-main">누적 원금</span></th><th><span class="th-main">예상 평가금액</span></th><th><span class="th-main">평가 손익</span></th><th><span class="th-main">원금의 몇 배</span></th></tr></thead><tbody>${tbody}</tbody></table></div>
      <div class="note" style="margin-top:14px">연 ${(r*100).toFixed(1)}% 복리 ${monthly>0?`+ 매달 ${fmtWon(monthly)} 적립`:"(추가 적립 없음)"}. 이 종목의 과거 수익률은 <b>연 ${pState.pastCAGR}%</b>(${pState.years.toFixed(1)}년)였어요. 실제로는 매년 들쭉날쭉하고 중간에 큰 하락도 겪습니다.</div>
    </div>
    <div class="card chartcard"><div class="charthead"><h3>복리 성장 곡선 (${pYears}년)</h3><div class="toggle"><button id="p_lin" class="on">선형</button><button id="p_log">로그</button></div></div>
      <div class="legend"><span><i style="background:#10b981"></i>예상 평가금액</span><span><i style="background:#9aa7a0"></i>누적 원금</span></div>
      <div class="chartbox"><canvas id="p_eq"></canvas></div>
      <div class="note" style="margin-top:10px">초록과 회색의 간격이 복리로 불어난 수익. 위 [과거 그대로]/[보수 10%] 버튼으로 가정을 바꿔 여러 시나리오를 비교하세요.</div></div>`;
  drawProjection(rows,false);
  $("#p_lin").onclick=()=>{drawProjection(rows,false);$("#p_lin").classList.add("on");$("#p_log").classList.remove("on");};
  $("#p_log").onclick=()=>{drawProjection(rows,true);$("#p_log").classList.add("on");$("#p_lin").classList.remove("on");};
}
function drawProjection(rows,log){
  const labels=rows.map(x=>x.year+"년");
  setChart("p_eq",{type:"line",data:{labels,datasets:[
    {label:"예상 평가금액",data:rows.map(x=>x.value),borderColor:"#10b981",backgroundColor:"transparent",borderWidth:2.4,pointRadius:0,tension:.1},
    {label:"누적 원금",data:rows.map(x=>x.principal),borderColor:"#9aa7a0",borderWidth:1.6,borderDash:[5,4],pointRadius:0,tension:.1}
  ]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},
    plugins:{legend:{display:false},tooltip:{...TIP,callbacks:{label:c=>` ${c.dataset.label}: ${fmtWon(c.parsed.y)}`}},peakLabels:{enabled:false}},
    scales:{x:{grid:{color:GRIDC},ticks:{color:TICKC,font:{family:"JetBrains Mono",size:10}}},
      y:log?{type:"logarithmic",grid:{color:GRIDC},ticks:{color:TICKC,font:{family:"JetBrains Mono",size:10},callback:v=>fmtShort(v)}}:{grid:{color:GRIDC},ticks:{color:TICKC,font:{family:"JetBrains Mono",size:10},callback:v=>fmtShort(v)}}}}});
}

attachSearch($("#s_cSym"), q=>{ $("#s_cSym").value=q.symbol; $("#s_cSym").title=q.name; });
attachSearch($("#t_cSym"), q=>{ $("#t_cSym").value=q.symbol; $("#t_cSym").title=q.name; });
attachSearch($("#p_cSym"), q=>{ $("#p_cSym").value=q.symbol; $("#p_cSym").title=q.name; });

/* ===== SHANNON ===== */
fillSelect("sh_instr"); bindCustomToggle("sh_instr","sh_custom");
let shMode="band";
$$("#sh_mode button").forEach(b=>b.onclick=()=>{
  shMode=b.dataset.m; $$("#sh_mode button").forEach(x=>x.classList.toggle("on",x===b));
  $("#sh_bandField").style.display = shMode==="band" ? "block" : "none";
});
attachSearch($("#sh_cSym"), q=>{ $("#sh_cSym").value=q.symbol; $("#sh_cSym").title=q.name; });
$("#sh_run").onclick=async ()=>{
  $("#sh_err").textContent="";
  const it=resolveInstr($("#sh_instr").value,$("#sh_cSym").value,parseFloat($("#sh_cLev").value),parseFloat($("#sh_cER").value));
  if(!it){$("#sh_err").textContent="종목 티커를 입력하거나 검색하세요.";return;}
  const d1=$("#sh_start").value,d2=$("#sh_end").value; if(!d1||!d2||d1>=d2){$("#sh_err").textContent="기간을 확인하세요.";return;}
  const total=(parseFloat($("#sh_total").value)||0)*1e4; if(total<=0){$("#sh_err").textContent="총 투자금을 입력하세요.";return;}
  const target=(parseFloat($("#sh_target").value)||60)/100;
  if(target<=0||target>=1){$("#sh_err").textContent="종목 비중은 1~99% 사이여야 합니다.";return;}
  const band=(parseFloat($("#sh_band").value)||10)/100;
  const cashR=parseFloat($("#sh_cashR").value)||0, fin=parseFloat($("#sh_fin").value)||0;
  const btn=$("#sh_run");btn.disabled=true;const o=btn.textContent;btn.textContent="⟳ 실행 중...";
  $("#sh_results").innerHTML=`<div class="card"><div class="loading"><span class="spin"></span> 리밸런싱 계산 중...</div></div>`;
  try{
    const cd=await getData(it.yahoo,it.base,d1,d2);
    const cl=clip(cd.data,d1,d2); if(cl.length<20){$("#sh_results").innerHTML=`<div class="card"><div class="err">데이터가 부족합니다.</div></div>`;return;}
    const series=synth(cl,it.lev,it.er,it.custom?0:fin);
    const demon=shannon(series,total,target,shMode,band,cashR);
    const u0=total/series[0].close;
    const holdCurve=series.map(r=>({date:r.date,value:u0*r.close}));
    renderShannon(it,d1,d2,target,band,cashR,demon,holdCurve,series);
  }catch(e){$("#sh_results").innerHTML=`<div class="card"><div class="err">오류: ${e.message}</div></div>`;}
  finally{btn.disabled=false;btn.textContent=o;}
};
function renderShannon(it,d1,d2,target,band,cashR,demon,holdCurve,series){
  const dFinal=demon.finalVal, hFinal=holdCurve[holdCurve.length-1].value;
  const dM=metrics(demon.curve.map(c=>({date:c.date,close:c.value})));
  const hM=metrics(series);
  const modeLabel={monthly:"월별",yearly:"연별",band:`밴드 ±${(band*100).toFixed(0)}%p`}[shMode];
  $("#sh_results").innerHTML=`
    <div class="card" style="margin-bottom:20px">
      <h2>${it.id} 도깨비 · 종목${(target*100).toFixed(0)}:현금${((1-target)*100).toFixed(0)} · ${modeLabel}</h2>
      <div style="font-size:12.5px;color:var(--ink-dim);margin:-8px 0 16px;font-family:'JetBrains Mono',monospace">${d1}~${d2} · 총 투자금 ${fmtWon(holdCurve[0].value)}${cashR>0?` · 현금이자 연 ${cashR}%`:""}</div>
      <div class="metrics">
        <div class="metric ${dFinal>=hFinal?"green":""}"><div class="k">도깨비 최종</div><div class="v ${dFinal>=hFinal?"pos":""}">${fmtWon(dFinal)}</div><div class="s">연 ${pct(dM.cagr)} · MDD ${(dM.mdd*100).toFixed(0)}%</div></div>
        <div class="metric ${hFinal>dFinal?"green":""}"><div class="k">100% 보유 최종</div><div class="v ${hFinal>dFinal?"pos":""}">${fmtWon(hFinal)}</div><div class="s">연 ${pct(hM.cagr)} · MDD ${(hM.mdd*100).toFixed(0)}%</div></div>
        <div class="metric cyan"><div class="k">도깨비 vs 보유</div><div class="v ${dFinal>=hFinal?"pos":"neg"}">${dFinal>=hFinal?"+":""}${fmtWon(dFinal-hFinal)}</div><div class="s">${((dFinal/hFinal-1)*100).toFixed(1)}% 차이</div></div>
        <div class="metric"><div class="k">리밸런싱 횟수</div><div class="v">${demon.rebals}</div><div class="s">${modeLabel}</div></div>
      </div>
      <div class="ctable-wrap"><table class="ctable"><thead><tr><th>전략</th>
        <th><span class="th-main">최종 평가금액</span></th>
        <th><span class="th-main">연평균 수익률</span><span class="th-sub">CAGR</span></th>
        <th><span class="th-main">최대 낙폭률</span><span class="th-sub">MDD</span></th>
        <th><span class="th-main">위험대비 수익</span><span class="th-sub">MAR</span></th></tr></thead><tbody>
        <tr><td class="name"><span class="namecell"><span class="cdot" style="background:#10b981;color:#10b981"></span>도깨비</span></td><td class="num ${dFinal>=hFinal?"hl-good":""}">${fmtWon(dFinal)}</td><td class="num">${pct(dM.cagr)}</td><td class="num ${Math.abs(dM.mdd)<Math.abs(hM.mdd)?"hl-good":"neg"}">${(dM.mdd*100).toFixed(1)}%</td><td class="num cy">${(dM.mdd!==0?dM.cagr/Math.abs(dM.mdd):0).toFixed(2)}</td></tr>
        <tr><td class="name"><span class="namecell"><span class="cdot" style="background:#9aa7a0;color:#9aa7a0"></span>100% 보유</span></td><td class="num ${hFinal>dFinal?"hl-good":""}">${fmtWon(hFinal)}</td><td class="num">${pct(hM.cagr)}</td><td class="num">${(hM.mdd*100).toFixed(1)}%</td><td class="num cy">${(hM.mdd!==0?hM.cagr/Math.abs(hM.mdd):0).toFixed(2)}</td></tr>
      </tbody></table></div>
      <div class="note" style="margin-top:14px"><b>읽는 법</b> · 도깨비는 보통 <b>최대 낙폭(MDD)을 크게 줄여줍니다</b>(현금 비중 덕분). 옆으로 출렁이는 장에선 수익까지 늘지만, 한 방향 강세장에선 현금이 발목을 잡아 100% 보유보다 적게 법니다.</div>
      <div class="boardadd" id="sh_boardadd"></div>
    </div>
    <div class="card chartcard"><div class="charthead"><h3>도깨비 vs 100% 보유</h3><div class="toggle"><button id="sh_lin" class="on">선형</button><button id="sh_log">로그</button></div></div>
      <div class="legend"><span><i style="background:#10b981"></i>도깨비 (종목${(target*100).toFixed(0)}:현금${((1-target)*100).toFixed(0)})</span><span><i style="background:#9aa7a0"></i>100% 보유</span></div>
      <div class="chartbox"><canvas id="sh_eq"></canvas></div>
      <div class="note" style="margin-top:10px">두 선의 모양을 비교하세요. 도깨비 선이 더 완만하게(덜 출렁이며) 가면 그게 낙폭을 줄여준 거예요.</div></div>`;
  drawShannon(demon.curve,holdCurve,false);
  boardAddButtons("sh_boardadd", [
    {label:`${it.id} 도깨비 ${(target*100).toFixed(0)}:${((1-target)*100).toFixed(0)} ${modeLabel}`, short:"도깨비", cagr:dM.cagr, mdd:dM.mdd, mar:(dM.mdd?dM.cagr/Math.abs(dM.mdd):0), finalVal:dFinal},
    {label:`${it.id} 100% 보유`, short:"100% 보유", cagr:hM.cagr, mdd:hM.mdd, mar:(hM.mdd?hM.cagr/Math.abs(hM.mdd):0), finalVal:hFinal}
  ]);
  $("#sh_lin").onclick=()=>{drawShannon(demon.curve,holdCurve,false);$("#sh_lin").classList.add("on");$("#sh_log").classList.remove("on");};
  $("#sh_log").onclick=()=>{drawShannon(demon.curve,holdCurve,true);$("#sh_log").classList.add("on");$("#sh_lin").classList.remove("on");};
}
function drawShannon(demonCurve,holdCurve,log){
  const idx=downsample(demonCurve.length); const labels=idx.map(i=>demonCurve[i].date);
  setChart("sh_eq",{type:"line",data:{labels,datasets:[
    {label:"도깨비",data:idx.map(i=>demonCurve[i].value),borderColor:"#10b981",backgroundColor:"transparent",borderWidth:2,pointRadius:0,tension:.06},
    {label:"100% 보유",data:idx.map(i=>holdCurve[i].value),borderColor:"#9aa7a0",borderWidth:1.6,borderDash:[5,4],pointRadius:0,tension:.06}
  ]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},
    plugins:{legend:{display:false},tooltip:{...TIP,callbacks:{label:c=>` ${c.dataset.label}: ${fmtWon(c.parsed.y)}`}},peakLabels:{enabled:true,isWon:true}},
    scales:{x:{grid:{color:GRIDC,drawTicks:false},ticks:{color:TICKC,maxTicksLimit:8,font:{family:"JetBrains Mono",size:10}}},
      y:log?{type:"logarithmic",grid:{color:GRIDC},ticks:{color:TICKC,font:{family:"JetBrains Mono",size:10},callback:v=>fmtShort(v)}}:{grid:{color:GRIDC},ticks:{color:TICKC,font:{family:"JetBrains Mono",size:10},callback:v=>fmtShort(v)}}}}});
}

renderBoard();

/* ===== ALLSTRAT ===== */
fillSelect("a_instr"); bindCustomToggle("a_instr","a_custom");
attachSearch($("#a_cSym"), q=>{ $("#a_cSym").value=q.symbol; $("#a_cSym").title=q.name; });

$("#a_run").onclick=async ()=>{
  $("#a_err").textContent="";
  const it=resolveInstr($("#a_instr").value,$("#a_cSym").value,parseFloat($("#a_cLev").value),parseFloat($("#a_cER").value));
  if(!it){$("#a_err").textContent="종목 티커를 입력하거나 검색하세요.";return;}
  const d1=$("#a_start").value,d2=$("#a_end").value; if(!d1||!d2||d1>=d2){$("#a_err").textContent="기간을 확인하세요.";return;}
  const lump=(parseFloat($("#a_lump").value)||0)*1e4, monthly=(parseFloat($("#a_monthly").value)||0)*1e4;
  if(lump<=0&&monthly<=0){$("#a_err").textContent="투자금을 입력하세요.";return;}
  const fin=parseFloat($("#a_fin").value)||0;
  const sN=parseInt($("#a_short").value)||3, lN=parseInt($("#a_long").value)||160;
  const t1=(parseFloat($("#a_t1").value)||20)/100, t2=(parseFloat($("#a_t2").value)||25)/100, t3=(parseFloat($("#a_t3").value)||30)/100;
  const demonW=(parseFloat($("#a_demonW").value)||60)/100, demonB=(parseFloat($("#a_demonB").value)||10)/100;
  const btn=$("#a_run");btn.disabled=true;const o=btn.textContent;btn.textContent="⟳ 계산 중...";
  $("#a_results").innerHTML=`<div class="card"><div class="loading"><span class="spin"></span> 모든 전략 계산 중...</div></div>`;
  try{
    const cd=await getData(it.yahoo,it.base,d1,d2);
    const cl=clip(cd.data,d1,d2); if(cl.length<Math.max(60,lN+10)){$("#a_results").innerHTML=`<div class="card"><div class="err">데이터가 부족합니다(장기이평 ${lN}일 이상 필요).</div></div>`;return;}
    const series=synth(cl,it.lev,it.er,it.custom?0:fin);
    const lumpInfo = monthly>0?`(거치 ${fmtWon(lump)} + 월 ${fmtWon(monthly)})`:"(거치식)";
    const out=[];
    const pf=portfolio(series,lump,monthly);
    const holdM=metrics(series);
    out.push({name:"단순 보유", note:"거치+적립", cagr:holdM.cagr, mdd:holdM.mdd, mar:holdM.mar, finalVal:pf.finalVal, sub:monthly>0?"적립 포함":"거치식"});
    const sig=backtestSignal(series, cl.map(r=>({date:r.date,close:r.close})), sN, lN);
    const sigSeries=sig.curve.map(c=>({date:c.date,close:c.close}));
    const sigPf=portfolio(sigSeries, lump, monthly);
    const sigM=metrics(sigSeries);
    out.push({name:`신호 매매 ${sN}/${lN}`, note:"거치+적립", cagr:sigM.cagr, mdd:sigM.mdd, mar:sigM.mar, finalVal:sigPf.finalVal, sub:monthly>0?"적립 포함":"거치식"});
    const init=lump*0.5, cashBuf=lump*0.5;
    const tr=[{drop:t1,deploy:0.34},{drop:t2,deploy:0.33},{drop:t3,deploy:0.33}].filter(t=>t.drop>0);
    const tranche=trancheStrategy(series, init, cashBuf, tr);
    const trM=metrics(tranche.curve.map(c=>({date:c.date,close:c.value})));
    out.push({name:`분할매수 -${(t1*100).toFixed(0)}/${(t2*100).toFixed(0)}/${(t3*100).toFixed(0)}%`, note:"거치식", cagr:trM.cagr, mdd:trM.mdd, mar:trM.mar, finalVal:tranche.finalVal, sub:"거치식만"});
    const demon=shannon(series, lump, demonW, "band", demonB, 0);
    const dM=metrics(demon.curve.map(c=>({date:c.date,close:c.value})));
    out.push({name:`도깨비 ${(demonW*100).toFixed(0)}:${((1-demonW)*100).toFixed(0)} ±${(demonB*100).toFixed(0)}`, note:"거치식", cagr:dM.cagr, mdd:dM.mdd, mar:dM.mar, finalVal:demon.finalVal, sub:"거치식만"});
    renderAllStrat(it, d1, d2, lumpInfo, lump, monthly, out);
  }catch(e){$("#a_results").innerHTML=`<div class="card"><div class="err">오류: ${e.message}</div></div>`;}
  finally{btn.disabled=false;btn.textContent=o;}
};
let aLast=null;
function renderAllStrat(it, d1, d2, lumpInfo, lump, monthly, out){
  aLast={it, out};
  const best={cagr:Math.max(...out.map(x=>x.cagr)), mar:Math.max(...out.map(x=>x.mar)), final:Math.max(...out.map(x=>x.finalVal))};
  const worstMdd=Math.min(...out.map(x=>x.mdd));
  const COL=["#10b981","#06b6d4","#f59e0b","#8b5cf6"];
  const rows=out.map((x,i)=>`<tr>
    <td class="name"><span class="namecell"><span class="cdot" style="background:${COL[i]};color:${COL[i]}"></span>${x.name}</span></td>
    <td class="num ${x.cagr===best.cagr?'hl-good':(x.cagr>=0?'pos':'neg')}">${pct(x.cagr)}</td>
    <td class="num ${x.mdd===worstMdd?'hl-bad':'neg'}">${(x.mdd*100).toFixed(1)}%</td>
    <td class="num ${x.mar===best.mar?'hl-good':'cy'}">${x.mar.toFixed(2)}</td>
    <td class="num ${x.finalVal===best.final?'hl-good':''}">${fmtWon(x.finalVal)}</td>
    <td class="num dimv" style="font-size:11px">${x.sub}</td></tr>`).join("");
  $("#a_results").innerHTML=`
    <div class="card" style="margin-bottom:20px">
      <h2>${it.id} 전략 일괄 비교 · ${d1}~${d2}</h2>
      <div style="font-size:12.5px;color:var(--ink-dim);margin:-8px 0 16px;font-family:'JetBrains Mono',monospace">투자금 ${fmtWon(lump)} ${lumpInfo}</div>
      <div class="ctable-wrap"><table class="ctable"><thead><tr><th>전략</th>
        <th><span class="th-main">연평균 수익률</span><span class="th-sub">CAGR</span></th>
        <th><span class="th-main">최대 낙폭률</span><span class="th-sub">MDD</span></th>
        <th><span class="th-main">위험대비 수익</span><span class="th-sub">MAR</span></th>
        <th><span class="th-main">최종 평가금액</span></th>
        <th><span class="th-main">방식</span></th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="note" style="margin-top:14px"><b class="hl-good">초록</b>=항목별 최고 · <b class="hl-bad">빨강</b>=가장 큰 낙폭 · <b>분할매수·도깨비는 거치식만</b>(적립 미적용)이라 적립을 크게 넣으면 단순보유·신호매매와 직접 비교가 안 맞을 수 있어요. 그땐 월 적립금을 0으로 두고 보세요.</div>
      <div class="boardadd" id="a_boardadd"></div>
    </div>
    <div class="card chartcard"><div class="charthead"><h3>최종 평가금액 비교</h3></div>
      <div class="chartbox short"><canvas id="a_bar"></canvas></div>
      <div class="note" style="margin-top:10px">막대가 높을수록 최종 금액이 큼. 하지만 <b>가장 높은 게 늘 최선은 아니에요</b> — 낙폭(MDD)을 견딜 수 있어야 그 수익을 실제로 가져갑니다.</div></div>`;
  const COL2=["#10b981","#06b6d4","#f59e0b","#8b5cf6"];
  setChart("a_bar",{type:"bar",data:{labels:out.map(x=>x.name),datasets:[{data:out.map(x=>x.finalVal),backgroundColor:COL2,borderRadius:5}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{...TIP,callbacks:{label:c=>" "+fmtWon(c.parsed.y)}}},
      scales:{x:{grid:{display:false},ticks:{color:TICKC,font:{family:"JetBrains Mono",size:10}}},y:{grid:{color:GRIDC},ticks:{color:TICKC,font:{family:"JetBrains Mono",size:10},callback:v=>fmtShort(v)}}}}});
  boardAddButtons("a_boardadd", out.map(x=>({label:`${it.id} ${x.name}`, short:x.name.split(" ")[0]==="신호"?"신호매매":x.name.split(" ")[0], cagr:x.cagr, mdd:x.mdd, mar:x.mar, finalVal:x.finalVal})));
}

/* ===== RSI ===== */
fillSelect("rs_instr"); bindCustomToggle("rs_instr","rs_custom");
attachSearch($("#rs_cSym"), q=>{ $("#rs_cSym").value=q.symbol; $("#rs_cSym").title=q.name; });

$("#rs_run").onclick=async ()=>{
  $("#rs_err").textContent="";
  const it=resolveInstr($("#rs_instr").value,$("#rs_cSym").value,parseFloat($("#rs_cLev").value),parseFloat($("#rs_cER").value));
  if(!it){$("#rs_err").textContent="종목 티커를 입력하거나 검색하세요.";return;}
  const d1=$("#rs_start").value,d2=$("#rs_end").value; if(!d1||!d2||d1>=d2){$("#rs_err").textContent="기간을 확인하세요.";return;}
  const total=(parseFloat($("#rs_total").value)||0)*1e4; if(total<=0){$("#rs_err").textContent="투자금을 입력하세요.";return;}
  const period=parseInt($("#rs_period").value)||14, buyTh=parseFloat($("#rs_buy").value)||30, sellTh=parseFloat($("#rs_sell").value)||70;
  const tr=Math.max(1,parseInt($("#rs_tr").value)||2), fin=parseFloat($("#rs_fin").value)||0;
  if(buyTh>=sellTh){$("#rs_err").textContent="매수 임계 < 매도 임계여야 합니다.";return;}
  const btn=$("#rs_run");btn.disabled=true;const o=btn.textContent;btn.textContent="⟳ 실행 중...";
  $("#rs_results").innerHTML=`<div class="card"><div class="loading"><span class="spin"></span> RSI 계산 중...</div></div>`;
  try{
    const cd=await getData(it.yahoo,it.base,d1,d2);
    const cl=clip(cd.data,d1,d2); if(cl.length<period+20){$("#rs_results").innerHTML=`<div class="card"><div class="err">데이터가 부족합니다(RSI 기간 ${period}일 이상 필요).</div></div>`;return;}
    const series=synth(cl,it.lev,it.er,it.custom?0:fin);
    const rsiBt=backtestRSI(series, total, period, buyTh, sellTh, tr);
    const u0=total/series[0].close;
    const holdCurve=series.map(r=>({date:r.date,value:u0*r.close}));
    renderRSI(it,d1,d2,period,buyTh,sellTh,tr,total,rsiBt,holdCurve,series);
  }catch(e){$("#rs_results").innerHTML=`<div class="card"><div class="err">오류: ${e.message}</div></div>`;}
  finally{btn.disabled=false;btn.textContent=o;}
};
function renderRSI(it,d1,d2,period,buyTh,sellTh,tr,total,rsiBt,holdCurve,series){
  const rFinal=rsiBt.finalVal, hFinal=holdCurve[holdCurve.length-1].value;
  const rM=metrics(rsiBt.curve.map(c=>({date:c.date,close:c.value})));
  const hM=metrics(series);
  const buys=rsiBt.trades.filter(t=>t.type==="매수").length, sells=rsiBt.trades.filter(t=>t.type==="매도").length;
  const trRows=rsiBt.trades.length?rsiBt.trades.slice(0,40).map((t,i)=>`<tr><td class="num dimv">#${i+1}</td><td class="num">${t.date}</td><td class="num ${t.type==="매수"?"cy":"amb"}">${t.type}</td><td class="num">${t.rsi.toFixed(0)}</td><td class="num">${fmtWon(t.amt)}</td></tr>`).join(""):`<tr><td colspan="5" class="dimv" style="text-align:center;padding:18px">신호 발생 없음</td></tr>`;
  $("#rs_results").innerHTML=`
    <div class="card" style="margin-bottom:20px">
      <h2>${it.id} RSI 과매도 분할매수 · ${d1}~${d2}</h2>
      <div style="font-size:12.5px;color:var(--ink-dim);margin:-8px 0 16px;font-family:'JetBrains Mono',monospace">RSI ${period} · 매수<${buyTh} / 매도>${sellTh} · ${tr}분할 · 총 ${fmtWon(total)}</div>
      <div class="metrics">
        <div class="metric ${rFinal>=hFinal?"green":""}"><div class="k">RSI 매수 최종</div><div class="v ${rFinal>=hFinal?"pos":""}">${fmtWon(rFinal)}</div><div class="s">연 ${pct(rM.cagr)} · MDD ${(rM.mdd*100).toFixed(0)}%</div></div>
        <div class="metric ${hFinal>rFinal?"green":""}"><div class="k">100% 보유 최종</div><div class="v ${hFinal>rFinal?"pos":""}">${fmtWon(hFinal)}</div><div class="s">연 ${pct(hM.cagr)} · MDD ${(hM.mdd*100).toFixed(0)}%</div></div>
        <div class="metric cyan"><div class="k">RSI vs 보유</div><div class="v ${rFinal>=hFinal?"pos":"neg"}">${rFinal>=hFinal?"+":""}${fmtWon(rFinal-hFinal)}</div><div class="s">${((rFinal/hFinal-1)*100).toFixed(1)}% 차이</div></div>
        <div class="metric"><div class="k">거래 횟수</div><div class="v">${rsiBt.trades.length}</div><div class="s">매수 ${buys} · 매도 ${sells}</div></div>
      </div>
      <div class="ctable-wrap"><table class="ctable"><thead><tr><th>전략</th>
        <th><span class="th-main">연평균 수익률</span><span class="th-sub">CAGR</span></th>
        <th><span class="th-main">최대 낙폭률</span><span class="th-sub">MDD</span></th>
        <th><span class="th-main">위험대비 수익</span><span class="th-sub">MAR</span></th></tr></thead><tbody>
        <tr><td class="name"><span class="namecell"><span class="cdot" style="background:#06b6d4;color:#06b6d4"></span>RSI 매수</span></td><td class="num ${rM.cagr>=hM.cagr?"hl-good":""}">${pct(rM.cagr)}</td><td class="num ${Math.abs(rM.mdd)<Math.abs(hM.mdd)?"hl-good":"neg"}">${(rM.mdd*100).toFixed(1)}%</td><td class="num cy">${rM.mar.toFixed(2)}</td></tr>
        <tr><td class="name"><span class="namecell"><span class="cdot" style="background:#9aa7a0;color:#9aa7a0"></span>100% 보유</span></td><td class="num ${hM.cagr>rM.cagr?"hl-good":""}">${pct(hM.cagr)}</td><td class="num">${(hM.mdd*100).toFixed(1)}%</td><td class="num cy">${hM.mar.toFixed(2)}</td></tr>
      </tbody></table></div>
      <div class="note" style="margin-top:14px"><b>읽는 법</b> · RSI 매수는 현금을 들고 신호를 기다리므로 <b>강세장에선 보유보다 많이 뒤처지지만</b>, 급락 후 반등을 잘 잡으면 낙폭을 크게 줄입니다.</div>
      <div class="boardadd" id="rs_boardadd"></div>
    </div>
    <div class="card chartcard"><div class="charthead"><h3>RSI 매수 vs 100% 보유</h3><div class="toggle"><button id="rs_lin" class="on">선형</button><button id="rs_log">로그</button></div></div>
      <div class="legend"><span><i style="background:#06b6d4"></i>RSI 매수</span><span><i style="background:#9aa7a0"></i>100% 보유</span></div>
      <div class="chartbox"><canvas id="rs_eq"></canvas></div></div>
    <div class="card"><div class="sectitle">거래 내역 ${rsiBt.trades.length>40?"(처음 40건)":""}</div>
      <div class="ctable-wrap"><table class="ctable"><thead><tr><th>회차</th><th>날짜</th><th>구분</th><th>RSI</th><th>금액</th></tr></thead><tbody>${trRows}</tbody></table></div></div>`;
  drawRSI(rsiBt.curve,holdCurve,false);
  $("#rs_lin").onclick=()=>{drawRSI(rsiBt.curve,holdCurve,false);$("#rs_lin").classList.add("on");$("#rs_log").classList.remove("on");};
  $("#rs_log").onclick=()=>{drawRSI(rsiBt.curve,holdCurve,true);$("#rs_log").classList.add("on");$("#rs_lin").classList.remove("on");};
  boardAddButtons("rs_boardadd", [
    {label:`${it.id} RSI${period} ${buyTh}/${sellTh} ${tr}분할`, short:"RSI매수", cagr:rM.cagr, mdd:rM.mdd, mar:rM.mar, finalVal:rFinal},
    {label:`${it.id} 100% 보유`, short:"100% 보유", cagr:hM.cagr, mdd:hM.mdd, mar:hM.mar, finalVal:hFinal}
  ]);
}
function drawRSI(rCurve,holdCurve,log){
  const idx=downsample(rCurve.length); const labels=idx.map(i=>rCurve[i].date);
  setChart("rs_eq",{type:"line",data:{labels,datasets:[
    {label:"RSI 매수",data:idx.map(i=>rCurve[i].value),borderColor:"#06b6d4",backgroundColor:"transparent",borderWidth:2,pointRadius:0,tension:.06},
    {label:"100% 보유",data:idx.map(i=>holdCurve[i].value),borderColor:"#9aa7a0",borderWidth:1.6,borderDash:[5,4],pointRadius:0,tension:.06}
  ]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},
    plugins:{legend:{display:false},tooltip:{...TIP,callbacks:{label:c=>` ${c.dataset.label}: ${fmtWon(c.parsed.y)}`}},peakLabels:{enabled:true,isWon:true}},
    scales:{x:{grid:{color:GRIDC,drawTicks:false},ticks:{color:TICKC,maxTicksLimit:8,font:{family:"JetBrains Mono",size:10}}},
      y:log?{type:"logarithmic",grid:{color:GRIDC},ticks:{color:TICKC,font:{family:"JetBrains Mono",size:10},callback:v=>fmtShort(v)}}:{grid:{color:GRIDC},ticks:{color:TICKC,font:{family:"JetBrains Mono",size:10},callback:v=>fmtShort(v)}}}}});
}

/* ===== DOUBLE-BB ===== */
(function(){
  function bandBand(series,period,mult,up){
    const n=series.length, out=new Array(n).fill(null);
    for(let i=period-1;i<n;i++){
      let s=0; for(let k=i-period+1;k<=i;k++)s+=series[k];
      const m=s/period; let v=0;
      for(let k=i-period+1;k<=i;k++){const d=series[k]-m; v+=d*d;}
      out[i]=m+(up?1:-1)*mult*Math.sqrt(v/period);
    }
    return out;
  }
  function doubleUpper(bars){
    const u1=bandBand(bars.map(b=>b.o),4,4,true);
    const u2=bandBand(bars.map(b=>b.c),20,2,true);
    return bars.map((_,i)=>(u1[i]==null||u2[i]==null)?null:Math.max(u1[i],u2[i]));
  }
  function doubleLower(bars){
    const l1=bandBand(bars.map(b=>b.o),4,4,false);
    const l2=bandBand(bars.map(b=>b.c),20,2,false);
    return bars.map((_,i)=>(l1[i]==null||l2[i]==null)?null:Math.min(l1[i],l2[i]));
  }
  function backtest(bars,upper,lower,direction,entryMode,N,numTR,slK,tpK,tpMode,expiryM,useConfirm=false,confW=5,trendMa=null){
    const n=bars.length, isShort=direction==="short";
    let equity=1, peak=1, maxDD=0;
    let trades=0, wins=0, losses=0, sumWin=0, sumLoss=0, tpC=0, slC=0, eodC=0, confSkip=0;
    let i=1;
    while(i<n){
      const band=isShort?lower:upper;
      const u=band[i], up1=band[i-1];
      if(u==null||up1==null){ i++; continue; }
      if(isShort){ if(!(bars[i].c<u && bars[i-1].c>=up1)){ i++; continue; } }
      else        { if(!(bars[i].c>u && bars[i-1].c<=up1)){ i++; continue; } }
      if(trendMa){
        const ma=trendMa[i];
        if(ma==null){ i++; continue; }
        if(isShort ? !(bars[i].c<ma) : !(bars[i].c>ma)){ i++; continue; }
      }
      const H=bars[i].h, L=bars[i].l, TR=H-L;
      if(TR<=0){ i++; continue; }
      let entryStart=i+1, expiryBase=i;
      if(useConfirm){
        let conf=-1;
        for(let j=i+1;j<n && j<=i+confW;j++){
          if(isShort?bars[j].c<bars[i].c:bars[j].c>bars[i].c){ conf=j; break; }
        }
        if(conf<0){ confSkip++; i++; continue; }
        entryStart=conf+1;
        expiryBase=conf;
      }
      const orders=[];
      if(isShort){
        if(entryMode==="tr"){ for(let k=0;k<numTR;k++) orders.push({p:L+k*TR,filled:false}); }
        else { for(let k=0;k<N;k++) orders.push({p:N===1?L:L+(H-L)*k/(N-1),filled:false}); }
      } else {
        if(entryMode==="tr"){ for(let k=0;k<numTR;k++) orders.push({p:H-k*TR,filled:false}); }
        else { for(let k=0;k<N;k++) orders.push({p:N===1?H:H-(H-L)*k/(N-1),filled:false}); }
      }
      const ordCount=orders.length;
      const SL=isShort
        ? Math.max(...orders.map(o=>o.p)) + slK*TR
        : Math.min(...orders.map(o=>o.p)) - slK*TR;
      let filled=0,sumFill=0,exited=false,exitPx=0,reason="",exitIdx=-1;
      for(let j=entryStart;j<n;j++){
        const b=bars[j];
        if(isShort){ for(const o of orders){ if(!o.filled && b.h>=o.p){ o.filled=true; filled++; sumFill+=o.p; } } }
        else        { for(const o of orders){ if(!o.filled && b.l<=o.p){ o.filled=true; filled++; sumFill+=o.p; } } }
        if(filled===0){ if(j-expiryBase>=expiryM)break; else continue; }
        const avg=sumFill/filled;
        if(isShort){
          const TP=tpMode==="avg"?avg-tpK*TR:L-tpK*TR;
          if(b.h>=SL){ exited=true; exitPx=SL; reason="SL"; exitIdx=j; break; }
          if(b.l<=TP){ exited=true; exitPx=TP; reason="TP"; exitIdx=j; break; }
        } else {
          const TP=tpMode==="avg"?avg+tpK*TR:H+tpK*TR;
          if(b.l<=SL){ exited=true; exitPx=SL; reason="SL"; exitIdx=j; break; }
          if(b.h>=TP){ exited=true; exitPx=TP; reason="TP"; exitIdx=j; break; }
        }
      }
      if(filled===0){ i++; continue; }
      if(!exited){ exitPx=bars[n-1].c; reason="EOD"; exitIdx=n-1; }
      const avg=sumFill/filled, frac=filled/ordCount;
      const ret=isShort ? frac*(avg-exitPx)/avg : frac*(exitPx-avg)/avg;
      equity*=(1+ret); if(equity>peak)peak=equity;
      const dd=equity/peak-1; if(dd<maxDD)maxDD=dd;
      trades++;
      if(ret>0){wins++;sumWin+=ret;}else{losses++;sumLoss+=Math.abs(ret);}
      if(reason==="TP")tpC++; else if(reason==="SL")slC++; else eodC++;
      i=exitIdx+1;
    }
    const winrate=trades?wins/trades:0;
    const avgWin=wins?sumWin/wins:0, avgLoss=losses?sumLoss/losses:0;
    const payoff=avgLoss>0?avgWin/avgLoss:(avgWin>0?Infinity:0);
    const totalRet=equity-1;
    const mar=maxDD<0?totalRet/Math.abs(maxDD):(totalRet>0?Infinity:0);
    const key=entryMode==="tr"?numTR:N;
    return {entryMode,direction,key,slK,tpK,tpMode,trades,winrate,payoff,totalRet,mdd:maxDD,mar,tpC,slC,eodC,confSkip,useConfirm,strategy:useConfirm?"더블비컨펌":"더블비"};
  }
  function parseMT5(text){
    const lines=text.split(/\r?\n/), out=[];
    const start=/date|open|time/i.test(lines[0]||"")?1:0;
    for(let i=start;i<lines.length;i++){
      const ln=lines[i].trim(); if(!ln)continue;
      const p=ln.split(/[\t,;]+/); if(p.length<5)continue;
      const d=p[0].replace(/\./g,"-").replace(/\//g,"-").slice(0,10);
      const hasTime=/:/.test(p[1]||""); const oi=hasTime?2:1;
      const o=+p[oi],h=+p[oi+1],l=+p[oi+2],c=+p[oi+3];
      if(!isFinite(o)||!isFinite(h)||!isFinite(l)||!isFinite(c)||c<=0)continue;
      out.push({day:d,date:d+" "+(hasTime?p[1]:"00:00:00"),o,h,l,c});
    }
    if(out.length<2)throw new Error("CSV에서 유효한 OHLC 행을 못 찾음");
    return out;
  }
  function groupByDay(bars){ const m={},order=[]; for(const b of bars){ if(!m[b.day]){m[b.day]=[];order.push(b.day);} m[b.day].push(b);} return {m,order}; }
  function agg(g){ let h=-Infinity,l=Infinity; for(const x of g){ if(x.h>h)h=x.h; if(x.l<l)l=x.l; } return {day:g[0].day,date:g[0].date,o:g[0].o,h,l,c:g[g.length-1].c}; }
  function intradayOnly(bars){ const {m}=groupByDay(bars); return bars.filter(b=>m[b.day].length>1); }
  function resampleN(bars,nn){ const {m,order}=groupByDay(bars); const out=[]; for(const d of order){const a=m[d]; for(let k=0;k<a.length;k+=nn)out.push(agg(a.slice(k,k+nn)));} return out; }
  function resampleDaily(bars){ const {m,order}=groupByDay(bars); return order.map(d=>agg(m[d])); }
  function buildTF_MT5(raw,tf){
    if(tf==="5m")return intradayOnly(raw);
    if(tf==="10m")return resampleN(intradayOnly(raw),2);
    if(tf==="1h")return resampleN(intradayOnly(raw),12);
    return resampleDaily(raw);
  }
  async function fetchYahoo(sym,interval,from,to){
    const u=`${PROXY}/?yahoo=${encodeURIComponent(sym)}&from=${from}&to=${to}&interval=${interval}`;
    const r=await fetch(u); const j=await r.json();
    if(!r.ok||!j.data)throw new Error(j.error||("프록시 오류 "+r.status));
    return j.data.map(x=>({day:String(x.date).slice(0,10),date:String(x.date),o:+x.o,h:+x.h,l:+x.l,c:+x.c}));
  }
  function daysAgo(n){ const d=new Date(); d.setDate(d.getDate()-n); return d.toISOString().slice(0,10); }

  let RAWCACHE={}, RAWLABEL="", RESULTS=[], SORT={key:"mar",dir:-1}, EMODE="n", DIRECTION="long", MA_FILTER=0;
  const el=id=>document.getElementById(id);

  function setSrc(s){
    $$("#db_src button").forEach(b=>b.classList.toggle("on",b.dataset.s===s));
    el("db_src").dataset.cur=s;
    el("db_uploadRow").style.display = s==="upload"?"":"none";
    el("db_yahooRow").style.display  = s==="yahoo"?"":"none";
    el("db_storedRow").style.display = s==="stored"?"":"none";
    el("db_tfrow").style.display     = s==="stored"?"none":"";
  }
  function setDir(d){
    DIRECTION=d;
    $$("#db_dir button").forEach(b=>b.classList.toggle("on",b.dataset.d===d));
    el("db_dir").dataset.cur=d;
    const isS=d==="short";
    if(el("db_trrow_hint"))el("db_trrow_hint").textContent=isS
      ?"1TR→저가만, 2TR→저가·저가+TR … 손절은 마지막 매도가 위"
      :"1TR→고가만, 2TR→고가·고가−TR, 3TR→고가·고가−TR·고가−2TR … 손절은 마지막 매수가 아래";
  }
  function setMaFilter(v){
    MA_FILTER=Math.max(0,+v||0);
    $$("#db_ma_filter button").forEach(b=>b.classList.toggle("on",+b.dataset.ma===MA_FILTER));
    el("db_ma_filter").dataset.cur=String(MA_FILTER);
  }
  function parseList(str,intOnly,minV){
    return String(str).split(/[,\s]+/).map(x=>+x).filter(x=>isFinite(x)&&x>=(minV||0)&&(!intOnly||Number.isInteger(x)));
  }
  function sliceRecentMonths(bars,months){
    if(!months||months<=0||!bars.length)return bars;
    const d=new Date(bars[bars.length-1].day+"T00:00:00");
    d.setMonth(d.getMonth()-months);
    const cutoff=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    return bars.filter(b=>b.day>=cutoff);
  }
  function err(msg){ el("db_err").textContent=msg||""; }
  function status(msg){ el("db_status").textContent=msg||""; }

  async function loadDataSources(){
    const src=el("db_src").dataset.cur;
    if(src==="yahoo"){
      const sym=el("db_sym").value.trim(); if(!sym)throw new Error("야후 티커를 입력하세요");
      const tf=el("db_tf").value;
      const from=el("db_from").value, to=el("db_to").value;
      status(`야후 ${sym} ${tf} 불러오는 중…`);
      const bars=tf==="10m"
        ? resampleN(await fetchYahoo(sym,"5m",from,to),2)
        : await fetchYahoo(sym, tf==="1d"?"1d":tf==="1h"?"60m":"5m", from, to);
      return [{label:sym||"야후", file:sym, bars}];
    }
    if(src==="upload"){
      if(!RAWCACHE.__upload__)throw new Error("CSV 파일을 먼저 선택하세요");
      return [{label:RAWCACHE.__uploadName__||"업로드", file:"upload", bars:buildTF_MT5(RAWCACHE.__upload__,el("db_tf").value)}];
    }
    const picks=selectedCsvFiles("db");
    if(!picks.length)throw new Error("비교할 저장 CSV를 1개 이상 체크하세요");
    const out=[];
    for(const cf of picks){
      if(!RAWCACHE[cf.file]){
        status(`${cf.sym} ${cf.tf} 불러오는 중…`);
        const r=await fetch(cf.file,{cache:"force-cache"});
        if(!r.ok)throw new Error(`${cf.file} 못 찾음(404). 레포 루트에 올렸는지 확인하세요.`);
        const parsed=parseMT5(await r.text());
        RAWCACHE[cf.file]=cf.raw?intradayOnly(parsed):parsed;
      }
      out.push({label:`${cf.sym} · ${cf.tf}`, file:cf.file, bars:RAWCACHE[cf.file]});
    }
    RAWLABEL=picks.length===1?`${picks[0].sym} · ${picks[0].tf}`:`${picks.length}개 CSV`;
    return out;
  }

  async function run(){
    err(""); RESULTS=[];
    const btn=el("db_run"); btn.disabled=true;
    try{
      const expiryM=Math.max(1,+el("db_expiry").value||20);
      const minTr=Math.max(0,+el("db_min").value||0);
      const useBase=el("db_use_base").checked;
      const useConfirm=el("db_use_confirm").checked;
      if(!useBase&&!useConfirm)throw new Error("비교할 전략을 1개 이상 체크하세요.");
      const confW=Math.max(1,Math.round(+el("db_confw").value||5));
      const strategies=[];
      if(useBase)strategies.push({label:"더블비",confirm:false});
      if(useConfirm)strategies.push({label:"더블비컨펌",confirm:true});
      const slKs=parseList(el("db_sl").value,false,0);
      const tpKs=parseList(el("db_tp").value,false,0);
      const nList=parseList(el("db_N").value,true,1);
      const trList=parseList(el("db_trN").value,true,1);
      const entryModes=[];
      if(nList.length)entryModes.push({mode:"n",dims:nList});
      if(trList.length)entryModes.push({mode:"tr",dims:trList});
      if(!entryModes.length)throw new Error("등분 N 또는 TR 분할수를 1개 이상 입력하세요");
      if(!slKs.length||!tpKs.length)throw new Error("손절·익절 값을 1개 이상 입력하세요");
      const tpModes=["fixed","avg"];
      const dir=DIRECTION;
      const months=+el("db_months").value||0;
      const maLen=MA_FILTER;
      const maLabel=maLen?`MA${maLen}`:"필터 없음";
      const sources=await loadDataSources();
      const dimCount=entryModes.reduce((a,em)=>a+em.dims.length,0);
      const perTotal=dimCount*slKs.length*tpKs.length*strategies.length*tpModes.length;
      let total=0;
      const res=[];
      for(let si=0; si<sources.length; si++){
        const src=sources[si], bars=sliceRecentMonths(src.bars, months);
        if(bars.length<60){ status(`${src.label} 봉 수가 너무 적어 건너뜀(${bars.length}${months?` · 최근 ${months}개월`:""})`); await pauseUI(); continue; }
        total+=perTotal;
        status(`엔진 실행 (${si+1}/${sources.length}) ${src.label} · ${bars.length.toLocaleString()}봉 · ${maLabel} · ${perTotal}조합…`);
        const upper=doubleUpper(bars), lower=doubleLower(bars);
        const trendMa=maLen?smaArr(bars.map(b=>b.c),maLen):null;
        const span=bars[0].day+" ~ "+bars[bars.length-1].day;
        for(const st of strategies)for(const em of entryModes)for(const d of em.dims)for(const s of slKs)for(const t of tpKs)for(const tpm of tpModes){
          const r = em.mode==="tr"
            ? backtest(bars,upper,lower,dir,"tr",1,d,s,t,tpm,expiryM,st.confirm,confW,trendMa)
            : backtest(bars,upper,lower,dir,"n",d,1,s,t,tpm,expiryM,st.confirm,confW,trendMa);
          r.strategy=st.label; r.dataLabel=src.label; r.file=src.file; r.bars=bars.length; r.span=span; r.trendMa=maLen; r.trend=maLen?`MA${maLen}`:"없음";
          if(r.trades>=minTr)res.push(r);
        }
        await pauseUI();
      }
      const CAP=500;
      const matched=res.length;
      res.sort((a,b)=>b.totalRet-a.totalRet);
      RESULTS=res.slice(0,CAP);
      const src=el("db_src").dataset.cur;
      const lbl=src==="stored"?RAWLABEL:(src==="upload"?(RAWCACHE.__uploadName__||"업로드"):el("db_sym").value)||"데이터";
      const capNote=matched>CAP?` · 총수익 상위 ${CAP}개만 표시`:"";
      status(`${lbl} · [${dir==="short"?"숏":"롱"}] · ${strategies.map(s=>s.label).join("+")} · 추세 ${maLabel} · ${months?`최근 ${months}개월`:"전체기간"} 표시 ${RESULTS.length}/${matched}조합(최소거래 ${minTr})${capNote}`);
      render();
    }catch(e){ err("⚠ "+e.message); status(""); }
    finally{ btn.disabled=false; }
  }

  function pct(x){ return (x>=0?"+":"")+(x*100).toFixed(1)+"%"; }
  function payoffStr(p){ return p===Infinity?"∞":p.toFixed(2); }
  function marStr(m){ return m===Infinity?"∞":m.toFixed(2); }
  function arrow(k){ return SORT.key===k?(SORT.dir<0?" ▾":" ▴"):""; }
  function money(x){
    if(!isFinite(x))return "-";
    return (x>=0?"+":"-")+"$"+Math.abs(x).toLocaleString("en-US",{maximumFractionDigits:0});
  }

  function render(){
    const wrap=el("db_results");
    if(!RESULTS.length){ wrap.innerHTML=`<div class="placeholder"><div class="big">조건에 맞는 조합이 없어요</div><div class="mono" style="font-size:12px">최소 거래수를 낮추거나 파라미터 범위를 넓혀보세요</div></div>`; return; }
    const entOf=r=>r.entryMode==="tr"?`TR${r.key}`:(r.key===1?"단일":`${r.key}등분`);
    const tpOf=r=>r.tpMode==="avg"?"평단":"돌파봉";
    const trendOf=r=>r.trend||((r.trendMa||0)?`MA${r.trendMa}`:"없음");
    const entOrd=r=>(r.entryMode==="tr"?1e6:0)+(+r.key);
    const bank=Math.max(0,+el("db_bank").value||10000);
    const rs=RESULTS.slice().sort((a,b)=>{
      const v=SORT.key==="dataLabel"
        ? String(a.dataLabel||"").localeCompare(String(b.dataLabel||""),"ko")
        : SORT.key==="strategy"
          ? String(a.strategy||"").localeCompare(String(b.strategy||""),"ko")
        : SORT.key==="trend"
          ? (a.trendMa||0)-(b.trendMa||0)
        : SORT.key==="tpMode"
          ? String(a.tpMode||"").localeCompare(String(b.tpMode||""),"ko")
        : SORT.key==="entry"
          ? entOrd(a)-entOrd(b)
          : (SORT.key==="mar"?a.mar-b.mar:SORT.key==="totalRet"||SORT.key==="profit"?a.totalRet-b.totalRet:SORT.key==="payoff"?a.payoff-b.payoff:SORT.key==="winrate"?a.winrate-b.winrate:SORT.key==="mdd"?a.mdd-b.mdd:SORT.key==="trades"?a.trades-b.trades:SORT.key==="confSkip"?(a.confSkip||0)-(b.confSkip||0):SORT.key==="key"?a.key-b.key:SORT.key==="slK"?a.slK-b.slK:a.tpK-b.tpK);
      return SORT.dir*v;
    });
    const bestMar=Math.max(...RESULTS.map(r=>r.mar===Infinity?-1:r.mar));
    const bestRet=Math.max(...RESULTS.map(r=>r.totalRet));
    const worstMdd=Math.min(...RESULTS.map(r=>r.mdd));
    const best=RESULTS.slice().sort((a,b)=>(b.mar===Infinity?1e9:b.mar)-(a.mar===Infinity?1e9:a.mar))[0];
    const head=(k,main,sub)=>`<th class="db-sort" data-k="${k}"><span class="th-main">${main}${arrow(k)}</span><span class="th-sub">${sub}</span></th>`;
    const rows=rs.map((r,ri)=>{
      const hot=r===best;
      const profit=r.totalRet*bank;
      return `<tr class="${hot?'db-hot':''}">
        <td class="mono dimv">${r.dataLabel||""}</td>
        <td class="mono">${r.strategy||""}</td>
        <td class="mono dimv">${trendOf(r)}</td>
        <td class="mono">${entOf(r)}</td>
        <td class="dimv">${tpOf(r)}</td>
        <td class="num">${r.slK}</td>
        <td class="num">${r.tpK}</td>
        <td class="num">${r.trades}</td>
        <td class="num">${(r.winrate*100).toFixed(0)}%</td>
        <td class="num ${r.payoff>=1?'pos':'neg'}">${payoffStr(r.payoff)}</td>
        <td class="num ${r.totalRet===bestRet?'hl-good':(r.totalRet>=0?'pos':'neg')}">${pct(r.totalRet)}</td>
        <td class="num ${profit>=0?'pos':'neg'}">${money(profit)}</td>
        <td class="num ${r.mdd===worstMdd?'hl-bad':'neg'}">${(r.mdd*100).toFixed(1)}%</td>
        <td class="num ${r.mar===bestMar&&r.mar!==Infinity?'hl-good':'cy'}">${marStr(r.mar)}</td>
        <td class="num dimv">${r.tpC}/${r.slC}${r.eodC?'/'+r.eodC:''}</td>
        <td class="num"><button class="db-save" data-i="${ri}" title="이 전략을 저장된 전략 목록에 추가">저장</button></td></tr>`;
    }).join("");
    const bestLabel=best.entryMode==="tr"?`TR${best.key}분할`:(best.key===1?"단일":`${best.key}등분`);
    const bestProfit=best.totalRet*bank;
    wrap.innerHTML=`
      <div class="db-best">최적 조합(MAR) · <b class="amb">${best.dataLabel||"데이터"} · ${best.strategy||"전략"} · ${trendOf(best)} · ${bestLabel} · ${tpOf(best)}익절 · 손절 ${best.slK}TR · 익절 ${best.tpK}TR</b>
        → 총수익 <b class="${best.totalRet>=0?'pos':'neg'}">${pct(best.totalRet)}</b> · 총 수익금 <b class="${bestProfit>=0?'pos':'neg'}">${money(bestProfit)}</b> <span class="dimv">($${bank.toLocaleString("en-US")} 기준)</span> · MDD <b class="neg">${(best.mdd*100).toFixed(1)}%</b> · MAR <b class="cy">${marStr(best.mar)}</b> · 거래 ${best.trades} · 승률 ${(best.winrate*100).toFixed(0)}%</div>
      <div class="ctable-wrap"><table class="ctable"><thead><tr>
        ${head("dataLabel","데이터","CSV")}
        ${head("strategy","전략","TYPE")}
        ${head("trend","추세","MA")}
        ${head("entry","진입","ENTRY")}${head("tpMode","익절기준","TP")}${head("slK","손절","×TR")}${head("tpK","익절","×TR")}
        ${head("trades","거래","TRADES")}${head("winrate","승률","WIN")}${head("payoff","손익비","PAYOFF")}
        ${head("totalRet","총수익","RETURN")}${head("profit","총 수익금","$")}
        ${head("mdd","최대낙폭","MDD")}${head("mar","위험대비","MAR")}
        <th><span class="th-main">청산</span><span class="th-sub">TP/SL</span></th>
        <th><span class="th-main">저장</span><span class="th-sub">SAVE</span></th>
      </tr></thead><tbody>${rows}</tbody></table></div>
      <div class="note" style="margin-top:14px"><b class="hl-good">초록</b>=최고 총수익/MAR · <b class="hl-bad">빨강</b>=최대 낙폭 · 호박색 줄=MAR 최적 · 더블비/더블비컨펌·등분/TR분할·돌파봉/평단 익절을 모두 한 표에 합쳐 비교 · 총 수익금은 기준자금×총수익률 단순 환산 · 청산열=익절/손절(+미청산) 횟수. 손익비=평균이익÷평균손실, MAR=총수익÷|MDD|.</div>`;
    wrap.querySelectorAll(".db-sort").forEach(th=>th.onclick=()=>{
      const k=th.dataset.k;
      if(SORT.key===k)SORT.dir*=-1; else{ SORT.key=k; SORT.dir=(k==="mdd"||k==="dataLabel"||k==="strategy"||k==="trend"||k==="entry"||k==="tpMode"||k==="confSkip"?1:-1); }
      render();
    });
    const confWNow=Math.max(1,Math.round(+el("db_confw").value||5));
    const monthsNow=+el("db_months").value||0;
    wrap.querySelectorAll(".db-save").forEach(btn=>btn.onclick=()=>{
      const r=rs[+btn.dataset.i]; if(!r)return;
      const entry=r.entryMode==="tr"?`TR${r.key}분할`:(r.key===1?"단일":`${r.key}등분`);
      const ok=StrategyStore.add({
        data:r.dataLabel||"", strategy:r.strategy||"", direction:r.direction==="short"?"숏":"롱",
        entry, slK:r.slK, tpK:r.tpK, tpMode:r.tpMode==="avg"?"평단":"돌파봉",
        trend:trendOf(r),
        confW:r.useConfirm?confWNow:null, months:monthsNow,
        trades:r.trades, winrate:r.winrate, payoff:r.payoff, totalRet:r.totalRet, mdd:r.mdd, mar:r.mar,
      });
      btn.textContent=ok?"✓ 저장됨":"이미 있음";
      btn.disabled=true; btn.style.opacity=.6;
      savedBadge();
    });
  }

  function init(){
    if(!el("db_run"))return;
    el("db_months").innerHTML=`<option value="0">전체</option>`+
      Array.from({length:24},(_,i)=>`<option value="${i+1}">최근 ${i+1}개월</option>`).join("");
    renderCsvChecks("db", Math.max(0, CSV_FILES.findIndex(cf=>cf.sym==="US100"&&cf.tf==="M5")));
    $$("#db_src button").forEach(b=>b.onclick=()=>setSrc(b.dataset.s));
    el("db_file").onchange=async e=>{
      const f=e.target.files[0]; if(!f)return;
      try{ RAWCACHE.__upload__=parseMT5(await f.text()); RAWCACHE.__uploadName__=f.name; status(`업로드됨: ${f.name} · ${RAWCACHE.__upload__.length.toLocaleString()}행`); err(""); }
      catch(ex){ err("⚠ "+ex.message); }
    };
    el("db_reload").onclick=()=>{ RAWCACHE={}; RAWLABEL=""; status("캐시 비움 — 다시 돌리면 새로 불러옵니다"); };
    $$("#db_dir button").forEach(b=>b.onclick=()=>setDir(b.dataset.d));
    $$("#db_ma_filter button").forEach(b=>b.onclick=()=>setMaFilter(b.dataset.ma));
    el("db_bank").oninput=()=>{ if(RESULTS.length)render(); };
    el("db_run").onclick=run;
    el("db_from").value=daysAgo(730); el("db_to").value=today();
    setSrc("stored"); setDir("long"); setMaFilter(0);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init); else init();
})();

/* ===== DOUBLE-BB CONFIRM ===== */
(function(){
  function bandBand(series,period,mult,up){
    const n=series.length, out=new Array(n).fill(null);
    for(let i=period-1;i<n;i++){
      let s=0; for(let k=i-period+1;k<=i;k++)s+=series[k];
      const m=s/period; let v=0;
      for(let k=i-period+1;k<=i;k++){const d=series[k]-m; v+=d*d;}
      out[i]=m+(up?1:-1)*mult*Math.sqrt(v/period);
    }
    return out;
  }
  function doubleUpper(bars){
    const u1=bandBand(bars.map(b=>b.o),4,4,true);
    const u2=bandBand(bars.map(b=>b.c),20,2,true);
    return bars.map((_,i)=>(u1[i]==null||u2[i]==null)?null:Math.max(u1[i],u2[i]));
  }
  function doubleLower(bars){
    const l1=bandBand(bars.map(b=>b.o),4,4,false);
    const l2=bandBand(bars.map(b=>b.c),20,2,false);
    return bars.map((_,i)=>(l1[i]==null||l2[i]==null)?null:Math.min(l1[i],l2[i]));
  }
  function backtest(bars,upper,lower,direction,entryMode,N,numTR,slK,tpK,tpMode,expiryM,confW){
    const n=bars.length, isShort=direction==="short";
    let equity=1, peak=1, maxDD=0;
    let trades=0, wins=0, losses=0, sumWin=0, sumLoss=0, tpC=0, slC=0, eodC=0, confSkip=0;
    let i=1;
    while(i<n){
      const band=isShort?lower:upper;
      const u=band[i], up1=band[i-1];
      if(u==null||up1==null){ i++; continue; }
      if(isShort){ if(!(bars[i].c<u && bars[i-1].c>=up1)){ i++; continue; } }
      else        { if(!(bars[i].c>u && bars[i-1].c<=up1)){ i++; continue; } }
      const H=bars[i].h, L=bars[i].l, TR=H-L;
      if(TR<=0){ i++; continue; }
      let conf=-1;
      for(let j=i+1;j<n && j<=i+confW;j++){
        if(isShort?bars[j].c<bars[i].c:bars[j].c>bars[i].c){ conf=j; break; }
      }
      if(conf<0){ confSkip++; i++; continue; }
      const orders=[];
      if(isShort){
        if(entryMode==="tr"){ for(let k=0;k<numTR;k++) orders.push({p:L+k*TR,filled:false}); }
        else { for(let k=0;k<N;k++) orders.push({p:N===1?L:L+(H-L)*k/(N-1),filled:false}); }
      } else {
        if(entryMode==="tr"){ for(let k=0;k<numTR;k++) orders.push({p:H-k*TR,filled:false}); }
        else { for(let k=0;k<N;k++) orders.push({p:N===1?H:H-(H-L)*k/(N-1),filled:false}); }
      }
      const ordCount=orders.length;
      const SL=isShort
        ? Math.max(...orders.map(o=>o.p)) + slK*TR
        : Math.min(...orders.map(o=>o.p)) - slK*TR;
      let filled=0,sumFill=0,exited=false,exitPx=0,reason="",exitIdx=-1;
      for(let j=conf+1;j<n;j++){
        const b=bars[j];
        if(isShort){ for(const o of orders){ if(!o.filled && b.h>=o.p){ o.filled=true; filled++; sumFill+=o.p; } } }
        else        { for(const o of orders){ if(!o.filled && b.l<=o.p){ o.filled=true; filled++; sumFill+=o.p; } } }
        if(filled===0){ if(j-conf>=expiryM)break; else continue; }
        const avg=sumFill/filled;
        if(isShort){
          const TP=tpMode==="avg"?avg-tpK*TR:L-tpK*TR;
          if(b.h>=SL){ exited=true; exitPx=SL; reason="SL"; exitIdx=j; break; }
          if(b.l<=TP){ exited=true; exitPx=TP; reason="TP"; exitIdx=j; break; }
        } else {
          const TP=tpMode==="avg"?avg+tpK*TR:H+tpK*TR;
          if(b.l<=SL){ exited=true; exitPx=SL; reason="SL"; exitIdx=j; break; }
          if(b.h>=TP){ exited=true; exitPx=TP; reason="TP"; exitIdx=j; break; }
        }
      }
      if(filled===0){ i++; continue; }
      if(!exited){ exitPx=bars[n-1].c; reason="EOD"; exitIdx=n-1; }
      const avg=sumFill/filled, frac=filled/ordCount;
      const ret=isShort ? frac*(avg-exitPx)/avg : frac*(exitPx-avg)/avg;
      equity*=(1+ret); if(equity>peak)peak=equity;
      const dd=equity/peak-1; if(dd<maxDD)maxDD=dd;
      trades++;
      if(ret>0){wins++;sumWin+=ret;}else{losses++;sumLoss+=Math.abs(ret);}
      if(reason==="TP")tpC++; else if(reason==="SL")slC++; else eodC++;
      i=exitIdx+1;
    }
    const winrate=trades?wins/trades:0;
    const avgWin=wins?sumWin/wins:0, avgLoss=losses?sumLoss/losses:0;
    const payoff=avgLoss>0?avgWin/avgLoss:(avgWin>0?Infinity:0);
    const totalRet=equity-1;
    const mar=maxDD<0?totalRet/Math.abs(maxDD):(totalRet>0?Infinity:0);
    const key=entryMode==="tr"?numTR:N;
    return {entryMode,direction,key,slK,tpK,trades,winrate,payoff,totalRet,mdd:maxDD,mar,tpC,slC,eodC,confSkip};
  }
  function parseMT5(text){
    const lines=text.split(/\r?\n/), out=[];
    const start=/date|open|time/i.test(lines[0]||"")?1:0;
    for(let i=start;i<lines.length;i++){
      const ln=lines[i].trim(); if(!ln)continue;
      const p=ln.split(/[\t,;]+/); if(p.length<5)continue;
      const d=p[0].replace(/\./g,"-").replace(/\//g,"-").slice(0,10);
      const hasTime=/:/.test(p[1]||""); const oi=hasTime?2:1;
      const o=+p[oi],h=+p[oi+1],l=+p[oi+2],c=+p[oi+3];
      if(!isFinite(o)||!isFinite(h)||!isFinite(l)||!isFinite(c)||c<=0)continue;
      out.push({day:d,date:d+" "+(hasTime?p[1]:"00:00:00"),o,h,l,c});
    }
    if(out.length<2)throw new Error("CSV에서 유효한 OHLC 행을 못 찾음");
    return out;
  }
  function groupByDay(bars){ const m={},order=[]; for(const b of bars){ if(!m[b.day]){m[b.day]=[];order.push(b.day);} m[b.day].push(b);} return {m,order}; }
  function agg(g){ let h=-Infinity,l=Infinity; for(const x of g){ if(x.h>h)h=x.h; if(x.l<l)l=x.l; } return {day:g[0].day,date:g[0].date,o:g[0].o,h,l,c:g[g.length-1].c}; }
  function intradayOnly(bars){ const {m}=groupByDay(bars); return bars.filter(b=>m[b.day].length>1); }
  function resampleN(bars,nn){ const {m,order}=groupByDay(bars); const out=[]; for(const d of order){const a=m[d]; for(let k=0;k<a.length;k+=nn)out.push(agg(a.slice(k,k+nn)));} return out; }
  function resampleDaily(bars){ const {m,order}=groupByDay(bars); return order.map(d=>agg(m[d])); }
  function buildTF_MT5(raw,tf){
    if(tf==="5m")return intradayOnly(raw);
    if(tf==="10m")return resampleN(intradayOnly(raw),2);
    if(tf==="1h")return resampleN(intradayOnly(raw),12);
    return resampleDaily(raw);
  }
  async function fetchYahoo(sym,interval,from,to){
    const u=`${PROXY}/?yahoo=${encodeURIComponent(sym)}&from=${from}&to=${to}&interval=${interval}`;
    const r=await fetch(u); const j=await r.json();
    if(!r.ok||!j.data)throw new Error(j.error||("프록시 오류 "+r.status));
    return j.data.map(x=>({day:String(x.date).slice(0,10),date:String(x.date),o:+x.o,h:+x.h,l:+x.l,c:+x.c}));
  }
  function daysAgo(n){ const d=new Date(); d.setDate(d.getDate()-n); return d.toISOString().slice(0,10); }

  let RAWCACHE={}, RAWLABEL="", RESULTS=[], SORT={key:"mar",dir:-1}, SKIPTOT=0, EMODE="n", DIRECTION="long";
  const el=id=>document.getElementById(id);
  if(!el("dc_run"))return;

  function setSrc(s){
    $$("#dc_src button").forEach(b=>b.classList.toggle("on",b.dataset.s===s));
    el("dc_src").dataset.cur=s;
    el("dc_uploadRow").style.display = s==="upload"?"":"none";
    el("dc_yahooRow").style.display  = s==="yahoo"?"":"none";
    el("dc_storedRow").style.display = s==="stored"?"":"none";
    el("dc_tfrow").style.display     = s==="stored"?"none":"";
  }
  function setTpMode(m){ $$("#dc_tpmode button").forEach(b=>b.classList.toggle("on",b.dataset.m===m)); el("dc_tpmode").dataset.cur=m; }
  function setDir(d){
    DIRECTION=d;
    $$("#dc_dir button").forEach(b=>b.classList.toggle("on",b.dataset.d===d));
    el("dc_dir").dataset.cur=d;
    const isS=d==="short";
    el("dc_tpfixed_btn").textContent=isS?"돌파봉 저가":"돌파봉 고가";
    el("dc_emode_label").textContent=isS?"매도 방식":"매수 방식";
    setEmode(EMODE);
  }
  function setEmode(e){
    EMODE=e;
    $$("#dc_emode button").forEach(b=>b.classList.toggle("on",b.dataset.e===e));
    el("dc_emode").dataset.cur=e;
    el("dc_nrow").style.display  = e==="n"?"":"none";
    el("dc_trrow").style.display = e==="tr"?"":"none";
    const isS=DIRECTION==="short";
    if(e==="tr"){
      el("dc_emode_hint").textContent=isS
        ?"1차=저가, 2차=저가+TR, 3차=저가+2TR … 손절은 마지막 매도가 위"
        :"1차=고가, 2차=고가−TR, 3차=고가−2TR … 손절은 마지막 매수가 아래";
      el("dc_trrow_hint").textContent=isS
        ?"1TR→저가만, 2TR→저가·저가+TR … 손절은 마지막 매도가 위"
        :"1TR→고가만, 2TR→고가·고가−TR, … 손절은 마지막 매수가 아래";
    } else {
      el("dc_emode_hint").textContent=isS
        ?"저가~고가를 N등분해 각 가격에 지정가 매도"
        :"고가~저가를 N등분해 각 가격에 지정가 매수";
    }
  }
  function parseList(str,intOnly,minV){
    return String(str).split(/[,\s]+/).map(x=>+x).filter(x=>isFinite(x)&&x>=(minV||0)&&(!intOnly||Number.isInteger(x)));
  }
  function err(msg){ el("dc_err").textContent=msg||""; }
  function status(msg){ el("dc_status").textContent=msg||""; }

  async function loadDataSources(){
    const src=el("dc_src").dataset.cur;
    if(src==="yahoo"){
      const sym=el("dc_sym").value.trim(); if(!sym)throw new Error("야후 티커를 입력하세요");
      const tf=el("dc_tf").value;
      const from=el("dc_from").value, to=el("dc_to").value;
      status(`야후 ${sym} ${tf} 불러오는 중…`);
      const bars=tf==="10m"
        ? resampleN(await fetchYahoo(sym,"5m",from,to),2)
        : await fetchYahoo(sym, tf==="1d"?"1d":tf==="1h"?"60m":"5m", from, to);
      return [{label:sym||"야후", file:sym, bars}];
    }
    if(src==="upload"){
      if(!RAWCACHE.__upload__)throw new Error("CSV 파일을 먼저 선택하세요");
      return [{label:RAWCACHE.__uploadName__||"업로드", file:"upload", bars:buildTF_MT5(RAWCACHE.__upload__,el("dc_tf").value)}];
    }
    const picks=selectedCsvFiles("dc");
    if(!picks.length)throw new Error("비교할 저장 CSV를 1개 이상 체크하세요");
    const out=[];
    for(const cf of picks){
      if(!RAWCACHE[cf.file]){
        status(`${cf.sym} ${cf.tf} 불러오는 중…`);
        const r=await fetch(cf.file,{cache:"force-cache"});
        if(!r.ok)throw new Error(`${cf.file} 못 찾음(404). 레포 루트에 올렸는지 확인하세요.`);
        const parsed=parseMT5(await r.text());
        RAWCACHE[cf.file]=cf.raw?intradayOnly(parsed):parsed;
      }
      out.push({label:`${cf.sym} · ${cf.tf}`, file:cf.file, bars:RAWCACHE[cf.file]});
    }
    RAWLABEL=picks.length===1?`${picks[0].sym} · ${picks[0].tf}`:`${picks.length}개 CSV`;
    return out;
  }

  async function run(){
    err(""); RESULTS=[]; SKIPTOT=0;
    const btn=el("dc_run"); btn.disabled=true;
    try{
      const emode=EMODE;
      const tpMode=el("dc_tpmode").dataset.cur;
      const confW=Math.max(1,+el("dc_confw").value||5);
      const expiryM=Math.max(1,+el("dc_expiry").value||20);
      const minTr=Math.max(0,+el("dc_min").value||0);
      const slKs=parseList(el("dc_sl").value,false,0);
      const tpKs=parseList(el("dc_tp").value,false,0);
      const gridDim = emode==="tr"
        ? parseList(el("dc_trN").value,true,1)
        : parseList(el("dc_N").value,true,1);
      if(!gridDim.length||!slKs.length||!tpKs.length)throw new Error("매수 파라미터·손절·익절 값을 1개 이상 입력하세요");
      const dir=DIRECTION;
      const sources=await loadDataSources();
      const perTotal=gridDim.length*slKs.length*tpKs.length;
      let total=0;
      const res=[];
      for(let si=0; si<sources.length; si++){
        const src=sources[si], bars=src.bars;
        if(bars.length<60){ status(`${src.label} 봉 수가 너무 적어 건너뜀(${bars.length})`); await pauseUI(); continue; }
        total+=perTotal;
        status(`엔진 실행 (${si+1}/${sources.length}) ${src.label} · ${bars.length.toLocaleString()}봉 · ${perTotal}조합 · 컨펌 윈도우 ${confW}봉…`);
        const upper=doubleUpper(bars), lower=doubleLower(bars);
        const span=bars[0].day+" ~ "+bars[bars.length-1].day;
        let skipForSource=0;
        for(const d of gridDim)for(const s of slKs)for(const t of tpKs){
          const r = emode==="tr"
            ? backtest(bars,upper,lower,dir,"tr",1,d,s,t,tpMode,expiryM,confW)
            : backtest(bars,upper,lower,dir,"n",d,1,s,t,tpMode,expiryM,confW);
          r.dataLabel=src.label; r.file=src.file; r.bars=bars.length; r.span=span;
          skipForSource=r.confSkip;
          if(r.trades>=minTr)res.push(r);
        }
        SKIPTOT+=skipForSource;
        await pauseUI();
      }
      RESULTS=res;
      const src=el("dc_src").dataset.cur;
      const lbl=src==="stored"?RAWLABEL:(src==="upload"?(RAWCACHE.__uploadName__||"업로드"):el("dc_sym").value)||"데이터";
      status(`${lbl} · [${dir==="short"?"숏":"롱"}] 컨펌 윈도우 ${confW}봉(폐기 ${SKIPTOT}건) · 표시 ${res.length}/${total}조합(최소거래 ${minTr})`);
      render();
    }catch(e){ err("⚠ "+e.message); status(""); }
    finally{ btn.disabled=false; }
  }

  function pct(x){ return (x>=0?"+":"")+(x*100).toFixed(1)+"%"; }
  function payoffStr(p){ return p===Infinity?"∞":p.toFixed(2); }
  function marStr(m){ return m===Infinity?"∞":m.toFixed(2); }
  function arrow(k){ return SORT.key===k?(SORT.dir<0?" ▾":" ▴"):""; }

  function render(){
    const wrap=el("dc_results");
    if(!RESULTS.length){ wrap.innerHTML=`<div class="placeholder"><div class="big">조건에 맞는 조합이 없어요</div><div class="mono" style="font-size:12px">최소 거래수를 낮추거나 컨펌 윈도우·파라미터 범위를 넓혀보세요</div></div>`; return; }
    const isT=EMODE==="tr";
    const dimLabel=isT?"TR수":"등분";
    const rs=RESULTS.slice().sort((a,b)=>{
      const v=SORT.key==="dataLabel"
        ? String(a.dataLabel||"").localeCompare(String(b.dataLabel||""),"ko")
        : (SORT.key==="mar"?a.mar-b.mar:SORT.key==="totalRet"?a.totalRet-b.totalRet:SORT.key==="payoff"?a.payoff-b.payoff:SORT.key==="winrate"?a.winrate-b.winrate:SORT.key==="mdd"?a.mdd-b.mdd:SORT.key==="trades"?a.trades-b.trades:SORT.key==="key"?a.key-b.key:SORT.key==="slK"?a.slK-b.slK:a.tpK-b.tpK);
      return SORT.dir*v;
    });
    const bestMar=Math.max(...RESULTS.map(r=>r.mar===Infinity?-1:r.mar));
    const bestRet=Math.max(...RESULTS.map(r=>r.totalRet));
    const worstMdd=Math.min(...RESULTS.map(r=>r.mdd));
    const best=RESULTS.slice().sort((a,b)=>(b.mar===Infinity?1e9:b.mar)-(a.mar===Infinity?1e9:a.mar))[0];
    const head=(k,main,sub)=>`<th class="db-sort" data-k="${k}"><span class="th-main">${main}${arrow(k)}</span><span class="th-sub">${sub}</span></th>`;
    const rows=rs.map(r=>{
      const hot=r===best;
      return `<tr class="${hot?'db-hot':''}">
        <td class="mono dimv">${r.dataLabel||""}</td>
        <td class="num">${r.key}</td>
        <td class="num">${r.slK}</td>
        <td class="num">${r.tpK}</td>
        <td class="num">${r.trades}</td>
        <td class="num">${(r.winrate*100).toFixed(0)}%</td>
        <td class="num ${r.payoff>=1?'pos':'neg'}">${payoffStr(r.payoff)}</td>
        <td class="num ${r.totalRet===bestRet?'hl-good':(r.totalRet>=0?'pos':'neg')}">${pct(r.totalRet)}</td>
        <td class="num ${r.mdd===worstMdd?'hl-bad':'neg'}">${(r.mdd*100).toFixed(1)}%</td>
        <td class="num ${r.mar===bestMar&&r.mar!==Infinity?'hl-good':'cy'}">${marStr(r.mar)}</td>
        <td class="num dimv">${r.tpC}/${r.slC}${r.eodC?'/'+r.eodC:''}</td></tr>`;
    }).join("");
    const bestLabel=isT?`TR${best.key}분할`:`${best.key}등분`;
    wrap.innerHTML=`
      <div class="db-best">최적 조합(MAR) · <b class="amb">${best.dataLabel||"데이터"} · ${bestLabel} · 손절 ${best.slK}TR · 익절 ${best.tpK}TR</b>
        → 총수익 <b class="${best.totalRet>=0?'pos':'neg'}">${pct(best.totalRet)}</b> · MDD <b class="neg">${(best.mdd*100).toFixed(1)}%</b> · MAR <b class="cy">${marStr(best.mar)}</b> · 거래 ${best.trades} · 승률 ${(best.winrate*100).toFixed(0)}% <span class="dimv">· 컨펌없어 폐기 ${SKIPTOT}건</span></div>
      <div class="ctable-wrap"><table class="ctable"><thead><tr>
        ${head("dataLabel","데이터","CSV")}
        ${head("key",dimLabel,isT?"TR":"N")}${head("slK","손절","×TR")}${head("tpK","익절","×TR")}
        ${head("trades","거래","TRADES")}${head("winrate","승률","WIN")}${head("payoff","손익비","PAYOFF")}
        ${head("totalRet","총수익","RETURN")}${head("mdd","최대낙폭","MDD")}${head("mar","위험대비","MAR")}
        <th><span class="th-main">청산</span><span class="th-sub">TP/SL</span></th>
      </tr></thead><tbody>${rows}</tbody></table></div>
      <div class="note" style="margin-top:14px"><b class="hl-good">초록</b>=최고 총수익/MAR · <b class="hl-bad">빨강</b>=최대 낙폭 · 호박색 줄=MAR 최적 · 여러 CSV 체크 시 한 표에 합쳐 비교 · 헤더 클릭 정렬 · 청산열=익절/손절(+미청산) 횟수. <b>컨펌봉 필터</b>: 돌파봉 이후 컨펌 윈도우 내 종가>돌파봉 종가인 봉이 나온 셋업만 거래. 손익비=평균이익÷평균손실, MAR=총수익÷|MDD|.</div>`;
    wrap.querySelectorAll(".db-sort").forEach(th=>th.onclick=()=>{
      const k=th.dataset.k;
      if(SORT.key===k)SORT.dir*=-1; else{ SORT.key=k; SORT.dir=(k==="mdd"||k==="dataLabel"?1:-1); }
      render();
    });
  }

  function init(){
    renderCsvChecks("dc", Math.max(0, CSV_FILES.findIndex(cf=>cf.sym==="US100"&&cf.tf==="M5")));
    $$("#dc_src button").forEach(b=>b.onclick=()=>setSrc(b.dataset.s));
    $$("#dc_tpmode button").forEach(b=>b.onclick=()=>setTpMode(b.dataset.m));
    $$("#dc_emode button").forEach(b=>b.onclick=()=>setEmode(b.dataset.e));
    el("dc_file").onchange=async e=>{
      const f=e.target.files[0]; if(!f)return;
      try{ RAWCACHE.__upload__=parseMT5(await f.text()); RAWCACHE.__uploadName__=f.name; status(`업로드됨: ${f.name} · ${RAWCACHE.__upload__.length.toLocaleString()}행`); err(""); }
      catch(ex){ err("⚠ "+ex.message); }
    };
    el("dc_reload").onclick=()=>{ RAWCACHE={}; RAWLABEL=""; status("캐시 비움 — 다시 돌리면 새로 불러옵니다"); };
    $$("#dc_dir button").forEach(b=>b.onclick=()=>setDir(b.dataset.d));
    el("dc_run").onclick=run;
    el("dc_from").value=daysAgo(730); el("dc_to").value=today();
    setSrc("stored"); setTpMode("fixed"); setDir("long"); setEmode("n");
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init); else init();
})();

/* ===== BREAKOUT THEN MA120 ===== */
(function(){
  const el=id=>document.getElementById(id);
  if(!el("br_run"))return;

  const TF_MIN={M1:1,M2:2,M3:3,M4:4,M5:5,M10:10,M12:12,M15:15,M30:30,H1:60,H2:120,H4:240,H8:480,H12:720,Daily:1440,Weekly:10080};
  let CACHE={}, RESULTS=[], SORT={key:"mar",dir:-1};

  function parseList(str,intOnly,minV){
    return String(str).split(/[,\s]+/).map(x=>+x).filter(x=>isFinite(x)&&x>=(minV||0)&&(!intOnly||Number.isInteger(x)));
  }
  function err(msg){ el("br_err").textContent=msg||""; }
  function status(msg){ el("br_status").textContent=msg||""; }
  function pct(x){ return (x>=0?"+":"")+(x*100).toFixed(1)+"%"; }
  function payoffStr(p){ return p===Infinity?"∞":p.toFixed(2); }
  function marStr(m){ return m===Infinity?"∞":m.toFixed(2); }
  function arrow(k){ return SORT.key===k?(SORT.dir<0?" ▾":" ▴"):""; }
  function toMs(date){ return new Date(String(date).replace(" ","T")).getTime(); }
  function pause(){ return new Promise(resolve=>setTimeout(resolve,0)); }

  function parseMT5(text){
    const lines=text.split(/\r?\n/), out=[];
    const start=/date|open|time/i.test(lines[0]||"")?1:0;
    for(let i=start;i<lines.length;i++){
      const ln=lines[i].trim(); if(!ln)continue;
      const p=ln.split(/[\t,;]+/); if(p.length<5)continue;
      const d=p[0].replace(/\./g,"-").replace(/\//g,"-").slice(0,10);
      const hasTime=/:/.test(p[1]||""); const oi=hasTime?2:1;
      const date=d+" "+(hasTime?p[1]:"00:00:00");
      const o=+p[oi],h=+p[oi+1],l=+p[oi+2],c=+p[oi+3];
      if(!isFinite(o)||!isFinite(h)||!isFinite(l)||!isFinite(c)||c<=0)continue;
      out.push({day:d,date,t:toMs(date),o,h,l,c});
    }
    if(out.length<2)throw new Error("CSV에서 유효한 OHLC 행을 못 찾음");
    out.sort((a,b)=>a.t-b.t);
    return out;
  }
  function groupByDay(bars){ const m={},order=[]; for(const b of bars){ if(!m[b.day]){m[b.day]=[];order.push(b.day);} m[b.day].push(b);} return {m,order}; }
  function intradayOnly(bars){ const {m}=groupByDay(bars); return bars.filter(b=>m[b.day].length>1); }

  async function loadCsv(cf){
    if(!cf)throw new Error("필요한 CSV 파일을 찾지 못했습니다");
    if(!CACHE[cf.file]){
      status(`${cf.sym} ${cf.tf} 불러오는 중…`);
      const r=await fetch(cf.file,{cache:"force-cache"});
      if(!r.ok)throw new Error(`${cf.file} 못 찾음(404). CSV가 HTML과 같은 서버 루트에 있는지 확인하세요.`);
      const parsed=parseMT5(await r.text());
      CACHE[cf.file]=cf.raw?intradayOnly(parsed):parsed;
    }
    return CACHE[cf.file];
  }
  function findCsv(sym,tf){ return CSV_FILES.find(cf=>cf.sym===sym&&cf.tf===tf); }

  function sma(vals,n){
    const out=new Array(vals.length).fill(null); let sum=0;
    for(let i=0;i<vals.length;i++){
      sum+=vals[i]; if(i>=n)sum-=vals[i-n];
      if(i>=n-1)out[i]=sum/n;
    }
    return out;
  }
  function rollMeanRange(bars,n){
    const out=new Array(bars.length).fill(null); let sum=0;
    for(let i=0;i<bars.length;i++){
      const r=bars[i].h-bars[i].l; sum+=r;
      if(i>=n)sum-=(bars[i-n].h-bars[i-n].l);
      if(i>=n-1)out[i]=sum/n;
    }
    return out;
  }
  function computeTR(bars, idx, opt, avgRng){
    const hour=60*60*1000;
    const endT=bars[idx].t;
    const normStart=endT-opt.trHours*hour;
    const newsStart=endT-opt.newsHours*hour;
    let kr=0;
    for(let j=idx-1;j>=0;j--){
      const b=bars[j];
      if(b.t<newsStart)break;
      const rng=b.h-b.l;
      const inNorm=b.t>=normStart;
      const isNews=avgRng[j]!=null && rng>=opt.newsMult*avgRng[j];
      if(inNorm||isNews){ if(rng>kr)kr=rng; }
    }
    if(kr===0){
      for(let j=idx-1;j>=Math.max(0,idx-3);j--){ const r=bars[j].h-bars[j].l; if(r>kr)kr=r; }
    }
    return kr>0?kr:null;
  }
  function makeSetups(entryBars,ma,avgRng,opt){
    const isShort=(opt.dir==="short");
    const setups=[];
    const stats={armed:0,touch:0,noKr:0};
    const hour=60*60*1000;
    const tfMin=TF_MIN[opt.tf]||1;
    const fromT=opt.fromT||-Infinity, toT=opt.toT||Infinity;
    let armed=false, armT=0;
    for(let i=0;i<entryBars.length;i++){
      const b=entryBars[i], m=ma[i];
      if(m==null)continue;
      const armCond = isShort ? (b.c <= m*(1-opt.gapPct)) : (b.c >= m*(1+opt.gapPct));
      if(armCond){ if(!armed)stats.armed++; armed=true; armT=b.t; continue; }
      if(!armed)continue;
      if(b.t-armT > opt.touchWaitH*hour){ armed=false; continue; }
      const touchCond = isShort ? (b.h>=m) : (b.l<=m);
      if(touchCond){
        const kr=computeTR(entryBars,i,opt,avgRng);
        armed=false;
        if(!kr){ stats.noKr++; continue; }
        if(b.t<fromT || b.t>toT) continue;
        setups.push({ touchIdx:i, touchT:b.t, touchPx:m, kr, touchDate:b.date, tfMin });
        stats.touch++;
      }
    }
    return {setups,stats};
  }
  function backtest(entryBars,ma,setups,N,slK,tpK,expiryBars,tpMode,dir){
    const isShort=(dir==="short");
    let equity=1, peak=1, maxDD=0, busyUntil=-Infinity;
    let trades=0,wins=0,losses=0,sumWin=0,sumLoss=0,tpC=0,slC=0,eodC=0,usedSetups=0,filledSteps=0;
    for(const st of setups){
      if(st.touchT<=busyUntil)continue;
      usedSetups++;
      const orders=[];
      for(let k=0;k<N;k++)orders.push({p: isShort ? st.touchPx+k*st.kr : st.touchPx-k*st.kr, filled:false});
      const SL = isShort ? Math.max(...orders.map(o=>o.p))+slK*st.kr
                         : Math.min(...orders.map(o=>o.p))-slK*st.kr;
      let filled=0,sumFill=0,exited=false,exitPx=0,reason="",exitIdx=-1;
      for(let j=st.touchIdx;j<entryBars.length;j++){
        const x=entryBars[j];
        for(const o of orders){
          if(!o.filled && (isShort ? x.h>=o.p : x.l<=o.p)){ o.filled=true; filled++; sumFill+=o.p; }
        }
        if(filled>0){
          const avg=sumFill/filled;
          if(isShort ? x.h>=SL : x.l<=SL){ exited=true; exitPx=SL; reason="SL"; exitIdx=j; break; }
          if(tpMode==="ma"){
            const tpLine=ma[j];
            if(tpLine!=null && j>st.touchIdx && (isShort ? x.l<=tpLine : x.h>=tpLine)){ exited=true; exitPx=tpLine; reason="TP"; exitIdx=j; break; }
          } else {
            const TP = isShort ? avg-tpK*st.kr : avg+tpK*st.kr;
            if(isShort ? x.l<=TP : x.h>=TP){ exited=true; exitPx=TP; reason="TP"; exitIdx=j; break; }
          }
          if(j-st.touchIdx>=expiryBars){ exited=true; exitPx=x.c; reason="EOD"; exitIdx=j; break; }
        }
      }
      if(filled===0)continue;
      if(!exited){ exitPx=entryBars[entryBars.length-1].c; reason="EOD"; exitIdx=entryBars.length-1; }
      const avg=sumFill/filled, frac=filled/N;
      const ret=frac*(isShort ? (avg-exitPx) : (exitPx-avg))/avg;
      equity*=(1+ret); if(equity>peak)peak=equity;
      const dd=equity/peak-1; if(dd<maxDD)maxDD=dd;
      trades++; filledSteps+=filled;
      if(ret>0){wins++;sumWin+=ret;}else{losses++;sumLoss+=Math.abs(ret);}
      if(reason==="TP")tpC++; else if(reason==="SL")slC++; else eodC++;
      busyUntil=entryBars[exitIdx].t;
    }
    const totalRet=equity-1;
    const avgWin=wins?sumWin/wins:0, avgLoss=losses?sumLoss/losses:0;
    const payoff=avgLoss>0?avgWin/avgLoss:(avgWin>0?Infinity:0);
    const mar=maxDD<0?totalRet/Math.abs(maxDD):(totalRet>0?Infinity:0);
    return {N,slK,tpK,trades,winrate:trades?wins/trades:0,payoff,totalRet,mdd:maxDD,mar,tpC,slC,eodC,usedSetups,avgFilled:trades?filledSteps/trades:0};
  }
  function selectedSyms(){ return Array.from($$("#br_syms button.on")).map(b=>b.dataset.sym); }
  function selectedTfs(){ return Array.from($$("#br_tf_list input:checked")).map(b=>b.dataset.tf); }

  async function run(){
    err(""); RESULTS=[];
    const btn=el("br_run"); btn.disabled=true;
    try{
      const syms=selectedSyms(), tfs=selectedTfs();
      if(!syms.length)throw new Error("심볼을 1개 이상 선택하세요");
      if(!tfs.length)throw new Error("진입 분봉을 1개 이상 선택하세요");
      const dir=el("br_dir").value||"long";
      const maLen=Math.max(2,Math.round(+el("br_maLen").value||120));
      const gapPct=Math.max(0,(+el("br_gap").value||1.5)/100);
      const parseDate=v=>{ v=(v||"").trim(); if(!v)return null; const t=new Date(v.replace(" ","T")).getTime(); return isFinite(t)?t:null; };
      const fromT=parseDate(el("br_from").value), toT=parseDate(el("br_to").value);
      const trHours=Math.max(1,+el("br_trHours").value||12);
      const newsHours=Math.max(trHours,+el("br_newsHours").value||24);
      const newsMult=Math.max(1,+el("br_newsMult").value||3);
      const tpMode=el("br_tpMode").value||"avg";
      const touchWaitH=Math.max(1,+el("br_touchWaitH").value||168);
      const expiryBars=Math.max(1,Math.round(+el("br_expiry").value||240));
      const minTr=Math.max(0,+el("br_min").value||0);
      const Ns=parseList(el("br_n").value,true,1);
      const slKs=parseList(el("br_sl").value,false,0);
      let tpKs=parseList(el("br_tp").value,false,0);
      if(tpMode==="ma")tpKs=[0];
      if(!Ns.length||!slKs.length||!tpKs.length)throw new Error("분할횟수·손절·익절 값을 1개 이상 입력하세요");
      const totalPer=Ns.length*slKs.length*tpKs.length;
      let total=0, skipped=[];
      const rows=[];
      for(const sym of syms){
        for(const tf of tfs){
          const ecf=findCsv(sym,tf);
          if(!ecf){ skipped.push(`${sym} ${tf}: CSV 없음`); continue; }
          const entryBars=await loadCsv(ecf);
          if(entryBars.length<maLen+20){ skipped.push(`${sym} ${tf}: 봉 수 부족`); continue; }
          status(`${sym} ${tf} 셋업 추출 중…`);
          const ma=sma(entryBars.map(b=>b.c),maLen);
          const avgRng=rollMeanRange(entryBars,100);
          const {setups,stats}=makeSetups(entryBars,ma,avgRng,{tf,dir,maLen,gapPct,trHours,newsHours,newsMult,touchWaitH,fromT,toT});
          total+=totalPer;
          status(`${sym} ${tf} 엔진 실행 · 셋업 ${setups.length}개 · ${totalPer}조합…`);
          for(const N of Ns)for(const slK of slKs)for(const tpK of tpKs){
            const r=backtest(entryBars,ma,setups,N,slK,tpK,expiryBars,tpMode,dir);
            r.sym=sym; r.tf=tf; r.label=`${sym} · ${tf}`; r.setups=setups.length; r.armed=stats.armed; r.touch=stats.touch; r.tpMode=tpMode; r.dir=dir;
            if(r.trades>=minTr)rows.push(r);
          }
          await pause();
        }
      }
      RESULTS=rows;
      status(`완료 · 표시 ${rows.length}/${total}조합(최소거래 ${minTr})${skipped.length?` · 건너뜀: ${skipped.join(", ")}`:""}`);
      render();
    }catch(e){ err("⚠ "+e.message); status(""); }
    finally{ btn.disabled=false; }
  }

  async function runRandom(){
    err("");
    el("br_rnd").disabled=true; el("br_run").disabled=true;
    try{
      const syms=selectedSyms(), tfs=selectedTfs();
      if(!syms.length||!tfs.length)throw new Error("심볼·진입분봉을 1개 이상 선택하세요");
      const months=Math.max(1,Math.round(+el("br_rndMonths").value||3));
      const reps=Math.max(1,Math.round(+el("br_rndReps").value||10));
      const winMs=months*30.44*24*60*60*1000;
      const dir=el("br_dir").value||"long";
      const maLen=Math.max(2,Math.round(+el("br_maLen").value||120));
      const gapPct=Math.max(0,(+el("br_gap").value||1.5)/100);
      const trHours=Math.max(1,+el("br_trHours").value||12);
      const newsHours=Math.max(trHours,+el("br_newsHours").value||24);
      const newsMult=Math.max(1,+el("br_newsMult").value||3);
      const tpMode=el("br_tpMode").value||"avg";
      const touchWaitH=Math.max(1,+el("br_touchWaitH").value||168);
      const expiryBars=Math.max(1,Math.round(+el("br_expiry").value||240));
      const Ns=parseList(el("br_n").value,true,1);
      const slKs=parseList(el("br_sl").value,false,0);
      let tpKs=parseList(el("br_tp").value,false,0);
      if(tpMode==="ma")tpKs=[0];
      if(!Ns.length||!slKs.length||!tpKs.length)throw new Error("분할·손절·익절 값을 1개 이상 입력하세요");
      const rows=[]; const skipped=[];
      const fmtD=t=>new Date(t).toISOString().slice(0,10);
      for(const sym of syms){
        for(const tf of tfs){
          const ecf=findCsv(sym,tf); if(!ecf){ skipped.push(`${sym} ${tf}:CSV없음`); continue; }
          const bars=await loadCsv(ecf);
          if(bars.length<maLen+50){ skipped.push(`${sym} ${tf}:봉부족`); continue; }
          const ma=sma(bars.map(b=>b.c),maLen);
          const avgRng=rollMeanRange(bars,100);
          const t0=bars[0].t, tN=bars[bars.length-1].t;
          if(tN-t0 < winMs*1.2){ skipped.push(`${sym} ${tf}:기간짧음`); continue; }
          for(let rep=0;rep<reps;rep++){
            const fromT=t0 + Math.random()*((tN-winMs)-t0);
            const toT=fromT+winMs;
            const {setups}=makeSetups(bars,ma,avgRng,{tf,dir,maLen,gapPct,trHours,newsHours,newsMult,touchWaitH,fromT,toT});
            let best=null;
            for(const N of Ns)for(const slK of slKs)for(const tpK of tpKs){
              const r=backtest(bars,ma,setups,N,slK,tpK,expiryBars,tpMode,dir);
              if(r.trades>=5 && r.mdd<0 && (!best || r.mar>best.mar)) best={...r};
            }
            rows.push({sym,tf,dir,tpMode,fromS:fmtD(fromT),toS:fmtD(toT),setups:setups.length,best});
            status(`${sym} ${tf} 랜덤 ${rep+1}/${reps} 구간…`);
            await pause();
          }
        }
      }
      renderRandom(rows,{months,reps,dir,skipped});
    }catch(e){ err("⚠ "+e.message); status(""); }
    finally{ el("br_rnd").disabled=false; el("br_run").disabled=false; }
  }

  function renderRandom(rows,meta){
    const wrap=el("br_results");
    if(!rows.length){ wrap.innerHTML=`<div class="placeholder"><div class="big">결과 없음</div><div class="mono" style="font-size:12px">기간이 너무 짧거나 심볼 미선택</div></div>`; return; }
    const valid=rows.filter(r=>r.best);
    const sorted=rows.slice().sort((a,b)=>((b.best?b.best.mar:-99))-((a.best?a.best.mar:-99)));
    const pos=valid.filter(r=>r.best.totalRet>0).length;
    const mars=valid.map(r=>r.best.mar).sort((a,b)=>a-b);
    const med=mars.length?mars[Math.floor(mars.length/2)]:0;
    const avg=mars.length?mars.reduce((s,x)=>s+x,0)/mars.length:0;
    const tpLab=r=>r.tpMode==="ma"?"120복귀":r.best.tpK+"KR";
    const trRows=sorted.map(r=>{
      if(!r.best) return `<tr><td class="mono dimv">${r.fromS}~${r.toS}</td><td class="mono dimv">${r.sym}·${r.tf}</td><td class="num dimv" colspan="6">거래부족(셋업 ${r.setups})</td></tr>`;
      const b=r.best;
      return `<tr style="${b.totalRet>0?'':'opacity:.5'}">
        <td class="mono dimv">${r.fromS}~${r.toS}</td>
        <td class="mono dimv">${r.sym}·${r.tf}</td>
        <td class="num">${b.N}/${b.slK}/${tpLab(r)}</td>
        <td class="num ${b.totalRet>=0?'pos':'neg'}">${(b.totalRet>=0?'+':'')+(b.totalRet*100).toFixed(1)}%</td>
        <td class="num neg">${(b.mdd*100).toFixed(1)}%</td>
        <td class="num cy">${b.mar===Infinity?'∞':b.mar.toFixed(2)}</td>
        <td class="num">${(b.winrate*100).toFixed(0)}%</td>
        <td class="num dimv">${b.trades}</td>
      </tr>`;
    }).join("");
    wrap.innerHTML=`
      <div class="db-best">🎲 랜덤 ${meta.months}개월 × ${rows.length}구간 (${meta.dir==="short"?"숏":"롱"}) ·
        <b class="${pos>valid.length/2?'pos':'neg'}">수익 구간 ${pos}/${valid.length}</b> · 평균 MAR <b class="cy">${avg.toFixed(2)}</b> · 중앙 MAR <b class="cy">${med.toFixed(2)}</b>
        ${meta.skipped.length?` · 건너뜀: ${meta.skipped.join(", ")}`:""}</div>
      <div class="ctable-wrap"><table class="ctable"><thead><tr>
        <th><span class="th-main">기간</span><span class="th-sub">${meta.months}M WINDOW</span></th>
        <th><span class="th-main">데이터</span></th>
        <th><span class="th-main">최적 조합</span><span class="th-sub">N/SL/TP</span></th>
        <th><span class="th-main">수익</span></th><th><span class="th-main">MDD</span></th>
        <th><span class="th-main">MAR</span></th><th><span class="th-main">승률</span></th><th><span class="th-main">거래</span></th>
      </tr></thead><tbody>${trRows}</tbody></table></div>
      <div class="note" style="margin-top:14px">각 구간마다 입력한 격자에서 <b>구간 내 최적(MAR)</b> 조합을 뽑은 결과. <b class="pos">수익 구간 비율</b>이 높고 평균·중앙 MAR이 안정적이면 견고한 전략. 흐린 줄=손실 구간. <b>구간별 최적이라 실제 운용(고정 파라미터)보다 낙관적</b>인 점 감안.</div>`;
  }

  function render(){
    const wrap=el("br_results");
    if(!RESULTS.length){ wrap.innerHTML=`<div class="placeholder"><div class="big">조건에 맞는 조합이 없어요</div><div class="mono" style="font-size:12px">최소 거래수나 대기시간을 조정해보세요</div></div>`; return; }
    const rs=RESULTS.slice().sort((a,b)=>{
      const v=SORT.key==="label"
        ? String(a.label).localeCompare(String(b.label),"ko")
        : (SORT.key==="mar"?a.mar-b.mar:SORT.key==="totalRet"?a.totalRet-b.totalRet:SORT.key==="payoff"?a.payoff-b.payoff:SORT.key==="winrate"?a.winrate-b.winrate:SORT.key==="mdd"?a.mdd-b.mdd:SORT.key==="trades"?a.trades-b.trades:SORT.key==="N"?a.N-b.N:SORT.key==="slK"?a.slK-b.slK:SORT.key==="setups"?a.setups-b.setups:a.tpK-b.tpK);
      return SORT.dir*v;
    });
    const best=RESULTS.slice().sort((a,b)=>(b.mar===Infinity?1e9:b.mar)-(a.mar===Infinity?1e9:a.mar))[0];
    const bestRet=Math.max(...RESULTS.map(r=>r.totalRet));
    const bestMar=Math.max(...RESULTS.map(r=>r.mar===Infinity?-1:r.mar));
    const worstMdd=Math.min(...RESULTS.map(r=>r.mdd));
    const head=(k,main,sub)=>`<th class="br-sort" data-k="${k}"><span class="th-main">${main}${arrow(k)}</span>${sub?`<span class="th-sub">${sub}</span>`:""}</th>`;
    const rows=rs.map(r=>`<tr class="${r===best?'db-hot':''}">
      <td class="mono dimv">${r.label}</td>
      <td class="num">${r.N}</td>
      <td class="num">${r.slK}</td>
      <td class="num">${r.tpMode==="ma"?"120선":r.tpK}</td>
      <td class="num">${r.trades}</td>
      <td class="num">${(r.winrate*100).toFixed(0)}%</td>
      <td class="num ${r.payoff>=1?'pos':'neg'}">${payoffStr(r.payoff)}</td>
      <td class="num ${r.totalRet===bestRet?'hl-good':(r.totalRet>=0?'pos':'neg')}">${pct(r.totalRet)}</td>
      <td class="num ${r.mdd===worstMdd?'hl-bad':'neg'}">${(r.mdd*100).toFixed(1)}%</td>
      <td class="num ${r.mar===bestMar&&r.mar!==Infinity?'hl-good':'cy'}">${marStr(r.mar)}</td>
      <td class="num dimv">${r.tpC}/${r.slC}${r.eodC?"/"+r.eodC:""}</td>
      <td class="num dimv">${r.setups}</td>
    </tr>`).join("");
    wrap.innerHTML=`
      <div class="db-best">최적 조합(MAR) · <b class="amb">${best.label} · ${best.dir==="short"?"숏":"롱"} · ${best.N}분할 · 손절 ${best.slK}KR · 익절 ${best.tpMode==="ma"?"120선복귀":best.tpK+"KR"}</b>
        → 총수익 <b class="${best.totalRet>=0?'pos':'neg'}">${pct(best.totalRet)}</b> · MDD <b class="neg">${(best.mdd*100).toFixed(1)}%</b> · MAR <b class="cy">${marStr(best.mar)}</b> · 거래 ${best.trades} · 승률 ${(best.winrate*100).toFixed(0)}%</div>
      <div class="ctable-wrap"><table class="ctable"><thead><tr>
        ${head("label","데이터","TF")}${head("N","분할","N")}${head("slK","손절","×KR")}${head("tpK","익절","×KR")}
        ${head("trades","거래","TRADES")}${head("winrate","승률","WIN")}${head("payoff","손익비","PAYOFF")}
        ${head("totalRet","총수익","RETURN")}${head("mdd","최대낙폭","MDD")}${head("mar","위험대비","MAR")}
        <th><span class="th-main">청산</span><span class="th-sub">TP/SL/E</span></th>${head("setups","셋업","120 touch")}
      </tr></thead><tbody>${rows}</tbody></table></div>
      <div class="note" style="margin-top:14px"><b class="hl-good">초록</b>=최고 총수익/MAR · <b class="hl-bad">빨강</b>=최대 낙폭 · 호박색 줄=MAR 최적 · KR=최근 N시간 최대 봉(뉴스봉은 24h 지속) · 셋업=이격 무장 뒤 120선 첫 터치 발생 수.</div>`;
    wrap.querySelectorAll(".br-sort").forEach(th=>th.onclick=()=>{
      const k=th.dataset.k;
      if(SORT.key===k)SORT.dir*=-1; else{ SORT.key=k; SORT.dir=(k==="mdd"||k==="label"?1:-1); }
      render();
    });
  }

  $$("#br_syms button").forEach(b=>b.onclick=()=>b.classList.toggle("on"));
  el("br_run").onclick=run;
  el("br_rnd").onclick=runRandom;
})();

/* ===== PAPER TRADE ===== */
(function(){
  function bandBand(series,period,mult,up){
    const n=series.length, out=new Array(n).fill(null);
    for(let i=period-1;i<n;i++){
      let s=0; for(let k=i-period+1;k<=i;k++)s+=series[k];
      const m=s/period; let v=0;
      for(let k=i-period+1;k<=i;k++){const d=series[k]-m; v+=d*d;}
      out[i]=m+(up?1:-1)*mult*Math.sqrt(v/period);
    }
    return out;
  }
  function doubleUpper(bars){
    const u1=bandBand(bars.map(b=>b.o),4,4,true);
    const u2=bandBand(bars.map(b=>b.c),20,2,true);
    return bars.map((_,i)=>(u1[i]==null||u2[i]==null)?null:Math.max(u1[i],u2[i]));
  }
  function doubleLower(bars){
    const l1=bandBand(bars.map(b=>b.o),4,4,false);
    const l2=bandBand(bars.map(b=>b.c),20,2,false);
    return bars.map((_,i)=>(l1[i]==null||l2[i]==null)?null:Math.min(l1[i],l2[i]));
  }
  function ptSim(bars,upper,lower,o){
    const {direction,entryMode,N,numTR,lots,slK,tpK,tpMode,expiryM,useConfirm,confW,contract,startBal}=o;
    const isShort=direction==="short";
    const n=bars.length, ledger=[];
    let bal=startBal,peak=startBal,maxDD=0,maxDDpct=0;
    let wins=0,losses=0,tpC=0,slC=0,eodC=0,confSkip=0,grossWin=0,grossLoss=0,totLots=0,maxPos=0;
    let i=1;
    while(i<n){
      const band=isShort?lower:upper;
      const u=band[i],up1=band[i-1];
      if(u==null||up1==null){i++;continue;}
      if(isShort){ if(!(bars[i].c<u && bars[i-1].c>=up1)){i++;continue;} }
      else        { if(!(bars[i].c>u && bars[i-1].c<=up1)){i++;continue;} }
      const H=bars[i].h,L=bars[i].l,TR=H-L;
      if(TR<=0){i++;continue;}
      let start=i;
      if(useConfirm){
        let conf=-1;
        for(let j=i+1;j<n && j<=i+confW;j++){
          if(isShort?bars[j].c<bars[i].c:bars[j].c>bars[i].c){conf=j;break;}
        }
        if(conf<0){ confSkip++; i++; continue; }
        start=conf;
      }
      const orders=[];
      if(isShort){
        if(entryMode==="tr"){ for(let k=0;k<numTR;k++) orders.push({p:L+k*TR,lot:lots[k]||0,filled:false}); }
        else { for(let k=0;k<N;k++) orders.push({p:N===1?L:L+(H-L)*k/(N-1),lot:lots[k]||0,filled:false}); }
      } else {
        if(entryMode==="tr"){ for(let k=0;k<numTR;k++) orders.push({p:H-k*TR,lot:lots[k]||0,filled:false}); }
        else { for(let k=0;k<N;k++) orders.push({p:N===1?H:H-(H-L)*k/(N-1),lot:lots[k]||0,filled:false}); }
      }
      const SL=isShort
        ? Math.max(...orders.map(o=>o.p)) + slK*TR
        : Math.min(...orders.map(o=>o.p)) - slK*TR;
      let fLots=0,fCnt=0,wsum=0,exited=false,exitPx=0,reason="",exitIdx=-1;
      for(let j=start+1;j<n;j++){
        const b=bars[j];
        if(isShort){ for(const ord of orders){ if(!ord.filled && b.h>=ord.p){ord.filled=true;fCnt++;fLots+=ord.lot;wsum+=ord.p*ord.lot;} } }
        else        { for(const ord of orders){ if(!ord.filled && b.l<=ord.p){ord.filled=true;fCnt++;fLots+=ord.lot;wsum+=ord.p*ord.lot;} } }
        if(fLots<=0){ if(j-start>=expiryM)break; else continue; }
        const avg=wsum/fLots;
        if(isShort){
          const TP=tpMode==="avg"?avg-tpK*TR:L-tpK*TR;
          if(b.h>=SL){exited=true;exitPx=SL;reason="SL";exitIdx=j;break;}
          if(b.l<=TP){exited=true;exitPx=TP;reason="TP";exitIdx=j;break;}
        } else {
          const TP=tpMode==="avg"?avg+tpK*TR:H+tpK*TR;
          if(b.l<=SL){exited=true;exitPx=SL;reason="SL";exitIdx=j;break;}
          if(b.h>=TP){exited=true;exitPx=TP;reason="TP";exitIdx=j;break;}
        }
      }
      if(fLots<=0){i++;continue;}
      if(!exited){exitPx=bars[n-1].c;reason="EOD";exitIdx=n-1;}
      const avg=wsum/fLots;
      const pnl=isShort ? fLots*contract*(avg-exitPx) : fLots*contract*(exitPx-avg);
      bal+=pnl; totLots+=fLots; if(fLots>maxPos)maxPos=fLots;
      if(bal>peak)peak=bal;
      const dd=bal-peak; if(dd<maxDD)maxDD=dd;
      const ddp=peak>0?(bal-peak)/peak:0; if(ddp<maxDDpct)maxDDpct=ddp;
      if(pnl>=0){wins++;grossWin+=pnl;}else{losses++;grossLoss+=Math.abs(pnl);}
      if(reason==="TP")tpC++;else if(reason==="SL")slC++;else eodC++;
      ledger.push({entry:bars[i].date,exit:bars[exitIdx].date,avg,lots:fLots,cnt:fCnt,exitPx,reason,pnl,bal});
      i=exitIdx+1;
    }
    const trades=ledger.length, netPnl=bal-startBal;
    const pf=grossLoss>0?grossWin/grossLoss:(grossWin>0?Infinity:0);
    return {ledger,startBal,finalBal:bal,netPnl,retPct:startBal>0?netPnl/startBal:0,
      maxDD,maxDDpct,trades,wins,losses,winrate:trades?wins/trades:0,pf,tpC,slC,eodC,confSkip,
      avgWin:wins?grossWin/wins:0,avgLoss:losses?grossLoss/losses:0,totLots,maxPos};
  }
  function parseMT5(text){
    const lines=text.split(/\r?\n/), out=[];
    const start=/date|open|time/i.test(lines[0]||"")?1:0;
    for(let i=start;i<lines.length;i++){
      const ln=lines[i].trim(); if(!ln)continue;
      const p=ln.split(/[\t,;]+/); if(p.length<5)continue;
      const d=p[0].replace(/\./g,"-").replace(/\//g,"-").slice(0,10);
      const hasTime=/:/.test(p[1]||""); const oi=hasTime?2:1;
      const o=+p[oi],h=+p[oi+1],l=+p[oi+2],c=+p[oi+3];
      if(!isFinite(o)||!isFinite(h)||!isFinite(l)||!isFinite(c)||c<=0)continue;
      out.push({day:d,date:d+" "+(hasTime?p[1]:"00:00:00"),o,h,l,c});
    }
    if(out.length<2)throw new Error("CSV에서 유효한 OHLC 행을 못 찾음");
    return out;
  }
  function groupByDay(bars){ const m={},order=[]; for(const b of bars){ if(!m[b.day]){m[b.day]=[];order.push(b.day);} m[b.day].push(b);} return {m,order}; }
  function agg(g){ let h=-Infinity,l=Infinity; for(const x of g){ if(x.h>h)h=x.h; if(x.l<l)l=x.l; } return {day:g[0].day,date:g[0].date,o:g[0].o,h,l,c:g[g.length-1].c}; }
  function intradayOnly(bars){ const {m}=groupByDay(bars); return bars.filter(b=>m[b.day].length>1); }
  function resampleN(bars,nn){ const {m,order}=groupByDay(bars); const out=[]; for(const d of order){const a=m[d]; for(let k=0;k<a.length;k+=nn)out.push(agg(a.slice(k,k+nn)));} return out; }
  function resampleDaily(bars){ const {m,order}=groupByDay(bars); return order.map(d=>agg(m[d])); }
  function buildTF_MT5(raw,tf){
    if(tf==="5m")return intradayOnly(raw);
    if(tf==="10m")return resampleN(intradayOnly(raw),2);
    if(tf==="1h")return resampleN(intradayOnly(raw),12);
    return resampleDaily(raw);
  }
  async function fetchYahoo(sym,interval,from,to){
    const u=`${PROXY}/?yahoo=${encodeURIComponent(sym)}&from=${from}&to=${to}&interval=${interval}`;
    const r=await fetch(u); const j=await r.json();
    if(!r.ok||!j.data)throw new Error(j.error||("프록시 오류 "+r.status));
    return j.data.map(x=>({day:String(x.date).slice(0,10),date:String(x.date),o:+x.o,h:+x.h,l:+x.l,c:+x.c}));
  }
  function daysAgo(n){ const d=new Date(); d.setDate(d.getDate()-n); return d.toISOString().slice(0,10); }

  let RAWCACHE={}, RAWLABEL="", LAST=null, EMODE="n", DIRECTION="long";
  const el=id=>document.getElementById(id);
  if(!el("pt_run"))return;

  function setSrc(s){
    $$("#pt_src button").forEach(b=>b.classList.toggle("on",b.dataset.s===s));
    el("pt_src").dataset.cur=s;
    el("pt_storedRow").style.display = s==="stored"?"":"none";
    el("pt_uploadRow").style.display = s==="upload"?"":"none";
    el("pt_yahooRow").style.display  = s==="yahoo"?"":"none";
    el("pt_tfrow").style.display     = s==="stored"?"none":"";
  }
  function setTpMode(m){ $$("#pt_tpmode button").forEach(b=>b.classList.toggle("on",b.dataset.m===m)); el("pt_tpmode").dataset.cur=m; }
  function setStrat(x){ $$("#pt_strat button").forEach(b=>b.classList.toggle("on",b.dataset.x===x)); el("pt_strat").dataset.cur=x; el("pt_confwRow").style.display = x==="confirm"?"":"none"; }
  function setDir(d){
    DIRECTION=d;
    $$("#pt_dir button").forEach(b=>b.classList.toggle("on",b.dataset.d===d));
    el("pt_dir").dataset.cur=d;
    el("pt_emode_label").textContent=d==="short"?"매도 방식":"매수 방식";
    setEmode(EMODE);
  }
  function setEmode(e){
    EMODE=e;
    $$("#pt_emode button").forEach(b=>b.classList.toggle("on",b.dataset.e===e));
    el("pt_emode").dataset.cur=e;
    el("pt_nrow").style.display = e==="n"?"":"none";
    el("pt_trrow").style.display= e==="tr"?"":"none";
    const isS=DIRECTION==="short";
    el("pt_emode_hint").textContent = e==="tr"
      ?(isS?"1차=저가, 2차=저가+TR, 3차=저가+2TR … 손절은 마지막 매도가 위"
           :"1차=고가, 2차=고가−TR, 3차=고가−2TR … 손절은 마지막 매수가 아래")
      :(isS?"저가~고가를 N등분해 각 가격에 지정가 매도"
           :"고가~저가를 N등분해 각 가격에 지정가 매수");
    buildLots();
  }
  function buildLots(){
    const isT=EMODE==="tr";
    const cnt=Math.max(1,Math.min(12,Math.round(isT?(+el("pt_trN").value||3):(+el("pt_N").value||3))));
    const cont=el("pt_lots");
    const prev={}; cont.querySelectorAll("input").forEach(inp=>prev[inp.dataset.k]=inp.value);
    let html="";
    for(let k=0;k<cnt;k++){
      const v=prev[k]!==undefined?prev[k]:"0.01";
      const tag=k===0?" (고가)":(isT?"":(k===cnt-1?" (저가)":""));
      html+=`<span style="display:inline-flex;flex-direction:column;width:92px;margin:0 8px 8px 0">
        <label style="font-size:10px;color:var(--ink-faint);margin-bottom:2px">${k+1}차${tag}</label>
        <input data-k="${k}" class="mono" type="number" step="0.01" min="0" value="${v}" style="width:100%"></span>`;
    }
    cont.innerHTML=html;
    cont.querySelectorAll("input").forEach(inp=>inp.oninput=sumLots);
    sumLots();
  }
  function sumLots(){
    let s=0; el("pt_lots").querySelectorAll("input").forEach(inp=>s+=(+inp.value||0));
    const c=+el("pt_contract").value||100;
    el("pt_lotsum").textContent=`최대 동시 보유 = ${s.toFixed(2)}랏 (1랏=${c}온스 · $1 움직임당 $${(s*c).toFixed(2)})`;
  }
  function readLots(){ return [...el("pt_lots").querySelectorAll("input")].map(inp=>+inp.value||0); }
  function err(msg){ el("pt_err").textContent=msg||""; }
  function status(msg){ el("pt_status").textContent=msg||""; }

  async function loadData(){
    const src=el("pt_src").dataset.cur;
    if(src==="yahoo"){
      const sym=el("pt_sym").value.trim(); if(!sym)throw new Error("야후 티커를 입력하세요");
      const tf=el("pt_tf").value;
      const from=el("pt_from").value, to=el("pt_to").value;
      status(`야후 ${sym} ${tf} 불러오는 중…`);
      if(tf==="10m"){ const b5=await fetchYahoo(sym,"5m",from,to); return resampleN(b5,2); }
      return fetchYahoo(sym, tf==="1d"?"1d":tf==="1h"?"60m":"5m", from, to);
    }
    if(src==="upload"){
      if(!RAWCACHE.__upload__)throw new Error("CSV 파일을 먼저 선택하세요");
      return buildTF_MT5(RAWCACHE.__upload__,el("pt_tf").value);
    }
    const idx=+el("pt_csv_sel").value;
    const cf=CSV_FILES[idx];
    if(!RAWCACHE[cf.file]){
      status(`${cf.sym} ${cf.tf} 불러오는 중…`);
      const r=await fetch(cf.file,{cache:"force-cache"});
      if(!r.ok)throw new Error(`${cf.file} 못 찾음(404). 레포 루트에 올렸는지 확인하세요.`);
      const parsed=parseMT5(await r.text());
      RAWCACHE[cf.file]=cf.raw?intradayOnly(parsed):parsed;
    }
    RAWLABEL=`${cf.sym} · ${cf.tf}`;
    return RAWCACHE[cf.file];
  }

  async function run(){
    err(""); LAST=null;
    const btn=el("pt_run"); btn.disabled=true;
    try{
      const emode=EMODE;
      const N   =Math.max(1,Math.min(12,Math.round(+el("pt_N").value||3)));
      const numTR=Math.max(1,Math.min(12,Math.round(+el("pt_trN").value||3)));
      const lots=readLots();
      if(lots.reduce((a,b)=>a+b,0)<=0)throw new Error("랏을 1개 이상(>0) 입력하세요");
      const o={
        direction:DIRECTION, entryMode:emode, N, numTR, lots,
        slK:Math.max(0,+el("pt_sl").value||0),
        tpK:Math.max(0,+el("pt_tp").value||0),
        tpMode:el("pt_tpmode").dataset.cur,
        expiryM:Math.max(1,+el("pt_expiry").value||20),
        useConfirm:el("pt_strat").dataset.cur==="confirm",
        confW:Math.max(1,+el("pt_confw").value||5),
        contract:Math.max(1,+el("pt_contract").value||100),
        startBal:Math.max(0,+el("pt_bal").value||10000)
      };
      const bars=await loadData();
      if(bars.length<60)throw new Error(`봉 수가 너무 적음(${bars.length}).`);
      status(`엔진 실행: ${bars.length.toLocaleString()}봉…`);
      const upper=doubleUpper(bars), lower=doubleLower(bars);
      const r=ptSim(bars,upper,lower,o);
      const src=el("pt_src").dataset.cur;
      const label=src==="stored"?RAWLABEL:(src==="upload"?(RAWCACHE.__uploadName__||"업로드"):el("pt_sym").value)||"데이터";
      const tf=src==="stored"?"":el("pt_tf").value;
      const span=bars[0].day+" ~ "+bars[bars.length-1].day;
      LAST={r,o,tf,span,label,bars:bars.length};
      status(`${label}${tf?" · "+tf:""} · ${bars.length.toLocaleString()}봉 · ${span}${o.useConfirm?` · 컨펌 ${o.confW}봉(폐기 ${r.confSkip})`:""}`);
      render();
    }catch(e){ err("⚠ "+e.message); status(""); }
    finally{ btn.disabled=false; }
  }

  function money(x){ const s=x<0?"-":""; return s+"$"+Math.abs(x).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function equitySVG(led,startBal){
    const pts=[startBal,...led.map(l=>l.bal)]; const n=pts.length; if(n<2)return "";
    let mn=Math.min(...pts),mx=Math.max(...pts); if(mn===mx){mn-=1;mx+=1;}
    const W=640,H=150,pad=5;
    const x=i=>pad+(W-2*pad)*i/(n-1);
    const y=v=>pad+(H-2*pad)*(1-(v-mn)/(mx-mn));
    const d=pts.map((v,i)=>`${i?'L':'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    const y0=y(startBal), up=pts[n-1]>=startBal;
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:150px;display:block;background:var(--input-bg);border:1px solid var(--border);border-radius:10px">
      <line x1="0" y1="${y0.toFixed(1)}" x2="${W}" y2="${y0.toFixed(1)}" stroke="#c8d6cf" stroke-dasharray="4 3"/>
      <path d="${d}" fill="none" stroke="${up?'#10b981':'#f43f5e'}" stroke-width="1.6"/></svg>`;
  }
  function render(){
    const wrap=el("pt_results");
    if(!LAST){ return; }
    const {r,o,tf,span,label}=LAST;
    if(!r.trades){ wrap.innerHTML=`<div class="placeholder"><div class="big">거래가 없어요</div><div class="mono" style="font-size:12px">기간·타임프레임·파라미터를 확인하세요${o.useConfirm?` (컨펌없어 폐기 ${r.confSkip}건)`:""}</div></div>`; return; }
    const tile=(lab,val,cls)=>`<div style="background:var(--input-bg);border:1px solid var(--border);border-radius:10px;padding:10px 12px">
      <div style="font-size:11px;color:var(--ink-faint)">${lab}</div>
      <div class="${cls||''}" style="font-size:18px;font-weight:700;margin-top:2px">${val}</div></div>`;
    const tiles=[
      tile("최종 잔고", money(r.finalBal), r.netPnl>=0?'pos':'neg'),
      tile("순손익", money(r.netPnl)+` (${r.retPct>=0?'+':''}${(r.retPct*100).toFixed(2)}%)`, r.netPnl>=0?'pos':'neg'),
      tile("최대 낙폭", money(r.maxDD)+` (${(r.maxDDpct*100).toFixed(2)}%)`, 'neg'),
      tile("거래수", r.trades, ''),
      tile("승률", (r.winrate*100).toFixed(1)+"%", ''),
      tile("손익비(PF)", r.pf===Infinity?"∞":r.pf.toFixed(2), r.pf>=1?'pos':'neg'),
      tile("평균이익 / 평균손실", money(r.avgWin)+" / "+money(r.avgLoss), ''),
      tile("청산 TP/SL/미청산", `${r.tpC}/${r.slC}/${r.eodC}`, '')
    ].join("");
    const rows=r.ledger.map((l,idx)=>{
      const rc=l.reason==="TP"?'pos':l.reason==="SL"?'neg':'dimv';
      const rt=l.reason==="TP"?"익절":l.reason==="SL"?"손절":"미청산";
      return `<tr>
        <td class="num dimv">${idx+1}</td>
        <td class="mono" style="font-size:11px">${l.entry.slice(0,16)}</td>
        <td class="mono" style="font-size:11px">${l.exit.slice(0,16)}</td>
        <td class="num">${l.avg.toFixed(2)}</td>
        <td class="num">${l.lots.toFixed(2)}<span class="dimv" style="font-size:10px">/${l.cnt}</span></td>
        <td class="num">${l.exitPx.toFixed(2)}</td>
        <td class="num ${rc}">${rt}</td>
        <td class="num ${l.pnl>=0?'pos':'neg'}">${money(l.pnl)}</td>
        <td class="num">${money(l.bal)}</td></tr>`;
    }).join("");
    const stratName=o.useConfirm?`더블비컨펌(컨펌 ${o.confW}봉)`:"더블비";
    const dirName=o.direction==="short"?"숏(매도)":"롱(매수)";
    const lotStr=o.lots.map(x=>x.toFixed(2)).join("/");
    const entryDesc=o.entryMode==="tr"?`TR${o.numTR}분할 랏 ${lotStr}`:`${o.N}등분 랏 ${lotStr}`;
    wrap.innerHTML=`
      <div class="db-best">${label}${tf?" · "+tf:""} · <b class="amb">${stratName}</b> · ${dirName} · ${entryDesc} · 손절 ${o.slK}TR · 익절 ${o.tpK}TR
        <span class="dimv">· 1랏=${o.contract}온스 · 시작 ${money(o.startBal)} · ${span}</span></div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:12px 0 14px">${tiles}</div>
      <div style="font-size:11px;color:var(--ink-faint);margin-bottom:4px">잔고 곡선 (점선=시작 잔고)</div>
      ${equitySVG(r.ledger,r.startBal)}
      <div style="font-size:11px;color:var(--ink-faint);margin:14px 0 4px">매매 내역 (${r.trades}건)</div>
      <div class="ctable-wrap" style="max-height:440px;overflow:auto"><table class="ctable"><thead><tr>
        <th><span class="th-main">#</span></th><th><span class="th-main">진입</span></th><th><span class="th-main">청산</span></th>
        <th><span class="th-main">평단</span></th><th><span class="th-main">랏</span><span class="th-sub">/체결수</span></th>
        <th><span class="th-main">청산가</span></th><th><span class="th-main">사유</span></th>
        <th><span class="th-main">손익</span></th><th><span class="th-main">잔고</span></th>
      </tr></thead><tbody>${rows}</tbody></table></div>
      <div class="note" style="margin-top:14px">고정 랏(복리 아님) · 손익=총 체결랏×${o.contract}온스×(청산가−평단) · 평단은 부분체결분만 · 수수료·스프레드 미반영. 랏열의 작은 숫자=체결된 차수 개수.</div>`;
  }

  function init(){
    CSV_FILES.forEach((cf,i)=>{
      const op=document.createElement("option");
      op.value=i; op.textContent=`${cf.sym} · ${cf.tf}  (${cf.file})`;
      el("pt_csv_sel").appendChild(op);
    });
    $$("#pt_src button").forEach(b=>b.onclick=()=>setSrc(b.dataset.s));
    $$("#pt_tpmode button").forEach(b=>b.onclick=()=>setTpMode(b.dataset.m));
    $$("#pt_strat button").forEach(b=>b.onclick=()=>setStrat(b.dataset.x));
    $$("#pt_dir button").forEach(b=>b.onclick=()=>setDir(b.dataset.d));
    $$("#pt_emode button").forEach(b=>b.onclick=()=>setEmode(b.dataset.e));
    el("pt_N").oninput=buildLots;
    el("pt_trN").oninput=buildLots;
    el("pt_contract").oninput=sumLots;
    el("pt_file").onchange=async e=>{
      const f=e.target.files[0]; if(!f)return;
      try{ RAWCACHE.__upload__=parseMT5(await f.text()); RAWCACHE.__uploadName__=f.name; status(`업로드됨: ${f.name} · ${RAWCACHE.__upload__.length.toLocaleString()}행`); err(""); }
      catch(ex){ err("⚠ "+ex.message); }
    };
    el("pt_reload").onclick=()=>{ RAWCACHE={}; RAWLABEL=""; status("캐시 비움 — 다시 돌리면 새로 불러옵니다"); };
    el("pt_run").onclick=run;
    el("pt_from").value=daysAgo(730); el("pt_to").value=today();
    setSrc("stored"); setTpMode("fixed"); setStrat("base"); setDir("long"); setEmode("n");
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init); else init();
})();

/* ===== REVERSAL DOUBLE-BB (변곡더블비) ===== */
(function(){
  const el=id=>document.getElementById(id);
  function bbSide(arr,period,mult,up){
    const out=new Array(arr.length).fill(null);
    for(let i=period-1;i<arr.length;i++){
      let s=0; for(let k=0;k<period;k++) s+=arr[i-k];
      const m=s/period; let v=0;
      for(let k=0;k<period;k++){const d=arr[i-k]-m;v+=d*d;}
      out[i]=m+(up?1:-1)*mult*Math.sqrt(v/period);
    }
    return out;
  }
  function calcDoubleLower(bars){
    const l1=bbSide(bars.map(b=>b.o),4,4,false);
    const l2=bbSide(bars.map(b=>b.c),20,2,false);
    return l1.map((v,i)=>v!==null&&l2[i]!==null?Math.min(v,l2[i]):null);
  }
  // 더블비 상단 = max(BB(시가,4,4σ), BB(종가,20,2σ)) — 기존 더블비 전략과 동일.
  // (종가 기준 4,4σ는 종가가 자기 밴드를 못 넘어 신호가 절대 안 나오므로 시가 기준 사용)
  function calcDoubleUpper(bars){
    const u1=bbSide(bars.map(b=>b.o),4,4,true);
    const u2=bbSide(bars.map(b=>b.c),20,2,true);
    return u1.map((v,i)=>v!==null&&u2[i]!==null?Math.max(v,u2[i]):null);
  }
  function calcTR(bars){
    return bars.map((b,i)=>{
      if(i===0)return b.h-b.l;
      const pc=bars[i-1].c;
      return Math.max(b.h-b.l,Math.abs(b.h-pc),Math.abs(b.l-pc));
    });
  }
  function calcRSI(bars,period){
    const n=bars.length, rsi=new Array(n).fill(null);
    if(n<=period)return rsi;
    let ag=0,al=0;
    for(let i=1;i<=period;i++){const d=bars[i].c-bars[i-1].c; if(d>0)ag+=d; else al-=d;}
    ag/=period; al/=period;
    rsi[period]=al===0?100:100-100/(1+ag/al);
    for(let i=period+1;i<n;i++){
      const d=bars[i].c-bars[i-1].c;
      ag=(ag*(period-1)+Math.max(d,0))/period;
      al=(al*(period-1)+Math.max(-d,0))/period;
      rsi[i]=al===0?100:100-100/(1+ag/al);
    }
    return rsi;
  }
  function calcSMA(arr,n){
    const out=new Array(arr.length).fill(null); let s=0;
    for(let i=0;i<arr.length;i++){
      s+=arr[i]; if(i>=n)s-=arr[i-n];
      if(i>=n-1)out[i]=s/n;
    }
    return out;
  }
  function detectSignals(bars,lower,upper,tr,rsi,pivotLookahead,lowBreakK,boxMinBars,maxWaitBars,entryMode,maArr){
    const sigs=[];
    for(let dbIdx=1;dbIdx<bars.length;dbIdx++){
      if(lower[dbIdx]===null||lower[dbIdx-1]===null)continue;
      if(!(bars[dbIdx].c<lower[dbIdx]&&bars[dbIdx-1].c>=lower[dbIdx-1]))continue;
      if(maArr&&(maArr[dbIdx]===null||bars[dbIdx].c>=maArr[dbIdx]))continue;
      const searchEnd=Math.min(bars.length-1,dbIdx+pivotLookahead);
      let pivotIdx=dbIdx, pivotLow=bars[dbIdx].l;
      for(let j=dbIdx+1;j<=searchEnd;j++){
        if(bars[j].l<pivotLow){pivotLow=bars[j].l;pivotIdx=j;}
      }
      const allowedBreak=tr[pivotIdx]*lowBreakK;
      const breakLevel=pivotLow-allowedBreak;
      const waitEnd=Math.min(bars.length-2,pivotIdx+maxWaitBars);
      let minLow=Infinity;
      for(let i=pivotIdx+1;i<=waitEnd;i++){
        minLow=Math.min(minLow,bars[i].l);
        if(minLow<breakLevel)break;
        if(i<pivotIdx+boxMinBars)continue;
        if(upper[i]===null)continue;
        if(bars[i].c<=upper[i])continue;
        const entryIdx=entryMode==="nextOpen"?i+1:i;
        if(entryIdx>=bars.length)continue;
        const entryPrice=entryMode==="nextOpen"?bars[entryIdx].o:bars[i].c;
        const rsiDiv=(rsi[pivotIdx]!==null&&rsi[dbIdx]!==null)?rsi[pivotIdx]>rsi[dbIdx]:null;
        sigs.push({dbIdx,pivotIdx,signalIdx:i,entryIdx,entryPrice,pivotLow,rsiDiv});
        break;
      }
    }
    return sigs;
  }
  function backtest(bars,sigs,tr,slK,tpK,expiryBars){
    const trades=[];
    let equity=1,peak=1,maxDD=0,wins=0,sumWin=0,sumLoss=0;
    for(const sig of sigs){
      const {entryIdx,entryPrice,pivotLow,signalIdx}=sig;
      const sigTR=tr[signalIdx];
      const sl=pivotLow-slK*sigTR;
      const tp=entryPrice+tpK*sigTR;
      const expire=Math.min(bars.length-1,entryIdx+expiryBars);
      let exitPx=null,exitReason="EXPIRE";
      for(let j=entryIdx+1;j<=expire;j++){
        const b=bars[j];
        if(b.l<=sl){exitPx=sl;exitReason="SL";break;}
        if(b.h>=tp){exitPx=tp;exitReason="TP";break;}
      }
      if(exitPx===null)exitPx=bars[expire].c;
      const ret=(exitPx-entryPrice)/entryPrice;
      equity*=(1+ret);
      if(equity>peak)peak=equity;
      const dd=equity/peak-1; if(dd<maxDD)maxDD=dd;
      if(ret>0){wins++;sumWin+=ret;}else{sumLoss+=Math.abs(ret);}
      trades.push({date:bars[signalIdx].date||bars[signalIdx].day,entryPrice,exitPrice:exitPx,sl,tp,ret,won:exitReason==="TP",exitReason,rsiDiv:sig.rsiDiv});
    }
    const cnt=trades.length;
    if(!cnt)return{trades,cnt,winRate:0,pf:0,totalRet:0,mdd:0,mar:0};
    const losses=cnt-wins;
    const avgWin=wins?sumWin/wins:0,avgLoss=losses?sumLoss/losses:0;
    const pf=avgLoss>0?avgWin/avgLoss:(avgWin>0?Infinity:0);
    const totalRet=equity-1;
    const mar=maxDD<0?totalRet/Math.abs(maxDD):(totalRet>0?Infinity:0);
    return{trades,cnt,winRate:wins/cnt,pf,totalRet,mdd:maxDD,mar};
  }
  function parseMT5local(text){
    const lines=text.split(/\r?\n/),out=[];
    const start=/date|open|time/i.test(lines[0]||"")?1:0;
    for(let i=start;i<lines.length;i++){
      const ln=lines[i].trim(); if(!ln)continue;
      const p=ln.split(/[\t,;]+/); if(p.length<5)continue;
      const d=p[0].replace(/\./g,"-").replace(/\//g,"-").slice(0,10);
      const hasT=/:/.test(p[1]||""); const oi=hasT?2:1;
      const o=+p[oi],h=+p[oi+1],l=+p[oi+2],c=+p[oi+3];
      if(!isFinite(o)||!isFinite(h)||!isFinite(l)||!isFinite(c)||c<=0)continue;
      out.push({day:d,date:d+" "+(hasT?p[1]:"00:00:00"),o,h,l,c});
    }
    if(out.length<2)throw new Error("CSV에서 유효한 OHLC 행을 못 찾음");
    return out;
  }
  function groupByDay(bars){const m={},order=[];for(const b of bars){if(!m[b.day]){m[b.day]=[];order.push(b.day);}m[b.day].push(b);}return{m,order};}
  function aggBars(g){let h=-Infinity,l=Infinity;for(const x of g){if(x.h>h)h=x.h;if(x.l<l)l=x.l;}return{day:g[0].day,date:g[0].date,o:g[0].o,h,l,c:g[g.length-1].c};}
  function intradayOnly(bars){const{m}=groupByDay(bars);return bars.filter(b=>m[b.day].length>1);}
  function resampleN(bars,nn){const{m,order}=groupByDay(bars);const out=[];for(const d of order){const a=m[d];for(let k=0;k<a.length;k+=nn)out.push(aggBars(a.slice(k,k+nn)));}return out;}
  function resampleDaily(bars){const{m,order}=groupByDay(bars);return order.map(d=>aggBars(m[d]));}
  function buildTF(raw,tf){
    if(tf==="5m")return intradayOnly(raw);
    if(tf==="10m")return resampleN(intradayOnly(raw),2);
    if(tf==="1h")return resampleN(intradayOnly(raw),12);
    return resampleDaily(raw);
  }
  let RAWCACHE={}, RESULTS=[], SORT={key:"mar",dir:-1};
  function parseList(str,intOnly,minV){
    return String(str).split(/[,\s]+/).map(x=>+x).filter(x=>isFinite(x)&&x>=(minV||0)&&(!intOnly||Number.isInteger(x)));
  }
  function errMsg(msg){el("revdb_err").textContent=msg||"";}
  function statusMsg(msg){el("revdb_status").textContent=msg||"";}
  async function loadSources(){
    const src=el("revdb_src").dataset.cur;
    if(src==="upload"){
      if(!RAWCACHE.__upload__)throw new Error("CSV 파일을 먼저 선택하세요");
      return[{label:RAWCACHE.__uploadName__||"업로드",bars:buildTF(RAWCACHE.__upload__,el("revdb_tf").value)}];
    }
    if(src==="yahoo"){
      const sym=el("revdb_sym").value.trim(); if(!sym)throw new Error("야후 티커를 입력하세요");
      const from=el("revdb_from").value,to=el("revdb_to").value;
      statusMsg(`야후 ${sym} 불러오는 중…`);
      const u=`${PROXY}/?yahoo=${encodeURIComponent(sym)}&from=${from}&to=${to}&interval=5m`;
      const r=await fetch(u); const j=await r.json();
      if(!r.ok||!j.data)throw new Error(j.error||"프록시 오류 "+r.status);
      const raw=j.data.map(x=>({day:String(x.date).slice(0,10),date:String(x.date),o:+x.o,h:+x.h,l:+x.l,c:+x.c}));
      return[{label:sym,bars:buildTF(raw,el("revdb_tf").value)}];
    }
    const picks=selectedCsvFiles("revdb");
    if(!picks.length)throw new Error("비교할 저장 CSV를 1개 이상 체크하세요");
    const out=[];
    for(const cf of picks){
      if(!RAWCACHE[cf.file]){
        statusMsg(`${cf.sym} ${cf.tf} 불러오는 중…`);
        const r=await fetch(cf.file,{cache:"force-cache"});
        if(!r.ok)throw new Error(`${cf.file} 못 찾음(404)`);
        const parsed=parseMT5local(await r.text());
        RAWCACHE[cf.file]=cf.raw?intradayOnly(parsed):parsed;
      }
      out.push({label:`${cf.sym}·${cf.tf}`,file:cf.file,bars:RAWCACHE[cf.file]});
    }
    return out;
  }
  async function run(){
    errMsg(""); RESULTS=[];
    const btn=el("revdb_run"); btn.disabled=true;
    try{
      const maFilter=Math.max(0,+el("revdb_ma").value||0);
      const pivotLookaheads=parseList(el("revdb_pivot").value,true,1);
      const lowBreakKs=parseList(el("revdb_lbk").value,false,0);
      const boxMinBarsList=parseList(el("revdb_bmb").value,true,1);
      const maxWait=Math.max(5,+el("revdb_wait").value||50);
      const slKs=parseList(el("revdb_sl").value,false,0);
      const tpKs=parseList(el("revdb_tp").value,false,0);
      const expiryBars=Math.max(1,+el("revdb_expiry").value||50);
      const minTr=Math.max(0,+el("revdb_min").value||0);
      const entryMode=el("revdb_entry").dataset.cur||"close";
      if(!pivotLookaheads.length||!lowBreakKs.length||!boxMinBarsList.length||!slKs.length||!tpKs.length)
        throw new Error("파라미터 값을 하나 이상 입력하세요");
      const sources=await loadSources();
      const rows=[];
      const total=sources.length*pivotLookaheads.length*lowBreakKs.length*boxMinBarsList.length*slKs.length*tpKs.length;
      let combo=0;
      for(const src of sources){
        const bars=src.bars;
        const lower=calcDoubleLower(bars);
        const upper=calcDoubleUpper(bars);
        const tr=calcTR(bars);
        const rsi14=calcRSI(bars,14);
        const maArr=maFilter>0?calcSMA(bars.map(b=>b.c),maFilter):null;
        for(const pLook of pivotLookaheads){
          for(const lbK of lowBreakKs){
            for(const bmb of boxMinBarsList){
              const sigs=detectSignals(bars,lower,upper,tr,rsi14,pLook,lbK,bmb,maxWait,entryMode,maArr);
              for(const slK of slKs){
                for(const tpK of tpKs){
                  combo++;
                  if(combo%100===0){statusMsg(`${combo}/${total} 조합…`);await new Promise(r=>setTimeout(r,0));}
                  const res=backtest(bars,sigs,tr,slK,tpK,expiryBars);
                  if(res.cnt<minTr)continue;
                  rows.push({label:src.label,pLook,lbK,bmb,slK,tpK,...res});
                }
              }
            }
          }
        }
      }
      RESULTS=rows;
      statusMsg(`완료 — 유효 ${rows.length}개 / 전체 ${total}개 조합`);
      render();
    }catch(e){errMsg(e.message);statusMsg("");}
    finally{btn.disabled=false;}
  }
  function pctStr(x){return(x>=0?"+":"")+(x*100).toFixed(1)+"%";}
  function pf2(x){return x===Infinity?"∞":x.toFixed(2);}
  function arw(k){return SORT.key===k?(SORT.dir<0?" ▾":" ▴"):"";}
  function numCls(v,good,bad){return v>=good?"hl-good":v<=bad?"hl-bad":"";}
  function render(){
    const con=el("revdb_results");
    if(!RESULTS.length){
      con.innerHTML=`<div class="placeholder"><div class="big">결과가 없습니다</div><div class="mono">최소거래수를 낮추거나 범위를 넓혀보세요</div></div>`;
      return;
    }
    const key=SORT.key, dir=SORT.dir;
    const sorted=[...RESULTS].sort((a,b)=>{
      const va=isFinite(a[key])?a[key]:1e9*Math.sign(dir);
      const vb=isFinite(b[key])?b[key]:1e9*Math.sign(dir);
      return(vb-va)*dir;
    });
    const best=sorted[0];
    const CAP=300;
    const view=sorted.slice(0,CAP);
    const capNote=sorted.length>CAP?` <span class="dimv">· 상위 ${CAP}개만 표시 (전체 ${sorted.length.toLocaleString()}개)</span>`:"";
    function hdr(k,main,sub=""){return`<th class="db-sort revdb-s" data-k="${k}" style="cursor:pointer"><div class="th-main">${main}${arw(k)}</div>${sub?`<div class="th-sub">${sub}</div>`:""}</th>`;}
    let html=`<div class="db-best">최상위: <b>${best.label}</b> · pivot=${best.pLook} · lbK=${best.lbK} · box=${best.bmb} · SL=${best.slK} · TP=${best.tpK} → <span class="pos">${pctStr(best.totalRet)}</span> · MDD ${pctStr(best.mdd)} · MAR ${pf2(best.mar)}${capNote}</div>`;
    html+=`<div class="ctable-wrap"><table class="ctable"><thead><tr>
      <th><div class="th-main">데이터</div></th>
      ${hdr("pLook","Pivot봉")}${hdr("lbK","저점K")}${hdr("bmb","박스봉")}${hdr("slK","SL×TR")}${hdr("tpK","TP×TR")}
      ${hdr("cnt","거래수")}${hdr("winRate","승률")}${hdr("pf","손익비")}${hdr("totalRet","총수익률")}${hdr("mdd","MDD")}${hdr("mar","MAR")}
      <th><div class="th-main">내역</div></th>
    </tr></thead><tbody>`;
    view.forEach((r,i)=>{
      html+=`<tr class="${i===0?"db-hot":""}">
        <td class="name mono" style="font-size:12px">${r.label}</td>
        <td class="num">${r.pLook}</td><td class="num">${r.lbK}</td><td class="num">${r.bmb}</td>
        <td class="num">${r.slK}</td><td class="num">${r.tpK}</td>
        <td class="num">${r.cnt}</td>
        <td class="num ${numCls(r.winRate,0.55,0)}">${(r.winRate*100).toFixed(0)}%</td>
        <td class="num ${numCls(r.pf,1.5,1)}">${pf2(r.pf)}</td>
        <td class="num ${r.totalRet>0?"pos":"neg"}">${pctStr(r.totalRet)}</td>
        <td class="num neg">${pctStr(r.mdd)}</td>
        <td class="num ${numCls(r.mar,2,0)}">${pf2(r.mar)}</td>
        <td><button class="revdb-dtl" data-idx="${i}" style="padding:4px 9px;border:1px solid var(--cyan);background:rgba(8,145,178,.1);color:var(--cyan);border-radius:6px;font-size:11px;font-weight:700;cursor:pointer">▸내역</button></td>
      </tr>`;
    });
    html+=`</tbody></table></div><div id="revdb_detail_area" style="margin-top:20px"></div>`;
    con.innerHTML=html;
    con.querySelectorAll(".revdb-s").forEach(th=>th.onclick=()=>{
      const k=th.dataset.k;
      if(SORT.key===k)SORT.dir*=-1; else{SORT.key=k;SORT.dir=-1;}
      render();
    });
    con.querySelectorAll(".revdb-dtl").forEach(b=>b.onclick=()=>showDetail(view[+b.dataset.idx]));
  }
  function showDetail(r){
    const area=el("revdb_detail_area"); if(!area)return;
    const rsiO=r.trades.filter(t=>t.rsiDiv===true).length;
    const rsiAll=r.trades.filter(t=>t.rsiDiv!==null).length;
    let html=`<div class="sectitle">거래 내역 · ${r.label} · pivot=${r.pLook} lbK=${r.lbK} box=${r.bmb} SL=${r.slK} TP=${r.tpK} · RSI다이버전스 ${rsiO}/${rsiAll}건</div>
    <div class="ctable-wrap"><table class="ctable"><thead><tr>
      <th><div class="th-main">날짜(신호봉)</div></th>
      <th><div class="th-main">진입가</div></th><th><div class="th-main">청산가</div></th>
      <th><div class="th-main">SL</div></th><th><div class="th-main">TP</div></th>
      <th><div class="th-main">수익률</div></th><th><div class="th-main">결과</div></th>
      <th><div class="th-main">RSI다이버전스</div></th>
    </tr></thead><tbody>`;
    for(const t of r.trades){
      const res=t.exitReason==="TP"?'<span class="pos">익절</span>':t.exitReason==="SL"?'<span class="neg">손절</span>':'<span class="dimv">만료</span>';
      const rdiv=t.rsiDiv===true?'<span class="pos">O</span>':t.rsiDiv===false?'<span class="neg">X</span>':'<span class="dimv">-</span>';
      html+=`<tr>
        <td class="name mono" style="font-size:11px">${String(t.date).slice(0,16)}</td>
        <td class="num mono">${t.entryPrice.toFixed(2)}</td><td class="num mono">${t.exitPrice.toFixed(2)}</td>
        <td class="num mono">${t.sl.toFixed(2)}</td><td class="num mono">${t.tp.toFixed(2)}</td>
        <td class="num ${t.ret>0?"pos":"neg"}">${pctStr(t.ret)}</td>
        <td>${res}</td><td style="text-align:center">${rdiv}</td>
      </tr>`;
    }
    html+=`</tbody></table></div>`;
    area.innerHTML=html;
    area.scrollIntoView({behavior:"smooth"});
  }
  function setSrcMode(s){
    el("revdb_src").dataset.cur=s;
    el("revdb_src").querySelectorAll("button").forEach(b=>b.classList.toggle("on",b.dataset.s===s));
    el("revdb_storedRow").style.display=s==="stored"?"":"none";
    el("revdb_uploadRow").style.display=s==="upload"?"":"none";
    el("revdb_yahooRow").style.display=s==="yahoo"?"":"none";
    el("revdb_tfrow").style.display=s==="stored"?"none":"";
  }
  function init(){
    if(!el("revdb_run"))return;
    renderCsvChecks("revdb");
    el("revdb_src").querySelectorAll("button").forEach(b=>b.onclick=()=>setSrcMode(b.dataset.s));
    el("revdb_entry").querySelectorAll("button").forEach(b=>b.onclick=()=>{
      el("revdb_entry").querySelectorAll("button").forEach(x=>x.classList.toggle("on",x===b));
      el("revdb_entry").dataset.cur=b.dataset.m;
    });
    el("revdb_file").onchange=async e=>{
      const f=e.target.files[0]; if(!f)return;
      try{RAWCACHE.__upload__=parseMT5local(await f.text());RAWCACHE.__uploadName__=f.name.replace(/\.csv$/i,"");}
      catch(ex){errMsg("⚠ "+ex.message);}
    };
    el("revdb_reload").onclick=()=>{RAWCACHE={};statusMsg("캐시 비움");};
    el("revdb_from").value=(()=>{const d=new Date();d.setDate(d.getDate()-730);return d.toISOString().slice(0,10);})();
    el("revdb_to").value=today();
    el("revdb_run").onclick=run;
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init); else init();
})();
//__CHUNK_END__
