#!/usr/bin/env python3
"""SFP 2차: 세션 유동성 레벨(전일 저가/고가 PDL·PDH, 전주 저가/고가 PWL·PWH) 스윕.

롱: 당일 최초로 PDL(전일 저가)을 장중 하회 후 종가 복귀(1봉/2봉).
다이버 게이트: 스윕봉 RSI14 > 전일 저가 발생봉 RSI (숏 대칭).
진입 next_open/break(스윕봉 고가 돌파, 5봉) · SL=스윕 극값 · RR 1.5/2.5/3.5.
대상: M15/M30/H1/H2 (일중 TF).
"""
import itertools
import os
import numpy as np
import pandas as pd
import gridsearch as g
from sfp_scan import simulate_from, BREAK_WINDOW

HERE = os.path.dirname(os.path.abspath(__file__))
DATASETS = [(s, t, f) for s, t, f in g.DATASETS if t in ("M15", "M30", "H1", "H2")]
LEVELS = ["PD", "PW"]
DIRS = ["long", "short"]
DIVS = [False, True]
CLOSEBACKS = [1, 2]
ENTRIES = ["next_open", "break"]
RRS = [1.5, 2.5, 3.5]


def load_with_time(path):
    df = pd.read_csv(path, sep="\t")
    df.columns = [c.strip("<>").lower() for c in df.columns]
    o, h, l, c = (df[x].to_numpy(float) for x in ["open", "high", "low", "close"])
    dt = pd.to_datetime(df["date"], format="%Y.%m.%d")
    day = dt.dt.strftime("%Y-%m-%d").to_numpy()
    week = dt.dt.strftime("%G-%V").to_numpy()
    return o, h, l, c, day, week


def period_levels(h, l, key):
    """key(일/주)별 이전 기간의 고저 + 그 극값 발생 봉 인덱스"""
    n = len(h)
    prev_hi = np.full(n, np.nan); prev_lo = np.full(n, np.nan)
    prev_hi_bar = np.full(n, -1, int); prev_lo_bar = np.full(n, -1, int)
    cur = None
    cur_hi = -np.inf; cur_lo = np.inf; cur_hb = -1; cur_lb = -1
    last = (np.nan, np.nan, -1, -1)
    for i in range(n):
        if key[i] != cur:
            if cur is not None:
                last = (cur_hi, cur_lo, cur_hb, cur_lb)
            cur = key[i]; cur_hi = -np.inf; cur_lo = np.inf; cur_hb = cur_lb = -1
        prev_hi[i], prev_lo[i], prev_hi_bar[i], prev_lo_bar[i] = last
        if h[i] > cur_hi: cur_hi = h[i]; cur_hb = i
        if l[i] < cur_lo: cur_lo = l[i]; cur_lb = i
    return prev_hi, prev_lo, prev_hi_bar, prev_lo_bar


def detect(o, h, l, c, rsi, d, key, prev_hi, prev_lo, hi_bar, lo_bar, need_div, closeback):
    n = len(c)
    events = []
    cur = None
    swept = False                      # 이 기간에 이미 스윕 발생?
    for i in range(n):
        if key[i] != cur:
            cur = key[i]; swept = False
        lvl = prev_lo[i] if d == "long" else prev_hi[i]
        ref = lo_bar[i] if d == "long" else hi_bar[i]
        if np.isnan(lvl) or ref < 0 or swept:
            continue
        pierced = (l[i] < lvl) if d == "long" else (h[i] > lvl)
        if not pierced:
            continue
        swept = True                   # 기간당 최초 이탈만
        sfp_bar = -1
        if d == "long":
            if c[i] > lvl:
                sfp_bar = i
            elif closeback == 2 and i + 1 < n and key[min(i + 1, n - 1)] == cur and c[i + 1] > lvl:
                sfp_bar = i + 1
        else:
            if c[i] < lvl:
                sfp_bar = i
            elif closeback == 2 and i + 1 < n and key[min(i + 1, n - 1)] == cur and c[i + 1] < lvl:
                sfp_bar = i + 1
        if sfp_bar < 0:
            continue
        if need_div:
            ok = rsi[i] > rsi[ref] if d == "long" else rsi[i] < rsi[ref]
            if not ok:
                continue
        extreme = min(l[i], l[sfp_bar]) if d == "long" else max(h[i], h[sfp_bar])
        events.append((sfp_bar, extreme))
    return events


def main():
    rows = []
    for sym, tf, fname in DATASETS:
        o, h, l, c, day, week = load_with_time(os.path.join(g.ROOT, fname))
        n = len(c)
        rsi = g.rsi(c, 14)
        lv = {"PD": period_levels(h, l, day), "PW": period_levels(h, l, week)}
        for lvm, d, dv, cb in itertools.product(LEVELS, DIRS, DIVS, CLOSEBACKS):
            ph, pl, hb, lb = lv[lvm]
            key = day if lvm == "PD" else week
            evs = detect(o, h, l, c, rsi, d, key, ph, pl, hb, lb, dv, cb)
            for em, rr in itertools.product(ENTRIES, RRS):
                trades = []
                last_exit = -1
                for sfp_bar, extreme in evs:
                    if em == "next_open":
                        e = sfp_bar + 1
                        if e >= n:
                            continue
                        res = simulate_from(o, h, l, c, e, o[e], extreme, rr, d)
                    else:
                        trig = h[sfp_bar] if d == "long" else l[sfp_bar]
                        res = None
                        for b in range(sfp_bar + 1, min(sfp_bar + 1 + BREAK_WINDOW, n)):
                            hit = (h[b] >= trig) if d == "long" else (l[b] <= trig)
                            if hit:
                                fill = max(o[b], trig) if d == "long" else min(o[b], trig)
                                res = simulate_from(o, h, l, c, b, fill, extreme, rr, d)
                                break
                    if res is None:
                        continue
                    e, x, r, rpct = res
                    if e <= last_exit:
                        continue
                    last_exit = x
                    trades.append((e, r, rpct))
                if trades:
                    rs = np.array([t[1] for t in trades]); es = np.array([t[0] for t in trades])
                    rp = np.array([t[2] for t in trades]); half = n // 2
                    r1, r2 = rs[es < half], rs[es >= half]
                    gw = rs[rs > 0].sum(); gl = -rs[rs < 0].sum()
                    rows.append(dict(symbol=sym, tf=tf, direction=d, level=lvm, closeback=cb,
                                     div=dv, entry=em, rr=rr, trades=len(rs),
                                     winrate=float((rs > 0).mean()), avg_r=float(rs.mean()),
                                     sum_r=float(rs.sum()),
                                     pf=float(gw / gl) if gl > 0 else float("inf"),
                                     gross_win=float(gw), gross_loss=float(gl),
                                     risk_pct=float(rp.mean()),
                                     h1_sum_r=float(r1.sum()), h2_sum_r=float(r2.sum()),
                                     h1_trades=int(len(r1)), h2_trades=int(len(r2))))
        print(sym, tf, "done", flush=True)
    df = pd.DataFrame(rows)
    df.to_csv(os.path.join(HERE, "results", "sfp_pd_by_dataset.csv"), index=False)

    key = ["direction", "level", "closeback", "div", "entry", "rr"]
    agg_rows = []
    for kv, grp in df.groupby(key):
        tr = int(grp.trades.sum())
        gw, gl = float(grp.gross_win.sum()), float(grp.gross_loss.sum())
        h1, h2 = float(grp.h1_sum_r.sum()), float(grp.h2_sum_r.sum())
        h1n, h2n = int(grp.h1_trades.sum()), int(grp.h2_trades.sum())
        agg_rows.append(dict(zip(key, kv)) | dict(
            trades=tr, avg_r=float(grp.sum_r.sum() / tr) if tr else np.nan,
            winrate=float((grp.winrate * grp.trades).sum() / tr) if tr else np.nan,
            pf=(gw / gl if gl > 0 else float("inf")) if tr else np.nan,
            risk_pct=float((grp.risk_pct * grp.trades).sum() / tr) if tr else np.nan,
            h1_avg_r=h1 / h1n if h1n else np.nan, h2_avg_r=h2 / h2n if h2n else np.nan,
            pos_datasets=int((grp.sum_r > 0).sum())))
    agg = pd.DataFrame(agg_rows).sort_values("avg_r", ascending=False)
    agg.to_csv(os.path.join(HERE, "results", "sfp_pd_agg.csv"), index=False)
    pd.set_option("display.width", 250)
    ok = agg[(agg.trades >= 30) & (agg.h1_avg_r > 0) & (agg.h2_avg_r > 0)]
    print(f"\n=== EA필터 통과 {len(ok)} / {len(agg)} ===")
    print(ok.head(15).to_string(index=False))
    print("\n=== 전체 상위 10 (필터 무시) ===")
    print(agg.head(10).to_string(index=False))
    print("\n=== 차원별 평균 ===")
    for dim in key:
        print(agg.groupby(dim).avg_r.mean().sort_values(ascending=False).to_string(), "\n")


if __name__ == "__main__":
    main()
