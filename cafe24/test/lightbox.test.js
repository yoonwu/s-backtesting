const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const SCRIPT = fs.readFileSync('/home/user/s-backtesting/cafe24/portfolio-lightbox.js', 'utf8');

// 1x1 png
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const LIST = `<html><head><meta charset="utf-8"><style>.prdList{list-style:none;display:flex;gap:40px}.prdList li{width:300px}.prdImg{height:200px}.prdImg img{width:200px;height:200px}.description{margin-top:20px}</style></head><body>
<div class="xans-element- xans-product xans-product-listnormal">
 <ul class="prdList grid4">
  <li id="anchorBoxId_1" class="item">
   <div class="thumbnail"><div class="prdImg">
     <a href="/product/kidsbag/1/category/24/display/1/"><img src="/web/product/medium/202401/a.png"></a>
   </div></div>
   <div class="description"><strong class="name"><a href="/product/kidsbag/1/category/24/display/1/"><span>상품명 : </span>키즈백(33*33*8)</a></strong>
     <ul class="xans-product-action prdAction"><li><a href="/product/kidsbag/1/category/24/display/1/" class="cart">장바구니</a></li></ul>
   </div>
  </li>
  <li id="anchorBoxId_2" class="item">
   <div class="thumbnail"><div class="prdImg">
     <a href="/product/eco/2/category/24/display/1/"><img src="/web/product/medium/202401/b.png"></a>
   </div></div>
   <div class="description"><strong class="name"><a href="/product/eco/2/category/24/display/1/"><span>상품명 : </span>교회에코백</a></strong></div>
  </li>
 </ul>
</div>
<script>var PORTFOLIO_LIGHTBOX_CONFIG = { categoryNos: [24] };</script>
<script src="/lb.js"></script>
</body></html>`;

const DETAIL = `<html><head><meta charset="utf-8"></head><body>
<div class="xans-element- xans-product xans-product-image">
  <div class="keyImg"><img src="//localhost:PORT/web/product/big/202401/a.png"></div>
  <div class="listImg"><ul>
    <li><a><img src="/web/product/tiny/202401/a1.png"></a></li>
    <li><a><img src="/web/product/tiny/202401/a2.png"></a></li>
  </ul></div>
</div>
<div id="prdDetail" class="cont">
  <img src="/web/upload/p1.png">
  <img ec-data-src="/web/upload/p2.png" src="/img/common/loading.gif">
  <img src="/web/upload/p3.png">
  <img src="/images/icon/btn_top.gif">
</div>
</body></html>`;

const DETAIL_EMPTY = `<html><body><div id="prdDetail"></div></body></html>`;

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/lb.js') { res.writeHead(200, {'Content-Type':'application/javascript'}); return res.end(SCRIPT); }
  if (url === '/web/product/big/202401/a1.png') { res.writeHead(404); return res.end('no big'); }  // big 원본 없음
  if (url.endsWith('.png') || url.endsWith('.gif')) { res.writeHead(200, {'Content-Type':'image/png'}); return res.end(PNG); }
  if (url.startsWith('/product/eco/2/')) { res.writeHead(200,{'Content-Type':'text/html'}); return res.end(DETAIL_EMPTY); }
  if (url.startsWith('/product/')) { res.writeHead(200,{'Content-Type':'text/html'}); return res.end(DETAIL.replace(/PORT/g, server.address().port)); }
  if (url.startsWith('/category/')) { res.writeHead(200,{'Content-Type':'text/html'}); return res.end(LIST); }
  res.writeHead(404); res.end('nope');
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const base = `http://localhost:${port}`;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const fails = [];
  const ok = (name, cond) => { console.log((cond?'  PASS  ':'  FAIL  ') + name); if(!cond) fails.push(name); };
  // 프리로드가 끝나야 .plb-img 의 src 가 바뀌므로 is-ready 를 기다린다
  const shownSrc = async () => {
    await page.waitForFunction(() => document.querySelector('.plb-img.is-ready') !== null, null, { timeout: 5000 });
    return page.locator('.plb-img').getAttribute('src');
  };

  await page.goto(`${base}/category/portfolio/24/`);

  // 1. 라이트박스가 아직 안 열려 있음
  ok('초기에 오버레이 없음', await page.locator('.plb-overlay.is-open').count() === 0);

  // 2. 썸네일 클릭 -> 페이지 이동 없이 라이트박스 오픈
  await page.locator('.prdList li:first-child .prdImg a').click();
  await page.waitForSelector('.plb-overlay.is-open', { timeout: 5000 });
  ok('썸네일 클릭 시 상세 페이지로 이동하지 않음', page.url().includes('/category/'));
  ok('라이트박스 열림', await page.locator('.plb-overlay.is-open').count() === 1);

  // 3. 이미지 수집: 아이콘/로딩 이미지 제외, 대표->추가->상세설명 순
  const count = (await page.locator('.plb-count').textContent()).trim();
  ok(`카운터 = "1 / 6" (실제: "${count}")`, count === '1 / 6');
  const first = await shownSrc();
  ok('첫 이미지가 big 대표이미지: ' + first, /\/web\/product\/big\/202401\/a\.png/.test(first));

  // 4. 좌우 이동 + tiny -> big 승격
  await page.locator('.plb-next').click();
  await page.waitForTimeout(150);
  ok('다음 이동 후 카운터 2/6', (await page.locator('.plb-count').textContent()).trim() === '2 / 6');
  const second = await shownSrc();
  ok('big 원본이 없으면 원래 URL 로 폴백: ' + second, /\/web\/product\/tiny\/202401\/a1\.png/.test(second));

  // 4-1. big 이 존재하는 이미지는 그대로 big 사용
  await page.locator('.plb-next').click();
  await page.waitForTimeout(150);
  const third = await shownSrc();
  ok('big 이 있으면 tiny->big 승격 유지: ' + third, /\/web\/product\/big\/202401\/a2\.png/.test(third));

  // 5. lazy(ec-data-src) 수집 + loading.gif/아이콘 제외
  for (let i = 0; i < 2; i++) { await page.locator('.plb-next').click(); await page.waitForTimeout(150); }
  const fifth = await shownSrc();
  ok('lazy(ec-data-src) 이미지 수집됨: ' + fifth, /\/web\/upload\/p2\.png/.test(fifth));

  // 6. 마지막에서 다음 -> 순환
  await page.locator('.plb-next').click();
  await page.locator('.plb-next').click();
  ok('마지막에서 다음 -> 1/6 순환', (await page.locator('.plb-count').textContent()).trim() === '1 / 6');

  // 6-1. 이전 방향 순환
  await page.locator('.plb-prev').click();
  ok('첫 장에서 이전 -> 6/6 순환', (await page.locator('.plb-count').textContent()).trim() === '6 / 6');
  await page.locator('.plb-next').click();

  // 7. ESC 로 닫기
  await page.keyboard.press('Escape');
  ok('ESC 로 닫힘', await page.locator('.plb-overlay.is-open').count() === 0);

  // 8. 캐시 재오픈
  await page.locator('.prdList li:first-child .prdImg a').click();
  await page.waitForSelector('.plb-overlay.is-open');
  ok('캐시로 재오픈', (await page.locator('.plb-count').textContent()).trim() === '1 / 6');
  await page.keyboard.press('Escape');

  // 9. 이미지 없는 상품 -> 상세 페이지로 폴백 이동
  await page.locator('.prdList li:nth-child(2) .prdImg a').click();
  await page.waitForURL('**/product/eco/2/**', { timeout: 5000 }).catch(()=>{});
  ok('이미지 없으면 상세로 폴백 이동', page.url().includes('/product/eco/2/'));

  // 10. 다른 분류에서는 비활성
  const page2 = await browser.newPage();
  await page2.goto(`${base}/category/etc/99/`);
  await page2.locator('.prdList li:first-child .prdImg a').click();
  await page2.waitForURL('**/product/kidsbag/1/**', { timeout: 5000 }).catch(()=>{});
  ok('설정 외 분류에서는 원래대로 상세 이동', page2.url().includes('/product/kidsbag/1/'));

  await browser.close();
  server.close();
  console.log(fails.length ? `\n${fails.length}건 실패` : '\n전체 통과');
  process.exit(fails.length ? 1 : 0);
})();
