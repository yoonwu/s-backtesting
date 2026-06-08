/* ============================================================================
   YOGIBAG DATA PROXY  ·  Cloudflare Worker
   ----------------------------------------------------------------------------
   주가/지수 일별 종가 데이터 프록시.
   요청 예) GET https://xxx.workers.dev/?yahoo=^NDX&stooq=^ndx&from=2010-01-01&to=2026-06-08
   동작 순서: 1) 야후  2) Stooq  3) (선택) Alpha Vantage  순으로 시도
   응답 예) { "source":"yahoo", "count":4012, "data":[{"date":"2010-01-04","close":1860.31}, ...] }
   - 서버 측 요청이라 CORS/외부요청 차단 문제 없음
   - 응답에 Access-Control-Allow-Origin:* 부여 → 어떤 웹페이지에서도 호출 가능
   - 6시간 엣지 캐싱 → 야후 호출 최소화 + 무료 한도 절약
   ----------------------------------------------------------------------------
   (선택) Alpha Vantage 폴백을 쓰려면:
     Cloudflare 대시보드 → 이 Worker → Settings → Variables and Secrets →
     Add → type: Secret, name: AV_KEY, value: (alphavantage.co 무료 키) → Deploy
   ========================================================================== */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    const url = new URL(request.url);
    const yahoo = url.searchParams.get("yahoo");
    const stooq = url.searchParams.get("stooq");
    const from = url.searchParams.get("from"); // YYYY-MM-DD
    const to = url.searchParams.get("to");     // YYYY-MM-DD

    if (!from || !to || (!yahoo && !stooq)) {
      return json({ error: "필수 파라미터: (yahoo 또는 stooq), from, to" }, 400);
    }

    // 엣지 캐시 (6시간) — 동일 요청은 야후를 다시 안 때림
    const cache = caches.default;
    const cacheKey = new Request(url.toString(), { method: "GET" });
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    const errors = [];
    let data = null, source = null;

    if (yahoo) {
      try { data = await fromYahoo(yahoo, from, to); source = "yahoo"; }
      catch (e) { errors.push("yahoo: " + e.message); }
    }
    if (!data && stooq) {
      try { data = await fromStooq(stooq, from, to); source = "stooq"; }
      catch (e) { errors.push("stooq: " + e.message); }
    }
    if (!data && env.AV_KEY && stooq && stooq.endsWith(".us")) {
      try {
        data = await fromAlpha(stooq.replace(".us", "").toUpperCase(), from, to, env.AV_KEY);
        source = "alphavantage";
      } catch (e) { errors.push("av: " + e.message); }
    }

    if (!data) return json({ error: "모든 데이터 소스 실패", detail: errors }, 502);

    const res = json({ source, count: data.length, data });
    res.headers.set("Cache-Control", "public, max-age=21600");
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

/* ---- Yahoo Finance chart API ---- */
async function fromYahoo(symbol, from, to) {
  const p1 = Math.floor(Date.parse(from) / 1000);
  const p2 = Math.floor(Date.parse(to) / 1000) + 86400; // 종료일 포함
  const u = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`
          + `?period1=${p1}&period2=${p2}&interval=1d`;
  const r = await fetch(u, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    cf: { cacheTtl: 0 },
  });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const j = await r.json();
  const result = j?.chart?.result?.[0];
  if (!result || j?.chart?.error) throw new Error(j?.chart?.error?.description || "결과 없음");
  const ts = result.timestamp || [];
  const adj = result.indicators?.adjclose?.[0]?.adjclose;
  const cls = result.indicators?.quote?.[0]?.close;
  const px = adj || cls;
  if (!ts.length || !px) throw new Error("빈 시계열");
  const out = [];
  for (let i = 0; i < ts.length; i++) {
    const v = px[i];
    if (v == null) continue;
    out.push({ date: new Date(ts[i] * 1000).toISOString().slice(0, 10), close: +v });
  }
  if (out.length < 2) throw new Error("행 부족");
  return out;
}

/* ---- Stooq CSV ---- */
async function fromStooq(symbol, from, to) {
  const d = s => s.replaceAll("-", "");
  const u = `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol)}&d1=${d(from)}&d2=${d(to)}&i=d`;
  const r = await fetch(u);
  if (!r.ok) throw new Error("HTTP " + r.status);
  const t = await r.text();
  if (/N\/D|<html/i.test(t)) throw new Error("데이터 없음");
  const lines = t.trim().split(/\r?\n/);
  const h = lines[0].toLowerCase().split(",");
  const di = h.indexOf("date");
  const ci = h.indexOf("close");
  if (di < 0 || ci < 0) throw new Error("CSV 형식 오류");
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const p = lines[i].split(",");
    const v = parseFloat(p[ci]);
    if (p[di] && !isNaN(v) && v > 0) out.push({ date: p[di].slice(0, 10), close: v });
  }
  if (out.length < 2) throw new Error("행 부족");
  return out;
}

/* ---- Alpha Vantage (선택 폴백, ETF용) ---- */
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
      const v = parseFloat(ts[day]["5. adjusted close"] || ts[day]["4. close"]);
      if (!isNaN(v)) out.push({ date: day, close: v });
    }
  }
  out.sort((a, b) => (a.date < b.date ? -1 : 1));
  if (out.length < 2) throw new Error("행 부족");
  return out;
}
