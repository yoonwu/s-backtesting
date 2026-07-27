# 카페24 포트폴리오 라이트박스

제작사례 포트폴리오를 **게시판(용량 제한)이 아니라 0원 상품**으로 쌓아두고,
분류 페이지에서 썸네일을 클릭하면 **상품 상세로 이동하지 않고 확대 뷰어**로 보여준다.

- `portfolio-lightbox.js` — 드롭인 스크립트 (CSS 포함, 외부 라이브러리 의존 없음)
- `test/lightbox.test.js` — 카페24 기본 스킨 구조를 흉내낸 가짜 페이지로 돌리는 브라우저 테스트

## 동작 방식

1. 분류(상품 목록) 페이지에서 썸네일/상품명 링크 클릭을 가로챈다.
2. 해당 상품 상세 페이지를 백그라운드에서 `fetch` 한다. (같은 도메인이라 CORS 문제 없음)
3. **대표이미지 → 추가이미지 → 상세설명(`#prdDetail`)** 순으로 `<img>` 를 뽑아낸다.
   - 아이콘/버튼/로딩 이미지는 제외하고, 중복 URL 은 한 번만 담는다.
   - lazy-load 속성(`ec-data-src`, `data-src`)도 읽는다.
   - `/web/product/tiny|small|medium/` 경로는 `/web/product/big/` 으로 자동 승격한다.
4. 라이트박스로 띄운다. `1 / 32` 카운터, 좌우 이동, ESC/배경클릭 닫기, 모바일 스와이프 지원.
5. 한 번 읽은 상품은 `sessionStorage` 에 캐싱해서 두 번째 클릭부터는 즉시 열린다.
6. 이미지를 하나도 못 찾으면 **원래 동작(상세 페이지 이동)으로 폴백**한다. 즉 최악의 경우에도 지금과 같다.

## 적용 방법

### 1) 파일 업로드

카페24 관리자 → `디자인(쇼핑몰 디자인) → 디자인 수정` → 편집창의 **파일 업로더**
(또는 웹FTP)로 `portfolio-lightbox.js` 를 `/web/upload/` 아래에 올린다.

### 2) 스킨에 스크립트 추가

포트폴리오 분류가 쓰는 **상품 분류(목록) 페이지 HTML** 맨 아래에 넣는다.
보통 `/product/list.html` 이고, 전체 적용하려면 `/layout/basic/layout.html` 의 `</body>` 직전도 가능하다.

```html
<script>
  // 포트폴리오 분류 번호만 적용. 비워두면 모든 상품 목록에 적용된다.
  var PORTFOLIO_LIGHTBOX_CONFIG = { categoryNos: [24] };
</script>
<script src="/web/upload/portfolio-lightbox.js"></script>
```

> **분류 번호 확인:** 포트폴리오 분류 페이지 URL 이
> `https://yogibag.co.kr/category/포트폴리오/24/` 라면 뒤의 `24` 가 분류 번호다.

### 3) 반드시 작업용 스킨 복사본에서 테스트

`디자인 → 디자인 보관함` 에서 운영 스킨을 **복사**한 뒤 그 사본에서 적용하고,
확인 끝난 다음 대표 디자인으로 교체한다.

## 설정 옵션

| 키 | 기본값 | 설명 |
|---|---|---|
| `categoryNos` | `[]` (전체) | 적용할 분류 번호 배열 |
| `itemSelector` | `.prdList > li, .prdList > div` | 목록 항목 셀렉터. 커스텀 스킨이면 수정 |
| `detailImageSelectors` | `#prdDetail img` 외 | 상세에서 이미지를 뽑을 셀렉터 (앞쪽 우선) |
| `cache` | `true` | sessionStorage 캐싱 사용 여부 |

## 테스트

카페24 기본 스킨 DOM 구조를 흉내낸 가짜 목록/상세 페이지를 로컬 서버로 띄우고
헤드리스 크로미움으로 실제 클릭 동작을 검증한다.

```bash
npm i playwright-core
node cafe24/test/lightbox.test.js
```

검증 항목: 클릭 시 페이지 이동 안 함 / 라이트박스 오픈 / 이미지 수집 개수와 순서 /
아이콘·로딩 이미지 제외 / lazy-load 속성 수집 / tiny→big 승격 / 좌우 순환 이동 /
ESC 닫기 / 캐시 재오픈 / **이미지 없으면 상세 페이지로 폴백** / 설정 외 분류에서는 원래 동작 유지.

## 같이 손보면 좋은 것

포트폴리오 상품은 판매용이 아니므로, 분류 페이지에서 아래를 CSS 로 숨기면 갤러리처럼 보인다.

```css
/* 포트폴리오 분류에서만 적용되도록 상위 클래스와 함께 쓸 것 */
.xans-product-listnormal .prdList .description .price,
.xans-product-listnormal .prdList .description .xans-product-listitem,
.xans-product-listnormal .prdList .prdAction { display: none; }
```

- 상품 등록 시 `판매안함` + `진열함` 으로 두면 장바구니/구매 버튼이 노출되지 않는다.
- 상품 이미지는 **가로 1600px 내외 + WebP** 로 올리면 용량이 원본 대비 1/3~1/5 로 줄어든다.

## 속도를 더 올리고 싶다면

현재는 클릭 시 상세 페이지 HTML 을 한 번 받아온다(첫 클릭만, 이후 캐시).
이걸 없애려면 상품 목록 모듈에서 이미지 URL 을 미리 내려주면 된다.
상품의 **간단설명** 같은 잘 안 쓰는 필드에 이미지 URL 목록을 JSON 으로 넣고,
목록 템플릿에서 `data-images` 속성으로 출력한 뒤 스크립트가 그걸 먼저 읽게 하는 방식.
다만 상품마다 수동 입력이 필요하므로, 사례가 수백 건으로 늘어난 뒤에 고려해도 늦지 않다.

## 용량이 더 늘어나면

상품 이미지 영역도 무한은 아니다. 사례가 계속 쌓여 한계에 닿으면
이미지만 외부 스토리지(예: Cloudflare R2 — 10GB 무료, 전송량 무과금)에 두고
카페24 에는 HTML/JS 만 남기는 구조로 옮기면 사실상 제한이 사라진다.
그 경우 이 스크립트는 `detailImageSelectors` 대신 외부 JSON 목록을 읽도록 바꾸면 된다.
