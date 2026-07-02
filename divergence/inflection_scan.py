#!/usr/bin/env python3
"""변곡(반전) 탐지기 7종 전수 비교 — RSI 다이버전스와 동일 하네스.

탐지기(롱 기준, 숏은 대칭):
  div       RSI 정다이버전스: 가격 저점↓ + RSI 저점↑ (기존 베이스라인)
  hidden    히든 다이버전스: 가격 저점↑ + RSI 저점↓ (추세 지속 눌림)
  spring    2B/스프링: 직전 피벗저점을 저가로 하회했다가 종가는 위로 복귀(가짜 이탈)
  pinbar    핀바: 아래꼬리≥몸통2배·꼬리≥레인지60%·종가 상단 50% 이내
  wbottom   볼린저 W바텀: 1저점은 밴드 밖, 2저점은 밴드 안(패닉 소진)
  failswing RSI 실패 스윙: RSI 피벗저점 상승(첫 저점<35), 가격 무관
  keyrev    키 리버설: 저가가 직전 10봉 최저 하회 + 종가가 직전봉 고가 위
  exhaust   소진 반전: 4봉 연속 종가 하락 후 종가>직전봉 고가 양봉

공통 골격(gridsearch.py와 동일):
  셋업 확정 → 자리 필터(없음/SR/BB/SR+BB, 컨플루언스 AND)
  → 트리거(self=셋업 확정봉 즉시 / candle=반전 장악봉, 10봉 내)
  → 다음봉 시가 진입 · SL=트리거봉 극값 · TP=RR×리스크(1.5/2.5)
  → SL·TP 동시=SL, 갭손절=시가, 최대 300봉, 동시 1포지션
고정: RSI14 · k3 · 오차 0.5×ATR14
"""
import itertools
import os
import numpy as np
import pandas as pd
import gridsearch as g

HERE = os.path.dirname(os.path.abspath(__file__))

DETECTORS = ["div", "hidden", "spring", "pinbar", "wbottom", "failswing", "keyrev", "exhaust"]
ZONES = [(), ("SR",), ("BB",), ("SR", "BB")]
TRIGGERS = ["self", "candle"]
RRS = [1.5, 2.5]
DIRS = ["long", "short"]
RSI_P, K = 14, 3


def pivot_pairs(piv, k, max_gap):
    for j in range(1, len(piv)):
        p1, p2 = piv[j - 1], piv[j]
        if k < p2 - p1 <= max_gap:
            yield p1, p2


def detect(o, h, l, c, rsi, k, d, bb_up, bb_lo, tickvol=None):
    """탐지기별 셋업 목록: (ref_bar, confirm_bar). ref=자리 평가 기준봉."""
    n = len(c)
    plo, phi = g.pivots(l, h, k)
    piv = plo if d == "long" else phi
    price = l if d == "long" else h
    out = {}

    ev = []
    for p1, p2 in pivot_pairs(piv, k, g.MAX_PIVOT_GAP):
        if d == "long" and price[p2] < price[p1] and rsi[p2] > rsi[p1]:
            ev.append((p2, p2 + k))
        if d == "short" and price[p2] > price[p1] and rsi[p2] < rsi[p1]:
            ev.append((p2, p2 + k))
    out["div"] = ev

    ev = []
    for p1, p2 in pivot_pairs(piv, k, g.MAX_PIVOT_GAP):
        if d == "long" and price[p2] > price[p1] and rsi[p2] < rsi[p1]:
            ev.append((p2, p2 + k))
        if d == "short" and price[p2] < price[p1] and rsi[p2] > rsi[p1]:
            ev.append((p2, p2 + k))
    out["hidden"] = ev

    # spring: 직전 확정 피벗 레벨을 장중 이탈 후 종가 복귀. 셋업봉=그 봉 자체
    ev = []
    pi = 0
    last_piv = -1
    for i in range(n):
        while pi < len(piv) and piv[pi] + k <= i:  # i 시점에 확정된 피벗만
            last_piv = piv[pi]
            pi += 1
        if last_piv < 0 or i - last_piv > g.MAX_PIVOT_GAP or i <= last_piv + k:
            continue
        lvl = price[last_piv]
        if d == "long" and l[i] < lvl and c[i] > lvl:
            ev.append((i, i))
        if d == "short" and h[i] > lvl and c[i] < lvl:
            ev.append((i, i))
    out["spring"] = ev

    ev = []
    for i in range(1, n):
        rng = h[i] - l[i]
        body = abs(c[i] - o[i])
        if rng <= 0:
            continue
        lower = min(o[i], c[i]) - l[i]
        upper = h[i] - max(o[i], c[i])
        if d == "long" and lower >= 2 * body and lower >= 0.6 * rng and c[i] >= h[i] - 0.5 * rng:
            ev.append((i, i))
        if d == "short" and upper >= 2 * body and upper >= 0.6 * rng and c[i] <= l[i] + 0.5 * rng:
            ev.append((i, i))
    out["pinbar"] = ev

    ev = []
    for p1, p2 in pivot_pairs(piv, k, g.MAX_PIVOT_GAP):
        if np.isnan(bb_lo[p1]) or np.isnan(bb_lo[p2]):
            continue
        if d == "long" and l[p1] <= bb_lo[p1] and l[p2] > bb_lo[p2]:
            ev.append((p2, p2 + k))
        if d == "short" and h[p1] >= bb_up[p1] and h[p2] < bb_up[p2]:
            ev.append((p2, p2 + k))
    out["wbottom"] = ev

    # failswing: RSI 자체의 피벗 (k봉 확정)
    ev = []
    rlo, rhi = g.pivots(np.asarray(rsi), np.asarray(rsi), k)
    rpiv = rlo if d == "long" else rhi
    for p1, p2 in pivot_pairs(rpiv, k, g.MAX_PIVOT_GAP):
        if d == "long" and rsi[p1] < 35 and rsi[p2] > rsi[p1]:
            ev.append((p2, p2 + k))
        if d == "short" and rsi[p1] > 65 and rsi[p2] < rsi[p1]:
            ev.append((p2, p2 + k))
    out["failswing"] = ev

    ev = []
    for i in range(11, n):
        if d == "long" and l[i] < l[i - 10:i].min() and c[i] > h[i - 1]:
            ev.append((i, i))
        if d == "short" and h[i] > h[i - 10:i].max() and c[i] < l[i - 1]:
            ev.append((i, i))
    out["keyrev"] = ev

    ev = []
    for i in range(5, n):
        if d == "long":
            down = all(c[i - j] < c[i - j - 1] for j in range(1, 5))
            if down and c[i] > o[i] and c[i] > h[i - 1]:
                ev.append((i, i))
        else:
            up = all(c[i - j] > c[i - j - 1] for j in range(1, 5))
            if up and c[i] < o[i] and c[i] < l[i - 1]:
                ev.append((i, i))
    out["exhaust"] = ev
    return out


def zone_flags(o, h, l, c, ref, d, atr, bb_up, bb_lo, lv_idx, lv_val, k):
    """ref봉에서 SR/BB 자리 플래그"""
    price = l[ref] if d == "long" else h[ref]
    tol = g.ATR_TOL * atr[ref]
    m = (lv_idx < ref - k) & (lv_idx >= ref - g.SR_LOOKBACK)   # ref 직전 피벗은 제외
    sr = bool(np.any(np.abs(lv_val[m] - price) <= tol)) if m.any() else False
    if d == "long":
        bb = (not np.isnan(bb_lo[ref])) and l[ref] <= bb_lo[ref]
    else:
        bb = (not np.isnan(bb_up[ref])) and h[ref] >= bb_up[ref]
    return sr, bb


def run_dataset(sym, tf, path):
    o, h, l, c = g.load_csv(path)
    n = len(c)
    atr = g.atr14(h, l, c)
    bb_up, bb_lo = g.bollinger(c)
    macd = g.ema(c, 12) - g.ema(c, 26)
    sig = g.ema(macd, 9)
    rsi = g.rsi(c, RSI_P)
    plo, phi = g.pivots(l, h, K)
    lv_idx = np.concatenate([plo, phi])
    lv_val = np.concatenate([l[plo], h[phi]])
    order = np.argsort(lv_idx)
    lv_idx, lv_val = lv_idx[order], lv_val[order]

    rows = []
    for d in DIRS:
        setups = detect(o, h, l, c, rsi, K, d, bb_up, bb_lo)
        for det in DETECTORS:
            evs = setups[det]
            # 자리 플래그 + 트리거/시뮬 캐시
            cache = []
            for ref, confirm in evs:
                if confirm >= n - 2:
                    continue
                sr, bb = zone_flags(o, h, l, c, ref, d, atr, bb_up, bb_lo, lv_idx, lv_val, K)
                sims = {}
                for trg in TRIGGERS:
                    if trg == "self":
                        t = confirm
                    else:
                        t = g.find_trigger(o, h, l, c, macd, sig, confirm, "candle", d)
                    sims[trg] = None if t < 0 else {rr: g.simulate(o, h, l, c, t, rr, d) for rr in RRS}
                cache.append((sr, bb, sims))
            for zs, trg, rr in itertools.product(ZONES, TRIGGERS, RRS):
                trades = []
                last_exit = -1
                for sr, bb, sims in cache:
                    if "SR" in zs and not sr:
                        continue
                    if "BB" in zs and not bb:
                        continue
                    s = sims[trg]
                    if s is None or s[rr] is None:
                        continue
                    e, x, r = s[rr]
                    if e <= last_exit:
                        continue
                    last_exit = x
                    trades.append((e, r))
                if trades:
                    rs = np.array([r for _, r in trades])
                    es = np.array([e for e, _ in trades])
                    half = n // 2
                    r1, r2 = rs[es < half], rs[es >= half]
                    gw = rs[rs > 0].sum(); gl = -rs[rs < 0].sum()
                    rows.append(dict(
                        symbol=sym, tf=tf, direction=d, detector=det,
                        zone="+".join(zs) if zs else "none", trigger=trg, rr=rr,
                        trades=len(rs), winrate=float((rs > 0).mean()),
                        avg_r=float(rs.mean()), sum_r=float(rs.sum()),
                        pf=float(gw / gl) if gl > 0 else float("inf"),
                        gross_win=float(gw), gross_loss=float(gl),
                        h1_sum_r=float(r1.sum()), h2_sum_r=float(r2.sum()),
                        h1_trades=int(len(r1)), h2_trades=int(len(r2))))
                else:
                    rows.append(dict(symbol=sym, tf=tf, direction=d, detector=det,
                                     zone="+".join(zs) if zs else "none", trigger=trg, rr=rr,
                                     trades=0, winrate=np.nan, avg_r=np.nan, sum_r=0.0,
                                     pf=np.nan, gross_win=0.0, gross_loss=0.0,
                                     h1_sum_r=0.0, h2_sum_r=0.0, h1_trades=0, h2_trades=0))
    return rows


def main():
    all_rows = []
    for sym, tf, fname in g.DATASETS:
        rows = run_dataset(sym, tf, os.path.join(g.ROOT, fname))
        all_rows.extend(rows)
        print(f"{sym} {tf} done", flush=True)
    df = pd.DataFrame(all_rows)
    df.to_csv(os.path.join(HERE, "results", "inflection_by_dataset.csv"), index=False)

    key = ["detector", "direction", "zone", "trigger", "rr"]
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
            h1_avg_r=h1 / h1n if h1n else np.nan,
            h2_avg_r=h2 / h2n if h2n else np.nan,
            pos_datasets=int((grp.sum_r > 0).sum())))
    agg = pd.DataFrame(agg_rows).sort_values("avg_r", ascending=False)
    agg.to_csv(os.path.join(HERE, "results", "inflection_agg.csv"), index=False)

    ok = agg[(agg.trades >= 30) & (agg.h1_avg_r > 0) & (agg.h2_avg_r > 0)]
    print("\n=== EA필터 통과 (거래>=30, 전후반+) 상위 20 ===")
    print(ok.head(20).to_string(index=False))
    print("\n=== 탐지기별 요약 (전 조합 평균) ===")
    print(agg.groupby("detector").agg(avg_r=("avg_r", "mean"), pf=("pf", "mean"),
                                      tot=("trades", "sum")).sort_values("avg_r", ascending=False).to_string())


if __name__ == "__main__":
    main()
