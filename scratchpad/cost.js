const path="scratchpad/revdb_ema.js"; // reuse funcs via require-like eval
const src=require("fs").readFileSync(path,"utf8").split("// ---------- 실행")[0];
eval(src);
const DS=[["XAU M5","XAUUSD.b_M5_202407010000_202606291240.csv",0.20],
["XAU M15","XAUUSD.b_M15_202407010000_202606290345.csv",0.20],
["XAU H1","XAUUSD.b_H1_202407010000_202606290300.csv",0.20],
["US100 M5","US100.b_M5_202501240655_202606290345.csv",0.5],
["US100 H1","US100.b_H1_202407010100_202606290300.csv",0.5]];
// cost = 왕복 비용(가격단위). 골드 ~0.20($ per oz ≈ 20pt), 나스닥 ~0.5pt 가정
const base={N:30,atrNear:1.0,slAtr:0.3,tpR:2.0,requireWeaker:true,swingW:2,maxHold:60};
const num=(x,d=2)=>(x==null||!isFinite(x))?"-":x.toFixed(d);
for(const [nm,f,cost] of DS){
  let bars;try{bars=loadCSV(f);}catch{continue;}
  for(const tpMode of ["R","up"]){
    const tr=backtest(bars,{...base,tpMode});
    // 비용을 R로 환산: 각 트레이드 risk로 나눔
    let tot=0,w=0;const adj=[];
    for(const t of tr){const c=cost/(t.entry-t.stop); const R=t.R-c; adj.push(R); tot+=R; if(R>0)w++;}
    const n=adj.length;const pf=(()=>{let gw=0,gl=0;for(const r of adj){if(r>0)gw+=r;else gl-=r;}return gl>0?gw/gl:Infinity;})();
    console.log((nm+" "+tpMode).padEnd(12),`| n=${n} 승률=${n?(w/n*100).toFixed(0):0}% 기대값R(비용후)=${num(tot/n)} 총R=${num(tot,1)} PF=${num(pf)}`);
  }
}
