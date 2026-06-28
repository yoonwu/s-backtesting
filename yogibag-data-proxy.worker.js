/* ============================================================================
   YOGIBAG DATA PROXY v2  ·  Cloudflare Worker
   ----------------------------------------------------------------------------
   주가/지수 데이터 프록시. (일봉 + 분봉 OHLC)
   요청 예) GET .../?yahoo=QQQ&stooq=qqq.us&from=2024-06-01&to=2026-06-28&interval=1d
           GET .../?yahoo=QQQ&from=2026-05-01&to=2026-06-28&interval=5m
   - interval 미지정 → 1d (기존 동작 그대로)
   - 응답 행: { date, o, h, l, c, close }
       · o/h/l/c = 원시(raw) OHLC  ← 더블비 등 캔들 전략용
       · close   = 일봉이면 adjclose(배당반영), 분봉이면 raw c  ← 기존 탭 하위호환
   - 분봉은 정규장만(includePrePost=false), date 는 ISO datetime
   - 야후 분봉 히스토리 한도: 5/15/30분=60일, 60분=730일, 1일=전체
   ----------------------------------------------------------------------------
   v1 대비 변경: interval 파라미터 추가, 행에 o/h/l/c 추가(close 필드는 유지).
   기존 탭은 .close/.date 만 읽으므로 영향 없음.
   ========================================================================== */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

// 야후 분봉 최대 조회 일수 (안전하게 -1)
const INTRADAY_LIMIT_DAYS = { "1m": 7, "2m": 59, "5m": 59, "15m": 59, "30m": 59, "60m": 729, "90m": 59 };

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    const url = new URL(request.url);
    const yahoo = url.searchParams.get("yahoo");
    const stooq = url.searchParams.get("stooq");
    const from = url.searchParams.get("from");           // YYYY-MM-DD
    const to = url.searchParams.get("to");               // YYYY-MM-DD
    const interval = url.searchParams.get("interval") || "1d";

    if (!from || !to || (!yahoo && !stooq)) {
      return json({ error: "필수 파라미터: (yahoo 또는 stooq), from, to" }, 400);
    }

    const cache = caches.default;
    const cacheKey = new Request(url.toString(), { method: "GET" });
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    const errors = [];
    let data = null, source = null;

    if (yahoo) {
      try { data = await fromYahoo(yahoo, from, to, interval); source = "yahoo"; }
      catch (e) { errors.push("yahoo: " + e.message); }
    }
    // 분봉은 stooq/AV 폴백 없음 (일봉만 폴백)
    if (!data && stooq && interval === "1d") {
      try { data = await fromStooq(stooq, from, to); source = "stooq"; }
      catch (e) { errors.push("stooq: " + e.message); }
    }
    if (!data && interval === "1d" && env.AV_KEY && stooq && stooq.endsWith(".us")) {
      try {
        data = await fromAlpha(stooq.replace(".us", "").toUpperCase(), from, to, env.AV_KEY);
        source = "alphavantage";
      } catch (e) { errors.push("av: " + e.message); }
    }

    if (!data) return json({ error: "모든 데이터 소스 실패", detail: errors }, 502);

    const res = json({ source, interval, count: data.length, data });
    res.headers.set("Cache-Control", interval === "1d" ? "public, max-age=21600" : "public, max-age=1800");
    ctx.waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  },
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS },
  });
}

/* ---- Yahoo Finance chart API (OHLC + interval) ---- */
async function fromYahoo(symbol, from, to, interval) {
  let p1 = Math.floor(Date.parse(from) / 1000);
  let p2 = Math.floor(Date.parse(to) / 1000) + 86400; // 종료일 포함
  const intraday = interval !== "1d";

  if (intraday && INTRADAY_LIMIT_DAYS[interval]) {
    const minP1 = p2 - INTRADAY_LIMIT_DAYS[interval] * 86400;
    if (p1 < minP1) p1 = minP1;
  }

  let u = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`
        + `?period1=${p1}&period2=${p2}&interval=${interval}`;
  if (intraday) u += `&includePrePost=false`;

  const r = await fetch(u, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    cf: { cacheTtl: 0 },
  });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const j = await r.json();
  const result = j?.chart?.result?.[0];
  if (!result || j?.chart?.error) throw new Error(j?.chart?.error?.description || "결과 없음");

  const ts = result.timestamp || [];
  const q = result.indicators?.quote?.[0] || {};
  const adj = result.indicators?.adjclose?.[0]?.adjclose;
  const O = q.open, H = q.high, L = q.low, C = q.close;
  if (!ts.length || !O || !H || !L || !C) throw new Error("빈 시계열");

  const out = [];
  for (let i = 0; i < ts.length; i++) {
    const o = O[i], h = H[i], l = L[i], c = C[i];
    if (o == null || h == null || l == null || c == null) continue;
    const iso = new Date(ts[i] * 1000).toISOString();
    const date = intraday ? iso : iso.slice(0, 10);
    const close = (!intraday && adj && adj[i] != null) ? +adj[i] : +c;
    out.push({ date, o: +o, h: +h, l: +l, c: +c, close });
  }
  if (out.length < 2) throw new Error("행 부족");
  return out;
}

/* ---- Stooq CSV (일봉 폴백) ---- */
async function fromStooq(symbol, from, to) {
  const d = s => s.replaceAll("-", "");
  const u = `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol)}&d1=${d(from)}&d2=${d(to)}&i=d`;
  const r = await fetch(u);
  if (!r.ok) throw new Error("HTTP " + r.status);
  const t = await r.text();
  if (/N\/D|<html/i.test(t)) throw new Error("데이터 없음");
  const lines = t.trim().split(/\r?\n/);
  const h = lines[0].toLowerCase().split(",");
  const di = h.indexOf("date"), oi = h.indexOf("open"), hi = h.indexOf("high"), li = h.indexOf("low"), ci = h.indexOf("close");
  if (di < 0 || ci < 0) throw new Error("CSV 형식 오류");
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const p = lines[i].split(",");
    const c = parseFloat(p[ci]);
    if (!p[di] || isNaN(c) || c <= 0) continue;
    const o = oi >= 0 ? parseFloat(p[oi]) : c;
    const hh = hi >= 0 ? parseFloat(p[hi]) : c;
    const ll = li >= 0 ? parseFloat(p[li]) : c;
    out.push({ date: p[di].slice(0, 10), o, h: hh, l: ll, c, close: c });
  }
  if (out.length < 2) throw new Error("행 부족");
  return out;
}

/* ---- Alpha Vantage (선택 폴백, 일봉 ETF용) ---- */
async function fromAlpha(symbol, from, to, key) {
  const u = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED`
          + `&symbol=${symbol}&outputsize=full&apikey=${key}`;
  const r = await fetch(u);
  if (!r.ok) throw new Error("HTTP " + r.status);
  const j = await r.json();
  const ts = j["Time Series (Daily)"];
  if (!ts) throw new Error(j["Note"] || j["Information"] || j["Error Message"] || "시계열 없음");
  const out = [];
  for (const day in ts) {
    if (day >= from && day <= to) {
      const o = parseFloat(ts[day]["1. open"]);
      const h = parseFloat(ts[day]["2. high"]);
      const l = parseFloat(ts[day]["3. low"]);
      const c = parseFloat(ts[day]["4. close"]);
      const adj = parseFloat(ts[day]["5. adjusted close"] || ts[day]["4. close"]);
      if (!isNaN(c)) out.push({ date: day, o, h, l, c, close: isNaN(adj) ? c : adj });
    }
  }
  out.sort((a, b) => (a.date < b.date ? -1 : 1));
  if (out.length < 2) throw new Error("행 부족");
  return out;
}
