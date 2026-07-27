/*
 * 네이버 검색광고 API 를 흉내낸 가짜 서버를 띄우고,
 * 서명 계산 / 헤더 / 파라미터 / 응답 파싱 / 에러 메시지를 검증한다.
 *
 *   node keyword-lab/test/api.test.js
 *
 * 실제 API 키 없이 돌아간다.
 */
'use strict';

const http = require('http');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..');
const CFG = { customerId: '1234567', apiKey: 'ACCESS_LICENSE', secretKey: 'SECRET_KEY_XYZ' };

const fails = [];
const ok = (name, cond, extra) => {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (cond ? '' : (extra ? '  <- ' + extra : '')));
  if (!cond) fails.push(name);
};

// 서버가 받은 요청을 기록
let lastReq = null;
let mode = 'ok';

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  lastReq = { path: u.pathname, query: u.searchParams, headers: req.headers };

  if (mode === '401') { res.writeHead(401); return res.end('{"code":401}'); }
  if (mode === '403') { res.writeHead(403); return res.end('{"code":403}'); }

  // 서버 쪽에서도 같은 방식으로 서명해서 대조한다 (= 진짜 검증)
  const ts = req.headers['x-timestamp'];
  const expect = crypto.createHmac('sha256', CFG.secretKey)
    .update(`${ts}.GET./keywordstool`).digest('base64');
  if (req.headers['x-signature'] !== expect) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    return res.end('{"title":"Unauthorized","detail":"signature mismatch"}');
  }

  const hints = (u.searchParams.get('hintKeywords') || '').split(',');
  const list = [];
  hints.forEach((h, hi) => {
    list.push({
      relKeyword: h,
      monthlyPcQcCnt: 1000 * (hi + 1),
      monthlyMobileQcCnt: 4000 * (hi + 1),
      monthlyAvePcClkCnt: 10, monthlyAveMobileClkCnt: 40,
      compIdx: '높음', plAvgDepth: 15
    });
    // 연관 키워드 2개씩 (깊이 확장 테스트용)
    for (let i = 1; i <= 2; i++) {
      list.push({
        relKeyword: h + '제작' + i,
        monthlyPcQcCnt: i === 1 ? '< 10' : 100,
        monthlyMobileQcCnt: 500 - i * 100,
        monthlyAvePcClkCnt: 1, monthlyAveMobileClkCnt: 5,
        compIdx: i === 1 ? '낮음' : '중간', plAvgDepth: i
      });
    }
  });
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ keywordList: list }));
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  process.env.NAVER_AD_API_BASE = base;

  // require 는 env 를 읽은 뒤에
  const api = require('../naver-api');

  // 1. 서명 — 서버가 독립적으로 재계산해서 대조한다
  const rows = await api.keywordTool(CFG, ['에코백', '파우치 제작']);
  ok('서명(X-Signature)이 서버 검증을 통과함', rows.length > 0);

  // 2. 헤더
  ok('X-Customer 에 계정 ID 전달', lastReq.headers['x-customer'] === CFG.customerId);
  ok('X-API-KEY 전달', lastReq.headers['x-api-key'] === CFG.apiKey);
  ok('X-Timestamp 가 밀리초 숫자', /^\d{13}$/.test(lastReq.headers['x-timestamp']));

  // 3. 키워드 공백 제거 (공백이 있으면 결과가 비어 돌아온다)
  const sent = lastReq.query.get('hintKeywords');
  ok('키워드 공백 제거: ' + sent, sent === '에코백,파우치제작');
  ok('showDetail=1 전달', lastReq.query.get('showDetail') === '1');

  // 4. "< 10" 문자열 파싱
  const lt = rows.find(r => r.keyword === '에코백제작1');
  ok('"< 10" 을 숫자로 정규화: pc=' + lt.pc, lt.pc > 0 && lt.pc < 10);

  // 5. 합계/모바일 비중
  const seed = rows.find(r => r.keyword === '에코백');
  ok('총 검색량 = PC + 모바일 (' + seed.total + ')', seed.total === 5000);
  ok('모바일 비중 계산 (' + seed.mobileShare + ')', Math.abs(seed.mobileShare - 0.8) < 0.001);

  // 6. 기회 점수 — 검색량이 같으면 경쟁이 약한 쪽이 높아야 한다
  const easy = api.normalize({ relKeyword: 'A', monthlyPcQcCnt: 1000, monthlyMobileQcCnt: 1000, compIdx: '낮음', plAvgDepth: 1 });
  const hard = api.normalize({ relKeyword: 'B', monthlyPcQcCnt: 1000, monthlyMobileQcCnt: 1000, compIdx: '높음', plAvgDepth: 15 });
  ok('같은 검색량이면 경쟁 약한 쪽 기회점수가 높음 (' + easy.opportunity + ' > ' + hard.opportunity + ')',
     easy.opportunity > hard.opportunity);
  // 검색량이 크게 앞서면 경쟁이 세도 이길 수 있어야 한다 (기회점수는 절대 순위가 아니라 트레이드오프)
  const big = api.normalize({ relKeyword: 'C', monthlyPcQcCnt: 20000, monthlyMobileQcCnt: 20000, compIdx: '높음', plAvgDepth: 15 });
  ok('검색량이 압도적이면 경쟁이 세도 상위 (' + big.opportunity + ' > ' + easy.opportunity + ')',
     big.opportunity > easy.opportunity);

  // 7. 힌트 5개 초과 방어
  let threw = null;
  try { await api.keywordTool(CFG, ['a', 'b', 'c', 'd', 'e', 'f']); } catch (e) { threw = e; }
  ok('힌트 6개면 호출 전에 막음', threw && /최대 5개/.test(threw.message));

  // 8. 잘못된 비밀키 -> 서버가 401, 원인 문장이 붙어야 함
  let err = null;
  try { await api.keywordTool({ ...CFG, secretKey: 'WRONG' }, ['에코백']); } catch (e) { err = e; }
  ok('비밀키 틀리면 401 + 서명 원인 안내',
     err && /401/.test(err.message) && /X-Signature/.test(err.message), err && err.message.slice(0, 80));

  // 9. 403 -> Customer ID 안내
  mode = '403';
  err = null;
  try { await api.keywordTool(CFG, ['에코백']); } catch (e) { err = e; }
  ok('403 이면 내 계정 ID 원인 안내', err && /내 계정 ID/.test(err.message));
  mode = 'ok';

  // 10. scan.js 를 실제로 돌려서 파일이 나오는지 (BFS + 캐시 + 출력)
  const tmpCfg = path.join(DIR, 'config.json');
  const hadCfg = fs.existsSync(tmpCfg);
  const backup = hadCfg ? fs.readFileSync(tmpCfg, 'utf8') : null;
  fs.writeFileSync(tmpCfg, JSON.stringify(CFG), 'utf8');
  ['cache.json', 'data.js', 'data.json'].forEach(f => {
    const p = path.join(DIR, f); if (fs.existsSync(p)) fs.unlinkSync(p);
  });

  try {
    // execFileSync 를 쓰면 이벤트 루프가 막혀 같은 프로세스의 가짜 서버가 응답을 못 한다.
    await execFileAsync(process.execPath,
      [path.join(DIR, 'scan.js'), '--seed', '에코백', '--depth', '1', '--delay', '0'],
      { env: { ...process.env, NAVER_AD_API_BASE: base }, timeout: 20000 });

    const dataPath = path.join(DIR, 'data.json');
    ok('scan.js 가 data.json 을 생성', fs.existsSync(dataPath));
    const out = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    ok('깊이 1 확장으로 씨앗보다 많은 키워드 수집 (' + out.rows.length + '개)', out.rows.length > 3);
    ok('기회 점수 내림차순 정렬',
       out.rows.every((r, i) => i === 0 || out.rows[i - 1].opportunity >= r.opportunity));
    ok('캐시 파일 생성', fs.existsSync(path.join(DIR, 'cache.json')));

    const js = fs.readFileSync(path.join(DIR, 'data.js'), 'utf8');
    ok('data.js 가 window.KEYWORD_DATA 로 시작', js.startsWith('window.KEYWORD_DATA = '));
  } catch (e) {
    ok('scan.js 실행', false, String(e.stderr || e.message).slice(0, 300));
  } finally {
    if (hadCfg) fs.writeFileSync(tmpCfg, backup); else fs.unlinkSync(tmpCfg);
  }

  server.close();
  console.log(fails.length ? `\n${fails.length}건 실패` : '\n전체 통과');
  process.exit(fails.length ? 1 : 0);
})();
