#!/usr/bin/env python3
"""히든 다이버+MA200+BB 최종 검증: 비용 민감도 · rsi/k 능선 · 분기별 · 랜덤 3개월 창.
+ ⑧ CHoCH(US100 M15/M30) 워크포워드 동일 검증.

비용 모델: 트레이드당 r_net = r − c/riskfrac (c=왕복비용 %/100, riskfrac=(진입가−SL)/진입가)
→ 타이트 스톱일수록 비용이 R를 크게 갉아먹는 구조를 정확히 반영.
"""
import itertools
import os
import numpy as np
import pandas as pd
import gridsearch as g
from combo_scan import div_events, resample, load_full
from sfp_scan import simulate_from

HERE = os.path.dirname(os.path.abspath(__file__))
COSTS = [0.0, 0.0001, 0.0002, 0.0004, 0.0006, 0.001]   # 왕복 0~0.1%
RNG_SEED = 42
N_WINDOWS = 30


def hidden_trades(sym, tf, path, rp, k, rr, d):
    """히든+MA200+BB+캔들 트레이드: (entry_bar, exit_bar, r, riskfrac)"""
    o, h, l, c, v = load_full(path)
    n = len(c)
    atr = g.atr14(h, l, c)
    bb_up, bb_lo = g.bollinger(c)
    macd = g.ema(c, 12) - g.ema(c, 26)
    sig = g.ema(macd, 9)
    rsi = g.rsi(c, rp)
    ma200 = pd.Series(c).rolling(200).mean().to_numpy()
    evs = div_events(l, h, rsi, k, d, hidden=True)
    out, last = [], -1
    for p1, p2, cf in evs:
        if cf >= n - 2:
            continue
        if np.isnan(ma200[p2]):
            continue
        if d == "long" and not (c[p2] > ma200[p2]):
            continue
        if d == "short" and not (c[p2] < ma200[p2]):
            continue
        bb = (not np.isnan(bb_lo[p2])) and (l[p2] <= bb_lo[p2] if d == "long" else h[p2] >= bb_up[p2])
        if not bb:
            continue
        t = g.find_trigger(o, h, l, c, macd, sig, cf, "candle", d)
        if t < 0:
            continue
        res = g.simulate(o, h, l, c, t, rr, d)
        if res is None:
            continue
        e, x, r = res
        if e <= last:
            continue
        last = x
        entry = o[e]
        risk = (entry - l[t]) if d == "long" else (h[t] - entry)
        out.append((e, x, r, risk / entry))
    return out, n


def choch_trades(sym, tf, path, rr):
    """⑧ CHoCH 롱 (combo_scan과 동일 로직)"""
    o, h, l, c, v = load_full(path)
    n = len(c)
    rsi14 = None
    O, H, L, C, end = resample(o, h, l, c, v, 8)
    R = g.rsi(C, 14)
    hev = div_events(L, H, R, 3, "long")
    plo, phi = g.pivots(l, h, 3)
    out, last = [], -1
    sims = []
    for P1, P2, CF in hev:
        if CF >= len(C):
            continue
        ws = end[CF] + 1
        we = min(ws + 80, n - 1)
        for t in range(ws, we):
            cand = [q for q in phi if q + 3 <= t]
            if not cand:
                continue
            lvl = h[cand[-1]]
            if c[t] > lvl:
                sl = l[ws:t + 1].min()
                e = t + 1
                if e < n:
                    res = simulate_from(o, h, l, c, e, o[e], sl, rr, "long")
                    if res:
                        sims.append(res)
                break
    for e, x, r, rf in sorted(sims):
        if e <= last:
            continue
        last = x
        out.append((e, x, r, rf))
    return out, n


def summarize(trades):
    rs = np.array([t[2] for t in trades])
    return len(rs), float((rs > 0).mean()), float(rs.mean()), \
        float(rs[rs > 0].sum() / max(-rs[rs < 0].sum(), 1e-9))


def cost_table(all_trades, label):
    print(f"\n--- 비용 민감도: {label} (거래 {len(all_trades)}) ---")
    print("왕복비용   평균R    합계R     PF    평균리스크%")
    rf = np.array([t[3] for t in all_trades])
    for cst in COSTS:
        rs = np.array([t[2] - cst / t[3] for t in all_trades])
        gw = rs[rs > 0].sum(); gl = -rs[rs < 0].sum()
        print(f"{cst*100:6.2f}%  {rs.mean():+7.3f}  {rs.sum():+8.1f}  {gw/max(gl,1e-9):5.2f}   {rf.mean()*100:.2f}%")


def robustness(all_trades, bars_total, label):
    """분기(8분할) + 랜덤 3개월 창"""
    es = np.array([t[0] for t in all_trades], float)
    rs = np.array([t[2] for t in all_trades])
    fr = es / np.array([t[4] for t in all_trades])      # 데이터셋 내 위치 0~1
    qs = []
    for q in range(8):
        m = (fr >= q / 8) & (fr < (q + 1) / 8)
        qs.append((int(m.sum()), float(rs[m].sum())))
    print(f"\n--- {label} 분기별 (거래수, 합계R) ---")
    print(" | ".join(f"Q{q+1} {n}건 {s:+.1f}" for q, (n, s) in enumerate(qs)),
          f"→ 양수 {sum(1 for _, s in qs if s > 0)}/8")
    rng = np.random.default_rng(RNG_SEED)
    win = 1 / 8
    pos = tot = 0
    for _ in range(N_WINDOWS):
        s = rng.uniform(0, 1 - win)
        m = (fr >= s) & (fr < s + win)
        if m.sum() == 0:
            continue
        tot += 1
        if rs[m].sum() > 0:
            pos += 1
    print(f"랜덤 3개월×{N_WINDOWS}: 양수 {pos}/{tot}")


def main():
    # ---------- 히든+MA200+BB: 능선 + 코어 슬롯 ----------
    print("=" * 70)
    print("① 히든 다이버 + MA200 + BB — rsi×k 능선 (전 데이터셋 합산, 2.5R)")
    print("=" * 70)
    for d in ["long", "short"]:
        print(f"\n[{d}]  rsi  k  거래  승률   평균R    PF")
        for rp, k in itertools.product([9, 14], [3, 5]):
            allt = []
            for sym, tf, fn in g.DATASETS:
                tr, n = hidden_trades(sym, tf, os.path.join(g.ROOT, fn), rp, k, 2.5, d)
                allt += [t + (n,) for t in tr]
            cnt, wr, avg, pf = summarize(allt)
            print(f"      {rp:3d} {k:2d} {cnt:5d} {wr*100:5.1f}% {avg:+7.3f} {pf:5.2f}")

    # ---------- 코어(rsi14 k3 2.5R) 비용 + 견고성 ----------
    for d in ["long", "short"]:
        allt = []
        by_tf = {}
        for sym, tf, fn in g.DATASETS:
            tr, n = hidden_trades(sym, tf, os.path.join(g.ROOT, fn), 14, 3, 2.5, d)
            allt += [t + (n,) for t in tr]
            by_tf.setdefault(tf, []).extend([t + (n,) for t in tr])
        cost_table(allt, f"히든+MA200+BB {d} (전 TF)")
        robustness(allt, None, f"히든 {d}")
        # TF별 비용 내성 요약 (0.04% 기준)
        print(f"\n{d} TF별 (rsi14 k3 2.5R): 거래 / 무비용 평균R / 0.04%비용 평균R")
        for tf in ["M15", "M30", "H1", "H2", "H4"]:
            tt = by_tf.get(tf, [])
            if not tt:
                continue
            rs0 = np.array([t[2] for t in tt])
            rs4 = np.array([t[2] - 0.0004 / t[3] for t in tt])
            print(f"  {tf:4s} {len(tt):4d}  {rs0.mean():+7.3f}  {rs4.mean():+7.3f}")

    # ---------- ⑧ CHoCH US100 ----------
    print("\n" + "=" * 70)
    print("② CHoCH 롱 (US100 M15+M30, 2.5R) — 비용 + 워크포워드")
    print("=" * 70)
    allt = []
    for sym, tf, fn in g.DATASETS:
        if sym != "US100" or tf not in ("M15", "M30"):
            continue
        tr, n = choch_trades(sym, tf, os.path.join(g.ROOT, fn), 2.5)
        allt += [t + (n,) for t in tr]
        rs = np.array([t[2] for t in tr])
        print(f"{sym} {tf}: {len(rs)}거래 평균R {rs.mean():+.3f}")
    cost_table(allt, "CHoCH US100 M15+M30")
    robustness(allt, None, "CHoCH")


if __name__ == "__main__":
    main()
