#!/usr/bin/env python3
"""다이버전스 결합 기법 통합 전수조사 — 사용자 리스트 ④⑤⑦⑧⑩⑪⑫ + 정밀 변형(②③⑥).

변형 목록 (모두 롱/숏 대칭, RR 1.5/2.5, RSI14·k3·오차0.5×ATR 고정):
  00_base_div   정다이버 + SR+BB + 캔들            (기존 확정 — 비교 기준)
  00_base_hid   히든다이버 + BB + 캔들             (기존 1위 — 비교 기준)
  02_fib_deep   정다이버 + 깊은 되돌림 61.8/78.6 자리
  03_reentry    정다이버 + BB 이탈 + [밴드 안 재진입 종가] 트리거 (존 볼린저 스펙)
  04a_hvn       정다이버 + 볼륨프로파일 HVN(250봉·30빈·상위3노드) 자리
  04b_avwap     정다이버 + 앵커드 VWAP(250봉 내 주요 극점 앵커) 자리
  05_triple_reg 엘더 삼중창: 상위TF(×8) MACD히스토 추세 게이트 + 정다이버
  05_triple_hid 삼중창 게이트 + 히든다이버 (엘더식 눌림목)
  06_ma200      히든다이버 + 종가>MA200 게이트 (자리 없음)
  06_ma200_bb   히든다이버 + MA200 게이트 + BB
  07_bos        정다이버 → 넥라인(구조) 돌파 종가 → 다음봉 진입, SL=p2
  07_retest     정다이버 → 넥라인 돌파 → 넥라인 리테스트 지정가, SL=p2
  08_choch      상위TF(×8) 정다이버 → 현재TF 피벗고점 돌파(CHoCH) → 진입
  10_wave5      정다이버 + 선행 피벗저점 3연속 하락(5파 소진 프록시)
  11_mtf        상위TF(×4) 정다이버 활성창 ∧ 현재TF 정다이버 (다중TF 정렬)
  12_obv        가격 피벗 LL + OBV HL (RSI 대신 OBV 다이버)
  12_obv_bb     OBV 다이버 + BB 자리
공통 체결: 캔들 트리거(별도 명시 제외) → 다음봉 시가 · SL=트리거봉 극값(07/08은 명시 SL)
          · SL·TP 동시=SL · 갭손절 시가 · 최대 300봉 · 동시 1포지션.
"""
import itertools
import os
import numpy as np
import pandas as pd
import gridsearch as g
from sfp_scan import simulate_from

HERE = os.path.dirname(os.path.abspath(__file__))
RRS = [1.5, 2.5]
DIRS = ["long", "short"]
K, RSI_P = 3, 14
BOS_WINDOW, RETEST_WINDOW, CHOCH_WINDOW = 20, 15, 80


def load_full(path):
    df = pd.read_csv(path, sep="\t")
    df.columns = [c.strip("<>").lower() for c in df.columns]
    return (df["open"].to_numpy(float), df["high"].to_numpy(float),
            df["low"].to_numpy(float), df["close"].to_numpy(float),
            df["tickvol"].to_numpy(float))


def div_events(l, h, rsi, k, d, hidden=False):
    """(p1, p2, confirm) 목록"""
    plo, phi = g.pivots(l, h, k)
    piv = plo if d == "long" else phi
    price = l if d == "long" else h
    out = []
    for j in range(1, len(piv)):
        p1, p2 = piv[j - 1], piv[j]
        if not (k < p2 - p1 <= g.MAX_PIVOT_GAP):
            continue
        if d == "long":
            ok = (price[p2] > price[p1] and rsi[p2] < rsi[p1]) if hidden else \
                 (price[p2] < price[p1] and rsi[p2] > rsi[p1])
        else:
            ok = (price[p2] < price[p1] and rsi[p2] > rsi[p1]) if hidden else \
                 (price[p2] > price[p1] and rsi[p2] < rsi[p1])
        if ok:
            out.append((p1, p2, p2 + k))
    return out


def resample(o, h, l, c, v, m):
    n = len(c) // m
    idx = np.arange(n) * m
    O = o[idx]
    H = np.array([h[i:i + m].max() for i in idx])
    L = np.array([l[i:i + m].min() for i in idx])
    C = c[idx + m - 1]
    end = idx + m - 1          # HTF봉 j의 종가 시점 = 베이스 인덱스
    return O, H, L, C, end


def hvn_flag(h, l, c, v, p2, price, tol):
    s0 = max(0, p2 - 250)
    tp = (h[s0:p2] + l[s0:p2] + c[s0:p2]) / 3
    w = v[s0:p2]
    if w.sum() <= 0:
        w = np.ones_like(tp)
    lo, hi = tp.min(), tp.max()
    if hi <= lo:
        return False
    bins = np.clip(((tp - lo) / (hi - lo) * 30).astype(int), 0, 29)
    volbin = np.bincount(bins, weights=w, minlength=30)
    top = np.argsort(volbin)[-3:]
    centers = lo + (top + 0.5) * (hi - lo) / 30
    return bool(np.any(np.abs(centers - price) <= tol))


def avwap_flag(h, l, c, v, p2, price, d, tol):
    s0 = max(0, p2 - 250)
    seg_h, seg_l = h[s0:p2], l[s0:p2]
    if len(seg_h) < 10:
        return False
    anchor = s0 + (int(np.argmax(seg_h)) if d == "long" else int(np.argmin(seg_l)))
    tp = (h[anchor:p2 + 1] + l[anchor:p2 + 1] + c[anchor:p2 + 1]) / 3
    w = v[anchor:p2 + 1]
    if w.sum() <= 0:
        w = np.ones_like(tp)
    vwap = float((tp * w).sum() / w.sum())
    return abs(price - vwap) <= tol


def stats_row(trades, n, meta):
    rs = np.array([r for _, r in trades])
    es = np.array([e for e, _ in trades])
    half = n // 2
    r1, r2 = rs[es < half], rs[es >= half]
    gw = rs[rs > 0].sum(); gl = -rs[rs < 0].sum()
    return meta | dict(
        trades=len(rs), winrate=float((rs > 0).mean()), avg_r=float(rs.mean()),
        sum_r=float(rs.sum()), pf=float(gw / gl) if gl > 0 else float("inf"),
        gross_win=float(gw), gross_loss=float(gl),
        h1_sum_r=float(r1.sum()), h2_sum_r=float(r2.sum()),
        h1_trades=int(len(r1)), h2_trades=int(len(r2)))


def collect(o, h, l, c, sims, n, meta_base, rr):
    """sims: (entry_bar, exit_bar, r) 시간순 목록 → 1포지션 통계"""
    trades, last = [], -1
    for e, x, r in sims:
        if e <= last:
            continue
        last = x
        trades.append((e, r))
    if not trades:
        return meta_base | dict(trades=0, winrate=np.nan, avg_r=np.nan, sum_r=0.0,
                                pf=np.nan, gross_win=0.0, gross_loss=0.0,
                                h1_sum_r=0.0, h2_sum_r=0.0, h1_trades=0, h2_trades=0)
    return stats_row(trades, n, meta_base)


def candle_pipeline(o, h, l, c, macd, sig, events, d, rr, n, trig="candle"):
    """confirm → 캔들 트리거 → 표준 시뮬. events: (confirm,) 또는 (.., confirm) 마지막 원소 confirm"""
    sims = []
    for ev in events:
        confirm = ev[-1]
        if confirm >= n - 2:
            continue
        t = g.find_trigger(o, h, l, c, macd, sig, confirm, trig, d)
        if t < 0:
            continue
        res = g.simulate(o, h, l, c, t, rr, d)
        if res:
            sims.append(res)
    return sims


def run_dataset(sym, tf, path):
    o, h, l, c, v = load_full(path)
    n = len(c)
    atr = g.atr14(h, l, c)
    bb_up, bb_lo = g.bollinger(c)
    macd = g.ema(c, 12) - g.ema(c, 26)
    sig = g.ema(macd, 9)
    rsi = g.rsi(c, RSI_P)
    ma200 = pd.Series(c).rolling(200).mean().to_numpy()
    obv = np.cumsum(np.sign(np.diff(c, prepend=c[0])) * np.where(v > 0, v, 1.0))
    plo, phi = g.pivots(l, h, K)
    lv_idx = np.concatenate([plo, phi]); lv_val = np.concatenate([l[plo], h[phi]])
    od = np.argsort(lv_idx); lv_idx, lv_val = lv_idx[od], lv_val[od]

    # 상위TF 다이버전스 (베이스 인덱스로 매핑)
    htf = {}
    for m in (4, 8):
        O, H, L, C, end = resample(o, h, l, c, v, m)
        R = g.rsi(C, RSI_P)
        evs = div_events(L, H, R, K, "long") , div_events(L, H, R, K, "short")
        MC = g.ema(C, 12) - g.ema(C, 26)
        MS = g.ema(MC, 9)
        htf[m] = dict(end=end, ev={"long": evs[0], "short": evs[1]},
                      hist=MC - MS, n=len(C))

    rows = []
    for d in DIRS:
        price = l if d == "long" else h
        reg = div_events(l, h, rsi, K, d)
        hid = div_events(l, h, rsi, K, d, hidden=True)

        def zflags(p2):
            tol = g.ATR_TOL * atr[p2]
            m_ = (lv_idx < p2 - K) & (lv_idx >= p2 - g.SR_LOOKBACK)
            sr = bool(np.any(np.abs(lv_val[m_] - price[p2]) <= tol)) if m_.any() else False
            bb = (not np.isnan(bb_lo[p2])) and (l[p2] <= bb_lo[p2] if d == "long" else h[p2] >= bb_up[p2])
            return sr, bb, tol

        variants = {}
        # 00 baselines
        variants["00_base_div"] = [(p1, p2, cf) for p1, p2, cf in reg if all(zflags(p2)[:2])]
        variants["00_base_hid"] = [(p1, p2, cf) for p1, p2, cf in hid if zflags(p2)[1]]
        # 02 deep fib
        ev = []
        for p1, p2, cf in reg:
            tol = g.ATR_TOL * atr[p2]
            s0 = max(0, p2 - g.FIB_LOOKBACK)
            hh = h[s0:p2].max() if p2 > s0 else h[p2]
            ll = l[s0:p2].min() if p2 > s0 else l[p2]
            rng = hh - ll
            if rng <= 0:
                continue
            for r_ in (0.618, 0.786):
                lvl = hh - r_ * rng if d == "long" else ll + r_ * rng
                if abs(price[p2] - lvl) <= tol:
                    ev.append((p1, p2, cf)); break
        variants["02_fib_deep"] = ev
        # 04
        variants["04a_hvn"] = [(p1, p2, cf) for p1, p2, cf in reg
                               if hvn_flag(h, l, c, v, p2, price[p2], g.ATR_TOL * atr[p2])]
        variants["04b_avwap"] = [(p1, p2, cf) for p1, p2, cf in reg
                                 if avwap_flag(h, l, c, v, p2, price[p2], d, g.ATR_TOL * atr[p2])]
        # 05 triple screen: 상위TF(×8) MACD히스토 게이트 (롱=상위 추세 상승)
        hi8 = htf[8]
        def htf_up(p2):
            j = min(int(p2 // 8), hi8["n"] - 1)
            return hi8["hist"][j] > 0 if d == "long" else hi8["hist"][j] < 0
        variants["05_triple_reg"] = [(p1, p2, cf) for p1, p2, cf in reg if htf_up(p2)]
        variants["05_triple_hid"] = [(p1, p2, cf) for p1, p2, cf in hid if htf_up(p2)]
        # 06 MA200 게이트 (히든)
        def ma_ok(p2):
            return (not np.isnan(ma200[p2])) and (c[p2] > ma200[p2] if d == "long" else c[p2] < ma200[p2])
        variants["06_ma200"] = [(p1, p2, cf) for p1, p2, cf in hid if ma_ok(p2)]
        variants["06_ma200_bb"] = [(p1, p2, cf) for p1, p2, cf in hid if ma_ok(p2) and zflags(p2)[1]]
        # 10 wave5 프록시: p1 앞 피벗 2개가 연속 하락(롱)
        piv_all = plo if d == "long" else phi
        pos_of = {p: i for i, p in enumerate(piv_all)}
        ev = []
        for p1, p2, cf in reg:
            i1 = pos_of.get(p1, -1)
            if i1 < 2:
                continue
            q1, q2 = piv_all[i1 - 1], piv_all[i1 - 2]
            if d == "long" and price[q2] > price[q1] > price[p1]:
                ev.append((p1, p2, cf))
            if d == "short" and price[q2] < price[q1] < price[p1]:
                ev.append((p1, p2, cf))
        variants["10_wave5"] = ev
        # 11 MTF 정렬: 상위TF(×4) 다이버 확정 후 40베이스봉 내 베이스 다이버
        hi4 = htf[4]
        wins = []
        for P1, P2, CF in hi4["ev"][d]:
            if CF < hi4["n"]:
                s = hi4["end"][CF]
                wins.append((s, s + 40))
        ev = [(p1, p2, cf) for p1, p2, cf in reg if any(a <= cf <= b for a, b in wins)]
        variants["11_mtf"] = ev
        # 12 OBV 다이버
        piv = plo if d == "long" else phi
        ev = []
        for j in range(1, len(piv)):
            p1, p2 = piv[j - 1], piv[j]
            if not (K < p2 - p1 <= g.MAX_PIVOT_GAP):
                continue
            if d == "long" and price[p2] < price[p1] and obv[p2] > obv[p1]:
                ev.append((p1, p2, p2 + K))
            if d == "short" and price[p2] > price[p1] and obv[p2] < obv[p1]:
                ev.append((p1, p2, p2 + K))
        variants["12_obv"] = ev
        variants["12_obv_bb"] = [(p1, p2, cf) for p1, p2, cf in ev if zflags(p2)[1]]

        for rr in RRS:
            for name, evs in variants.items():
                sims = candle_pipeline(o, h, l, c, macd, sig, evs, d, rr, n)
                rows.append(collect(o, h, l, c, sims,
                                    n, dict(symbol=sym, tf=tf, direction=d, variant=name, rr=rr), rr))

            # 03_reentry: BB 이탈 다이버 + 밴드 재진입 종가 트리거
            sims = []
            for p1, p2, cf in reg:
                if not zflags(p2)[1] or cf >= n - 2:
                    continue
                t = -1
                for tt in range(max(cf, 1), min(cf + g.TRIGGER_WINDOW + 1, n - 1)):
                    inside = (c[tt] > bb_lo[tt]) if d == "long" else (c[tt] < bb_up[tt])
                    if inside:
                        t = tt; break
                if t < 0:
                    continue
                res = g.simulate(o, h, l, c, t, rr, d)
                if res:
                    sims.append(res)
            rows.append(collect(o, h, l, c, sims, n,
                                dict(symbol=sym, tf=tf, direction=d, variant="03_reentry", rr=rr), rr))

            # 07 BOS / 리테스트
            bos_sims, rt_sims = [], []
            for p1, p2, cf in reg:
                if cf >= n - 2:
                    continue
                neck = h[p1:p2 + 1].max() if d == "long" else l[p1:p2 + 1].min()
                sl = price[p2]
                bos = -1
                for t in range(cf, min(cf + BOS_WINDOW, n - 1)):
                    if (d == "long" and c[t] > neck) or (d == "short" and c[t] < neck):
                        bos = t; break
                if bos < 0:
                    continue
                e = bos + 1
                res = simulate_from(o, h, l, c, e, o[e], sl, rr, d)
                if res:
                    bos_sims.append(res[:3])
                for b in range(bos + 1, min(bos + 1 + RETEST_WINDOW, n)):
                    hit = (l[b] <= neck) if d == "long" else (h[b] >= neck)
                    if hit:
                        fill = min(o[b], neck) if d == "long" else max(o[b], neck)
                        res = simulate_from(o, h, l, c, b, fill, sl, rr, d)
                        if res:
                            rt_sims.append(res[:3])
                        break
            rows.append(collect(o, h, l, c, bos_sims, n,
                                dict(symbol=sym, tf=tf, direction=d, variant="07_bos", rr=rr), rr))
            rows.append(collect(o, h, l, c, rt_sims, n,
                                dict(symbol=sym, tf=tf, direction=d, variant="07_retest", rr=rr), rr))

            # 08 CHoCH: 상위TF(×8) 다이버 → 베이스 피벗고점(저점) 돌파
            sims = []
            opp = phi if d == "long" else plo   # 롱=피벗고점 돌파
            for P1, P2, CF in hi8["ev"][d]:
                if CF >= hi8["n"]:
                    continue
                ws = hi8["end"][CF] + 1
                we = min(ws + CHOCH_WINDOW, n - 1)
                done = False
                for t in range(ws, we):
                    cand = [q for q in opp if q + K <= t]   # t까지 확정된 피벗
                    if not cand:
                        continue
                    lvl = h[cand[-1]] if d == "long" else l[cand[-1]]
                    brk = (c[t] > lvl) if d == "long" else (c[t] < lvl)
                    if brk:
                        sl = l[ws:t + 1].min() if d == "long" else h[ws:t + 1].max()
                        e = t + 1
                        if e < n:
                            res = simulate_from(o, h, l, c, e, o[e], sl, rr, d)
                            if res:
                                sims.append(res[:3])
                        done = True
                        break
                if done:
                    continue
            rows.append(collect(o, h, l, c, sims, n,
                                dict(symbol=sym, tf=tf, direction=d, variant="08_choch", rr=rr), rr))
    return rows


def main():
    all_rows = []
    for sym, tf, fname in g.DATASETS:
        all_rows.extend(run_dataset(sym, tf, os.path.join(g.ROOT, fname)))
        print(sym, tf, "done", flush=True)
    df = pd.DataFrame(all_rows)
    df.to_csv(os.path.join(HERE, "results", "combo_by_dataset.csv"), index=False)

    key = ["variant", "direction", "rr"]
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
    agg.to_csv(os.path.join(HERE, "results", "combo_agg.csv"), index=False)

    pd.set_option("display.width", 250)
    ok = agg[(agg.trades >= 30) & (agg.h1_avg_r > 0) & (agg.h2_avg_r > 0)]
    print(f"\n=== EA필터 통과 {len(ok)} / {len(agg)} ===")
    print(ok.to_string(index=False))
    print("\n=== 변형별 최고 셀 (거래>=30) ===")
    m = agg[agg.trades >= 30]
    print(m.loc[m.groupby("variant").avg_r.idxmax()].sort_values("avg_r", ascending=False).to_string(index=False))


if __name__ == "__main__":
    main()
