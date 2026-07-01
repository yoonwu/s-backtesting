// 변곡더블비 EMA 확인형 v1 — 백테스트 (롱 전용)
// 스펙: BB(20,2), EMA(5,8,13), ATR(14)
//  1) 1차 저점: low < BB하단
//  2) 반등: 이후 close > EMA5 최소 1회
//  3) 2차 저점: |low2-low1| <= ATR*1.0, close2 > BB하단, (옵션) 이탈강도2 < 이탈강도1
//  4) 확인: close > EMA13 && EMA5 > EMA8
//  진입: 확인 다음 봉 시가 / 손절: 2차저점 - ATR*0.3 / 익절: risk*1.5 (+BB중심/상단 변형)
const fs = require("fs");

// ---------- CSV 로더 (MT5 tab, 앞쪽 일봉 구간 자동 제거) ----------
function loadCSV(path) {
  const raw = fs.readFileSync(path, "utf8").trim().split(/\r?\n/);
  const rows = [];
  for (let i = 1; i < raw.length; i++) {
    const p = raw[i].split("\t");
    if (p.length < 6) continue;
    rows.push({ date: p[0], time: p[1], o: +p[2], h: +p[3], l: +p[4], c: +p[5] });
  }
  // 첫 인트라데이(시간!=00:00:00) 지점부터 사용
  let start = 0;
  for (let i = 0; i < rows.length; i++) { if (rows[i].time !== "00:00:00") { start = i; break; } }
  return rows.slice(start);
}

// ---------- 지표 ----------
function ema(arr, period) {
  const out = new Array(arr.length).fill(null);
  const k = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < arr.length; i++) {
    if (i < period - 1) { seed += arr[i]; continue; }
    if (i === period - 1) { seed += arr[i]; out[i] = seed / period; continue; }
    out[i] = arr[i] * k + out[i - 1] * (1 - k);
  }
  return out;
}
function bb(close, period, mult) {
  const mid = new Array(close.length).fill(null);
  const up = new Array(close.length).fill(null);
  const lo = new Array(close.length).fill(null);
  for (let i = period - 1; i < close.length; i++) {
    let s = 0; for (let k = 0; k < period; k++) s += close[i - k];
    const m = s / period;
    let v = 0; for (let k = 0; k < period; k++) { const d = close[i - k] - m; v += d * d; }
    const sd = Math.sqrt(v / period); // 모집단 표준편차 (MT5 iBands)
    mid[i] = m; up[i] = m + mult * sd; lo[i] = m - mult * sd;
  }
  return { mid, up, lo };
}
function atr(bars, period) {
  const out = new Array(bars.length).fill(null);
  const tr = new Array(bars.length).fill(0);
  for (let i = 0; i < bars.length; i++) {
    if (i === 0) { tr[i] = bars[i].h - bars[i].l; continue; }
    tr[i] = Math.max(bars[i].h - bars[i].l, Math.abs(bars[i].h - bars[i - 1].c), Math.abs(bars[i].l - bars[i - 1].c));
  }
  let seed = 0;
  for (let i = 0; i < bars.length; i++) {
    if (i < period) { seed += tr[i]; if (i === period - 1) out[i] = seed / period; continue; }
    out[i] = (out[i - 1] * (period - 1) + tr[i]) / period; // Wilder
  }
  return out;
}
// 프랙탈 스윙저점 (w봉 양쪽보다 낮음)
function swingLows(bars, w) {
  const idx = [];
  for (let i = w; i < bars.length - w; i++) {
    let isLow = true;
    for (let k = 1; k <= w; k++) if (bars[i - k].l < bars[i].l || bars[i + k].l < bars[i].l) { isLow = false; break; }
    if (isLow) idx.push(i);
  }
  return idx;
}

// ---------- 백테스트 ----------
function backtest(bars, opts) {
  const { N, atrNear, slAtr, tpMode, tpR, requireWeaker, swingW, maxHold } = opts;
  const close = bars.map(b => b.c);
  const e5 = ema(close, 5), e8 = ema(close, 8), e13 = ema(close, 13);
  const B = bb(close, 20, 2), A = atr(bars, 14);
  const lows = swingLows(bars, swingW);
  const pen = i => (B.lo[i] == null ? -1 : B.lo[i] - bars[i].l); // 이탈강도(양수=밴드 아래로 이탈)

  const trades = [];
  let lastExitIdx = -1;

  for (let a = 0; a < lows.length; a++) {
    const L1 = lows[a];
    if (B.lo[L1] == null || A[L1] == null) continue;
    if (!(bars[L1].l < B.lo[L1])) continue;              // 1차: low < BB하단
    for (let b = a + 1; b < lows.length; b++) {
      const L2 = lows[b];
      if (L2 - L1 > N) break;                            // N봉 이내
      if (B.lo[L2] == null || A[L2] == null) continue;
      // 반등: L1~L2 사이 close>EMA5 최소 1회
      let reb = false;
      for (let j = L1 + 1; j < L2; j++) { if (e5[j] != null && bars[j].c > e5[j]) { reb = true; break; } }
      if (!reb) continue;
      // 2차 저점 조건
      if (Math.abs(bars[L2].l - bars[L1].l) > A[L2] * atrNear) continue; // ATR 이내
      if (!(bars[L2].c > B.lo[L2])) continue;            // 2차 종가 > BB하단
      if (requireWeaker && !(pen(L2) < pen(L1))) continue; // 이탈강도 약화
      // 확인: L2 이후 첫 (close>EMA13 && EMA5>EMA8)
      let conf = -1;
      for (let i = L2; i <= Math.min(bars.length - 2, L2 + N); i++) {
        if (e13[i] == null || e8[i] == null) continue;
        if (bars[i].c > e13[i] && e5[i] > e8[i]) { conf = i; break; }
      }
      if (conf < 0) continue;
      const entryIdx = conf + 1;
      if (entryIdx <= lastExitIdx) break;                // 중복 방지
      if (entryIdx >= bars.length) break;
      const entry = bars[entryIdx].o;
      const stop = bars[L2].l - A[L2] * slAtr;
      const risk = entry - stop;
      if (risk <= 0) break;
      let tp;
      if (tpMode === "R") tp = entry + risk * tpR;
      else if (tpMode === "mid") tp = B.mid[conf];
      else tp = B.up[conf];                              // "up"
      if (tp == null || tp <= entry) break;
      // 실행
      let exit = null, exitIdx = null, result = null;
      for (let i = entryIdx; i < Math.min(bars.length, entryIdx + maxHold); i++) {
        if (bars[i].l <= stop) { exit = stop; exitIdx = i; result = (stop - entry) / risk; break; }   // 손절 우선
        if (bars[i].h >= tp) { exit = tp; exitIdx = i; result = (tp - entry) / risk; break; }
      }
      if (exit == null) { // maxHold 만료 → 종가청산
        exitIdx = Math.min(bars.length - 1, entryIdx + maxHold - 1);
        exit = bars[exitIdx].c; result = (exit - entry) / risk;
      }
      trades.push({ entryIdx, exitIdx, entry, stop, tp, exit, R: result,
                    d1: bars[L1].date + " " + bars[L1].time, d2: bars[L2].date + " " + bars[L2].time,
                    de: bars[entryIdx].date + " " + bars[entryIdx].time });
      lastExitIdx = exitIdx;
      break; // 이 L1에 대해 한 트레이드
    }
  }
  return trades;
}

function stats(trades) {
  const n = trades.length;
  if (!n) return { n: 0 };
  const wins = trades.filter(t => t.R > 0);
  const winRate = wins.length / n;
  const totR = trades.reduce((s, t) => s + t.R, 0);
  const grossW = wins.reduce((s, t) => s + t.R, 0);
  const grossL = -trades.filter(t => t.R <= 0).reduce((s, t) => s + t.R, 0);
  const pf = grossL > 0 ? grossW / grossL : Infinity;
  const expc = totR / n;
  // maxDD (R 누적곡선)
  let eq = 0, peak = 0, mdd = 0;
  for (const t of trades) { eq += t.R; peak = Math.max(peak, eq); mdd = Math.min(mdd, eq - peak); }
  const mar = mdd < 0 ? totR / -mdd : Infinity;
  return { n, winRate, totR, pf, expc, mdd, mar,
           avgWin: wins.length ? grossW / wins.length : 0,
           avgLoss: (n - wins.length) ? grossL / (n - wins.length) : 0 };
}

// ---------- 실행 ----------
const DATASETS = [
  ["XAU M5", "XAUUSD.b_M5_202407010000_202606291240.csv"],
  ["XAU M15", "XAUUSD.b_M15_202407010000_202606290345.csv"],
  ["XAU H1", "XAUUSD.b_H1_202407010000_202606290300.csv"],
  ["US100 M5", "US100.b_M5_202501240655_202606290345.csv"],
  ["US100 M15", "US100.b_M15_202407010100_202606290345.csv"],
  ["US100 H1", "US100.b_H1_202407010100_202606290300.csv"],
];

const base = { N: 30, atrNear: 1.0, slAtr: 0.3, tpR: 1.5, requireWeaker: false, swingW: 2, maxHold: 60 };
const TPMODES = ["R", "mid", "up"];

const pad = (s, w) => String(s).padEnd(w);
const num = (x, d = 2) => (x == null || !isFinite(x)) ? "-" : x.toFixed(d);

for (const [name, file] of DATASETS) {
  let bars;
  try { bars = loadCSV(file); } catch (e) { console.log(name, "LOAD FAIL", e.message); continue; }
  console.log("\n================ " + name + "  (bars=" + bars.length + ") ================");
  console.log(pad("TP모드", 8), pad("거래", 6), pad("승률", 7), pad("기대값R", 9), pad("총R", 8), pad("PF", 6), pad("MDD_R", 8), pad("MAR", 6), pad("평균익", 7), pad("평균손", 7));
  for (const tpMode of TPMODES) {
    const tr = backtest(bars, { ...base, tpMode });
    const s = stats(tr);
    if (!s.n) { console.log(pad(tpMode, 8), "0 trades"); continue; }
    console.log(pad(tpMode, 8), pad(s.n, 6), pad((s.winRate * 100).toFixed(1) + "%", 7),
      pad(num(s.expc), 9), pad(num(s.totR, 1), 8), pad(num(s.pf), 6), pad(num(s.mdd, 1), 8),
      pad(num(s.mar), 6), pad(num(s.avgWin), 7), pad(num(s.avgLoss), 7));
  }
}

// ================= 추가: 전/후반 분할 + 파라미터 스윕 =================
console.log("\n\n########## 강건성: 전반/후반 분할 (TP=R, TP=up) ##########");
function splitTest(bars, opts) {
  const mid = Math.floor(bars.length / 2);
  const h1 = bars.slice(0, mid), h2 = bars.slice(mid);
  return [stats(backtest(h1, opts)), stats(backtest(h2, opts))];
}
for (const [name, file] of DATASETS) {
  let bars; try { bars = loadCSV(file); } catch { continue; }
  for (const tpMode of ["R", "up"]) {
    const [a, b] = splitTest(bars, { ...base, tpMode });
    const f = s => s.n ? `n=${s.n} exp=${num(s.expc)} PF=${num(s.pf)} tot=${num(s.totR,1)}` : "n=0";
    console.log(pad(name + " " + tpMode, 14), "| 전반:", pad(f(a), 34), "| 후반:", f(b));
  }
}

console.log("\n\n########## 스윕: slAtr × tpR (TP=R), XAU·US100 전TF ##########");
for (const [name, file] of DATASETS) {
  let bars; try { bars = loadCSV(file); } catch { continue; }
  console.log("\n--- " + name + " ---");
  console.log(pad("", 10), ["tpR1.5","tpR2.0","tpR3.0"].map(x=>pad(x,20)).join(""));
  for (const slAtr of [0.3, 0.5, 1.0, 1.5]) {
    const cells = [1.5, 2.0, 3.0].map(tpR => {
      const s = stats(backtest(bars, { ...base, slAtr, tpR, tpMode: "R" }));
      return s.n ? `n${s.n} e${num(s.expc)} PF${num(s.pf)}` : "n0";
    });
    console.log(pad("sl" + slAtr, 10), cells.map(c => pad(c, 20)).join(""));
  }
}

console.log("\n\n########## requireWeaker(이탈강도 약화) on/off (TP=up) ##########");
for (const [name, file] of DATASETS) {
  let bars; try { bars = loadCSV(file); } catch { continue; }
  const off = stats(backtest(bars, { ...base, tpMode: "up", requireWeaker: false }));
  const on = stats(backtest(bars, { ...base, tpMode: "up", requireWeaker: true }));
  const f = s => s.n ? `n=${s.n} exp=${num(s.expc)} PF=${num(s.pf)} MAR=${num(s.mar)}` : "n=0";
  console.log(pad(name, 12), "| off:", pad(f(off), 38), "| on:", f(on));
}
