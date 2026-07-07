#!/usr/bin/env python3
"""넥라인눌림 심층 전수조사 — neckline_scan의 고정 상수 2개를 차원으로 추가.

스윕: 방향(2) × k(3/5) × 같은바닥 허용(0.5/1.0) × 터치오차(0.1/0.2/0.4)
     × 최소바닥(2/3) × 진입(터치/확인) × 익절(1.5/2.5/3.5R/패턴) × 손절여유(0.5/1.0)
     = 1,536셀 × 12데이터셋. 혼합TF 트리밍 적용(load_trimmed).

견고성: 전/후반 평균R + 4분기 양수 개수 + 0.05% 실비용 R + 이웃능선(k·허용·터치·손절 1칸).
"""
import itertools
import os
import numpy as np
import pandas as pd
import gridsearch as g
from neckline_scan import load_trimmed, TF_MIN, DATASETS

HERE = os.path.dirname(os.path.abspath(__file__))

KS = [3, 5]
TOLS = [0.5, 1.0]
TTOLS = [0.1, 0.2, 0.4]
BOTTOMS = [2, 3]
ENTRIES = ["touch", "confirm"]
TPS = ["1.5R", "2.5R", "3.5R", "measured"]
SLATRS = [0.5, 1.0]
DIRS = ["long", "short"]

MIN_BOUNCE = 1.0
MAX_BREAK = 0.3
MAX_GAP = 60
BRK_WIN = 40
RT_WIN = 30
FAIL_TOL = 0.5
CONF_WIN = 5
MAX_HOLD = 300


def detect(o, h, l, c, atr, k, tol, d, ttol):
    """neckline_scan.detect_events와 동일하되 터치오차 파라미터화 +
    cl_min/atr_touch 반환(손절여유를 트레이드 단계에서 스윕)."""
    n = len(c)
    lo = l if d == "long" else -h
    hi = h if d == "long" else -l
    op = o if d == "long" else -o
    cl = c if d == "long" else -c
    plo, _ = g.pivots(np.asarray(lo), np.asarray(hi), k)
    events = []
    cl_lows = []
    cl_min = None
    state = "SCAN"
    neck = None
    deadline = -1
    brk_bar = -1
    piv_sorted = sorted(plo)
    pi = 0
    i = 0
    while i < n - 1:
        new_piv = None
        if pi < len(piv_sorted) and piv_sorted[pi] + k <= i:
            new_piv = piv_sorted[pi]
            pi += 1
        if new_piv is not None:
            p, px = new_piv, lo[new_piv]
            a = atr[p]
            if cl_lows and p - cl_lows[-1][0] <= MAX_GAP:
                if px < cl_min - MAX_BREAK * a:
                    cl_lows = [(p, px)]; cl_min = px; state = "SCAN"; neck = None
                elif abs(px - cl_min) <= tol * a:
                    seg_hi = hi[cl_lows[-1][0]:p + 1].max()
                    if seg_hi - max(cl_lows[-1][1], px) >= MIN_BOUNCE * a:
                        cl_lows.append((p, px))
                        cl_min = min(cl_min, px)
                        if state in ("SCAN", "ARMED"):
                            neck = hi[cl_lows[0][0]:p + 1].max()
                            state = "ARMED"
                            deadline = i + BRK_WIN
            else:
                cl_lows = [(p, px)]; cl_min = px; state = "SCAN"; neck = None
        if state == "ARMED":
            if lo[i] < cl_min - MAX_BREAK * atr[i]:
                cl_lows = []; cl_min = None; state = "SCAN"; neck = None
            elif cl[i] > neck:
                state = "BROKE"; brk_bar = i; deadline = i + RT_WIN
            elif i >= deadline:
                state = "SCAN"
        elif state == "BROKE":
            a = atr[i]
            if cl[i] < neck - FAIL_TOL * a or lo[i] < cl_min:
                state = "SCAN"; cl_lows = []; cl_min = None; neck = None
            elif i > brk_bar and lo[i] <= neck + ttol * a:
                px_touch = min(op[i], neck + ttol * a)
                e_conf = -1; px_conf = None
                for cc in range(i, min(i + CONF_WIN + 1, n - 1)):
                    if cl[cc] > op[cc] and cl[cc] > neck:
                        e_conf = cc + 1
                        px_conf = op[cc + 1]
                        break
                    if cl[cc] < neck - FAIL_TOL * atr[cc] or lo[cc] < cl_min:
                        break
                events.append(dict(
                    e_touch=i, px_touch=px_touch, e_conf=e_conf, px_conf=px_conf,
                    cl_min=cl_min, atr_t=atr[i], neck=neck, nbottoms=len(cl_lows),
                    measured=neck + (neck - cl_min)))
                state = "SCAN"; cl_lows = []; cl_min = None; neck = None
            elif i >= deadline:
                state = "SCAN"; cl_lows = []; cl_min = None; neck = None
        i += 1
    return events


def sim(oo, hh, ll, cc, e, entry, sl, tp):
    n = len(cc)
    risk = entry - sl
    if risk <= 0 or e >= n:
        return None
    for i in range(e, min(e + MAX_HOLD, n)):
        if ll[i] <= sl:
            px = min(oo[i], sl) if i > e else sl
            if i == e and oo[i] < sl:
                px = oo[i]
            return (e, i, (px - entry) / risk, risk)
        if hh[i] >= tp:
            return (e, i, (tp - entry) / risk, risk)
    i = min(e + MAX_HOLD, n) - 1
    return (e, i, (cc[i] - entry) / risk, risk)


def run_dataset(sym, tf, path):
    o, h, l, c, dt, cut = load_trimmed(path, TF_MIN[tf])
    n = len(c)
    atr = g.atr14(h, l, c)
    rows = []
    for d, k, tol, ttol in itertools.product(DIRS, KS, TOLS, TTOLS):
        oo, hh, ll, cc = (o, h, l, c) if d == "long" else (-o, -l, -h, -c)
        evs = detect(o, h, l, c, atr, k, tol, d, ttol)
        for nb, em, tpm, sla in itertools.product(BOTTOMS, ENTRIES, TPS, SLATRS):
            trades = []
            last = -1
            for ev in evs:
                if ev["nbottoms"] < nb:
                    continue
                if em == "touch":
                    e, px = ev["e_touch"], ev["px_touch"]
                else:
                    if ev["e_conf"] < 0:
                        continue
                    e, px = ev["e_conf"], ev["px_conf"]
                sl = ev["cl_min"] - sla * ev["atr_t"]
                risk = px - sl
                if risk <= 0:
                    continue
                tp = ev["measured"] if tpm == "measured" else px + float(tpm[:-1]) * risk
                if tp <= px:
                    continue
                res = sim(oo, hh, ll, cc, e, px, sl, tp)
                if res is None:
                    continue
                e_, x_, r_, rk = res
                if e_ <= last:
                    continue
                last = x_
                real_px = px if d == "long" else -px
                trades.append((e_, r_, abs(rk) / abs(real_px)))
            if len(trades) < 5:
                continue
            rs = np.array([t[1] for t in trades])
            es = np.array([t[0] for t in trades])
            rf = np.array([t[2] for t in trades])
            half = n // 2
            r1, r2 = rs[es < half], rs[es >= half]
            q = np.minimum((es * 4) // n, 3)
            qpos = int(sum(rs[q == j].sum() > 0 for j in range(4) if (q == j).any()))
            qn = int(len(set(q.tolist())))
            gw = rs[rs > 0].sum(); gl = -rs[rs < 0].sum()
            rn = rs - 0.0005 / rf
            rows.append(dict(
                symbol=sym, tf=tf, direction=d, k=k, tol=tol, ttol=ttol,
                bottoms=nb, entry=em, tp=tpm, slatr=sla, trades=len(rs),
                winrate=float((rs > 0).mean()), avg_r=float(rs.mean()),
                sum_r=float(rs.sum()), pf=float(gw / max(gl, 1e-9)),
                net05=float(rn.mean()), risk_pct=float(rf.mean()),
                h1=float(r1.mean()) if len(r1) else np.nan,
                h2=float(r2.mean()) if len(r2) else np.nan,
                q_pos=qpos, q_n=qn))
    return rows


def ridge(df, row):
    """이웃 능선: k·tol·ttol·slatr 중 하나만 1칸 이동한 셀들의 net05>0 비율"""
    dims = dict(k=KS, tol=TOLS, ttol=TTOLS, slatr=SLATRS)
    pos = tot = 0
    for dim, vals in dims.items():
        i = vals.index(row[dim])
        for j in (i - 1, i + 1):
            if 0 <= j < len(vals):
                m = df[(df.symbol == row.symbol) & (df.tf == row.tf) & (df.direction == row.direction)
                       & (df.bottoms == row.bottoms) & (df.entry == row.entry) & (df.tp == row.tp)]
                for d2, v2 in dims.items():
                    m = m[m[d2] == (vals[j] if d2 == dim else row[d2])]
                if len(m):
                    tot += 1
                    if m.iloc[0].net05 > 0:
                        pos += 1
    return f"{pos}/{tot}"


def main():
    all_rows = []
    for sym, tf, fname in DATASETS:
        rows = run_dataset(sym, tf, os.path.join(g.ROOT, fname))
        all_rows.extend(rows)
        print(f"{sym} {tf}: {len(rows)} cells", flush=True)
    df = pd.DataFrame(all_rows)
    df.to_csv(os.path.join(HERE, "results", "neckline_deep.csv"), index=False)

    pd.set_option("display.width", 300)
    ok = df[(df.trades >= 25) & (df.net05 > 0) & (df.h1 > 0) & (df.h2 > 0) & (df.q_pos >= 3)]
    print(f"\n견고 필터(거래25+ · 실비용+ · 전후반+ · 4분기 중 3+분기 양수) 통과: {len(ok)}/{len(df)}")

    # 종목·TF·방향별 베스트 1셀
    best = ok.sort_values("net05", ascending=False).groupby(
        ["symbol", "tf", "direction"], as_index=False).first()
    best = best.sort_values("net05", ascending=False)
    best["ridge"] = [ridge(df, r) for _, r in best.iterrows()]
    cols = ["symbol", "tf", "direction", "k", "tol", "ttol", "bottoms", "entry", "tp", "slatr",
            "trades", "winrate", "avg_r", "net05", "pf", "h1", "h2", "q_pos", "q_n", "ridge", "risk_pct"]
    print("\n=== 슬롯별(종목·TF·방향) 베스트 ===")
    print(best[cols].to_string(index=False))

    print("\n=== 전체 셀 실비용 상위 20 (견고 필터 통과분) ===")
    top = ok.sort_values("net05", ascending=False).head(20)
    print(top[cols[:-2]].to_string(index=False))


if __name__ == "__main__":
    main()
