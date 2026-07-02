#!/usr/bin/env python3
"""히든 다이버전스 전 차원 전수조사 — 베스트 10 선발.

그리드: 방향(2) × 자리부분집합(8, 없음 포함) × 트리거(3) × RR(1.5~4, 6) ×
        RSI(9/14) × k(3/5) × 오차(0.5/1.0) × MA게이트(0/200) = 4,608 / 데이터셋
데이터: US100·XAUUSD × M10/M15/M30/H1/H2/H4 = 12셋 → 총 55,296셀

선발 기준(순서대로):
  ① 거래 ≥ 30  ② 전·후반 평균R 둘 다 +  ③ 왕복 0.02% 비용 차감 후 평균R > 0
  ④ 분기(8분할) 양수 ≥ 5  ⑤ 랜덤 3개월×30 양수 ≥ 18
  → 통과분을 비용차감 평균R로 랭킹, (종목·TF·방향·자리·트리거) 중복 제거 후 TOP 10
S/R 컷오프는 웹 테스트랩과 동일(lv < p1). 체결 규칙 동일(보수적).
"""
import itertools
import os
import numpy as np
import pandas as pd
import gridsearch as g
from combo_scan import load_full

HERE = os.path.dirname(os.path.abspath(__file__))

DATASETS = [
    ("US100", "M10", "US100.b_M10_202407010100_202606290340.csv"),
    ("US100", "M15", "US100.b_M15_202407010100_202606290345.csv"),
    ("US100", "M30", "US100.b_M30_202407010100_202606290330.csv"),
    ("US100", "H1",  "US100.b_H1_202407010100_202606290300.csv"),
    ("US100", "H2",  "US100.b_H2_202407010000_202606290200.csv"),
    ("US100", "H4",  "US100.b_H4_202407010000_202606290000.csv"),
    ("XAUUSD", "M10", "XAUUSD.b_M10_202407010000_202606290350.csv"),
    ("XAUUSD", "M15", "XAUUSD.b_M15_202407010000_202606290345.csv"),
    ("XAUUSD", "M30", "XAUUSD.b_M30_202407010000_202606290330.csv"),
    ("XAUUSD", "H1",  "XAUUSD.b_H1_202407010000_202606290300.csv"),
    ("XAUUSD", "H2",  "XAUUSD.b_H2_202407010000_202606290200.csv"),
    ("XAUUSD", "H4",  "XAUUSD.b_H4_202407010000_202606290000.csv"),
]
DIRS = ["long", "short"]
ZONES = [(), ("SR",), ("BB",), ("FIB",), ("SR", "BB"), ("SR", "FIB"), ("BB", "FIB"), ("SR", "BB", "FIB")]
TRIGS = ["candle", "macd", "candle+macd"]
RRS = [1.5, 2.0, 2.5, 3.0, 3.5, 4.0]
RSIS = [9, 14]
KS = [3, 5]
TOLS = [0.5, 1.0]
MAS = [0, 200]
COST = 0.0002   # 랭킹용 왕복 0.02%


def build_hidden(o, h, l, c, rsi, k, d, atr, bb_up, bb_lo, tol, ma200):
    """이벤트 배열: p2, confirm, sr, bb, fib, maok (웹랩과 동일 정의)"""
    n = len(c)
    plo, phi = g.pivots(l, h, k)
    lv_idx = np.concatenate([plo, phi])
    lv_val = np.concatenate([l[plo], h[phi]])
    od = np.argsort(lv_idx)
    lv_idx, lv_val = lv_idx[od], lv_val[od]
    piv = plo if d == "long" else phi
    price = l if d == "long" else h
    evs = []
    for j in range(1, len(piv)):
        p1, p2 = piv[j - 1], piv[j]
        if not (k < p2 - p1 <= g.MAX_PIVOT_GAP):
            continue
        if d == "long":
            ok = price[p2] > price[p1] and rsi[p2] < rsi[p1]
        else:
            ok = price[p2] < price[p1] and rsi[p2] > rsi[p1]
        if not ok:
            continue
        cf = p2 + k
        if cf >= n - 2:
            continue
        t_ = tol * atr[p2]
        m = (lv_idx < p1) & (lv_idx >= p2 - g.SR_LOOKBACK)
        sr = bool(np.any(np.abs(lv_val[m] - price[p2]) <= t_)) if m.any() else False
        bb = (not np.isnan(bb_lo[p2])) and (l[p2] <= bb_lo[p2] if d == "long" else h[p2] >= bb_up[p2])
        s0 = max(0, p2 - g.FIB_LOOKBACK)
        hh = h[s0:p2].max() if p2 > s0 else h[p2]
        ll = l[s0:p2].min() if p2 > s0 else l[p2]
        rng = hh - ll
        fib = False
        if rng > 0:
            for r_ in (0.382, 0.5, 0.618):
                lvl = hh - r_ * rng if d == "long" else ll + r_ * rng
                if abs(price[p2] - lvl) <= t_:
                    fib = True
                    break
        maok = (not np.isnan(ma200[p2])) and (c[p2] > ma200[p2] if d == "long" else c[p2] < ma200[p2])
        evs.append((p2, cf, sr, bb, fib, maok))
    return evs


def run_dataset(sym, tf, path):
    o, h, l, c, v = load_full(path)
    n = len(c)
    atr = g.atr14(h, l, c)
    bb_up, bb_lo = g.bollinger(c)
    macd = g.ema(c, 12) - g.ema(c, 26)
    sig = g.ema(macd, 9)
    ma200 = pd.Series(c).rolling(200).mean().to_numpy()
    rows = []
    for rp, k, d, tol in itertools.product(RSIS, KS, DIRS, TOLS):
        rsi = g.rsi(c, rp)
        evs = build_hidden(o, h, l, c, rsi, k, d, atr, bb_up, bb_lo, tol, ma200)
        if not evs:
            continue
        E = len(evs)
        sr_f = np.array([e[2] for e in evs])
        bb_f = np.array([e[3] for e in evs])
        fib_f = np.array([e[4] for e in evs])
        ma_f = np.array([e[5] for e in evs])
        # 트리거·시뮬 캐시: (trig, rr) → e/x/r/riskfrac 배열 (실패=-1)
        sim = {}
        for trig in TRIGS:
            ts = np.full(E, -1, int)
            for i, (p2, cf, *_rest) in enumerate(evs):
                ts[i] = g.find_trigger(o, h, l, c, macd, sig, cf, trig, d)
            for rr in RRS:
                eA = np.full(E, -1, int); xA = np.full(E, -1, int)
                rA = np.zeros(E); fA = np.zeros(E)
                for i in range(E):
                    t = ts[i]
                    if t < 0:
                        continue
                    res = g.simulate(o, h, l, c, t, rr, d)
                    if res is None:
                        continue
                    e_, x_, r_ = res
                    entry = o[e_]
                    risk = (entry - l[t]) if d == "long" else (h[t] - entry)
                    eA[i], xA[i], rA[i], fA[i] = e_, x_, r_, risk / entry
                sim[(trig, rr)] = (eA, xA, rA, fA)
        for zs, maP, trig, rr in itertools.product(ZONES, MAS, TRIGS, RRS):
            mask = np.ones(E, bool)
            if "SR" in zs:
                mask &= sr_f
            if "BB" in zs:
                mask &= bb_f
            if "FIB" in zs:
                mask &= fib_f
            if maP:
                mask &= ma_f
            eA, xA, rA, fA = sim[(trig, rr)]
            mask &= eA >= 0
            idx = np.nonzero(mask)[0]
            if len(idx) == 0:
                continue
            # 동시 1포지션
            keep = []
            last = -1
            for i in idx:
                if eA[i] <= last:
                    continue
                last = xA[i]
                keep.append(i)
            if len(keep) < 10:
                continue
            keep = np.array(keep)
            rs = rA[keep]; fs = fA[keep]; es = eA[keep]
            half = n // 2
            r1, r2 = rs[es < half], rs[es >= half]
            if not len(r1) or not len(r2):
                continue
            rn = rs - COST / fs
            gw = rs[rs > 0].sum(); gl = -rs[rs < 0].sum()
            gwn = rn[rn > 0].sum(); gln = -rn[rn < 0].sum()
            rows.append(dict(
                symbol=sym, tf=tf, direction=d, zone="+".join(zs) if zs else "none",
                trigger=trig, rr=rr, rsi=rp, k=k, tol=tol, ma=maP,
                trades=len(rs), winrate=float((rs > 0).mean()),
                avg_r=float(rs.mean()), pf=float(gw / max(gl, 1e-9)),
                risk_pct=float(fs.mean()),
                net_avg_r=float(rn.mean()), net_pf=float(gwn / max(gln, 1e-9)),
                h1_avg_r=float(r1.mean()), h2_avg_r=float(r2.mean()),
                entries=es.tolist(), rlist=rs.tolist(), nbars=n))
    return rows


def robust(row):
    es = np.array(row["entries"], float) / row["nbars"]
    rs = np.array(row["rlist"])
    q_pos = sum(1 for q in range(8) if rs[(es >= q / 8) & (es < (q + 1) / 8)].sum() > 0)
    rng = np.random.default_rng(42)
    pos = tot = 0
    for _ in range(30):
        s = rng.uniform(0, 1 - 1 / 8)
        m = (es >= s) & (es < s + 1 / 8)
        if m.sum() == 0:
            continue
        tot += 1
        pos += rs[m].sum() > 0
    return q_pos, pos, tot


def main():
    all_rows = []
    for sym, tf, fname in DATASETS:
        rows = run_dataset(sym, tf, os.path.join(g.ROOT, fname))
        all_rows.extend(rows)
        print(f"{sym} {tf}: cells={len(rows)}", flush=True)
    df = pd.DataFrame(all_rows)
    slim = df.drop(columns=["entries", "rlist", "nbars"])
    slim.to_csv(os.path.join(HERE, "results", "hidden_full_agg.csv"), index=False)
    print(f"\n총 유효 셀 {len(df)}")

    f = df[(df.trades >= 30) & (df.h1_avg_r > 0) & (df.h2_avg_r > 0) & (df.net_avg_r > 0)].copy()
    print(f"1차 필터(거래30·전후반+·0.02%비용 생존): {len(f)}")
    f = f.sort_values("net_avg_r", ascending=False)

    # 견고성 검사 (상위부터, 중복 제거하며 10개 찰 때까지)
    seen = set()
    top = []
    for _, row in f.iterrows():
        key = (row.symbol, row.tf, row.direction, row.zone, row.trigger)
        if key in seen:
            continue
        q, wpos, wtot = robust(row)
        if q < 5 or wpos < 18:
            continue
        seen.add(key)
        top.append(dict(row) | dict(q_pos=q, win_pos=f"{wpos}/{wtot}"))
        if len(top) >= 10:
            break
    out = pd.DataFrame(top).drop(columns=["entries", "rlist", "nbars"])
    out.to_csv(os.path.join(HERE, "results", "hidden_top10.csv"), index=False)
    pd.set_option("display.width", 300)
    cols = ["symbol", "tf", "direction", "zone", "trigger", "rr", "rsi", "k", "tol", "ma",
            "trades", "winrate", "avg_r", "net_avg_r", "pf", "net_pf", "risk_pct",
            "h1_avg_r", "h2_avg_r", "q_pos", "win_pos"]
    print("\n=== 최종 TOP 10 (0.02% 비용 차감 랭킹 · 분기≥5/8 · 랜덤≥18/30 · 중복 제거) ===")
    print(out[cols].to_string(index=False))


if __name__ == "__main__":
    main()
