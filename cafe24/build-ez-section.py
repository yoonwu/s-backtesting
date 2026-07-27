#!/usr/bin/env python3
"""portfolio-lightbox.js -> 카페24 EZ 편집기 커스텀 HTML 섹션 스니펫 생성.

    python3 cafe24/build-ez-section.py [분류번호]

EZ(에디봇) 편집기의 커스텀 HTML 섹션은 붙여넣은 내용을 HTML 로 파싱한다.
스크립트 안에 태그처럼 보이는 문자열이 있으면 그걸 진짜 마크업으로 착각해
코드를 망가뜨리므로(실제로 겪음), 생성 전에 그런 문자열이 없는지 검사한다.
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'portfolio-lightbox.js')
OUT = os.path.join(HERE, 'ez-custom-html-section.txt')

# 지금 쇼핑몰에 만들어 둔 섹션의 id. 다른 섹션에 넣으려면 이 값을 그 섹션 것으로 바꾼다.
SECTION_ID = 'contents-0e33qxj-1'
CATEGORY_NOS = sys.argv[1] if len(sys.argv) > 1 else '62'

js = open(SRC, encoding='utf-8').read()

# 파일 상단 사용법 주석은 인라인에 불필요하므로 한 줄로 대체
start = js.index('/*!')
end = js.index('*/', start) + 2
body = '/* 제작사례 포트폴리오 라이트박스 - 상품 목록 썸네일 클릭 시 확대 뷰어 */\n' + js[end:].lstrip('\n')

bad = re.findall(r'<[a-zA-Z/!][^\n]*', body)
if bad:
    sys.exit('태그처럼 보이는 문자열이 남아있어 EZ 편집기가 파싱해버린다:\n  ' + '\n  '.join(bad[:5]))

section_open = (
    '<section class="section" data-ez-module="html/1" data-ez-name="CUSTOM HTML"'
    ' data-ez-type="plain" data-ez="%s">' % SECTION_ID
)

with open(OUT, 'w', encoding='utf-8') as f:
    f.write(section_open + '\n')
    f.write('<script>\n')
    f.write('  var PORTFOLIO_LIGHTBOX_CONFIG = { categoryNos: [%s] };\n' % CATEGORY_NOS)
    f.write('</script>\n')
    f.write('<script>\n')
    f.write(body.rstrip('\n') + '\n')
    f.write('</script>\n')
    f.write('</section>\n')

print('생성 완료:', OUT, '(분류 %s)' % CATEGORY_NOS)
