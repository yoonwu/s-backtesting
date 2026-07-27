/*!
 * portfolio-lightbox.js
 * 카페24 스마트디자인용 - 상품 목록(분류) 페이지에서 썸네일을 클릭했을 때
 * 상품 상세 페이지로 이동하지 않고, 상세 이미지들을 라이트박스로 확대해서 보여준다.
 *
 * 제작사례 포트폴리오를 게시판(용량 제한) 대신 0원 상품으로 쌓아두고
 * 갤러리처럼 보여주기 위한 용도.
 *
 * 적용: 스킨에 script 태그로 불러오거나, 인라인으로 붙여넣는다.
 *   외부 파일:  script[src="/web/upload/portfolio-lightbox.js"]
 *   설정(선택): window.PORTFOLIO_LIGHTBOX_CONFIG = { categoryNos: [24, 25] }
 *               (이 파일보다 먼저 선언되어야 한다)
 *
 * 주의: 이 파일 안에는 script 종료 태그 문자열을 절대 쓰지 말 것.
 *       HTML 에 인라인으로 붙여넣을 때 그 지점에서 script 태그가 끊긴다.
 */
(function () {
  'use strict';

  if (window.__portfolioLightboxLoaded) return;
  window.__portfolioLightboxLoaded = true;

  var CFG = window.PORTFOLIO_LIGHTBOX_CONFIG || {};

  // 적용할 분류(카테고리) 번호. 빈 배열이면 모든 상품 목록 페이지에 적용.
  var CATEGORY_NOS = (CFG.categoryNos || []).map(String);
  // 상품 목록 항목 셀렉터 (기본 스마트디자인 스킨 기준)
  var ITEM_SELECTOR = CFG.itemSelector || '.prdList > li, .prdList > div';
  // 상세 페이지에서 이미지를 긁어올 순서 (앞쪽이 우선)
  // 대표이미지 -> 추가이미지 -> 상세설명 순으로 모은다
  var IMAGE_SELECTORS = CFG.detailImageSelectors || [
    '.xans-product-image .keyImg img',
    '.xans-product-image .listImg img',
    '.xans-product-addimage img',
    '#prdDetail img',
    '.xans-product-detaildesign img'
  ];
  var USE_CACHE = CFG.cache !== false;

  // 아이콘/버튼/여백용 이미지 제외
  var EXCLUDE_RE = /(\/icon\/|\/btn|\/banner\/|blank\.gif|spacer\.gif|1x1\.|loading|\/common\/)/i;

  // ---------------------------------------------------------------- utils

  function currentCategoryNo() {
    var m = location.pathname.match(/\/category\/[^\/]*\/(\d+)\//);
    if (m) return m[1];
    m = location.search.match(/[?&]cate_no=(\d+)/);
    return m ? m[1] : null;
  }

  function shouldApply() {
    if (!document.querySelector('.prdList')) return false;
    if (!CATEGORY_NOS.length) return true;
    var no = currentCategoryNo();
    return !!no && CATEGORY_NOS.indexOf(no) !== -1;
  }

  function productNoOf(href) {
    var m = href.match(/\/product\/[^\/]*\/(\d+)\//) || href.match(/[?&]product_no=(\d+)/);
    return m ? m[1] : null;
  }

  // lazy-load 속성까지 고려한 실제 src
  function srcOf(img) {
    var s = img.getAttribute('ec-data-src') ||
            img.getAttribute('data-src') ||
            img.getAttribute('data-original') ||
            img.getAttribute('src') || '';
    if (s.indexOf('//') === 0) s = location.protocol + s;
    return s;
  }

  // 카페24 상품 이미지 경로: /web/product/{tiny|small|medium|big}/...
  //                          /web/product/extra/{tiny|small|medium|big}/... (추가이미지)
  var SIZE_RE = /\/web\/product\/((?:extra\/)?)(tiny|small|medium|big)\//;

  // 크기별 파일이 항상 다 생성돼 있지는 않다(big 이 없는 상품이 실제로 있음).
  // 큰 것부터 후보를 만들어 순차로 시도하고, 마지막에 원래 URL 을 반드시 남긴다.
  function sizeCandidates(url) {
    var m = url.match(SIZE_RE);
    if (!m) return [url];
    var out = [];
    ['big', 'medium', 'small', 'tiny'].forEach(function (sz) {
      var u = url.replace(SIZE_RE, '/web/product/' + m[1] + sz + '/');
      if (out.indexOf(u) === -1) out.push(u);
    });
    if (out.indexOf(url) === -1) out.push(url);
    return out;
  }

  function collectImages(doc) {
    var seen = {};
    var out = [];
    IMAGE_SELECTORS.forEach(function (sel) {
      var nodes;
      try { nodes = doc.querySelectorAll(sel); } catch (e) { return; }
      Array.prototype.forEach.call(nodes, function (img) {
        var src = srcOf(img);
        if (!src || EXCLUDE_RE.test(src)) return;
        var key = src.split('?')[0];
        if (seen[key]) return;
        seen[key] = 1;
        var cands = sizeCandidates(src);
        out.push({ src: cands[0], alts: cands.slice(1) });
      });
    });
    return out;
  }

  function cacheGet(no) {
    if (!USE_CACHE) return null;
    try {
      var raw = sessionStorage.getItem('plb3:' + no);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function cacheSet(no, images) {
    if (!USE_CACHE) return;
    try { sessionStorage.setItem('plb3:' + no, JSON.stringify(images)); } catch (e) {}
  }

  function fetchImages(href, no) {
    var cached = cacheGet(no);
    if (cached && cached.length) return Promise.resolve(cached);

    return fetch(href, { credentials: 'same-origin' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var images = collectImages(doc);
        if (images.length) cacheSet(no, images);
        return images;
      });
  }

  // ---------------------------------------------------------------- styles

  var CSS = [
    '.plb-overlay{position:fixed;inset:0;z-index:99999;display:none;',
    '  background:rgba(0,0,0,.92);align-items:center;justify-content:center;}',
    '.plb-overlay.is-open{display:flex;}',
    '.plb-stage{position:relative;width:100%;height:100%;display:flex;',
    '  align-items:center;justify-content:center;padding:56px 72px;box-sizing:border-box;}',
    '.plb-img{max-width:100%;max-height:100%;object-fit:contain;',
    '  opacity:0;transition:opacity .18s ease;user-select:none;-webkit-user-drag:none;}',
    '.plb-img.is-ready{opacity:1;}',
    '.plb-count{position:absolute;top:16px;left:20px;color:#fff;font-size:13px;',
    '  letter-spacing:.02em;opacity:.75;font-family:inherit;}',
    '.plb-title{position:absolute;bottom:16px;left:20px;right:20px;color:#fff;',
    '  font-size:14px;opacity:.8;text-align:center;pointer-events:none;}',
    '.plb-btn{position:absolute;border:0;background:transparent;color:#fff;cursor:pointer;',
    '  padding:12px;line-height:0;opacity:.7;transition:opacity .15s;}',
    '.plb-btn:hover{opacity:1;}',
    '.plb-close{top:8px;right:12px;font-size:30px;line-height:1;padding:8px 12px;}',
    '.plb-prev{left:8px;top:50%;transform:translateY(-50%);font-size:34px;}',
    '.plb-next{right:8px;top:50%;transform:translateY(-50%);font-size:34px;}',
    '.plb-spinner{position:absolute;width:34px;height:34px;border:3px solid rgba(255,255,255,.25);',
    '  border-top-color:#fff;border-radius:50%;animation:plb-spin .8s linear infinite;display:none;}',
    '.plb-spinner.is-on{display:block;}',
    '@keyframes plb-spin{to{transform:rotate(360deg);}}',
    'body.plb-lock{overflow:hidden;}',
    '.plb-loading-cursor{cursor:progress;}',
    '@media (max-width:768px){',
    '  .plb-stage{padding:48px 12px;}',
    '  .plb-prev,.plb-next{font-size:26px;}',
    '}'
  ].join('');

  function injectStyle() {
    var el = document.createElement('style');
    el.type = 'text/css';
    el.appendChild(document.createTextNode(CSS));
    document.head.appendChild(el);
  }

  // ---------------------------------------------------------------- viewer

  var viewer = null;

  // 주의: innerHTML 로 마크업 문자열을 쓰지 않는다.
  // 카페24 EZ 편집기의 커스텀 HTML 섹션은 스크립트 안의 태그 문자열까지
  // 실제 마크업으로 파싱해버려서 코드가 망가진다. 전부 createElement 로 조립한다.
  function el(tag, cls) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    return node;
  }

  function buildViewer() {
    var overlay = el('div', 'plb-overlay');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    var stage = el('div', 'plb-stage');
    var count = el('span', 'plb-count');
    var spinner = el('div', 'plb-spinner');
    var img = el('img', 'plb-img');
    img.setAttribute('alt', '');
    var title = el('p', 'plb-title');
    stage.appendChild(count);
    stage.appendChild(spinner);
    stage.appendChild(img);
    stage.appendChild(title);
    overlay.appendChild(stage);

    function makeButton(cls, label, glyph) {
      var b = el('button', 'plb-btn ' + cls);
      b.type = 'button';
      b.setAttribute('aria-label', label);
      b.appendChild(document.createTextNode(glyph));
      overlay.appendChild(b);
      return b;
    }
    var closeBtn = makeButton('plb-close', '닫기', '×');   // ×
    var prevBtn = makeButton('plb-prev', '이전', '❮');     // ❮
    var nextBtn = makeButton('plb-next', '다음', '❯');     // ❯

    document.body.appendChild(overlay);

    var v = {
      root: overlay,
      img: img,
      count: count,
      title: title,
      spinner: spinner,
      images: [],
      index: 0,
      seq: 0,
      fallbackHref: ''
    };

    closeBtn.addEventListener('click', close);
    prevBtn.addEventListener('click', function (e) {
      e.stopPropagation(); step(-1);
    });
    nextBtn.addEventListener('click', function (e) {
      e.stopPropagation(); step(1);
    });
    // 배경(이미지 바깥) 클릭 시 닫기
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay || e.target.classList.contains('plb-stage')) close();
    });

    // 모바일 스와이프
    var startX = null;
    overlay.addEventListener('touchstart', function (e) {
      startX = e.touches[0].clientX;
    }, { passive: true });
    overlay.addEventListener('touchend', function (e) {
      if (startX === null) return;
      var dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 45) step(dx < 0 ? 1 : -1);
      startX = null;
    }, { passive: true });

    return v;
  }

  // 어떤 크기로도 못 받는 이미지는 목록에서 빼고 다음 장으로 넘어간다.
  function dropCurrent() {
    var v = viewer;
    if (v.images.length <= 1) { close(); return; }
    v.images.splice(v.index, 1);
    if (v.index >= v.images.length) v.index = 0;
    render();
  }

  function render() {
    var v = viewer;
    var item = v.images[v.index];
    var seq = ++v.seq;
    var chain = [item.src].concat(item.alts || []);
    var i = 0;

    v.img.classList.remove('is-ready');
    v.spinner.classList.add('is-on');
    v.count.textContent = (v.index + 1) + ' / ' + v.images.length;

    var loader = new Image();
    loader.onload = function () {
      if (seq !== v.seq) return;          // 그 사이 다른 장으로 넘어갔으면 무시
      item.src = loader.src;              // 성공한 URL 로 고정
      item.alts = [];
      v.img.src = loader.src;
      v.img.classList.add('is-ready');
      v.spinner.classList.remove('is-on');
    };
    loader.onerror = function () {
      if (seq !== v.seq) return;
      i += 1;
      if (i < chain.length) { loader.src = chain[i]; return; }
      v.spinner.classList.remove('is-on');
      dropCurrent();
    };
    loader.src = chain[0];

    // 다음 이미지 미리 받아두기
    var next = v.images[v.index + 1];
    if (next) { var p = new Image(); p.src = next.src; }
  }

  function step(delta) {
    var v = viewer;
    if (v.images.length < 2) return;
    v.index = (v.index + delta + v.images.length) % v.images.length;
    render();
  }

  function open(images, title, fallbackHref) {
    if (!viewer) viewer = buildViewer();
    viewer.images = images;
    viewer.index = 0;
    viewer.title.textContent = title || '';
    viewer.fallbackHref = fallbackHref || '';
    viewer.root.classList.add('is-open');
    document.body.classList.add('plb-lock');
    render();
  }

  function close() {
    if (!viewer) return;
    viewer.root.classList.remove('is-open');
    viewer.img.removeAttribute('src');
    document.body.classList.remove('plb-lock');
  }

  document.addEventListener('keydown', function (e) {
    if (!viewer || !viewer.root.classList.contains('is-open')) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
  });

  // ---------------------------------------------------------------- binding

  function itemOf(node) {
    var el = node;
    while (el && el !== document.body) {
      if (el.matches && el.matches(ITEM_SELECTOR)) return el;
      el = el.parentNode;
    }
    return null;
  }

  function titleOf(item) {
    var el = item.querySelector('.description .name a, .name a, .description .name');
    if (!el) return '';
    // 스마트디자인이 앞에 붙이는 "상품명 :" 접두 라벨 제거
    var text = (el.textContent || '').replace(/^\s*상품명\s*:?\s*/, '');
    return text.trim();
  }

  function onClick(e) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;

    var link = e.target.closest ? e.target.closest('a[href*="/product/"]') : null;
    if (!link) return;

    var item = itemOf(link);
    if (!item) return;

    // 장바구니/관심상품/옵션 등 액션 버튼은 건드리지 않는다
    if (link.closest('.xans-product-action, .prdAction, .icon, .promotion')) return;

    var href = link.getAttribute('href');
    var no = productNoOf(href);
    if (!no) return;

    e.preventDefault();
    e.stopPropagation();

    var title = titleOf(item);
    var cached = cacheGet(no);
    if (cached && cached.length) {
      open(cached, title, link.href);
      return;
    }

    document.body.classList.add('plb-loading-cursor');
    fetchImages(link.href, no)
      .then(function (images) {
        document.body.classList.remove('plb-loading-cursor');
        if (!images.length) {
          // 뽑아낼 이미지가 없으면 원래 동작(상세 페이지 이동)으로 폴백
          location.href = link.href;
          return;
        }
        open(images, title, link.href);
      })
      .catch(function () {
        document.body.classList.remove('plb-loading-cursor');
        location.href = link.href;
      });
  }

  function init() {
    if (!shouldApply()) return;
    injectStyle();
    document.addEventListener('click', onClick, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
