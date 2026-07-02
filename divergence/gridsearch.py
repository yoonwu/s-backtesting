#!/usr/bin/env python3
"""RSI 다이버전스(변곡) 전략 336개 조합 전수 그리드서치 — s-backtesting 실데이터판.

전략 정의
---------
1. 스윙 피벗: low[i]가 좌우 k봉(k=3/5) 중 최저면 피벗저점. 피벗은 k봉 뒤에 확정(룩어헤드 방지).
2. 다이버전스: 연속 피벗저점 p1→p2에서 가격은 저점 낮춤(low[p2]<low[p1]),
   RSI(9/14)는 저점 높임(rsi[p2]>rsi[p1]) → 상승 다이버전스(롱). 숏은 대칭.
3. 자리 필터(피벗 p2 시점 평가, 선택 필터 전부 충족해야 함=컨플루언스 AND):
   - S/R : 과거 피벗(고/저) 레벨과 0.5×ATR14 이내
   - BB  : 볼린저(20,2σ) 밴드 밖 (롱=하단 이탈, 숏=상단 이탈)
   - FIB : 최근 120봉 스윙 레인지의 38.2/50/61.8% 되돌림 레벨과 0.5×ATR14 이내
4. 트리거(확정봉부터 10봉 내 첫 발생):
   - 캔들      : 롱=양봉이며 종가>직전봉 고가 (반전 장악형)
   - MACD      : MACD(12,26,9) 라인이 시그널 상향 돌파
   - 캔들+MACD : 캔들 조건 + 해당 봉에서 MACD>시그널
5. 진입: 트리거 다음 봉 시가. 손절: 트리거봉 저가(롱)/고가(숏). 익절: 1.5R / 2.5R.
6. 보수적 체결: 한 봉에서 SL·TP 동시 도달 시 SL 처리. 갭으로 손절 관통 시 시가 체결(더 나쁜 값).
   TP 갭은 TP 가격만 인정. 최대 보유 300봉 초과 시 종가 청산. 동시 1포지션(중복 진입 금지).

그리드: 방향(2) × 자리부분집합(7) × 트리거(3) × RR(2) × RSI(2) × k(2) = 336
"""
import itertools
import os
import sys
import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

DATASETS = [
    ("US100",  "M15", "US100.b_M15_202407010100_202606290345.csv"),
    ("US100",  "M30", "US100.b_M30_202407010100_202606290330.csv"),
    ("US100",  "H1",  "US100.b_H1_202407010100_202606290300.csv"),
    ("US100",  "H2",  "US100.b_H2_202407010000_202606290200.csv"),
    ("US100",  "H4",  "US100.b_H4_202407010000_202606290000.csv"),
    ("XAUUSD", "M15", "XAUUSD.b_M15_202407010000_202606290345.csv"),
    ("XAUUSD", "M30", "XAUUSD.b_M30_202407010000_202606290330.csv"),
    ("XAUUSD", "H1",  "XAUUSD.b_H1_202407010000_202606290300.csv"),
    ("XAUUSD", "H2",  "XAUUSD.b_H2_202407010000_202606290200.csv"),
    ("XAUUSD", "H4",  "XAUUSD.b_H4_202407010000_202606290000.csv"),
]

RSI_PERIODS = [9, 14]
SWING_KS = [3, 5]
DIRS = ["long", "short"]
TRIGGERS = ["candle", "macd", "candle+macd"]
RRS = [1.5, 2.5]
ZONES = ["SR", "BB", "FIB"]
ZONE_SUBSETS = [c for n in range(1, 4) for c in itertools.combinations(ZONES, n)]  # 7

MAX_PIVOT_GAP = 60      # p1~p2 최대 간격(봉)
TRIGGER_WINDOW = 10     # 확정봉 이후 트리거 탐색 창
MAX_HOLD = 300          # 최대 보유 봉수
SR_LOOKBACK = 250       # S/R 레벨 탐색 범위
FIB_LOOKBACK = 120      # 피보 스윙 레인지 범위
ATR_TOL = 0.5           # 레벨 허용 오차(×ATR14)


def load_csv(path):
    df = pd.read_csv(path, sep="\t")
    df.columns = [c.strip("<>").lower() for c in df.columns]
    return (df["open"].to_numpy(float), df["high"].to_numpy(float),
            df["low"].to_numpy(float), df["close"].to_numpy(float))


def rsi(close, period):
    delta = np.diff(close, prepend=close[0])
    gain = np.where(delta > 0, delta, 0.0)
    loss = np.where(delta < 0, -delta, 0.0)
    ag = np.empty_like(close); al = np.empty_like(close)
    ag[0] = gain[0]; al[0] = loss[0]
    a = 1.0 / period
    for i in range(1, len(close)):  # Wilder smoothing
        ag[i] = ag[i-1] + a * (gain[i] - ag[i-1])
        al[i] = al[i-1] + a * (loss[i] - al[i-1])
    rs = ag / np.where(al == 0, 1e-12, al)
    return 100 - 100 / (1 + rs)


def ema(x, period):
    a = 2.0 / (period + 1)
    out = np.empty_like(x)
    out[0] = x[0]
    for i in range(1, len(x)):
        out[i] = out[i-1] + a * (x[i] - out[i-1])
    return out


def atr14(h, l, c):
    pc = np.roll(c, 1); pc[0] = c[0]
    tr = np.maximum(h - l, np.maximum(np.abs(h - pc), np.abs(l - pc)))
    return ema(tr, 14 * 2 - 1)  # Wilder ATR ≈ EMA(2p-1)


def bollinger(c, period=20, mult=2.0):
    s = pd.Series(c)
    ma = s.rolling(period).mean().to_numpy()
    sd = s.rolling(period).std(ddof=0).to_numpy()
    return ma + mult * sd, ma - mult * sd


def pivots(low, high, k):
    """k봉 좌우 극값 피벗. 반환: (피벗저점 인덱스, 피벗고점 인덱스)"""
    n = len(low)
    plo, phi = [], []
    for i in range(k, n - k):
        w = low[i-k:i+k+1]
        if low[i] == w.min() and (w == low[i]).sum() == 1:
            plo.append(i)
        w = high[i-k:i+k+1]
        if high[i] == w.max() and (w == high[i]).sum() == 1:
            phi.append(i)
    return np.array(plo, int), np.array(phi, int)


def build_events(o, h, l, c, rsi_arr, k, direction, atr, bb_up, bb_lo):
    """다이버전스 이벤트 목록. 각 이벤트: (p2, confirm_idx, sr_flag, bb_flag, fib_flag)"""
    plo, phi = pivots(l, h, k)
    # S/R 레벨 배열: 모든 피벗의 극값 가격 (저점 피벗=저가, 고점 피벗=고가)
    lv_idx = np.concatenate([plo, phi])
    lv_val = np.concatenate([l[plo], h[phi]])
    order = np.argsort(lv_idx)
    lv_idx, lv_val = lv_idx[order], lv_val[order]

    piv = plo if direction == "long" else phi
    price = l if direction == "long" else h
    events = []
    for j in range(1, len(piv)):
        p1, p2 = piv[j-1], piv[j]
        if p2 - p1 > MAX_PIVOT_GAP or p2 - p1 <= k:
            continue
        if direction == "long":
            div = price[p2] < price[p1] and rsi_arr[p2] > rsi_arr[p1]
        else:
            div = price[p2] > price[p1] and rsi_arr[p2] < rsi_arr[p1]
        if not div:
            continue
        confirm = p2 + k
        if confirm >= len(c) - 2:
            continue
        tol = ATR_TOL * atr[p2]
        # S/R: p1 이전 피벗 레벨과 tol 이내 (p2 기준 SR_LOOKBACK봉 내)
        m = (lv_idx < p1) & (lv_idx >= p2 - SR_LOOKBACK)
        sr = bool(np.any(np.abs(lv_val[m] - price[p2]) <= tol)) if m.any() else False
        # BB: 밴드 이탈
        if direction == "long":
            bb = (not np.isnan(bb_lo[p2])) and l[p2] <= bb_lo[p2]
        else:
            bb = (not np.isnan(bb_up[p2])) and h[p2] >= bb_up[p2]
        # FIB: 최근 스윙 레인지 되돌림 레벨 근접
        s0 = max(0, p2 - FIB_LOOKBACK)
        hi = h[s0:p2].max() if p2 > s0 else h[p2]
        lo = l[s0:p2].min() if p2 > s0 else l[p2]
        rng = hi - lo
        fib = False
        if rng > 0:
            for r in (0.382, 0.5, 0.618):
                lvl = hi - r * rng if direction == "long" else lo + r * rng
                if abs(price[p2] - lvl) <= tol:
                    fib = True
                    break
        events.append((p2, confirm, sr, bb, fib))
    return events


def find_trigger(o, h, l, c, macd, sig, confirm, trigger, direction):
    """확정봉부터 TRIGGER_WINDOW봉 내 첫 트리거 봉 인덱스(없으면 -1)"""
    n = len(c)
    for t in range(max(confirm, 1), min(confirm + TRIGGER_WINDOW + 1, n - 1)):
        if direction == "long":
            candle = c[t] > o[t] and c[t] > h[t-1]
            mx = macd[t] > sig[t] and macd[t-1] <= sig[t-1]
            mstate = macd[t] > sig[t]
        else:
            candle = c[t] < o[t] and c[t] < l[t-1]
            mx = macd[t] < sig[t] and macd[t-1] >= sig[t-1]
            mstate = macd[t] < sig[t]
        ok = (candle if trigger == "candle" else
              mx if trigger == "macd" else (candle and mstate))
        if ok:
            return t
    return -1


def simulate(o, h, l, c, t, rr, direction):
    """트리거봉 t 기준 진입~청산. 반환: (entry_bar, exit_bar, R) 또는 None"""
    n = len(c)
    e = t + 1
    if e >= n:
        return None
    entry = o[e]
    stop = l[t] if direction == "long" else h[t]
    risk = (entry - stop) if direction == "long" else (stop - entry)
    if risk <= 0:
        return None
    tp = entry + rr * risk if direction == "long" else entry - rr * risk
    for i in range(e, min(e + MAX_HOLD, n)):
        if direction == "long":
            if l[i] <= stop:  # 보수적: SL 우선, 갭 관통 시 시가 체결(더 나쁜 값)
                px = min(o[i], stop)
                return (e, i, (px - entry) / risk)
            if h[i] >= tp:
                return (e, i, rr)
        else:
            if h[i] >= stop:
                px = max(o[i], stop)
                return (e, i, (entry - px) / risk)
            if l[i] <= tp:
                return (e, i, rr)
    i = min(e + MAX_HOLD, n) - 1
    r = (c[i] - entry) / risk if direction == "long" else (entry - c[i]) / risk
    return (e, i, r)


def run_dataset(sym, tf, path):
    o, h, l, c = load_csv(path)
    n = len(c)
    atr = atr14(h, l, c)
    bb_up, bb_lo = bollinger(c)
    macd_line = ema(c, 12) - ema(c, 26)
    macd_sig = ema(macd_line, 9)
    rsis = {p: rsi(c, p) for p in RSI_PERIODS}

    # (rsiP, k, dir) → 이벤트 + 트리거/시뮬 캐시
    rows = []
    for rp, k, d in itertools.product(RSI_PERIODS, SWING_KS, DIRS):
        events = build_events(o, h, l, c, rsis[rp], k, d, atr, bb_up, bb_lo)
        # 트리거·시뮬 결과 캐시: event × trigger × rr
        cache = {}
        for ei, (p2, confirm, sr, bb, fib) in enumerate(events):
            for trg in TRIGGERS:
                t = find_trigger(o, h, l, c, macd_line, macd_sig, confirm, trg, d)
                if t < 0:
                    cache[(ei, trg)] = None
                    continue
                cache[(ei, trg)] = {rr: simulate(o, h, l, c, t, rr, d) for rr in RRS}
        for zs, trg, rr in itertools.product(ZONE_SUBSETS, TRIGGERS, RRS):
            trades = []
            last_exit = -1
            for ei, (p2, confirm, sr, bb, fib) in enumerate(events):
                flags = {"SR": sr, "BB": bb, "FIB": fib}
                if not all(flags[z] for z in zs):
                    continue
                sims = cache[(ei, trg)]
                if sims is None:
                    continue
                res = sims[rr]
                if res is None:
                    continue
                e, x, r = res
                if e <= last_exit:  # 동시 1포지션
                    continue
                last_exit = x
                trades.append((e, r))
            if trades:
                rs = np.array([r for _, r in trades])
                es = np.array([e for e, _ in trades])
                half = n // 2
                r1 = rs[es < half]; r2 = rs[es >= half]
                gw = rs[rs > 0].sum(); gl = -rs[rs < 0].sum()
                rows.append(dict(
                    symbol=sym, tf=tf, direction=d, zone="+".join(zs), trigger=trg,
                    rr=rr, rsi=rp, k=k, trades=len(rs),
                    winrate=float((rs > 0).mean()), avg_r=float(rs.mean()),
                    sum_r=float(rs.sum()),
                    pf=float(gw / gl) if gl > 0 else float("inf"),
                    gross_win=float(gw), gross_loss=float(gl),
                    h1_avg_r=float(r1.mean()) if len(r1) else np.nan,
                    h2_avg_r=float(r2.mean()) if len(r2) else np.nan,
                    h1_sum_r=float(r1.sum()), h2_sum_r=float(r2.sum()),
                    h1_trades=int(len(r1)), h2_trades=int(len(r2)),
                ))
            else:
                rows.append(dict(symbol=sym, tf=tf, direction=d, zone="+".join(zs),
                                 trigger=trg, rr=rr, rsi=rp, k=k, trades=0,
                                 winrate=np.nan, avg_r=np.nan, sum_r=0.0, pf=np.nan,
                                 gross_win=0.0, gross_loss=0.0,
                                 h1_avg_r=np.nan, h2_avg_r=np.nan,
                                 h1_sum_r=0.0, h2_sum_r=0.0,
                                 h1_trades=0, h2_trades=0))
    return rows


def main():
    all_rows = []
    for sym, tf, fname in DATASETS:
        path = os.path.join(ROOT, fname)
        rows = run_dataset(sym, tf, path)
        all_rows.extend(rows)
        df = pd.DataFrame(rows)
        done = df[df.trades > 0]
        print(f"{sym} {tf}: combos with trades={len(done)}/{len(df)}, "
              f"median trades={done.trades.median():.0f}", flush=True)

    long_df = pd.DataFrame(all_rows)
    long_df.to_csv(os.path.join(HERE, "results", "grid_results_by_dataset.csv"), index=False)

    # 조합(336) 단위 집계: 전 데이터셋 트레이드 합산
    key = ["direction", "zone", "trigger", "rr", "rsi", "k"]
    agg_rows = []
    for kv, g in long_df.groupby(key):
        tr = int(g.trades.sum())
        gw, gl = float(g.gross_win.sum()), float(g.gross_loss.sum())
        if tr > 0:
            w = g.trades / tr
            avg_r = float(g.sum_r.sum()) / tr
            wr = float((g.winrate.fillna(0) * w).sum())
            sum_r = float(g.sum_r.sum())
            pf = gw / gl if gl > 0 else float("inf")
            pos_ds = int((g.sum_r > 0).sum())
            h1 = float(g.h1_sum_r.sum()); h1n = int(g.h1_trades.sum())
            h2 = float(g.h2_sum_r.sum()); h2n = int(g.h2_trades.sum())
        else:
            avg_r = wr = sum_r = pf = np.nan
            pos_ds = h1n = h2n = 0
            h1 = h2 = np.nan
        agg_rows.append(dict(zip(key, kv)) | dict(
            trades=tr, winrate=wr, avg_r=avg_r, sum_r=sum_r, pf=pf,
            h1_avg_r=(h1 / h1n if h1n else np.nan),
            h2_avg_r=(h2 / h2n if h2n else np.nan),
            pos_datasets=pos_ds, n_datasets=int((g.trades > 0).sum())))
    agg = pd.DataFrame(agg_rows).sort_values("avg_r", ascending=False)
    agg.to_csv(os.path.join(HERE, "results", "grid_results_agg.csv"), index=False)
    print(agg.head(15).to_string(index=False))


if __name__ == "__main__":
    main()
