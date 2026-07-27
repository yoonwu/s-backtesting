/*
 * 카페24 기본 스킨 DOM 구조를 흉내낸 가짜 목록/상세 페이지를 로컬 서버로 띄우고,
 * 헤드리스 크로미움으로 실제 클릭 동작을 검증한다.
 *
 *   npm i playwright-core
 *   node cafe24/test/lightbox.test.js
 *
 * 이미지 경로는 yogibag.co.kr 에서 실제로 수집된 URL 형태를 그대로 반영했다.
 *   - 대표이미지  /web/product/big/...        (big 파일이 없는 상품이 존재)
 *   - 추가이미지  /web/product/extra/small/...
 *   - 상세설명    /web/upload/NNEditor/...
 */
const http = require('http');
const fs = require('fs');
const { chromium } = require('playwright-core');

const SECTION = fs
  .readFileSync(__dirname + '/../ez-custom-html-section.txt', 'utf8')
  .replace('categoryNos: [62]', 'categoryNos: [24]');

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

// 이 경로들만 404 (그 외 이미지 요청은 전부 200)
const MISSING = new Set([
  '/web/product/big/202405/key.jpg',          // 대표이미지 big 없음 -> medium 으로 폴백
  '/web/product/extra/big/202405/ex.png',     // 추가이미지 big/medium 없음 -> small 로 폴백
  '/web/product/extra/medium/202405/ex.png',
  '/web/product/big/202405/dead.jpg',         // 어떤 크기로도 없는 이미지 -> 목록에서 제외
  '/web/product/medium/202405/dead.jpg',
  '/web/product/small/202405/dead.jpg',
  '/web/product/tiny/202405/dead.jpg'
]);

const LIST = `<html><head><meta charset="utf-8"><style>
.prdList{list-style:none;display:flex;gap:40px}.prdList li{width:300px}
.prdImg{height:200px}.prdImg img{width:200px;height:200px}.description{margin-top:20px}
</style></head><body>
<div class="xans-element- xans-product xans-product-listnormal">
 <ul class="prdList grid4">
  <li id="anchorBoxId_1" class="item">
   <div class="thumbnail"><div class="prdImg">
     <a href="/product/kidsbag/1/category/24/display/1/"><img src="/web/product/medium/202405/key.jpg"></a>
   </div></div>
   <div class="description"><strong class="name"><a href="/product/kidsbag/1/category/24/display/1/"><span>상품명 : </span>키즈백(33*33*8)</a></strong>
     <ul class="xans-product-action prdAction"><li><a href="/product/kidsbag/1/category/24/display/1/" class="cart">장바구니</a></li></ul>
   </div>
  </li>
  <li id="anchorBoxId_2" class="item">
   <div class="thumbnail"><div class="prdImg">
     <a href="/product/eco/2/category/24/display/1/"><img src="/web/product/medium/202405/b.jpg"></a>
   </div></div>
   <div class="description"><strong class="name"><a href="/product/eco/2/category/24/display/1/"><span>상품명 : </span>교회에코백</a></strong></div>
  </li>
 </ul>
</div>
${SECTION}
</body></html>`;

const DETAIL = `<html><head><meta charset="utf-8"></head><body>
<div class="xans-element- xans-product xans-product-image">
  <div class="keyImg"><img src="/web/product/big/202405/key.jpg"></div>
  <div class="listImg"><ul>
    <li><a><img src="/web/product/extra/small/202405/ex.png"></a></li>
    <li><a><img src="/web/product/big/202405/dead.jpg"></a></li>
  </ul></div>
</div>
<div id="prdDetail" class="cont">
  <img src="/web/upload/NNEditor/20240528/p1.jpg">
  <img ec-data-src="/web/upload/NNEditor/20240528/p2.jpg" src="/img/common/loading.gif">
  <img src="/web/upload/NNEditor/20240528/p3.jpg">
  <img src="/images/icon/btn_top.gif">
</div>
</body></html>`;

const DETAIL_EMPTY =
  '<html><head><meta charset="utf-8"></head><body><div id="prdDetail"></div></body></html>';

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (MISSING.has(url)) { res.writeHead(404); return res.end('missing'); }
  if (/\.(png|jpg|gif)$/.test(url)) { res.writeHead(200, { 'Content-Type': 'image/png' }); return res.end(PNG); }
  if (url.startsWith('/product/eco/2/')) { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(DETAIL_EMPTY); }
  if (url.startsWith('/product/')) { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(DETAIL); }
  if (url.startsWith('/category/')) { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(LIST); }
  res.writeHead(404); res.end('nope');
});

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
  });
  const page = await browser.newPage();

  const fails = [];
  const ok = (name, cond) => {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + name);
    if (!cond) fails.push(name);
  };
  const counter = async () => (await page.locator('.plb-count').textContent()).trim();
  // 프리로드가 끝나야 .plb-img 의 src 가 바뀌므로 is-ready 를 기다린다
  const shownSrc = async () => {
    await page.waitForFunction(() => document.querySelector('.plb-img.is-ready') !== null, null, { timeout: 5000 });
    return page.locator('.plb-img').getAttribute('src');
  };
  const next = async () => { await page.locator('.plb-next').click(); await page.waitForTimeout(250); };

  await page.goto(`${base}/category/portfolio/24/`);
  ok('초기에 오버레이 없음', (await page.locator('.plb-overlay.is-open').count()) === 0);

  // 1. 썸네일 클릭 -> 페이지 이동 없이 라이트박스 오픈
  await page.locator('.prdList li:first-child .prdImg a').click();
  await page.waitForSelector('.plb-overlay.is-open', { timeout: 5000 });
  ok('썸네일 클릭 시 상세 페이지로 이동하지 않음', page.url().includes('/category/'));
  ok('라이트박스 열림', (await page.locator('.plb-overlay.is-open').count()) === 1);

  // 2. 수집 결과: 대표1 + 추가2 + 상세설명3 = 6 (아이콘/loading.gif 제외)
  const c0 = await counter();
  ok(`카운터 = "1 / 6" (실제: "${c0}")`, c0 === '1 / 6');

  // 3. 대표이미지 big 이 없으면 medium 으로 폴백
  const first = await shownSrc();
  ok('대표이미지 big 404 -> medium 폴백: ' + first, /\/web\/product\/medium\/202405\/key\.jpg/.test(first));

  // 4. 추가이미지: extra/big, extra/medium 실패 후 extra/small 로 복귀
  await next();
  const second = await shownSrc();
  ok('추가이미지 big/medium 404 -> small 폴백: ' + second, /\/web\/product\/extra\/small\/202405\/ex\.png/.test(second));

  // 5. 모든 크기가 없는 이미지는 목록에서 빠지고 다음 장으로 자동 이동
  await next();
  await page.waitForTimeout(500);
  const third = await shownSrc();
  ok('전부 404 인 이미지는 건너뜀: ' + third, /\/web\/upload\/NNEditor\/20240528\/p1\.jpg/.test(third));
  const c1 = await counter();
  ok(`제외 후 총 장수 5로 감소 (실제: "${c1}")`, c1.endsWith('/ 5'));

  // 6. lazy(ec-data-src) 수집 + loading.gif/아이콘 제외
  await next();
  const fourth = await shownSrc();
  ok('lazy(ec-data-src) 이미지 수집됨: ' + fourth, /\/web\/upload\/NNEditor\/20240528\/p2\.jpg/.test(fourth));

  // 7. 순환 이동
  await next();
  await next();
  ok('마지막에서 다음 -> 1/5 순환', (await counter()) === '1 / 5');
  await page.locator('.plb-prev').click();
  await page.waitForTimeout(250);
  ok('첫 장에서 이전 -> 5/5 순환', (await counter()) === '5 / 5');

  // 8. ESC 로 닫기
  await page.keyboard.press('Escape');
  ok('ESC 로 닫힘', (await page.locator('.plb-overlay.is-open').count()) === 0);

  // 9. 캐시로 재오픈
  await page.locator('.prdList li:first-child .prdImg a').click();
  await page.waitForSelector('.plb-overlay.is-open');
  ok('캐시로 즉시 재오픈', (await counter()) === '1 / 6');
  await page.keyboard.press('Escape');

  // 10. 뽑아낼 이미지가 없으면 원래 동작(상세 페이지 이동)으로 폴백
  await page.locator('.prdList li:nth-child(2) .prdImg a').click();
  await page.waitForURL('**/product/eco/2/**', { timeout: 5000 }).catch(() => {});
  ok('이미지 없으면 상세로 폴백 이동', page.url().includes('/product/eco/2/'));

  // 11. 설정한 분류가 아니면 원래 동작 유지
  const page2 = await browser.newPage();
  await page2.goto(`${base}/category/etc/99/`);
  await page2.locator('.prdList li:first-child .prdImg a').click();
  await page2.waitForURL('**/product/kidsbag/1/**', { timeout: 5000 }).catch(() => {});
  ok('설정 외 분류에서는 원래대로 상세 이동', page2.url().includes('/product/kidsbag/1/'));

  await browser.close();
  server.close();
  console.log(fails.length ? `\n${fails.length}건 실패` : '\n전체 통과');
  process.exit(fails.length ? 1 : 0);
})();
