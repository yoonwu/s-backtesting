#!/usr/bin/env python3
"""⑨ 유동성 스윕(SFP) + 다이버전스 — 심층 전수조사.

SFP(Swing Failure Pattern): 전저점(전고점)을 장중 살짝 하회(상회)해 스탑을
털고 종가는 레벨 위(아래)로 복귀. 스윕 극값 바로 밖에 손절 → 타이트 리스크.

앞선 단순 2B(spring)와의 차이 — 이번 조사의 3축:
  A. 레벨 유의미성: 스윕 대상이 "확정 후 한 번도 안 깨진(first-breach)" 피벗.
     · piv3  = k3 피벗저점  · piv5 = k5 피벗저점(굵은 스윙)
     · major = k3 피벗 + 스윕 시점 직전 40봉 최저가와 일치(레인지 로우)
  B. 다이버전스 게이트: 스윕봉 RSI14 > 스윕된 피벗봉 RSI (숏은 반대) — A급 조건
  C. 진입 방식: next_open = SFP봉 마감 후 다음봉 시가
                break    = SFP봉 고가 돌파 스탑주문(5봉 내, 미돌파 취소)

추가 차원: 복귀(closeback) 1봉/2봉 · 스윕 깊이 캡(≤1×ATR / 무제한) · RR 1.5/2.5/3.5
공통: SL=스윕 극값, 동시 도달 SL 우선, 갭손절 시가, 최대 300봉, 동시 1포지션.
비용 민감도: 트레이드별 리스크%(리스크/진입가) 기록 → 왕복비용 c에서 r_net = r − c/리스크%.
"""
import itertools
import os
import numpy as np
import pandas as pd
import gridsearch as g

HERE = os.path.dirname(os.path.abspath(__file__))

LEVELS = ["piv3", "piv5", "major"]
DIVS = [False, True]
CLOSEBACKS = [1, 2]
DEPTH_CAPS = [None, 1.0]        # ×ATR14
ENTRIES = ["next_open", "break"]
RRS = [1.5, 2.5, 3.5]
DIRS = ["long", "short"]
LOOKBACK = 100                  # 레벨 탐색 범위(봉)
BREAK_WINDOW = 5                # 돌파 진입 대기(봉)
MAJOR_WIN = 40


def first_breach_levels(l_or_h, piv, k, n, direction, lows, highs):
    """피벗별 (확정봉 이후) 최초 이탈 봉 인덱스. 반환: level_arr[(piv_idx)] = breach_bar(없으면 n)"""
    breach = {}
    for p in piv:
        lvl = l_or_h[p]
        b = n
        for j in range(p + k + 1, n):
            if direction == "long" and lows[j] < lvl:
                b = j
                break
            if direction == "short" and highs[j] > lvl:
                b = j
                break
        breach[p] = b
    return breach


def detect_sfp(o, h, l, c, rsi, atr, d, level_mode, need_div, closeback, depth_cap):
    """SFP 이벤트: (sfp_bar, swept_pivot, sweep_extreme). sfp_bar=복귀 확정봉."""
    n = len(c)
    k = 5 if level_mode == "piv5" else 3
    plo, phi = g.pivots(l, h, k)
    piv = plo if d == "long" else phi
    price = l if d == "long" else h
    breach = first_breach_levels(price, piv, k, n, d, l, h)

    events = []
    pi = 0
    active = []                      # 확정됐고 아직 안 깨진 피벗들
    for i in range(n):
        while pi < len(piv) and piv[pi] + k <= i - 1:   # i 이전에 확정된 피벗만
            active.append(piv[pi])
            pi += 1
        active = [p for p in active if i - p <= LOOKBACK]
        cands = []
        for p in active:
            if breach[p] != i:       # 이 봉이 최초 이탈이어야(first-breach)
                continue
            lvl = price[p]
            if level_mode == "major":
                s0 = max(0, i - MAJOR_WIN)
                ext = l[s0:i].min() if d == "long" else h[s0:i].max()
                if lvl != ext:
                    continue
            cands.append(p)
        if not cands:
            continue
        # 가장 유의미한(극단) 레벨 하나
        p = min(cands, key=lambda x: price[x]) if d == "long" else max(cands, key=lambda x: price[x])
        lvl = price[p]
        depth = (lvl - l[i]) if d == "long" else (h[i] - lvl)
        if depth <= 0:
            continue
        if depth_cap is not None and depth > depth_cap * atr[i]:
            continue
        # 복귀 판정
        sfp_bar = -1
        if d == "long":
            if c[i] > lvl:
                sfp_bar = i
            elif closeback == 2 and i + 1 < n and c[i + 1] > lvl and l[i + 1] > l[i] - 1e-12:
                sfp_bar = i + 1
        else:
            if c[i] < lvl:
                sfp_bar = i
            elif closeback == 2 and i + 1 < n and c[i + 1] < lvl and h[i + 1] < h[i] + 1e-12:
                sfp_bar = i + 1
        if sfp_bar < 0:
            continue
        if need_div:
            ok = rsi[i] > rsi[p] if d == "long" else rsi[i] < rsi[p]
            if not ok:
                continue
        extreme = min(l[i], l[sfp_bar]) if d == "long" else max(h[i], h[sfp_bar])
        events.append((sfp_bar, p, extreme))
    return events


def simulate_from(o, h, l, c, e, entry, sl, rr, d):
    """entry 가격·SL 지정 시뮬. 반환 (e, exit_bar, R, risk_pct)"""
    n = len(c)
    risk = (entry - sl) if d == "long" else (sl - entry)
    if risk <= 0:
        return None
    tp = entry + rr * risk if d == "long" else entry - rr * risk
    for i in range(e, min(e + g.MAX_HOLD, n)):
        if d == "long":
            if l[i] <= sl:
                px = min(o[i], sl) if i > e else sl
                return (e, i, (px - entry) / risk, risk / entry)
            if h[i] >= tp:
                return (e, i, rr, risk / entry)
        else:
            if h[i] >= sl:
                px = max(o[i], sl) if i > e else sl
                return (e, i, (entry - px) / risk, risk / entry)
            if l[i] <= tp:
                return (e, i, rr, risk / entry)
    i = min(e + g.MAX_HOLD, n) - 1
    r = (c[i] - entry) / risk if d == "long" else (entry - c[i]) / risk
    return (e, i, r, risk / entry)


def build_trade(o, h, l, c, ev, entry_mode, rr, d):
    sfp_bar, p, extreme = ev
    n = len(c)
    if entry_mode == "next_open":
        e = sfp_bar + 1
        if e >= n:
            return None
        return simulate_from(o, h, l, c, e, o[e], extreme, rr, d)
    # break: SFP봉 극값 돌파 스탑주문
    trig_px = h[sfp_bar] if d == "long" else l[sfp_bar]
    for b in range(sfp_bar + 1, min(sfp_bar + 1 + BREAK_WINDOW, n)):
        hit = (h[b] >= trig_px) if d == "long" else (l[b] <= trig_px)
        if hit:
            fill = max(o[b], trig_px) if d == "long" else min(o[b], trig_px)
            return simulate_from(o, h, l, c, b, fill, extreme, rr, d)
    return None


def run_dataset(sym, tf, path):
    o, h, l, c = g.load_csv(path)
    n = len(c)
    atr = g.atr14(h, l, c)
    rsi = g.rsi(c, 14)
    rows = []
    for d, lv, cb, cap in itertools.product(DIRS, LEVELS, CLOSEBACKS, DEPTH_CAPS):
        base = detect_sfp(o, h, l, c, rsi, atr, d, lv, False, cb, cap)
        with_div = detect_sfp(o, h, l, c, rsi, atr, d, lv, True, cb, cap)
        for dv, evs in ((False, base), (True, with_div)):
            for em, rr in itertools.product(ENTRIES, RRS):
                trades = []
                last_exit = -1
                for ev in evs:
                    res = build_trade(o, h, l, c, ev, em, rr, d)
                    if res is None:
                        continue
                    e, x, r, rpct = res
                    if e <= last_exit:
                        continue
                    last_exit = x
                    trades.append((e, r, rpct))
                if trades:
                    rs = np.array([t[1] for t in trades])
                    es = np.array([t[0] for t in trades])
                    rp = np.array([t[2] for t in trades])
                    half = n // 2
                    r1, r2 = rs[es < half], rs[es >= half]
                    gw = rs[rs > 0].sum(); gl = -rs[rs < 0].sum()
                    rows.append(dict(
                        symbol=sym, tf=tf, direction=d, level=lv, closeback=cb,
                        depth_cap=("none" if cap is None else cap), div=dv,
                        entry=em, rr=rr, trades=len(rs),
                        winrate=float((rs > 0).mean()), avg_r=float(rs.mean()),
                        sum_r=float(rs.sum()),
                        pf=float(gw / gl) if gl > 0 else float("inf"),
                        gross_win=float(gw), gross_loss=float(gl),
                        risk_pct=float(rp.mean()),
                        h1_sum_r=float(r1.sum()), h2_sum_r=float(r2.sum()),
                        h1_trades=int(len(r1)), h2_trades=int(len(r2))))
                else:
                    rows.append(dict(symbol=sym, tf=tf, direction=d, level=lv, closeback=cb,
                                     depth_cap=("none" if cap is None else cap), div=dv,
                                     entry=em, rr=rr, trades=0, winrate=np.nan, avg_r=np.nan,
                                     sum_r=0.0, pf=np.nan, gross_win=0.0, gross_loss=0.0,
                                     risk_pct=np.nan, h1_sum_r=0.0, h2_sum_r=0.0,
                                     h1_trades=0, h2_trades=0))
    return rows


def main():
    all_rows = []
    for sym, tf, fname in g.DATASETS:
        all_rows.extend(run_dataset(sym, tf, os.path.join(g.ROOT, fname)))
        print(f"{sym} {tf} done", flush=True)
    df = pd.DataFrame(all_rows)
    df.to_csv(os.path.join(HERE, "results", "sfp_by_dataset.csv"), index=False)

    key = ["direction", "level", "closeback", "depth_cap", "div", "entry", "rr"]
    agg_rows = []
    for kv, grp in df.groupby(key):
        tr = int(grp.trades.sum())
        gw, gl = float(grp.gross_win.sum()), float(grp.gross_loss.sum())
        h1, h2 = float(grp.h1_sum_r.sum()), float(grp.h2_sum_r.sum())
        h1n, h2n = int(grp.h1_trades.sum()), int(grp.h2_trades.sum())
        agg_rows.append(dict(zip(key, kv)) | dict(
            trades=tr,
            winrate=float((grp.winrate * grp.trades).sum() / tr) if tr else np.nan,
            avg_r=float(grp.sum_r.sum() / tr) if tr else np.nan,
            sum_r=float(grp.sum_r.sum()),
            pf=(gw / gl if gl > 0 else float("inf")) if tr else np.nan,
            risk_pct=float((grp.risk_pct * grp.trades).sum() / tr) if tr else np.nan,
            h1_avg_r=h1 / h1n if h1n else np.nan,
            h2_avg_r=h2 / h2n if h2n else np.nan,
            pos_datasets=int((grp.sum_r > 0).sum())))
    agg = pd.DataFrame(agg_rows).sort_values("avg_r", ascending=False)
    agg.to_csv(os.path.join(HERE, "results", "sfp_agg.csv"), index=False)

    pd.set_option("display.width", 250)
    ok = agg[(agg.trades >= 30) & (agg.h1_avg_r > 0) & (agg.h2_avg_r > 0)]
    print(f"\n=== EA필터 통과 {len(ok)}개 / 전체 {len(agg)}조합 — 상위 20 ===")
    print(ok.head(20).to_string(index=False))
    print("\n=== 차원별 한계효과 (평균 avg_r) ===")
    for dim in key:
        print(agg.groupby(dim).agg(avg_r=("avg_r", "mean"), pf=("pf", "mean"),
                                   tot=("trades", "sum")).sort_values("avg_r", ascending=False).to_string(), "\n")


if __name__ == "__main__":
    main()
