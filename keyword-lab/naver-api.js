/*
 * 네이버 검색광고 API 클라이언트 (키워드도구)
 *
 * 대부분 여기서 막힌다 -> X-Signature.
 *   서명 대상 문자열은 `${timestamp}.${METHOD}.${path}` 이고,
 *   path 는 쿼리스트링을 뺀 경로("/keywordstool")만 쓴다.
 *   비밀키로 HMAC-SHA256 한 뒤 base64 로 인코딩한다.
 *
 * 그 외 자주 걸리는 것들:
 *   - hintKeywords 는 한 번에 최대 5개
 *   - 키워드에서 공백을 빼야 한다 ("에코백 제작" -> "에코백제작")
 *   - X-Customer 는 '내 계정 ID'(숫자). 네이버 아이디가 아니다.
 *   - 호출 빈도 제한이 있어 연속 호출 시 간격이 필요하다.
 */
'use strict';

const crypto = require('crypto');

// 테스트에서 가짜 서버로 돌리기 위해 환경변수로 덮어쓸 수 있게 열어둔다.
const BASE = process.env.NAVER_AD_API_BASE || 'https://api.searchad.naver.com';
const PATH = '/keywordstool';

function sign(timestamp, method, path, secretKey) {
  const message = `${timestamp}.${method}.${path}`;
  return crypto.createHmac('sha256', secretKey).update(message).digest('base64');
}

// "< 10" 같은 문자열로 내려오는 경우가 있어 숫자로 정규화한다.
function toNumber(v) {
  if (typeof v === 'number') return v;
  if (v === null || v === undefined) return 0;
  const m = String(v).replace(/[^0-9.]/g, '');
  if (!m) return 0;
  // "< 10" 은 10 미만이라는 뜻이므로 보수적으로 5 로 본다.
  return String(v).indexOf('<') >= 0 ? Math.max(1, Math.floor(Number(m) / 2)) : Number(m);
}

const COMP_WEIGHT = { '낮음': 1, '중간': 2, '높음': 3 };

function normalize(row) {
  const pc = toNumber(row.monthlyPcQcCnt);
  const mobile = toNumber(row.monthlyMobileQcCnt);
  const total = pc + mobile;
  const comp = row.compIdx || '';
  const compW = COMP_WEIGHT[comp] || 2;
  const depth = toNumber(row.plAvgDepth);          // 광고 노출 경쟁 깊이(0~15)

  return {
    keyword: row.relKeyword,
    pc: pc,
    mobile: mobile,
    total: total,
    mobileShare: total ? +(mobile / total).toFixed(3) : 0,
    comp: comp,
    compWeight: compW,
    adDepth: depth,
    pcClick: toNumber(row.monthlyAvePcClkCnt),
    mobileClick: toNumber(row.monthlyAveMobileClkCnt),
    // 기회 점수: 검색량이 클수록 높고, 경쟁이 셀수록 깎인다.
    // 절대값에 의미는 없고 정렬용 상대 지표다.
    opportunity: +(total / (compW * (1 + depth / 15))).toFixed(1)
  };
}

/**
 * 힌트 키워드(최대 5개)로 연관 키워드를 조회한다.
 * @param {{customerId:string, apiKey:string, secretKey:string}} cfg
 * @param {string[]} hints
 * @param {{fetch?:Function, base?:string}} [opts] 테스트에서 주입용
 */
async function keywordTool(cfg, hints, opts) {
  opts = opts || {};
  const doFetch = opts.fetch || globalThis.fetch;
  const base = opts.base || BASE;

  if (!hints.length) return [];
  if (hints.length > 5) throw new Error('hintKeywords 는 최대 5개까지만 됩니다: ' + hints.length);

  const timestamp = String(opts.now || Date.now());
  const signature = sign(timestamp, 'GET', PATH, cfg.secretKey);

  // 공백이 있으면 결과가 비어서 돌아온다.
  const cleaned = hints.map(function (k) { return String(k).replace(/\s+/g, ''); });
  const url = base + PATH + '?hintKeywords=' + encodeURIComponent(cleaned.join(',')) + '&showDetail=1';

  const res = await doFetch(url, {
    method: 'GET',
    headers: {
      'X-Timestamp': timestamp,
      'X-API-KEY': cfg.apiKey,
      'X-Customer': String(cfg.customerId),
      'X-Signature': signature,
      'Content-Type': 'application/json; charset=UTF-8'
    }
  });

  if (!res.ok) {
    const body = await res.text().catch(function () { return ''; });
    throw new Error(explainError(res.status, body));
  }

  const json = await res.json();
  return (json.keywordList || []).map(normalize);
}

// HTTP 상태코드만 봐서는 원인을 모르니, 흔한 실패를 문장으로 바꿔준다.
function explainError(status, body) {
  const hint = {
    401: '인증 실패. X-Signature 계산이나 비밀키를 확인하세요. ' +
         '서명 대상은 "타임스탬프.GET./keywordstool" 이고 쿼리스트링은 빼야 합니다.',
    403: '권한 없음. X-Customer 에 네이버 아이디가 아니라 검색광고 "내 계정 ID"(숫자)를 넣었는지 확인하세요.',
    404: '경로 오류. /keywordstool 이 맞는지 확인하세요.',
    429: '호출 제한에 걸렸습니다. 요청 간격을 늘리세요.'
  }[status];
  return 'API 오류 ' + status + (hint ? '\n  -> ' + hint : '') + (body ? '\n  응답: ' + body.slice(0, 300) : '');
}

module.exports = { keywordTool, sign, normalize, toNumber, explainError, BASE, PATH };
