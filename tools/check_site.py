"""Static SEO and local-path verification; no external dependencies."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
import json, re, xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
BASE='https://ivanzdaniekin.github.io/mypage/'
class Parser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True); self.tags=[]
    def handle_starttag(self,tag,attrs): self.tags.append((tag,dict(attrs)))
diagnostics={'manual-form-test','turnstile-check'}
pages=sorted(p for p in ROOT.rglob('index.html') if p.relative_to(ROOT).parts[0] not in diagnostics)
parsed={}
policy_page=ROOT/'privacy/index.html'
language_pairs=[
    {'ru':'', 'uk':'uk/'},
    {'ru':'vakansii/', 'uk':'uk/vakansii/'},
]
for p in pages:
    s=p.read_text(); parser=Parser(); parser.feed(s); parsed[p]=parser
    assert sum(t=='h1' for t,a in parser.tags)==1,p
    lang='uk' if p.relative_to(ROOT).parts[0]=='uk' else 'ru'
    assert ('html',{'lang':lang}) in parser.tags,p
    assert 'noindex' not in s.lower(),p
    canonical=[a['href'] for t,a in parser.tags if t=='link' and a.get('rel')=='canonical']
    expected=BASE+p.relative_to(ROOT).as_posix().removesuffix('index.html')
    if p!=policy_page: assert canonical==[expected],(p,canonical)
    pair=next((pair for pair in language_pairs if expected==BASE+pair[lang]),None)
    if pair:
        alternate=[(a.get('hreflang'),a.get('href')) for t,a in parser.tags if t=='link' and a.get('rel')=='alternate']
        assert sorted(alternate)==sorted((code,BASE+url) for code,url in pair.items()),(p,alternate)
        switch=[(a.get('hreflang'),a.get('href'),a.get('aria-current')) for t,a in parser.tags if t=='a' and 'hreflang' in a]
        assert sorted(switch)==sorted((code,'/mypage/'+url,'page' if code==lang else None) for code,url in pair.items()),(p,switch)
    for raw in re.findall(r'<script type="application/ld\+json">(.*?)</script>',s,re.S):
        data=json.loads(raw); assert data['@type']=='Person'; assert len(data['sameAs'])==5
    assert 'JobPosting' not in s
    for tag,a in parser.tags:
        for attr in ('href','src'):
            if attr not in a: continue
            url=urlsplit(a[attr])
            if url.netloc and url.netloc!='ivanzdaniekin.github.io': continue
            if url.scheme and url.scheme not in ('http','https'): continue
            if url.path:
                assert url.path.startswith('/mypage/'),(p,a[attr])
                target=ROOT/unquote(url.path.removeprefix('/mypage/'))
                if target.is_dir(): target=target/'index.html'
            else: target=p
            assert target.is_file(),(p,a[attr])
            if url.fragment:
                assert target.suffix=='.html'
                assert re.search(r'id="'+re.escape(url.fragment)+'"',target.read_text()),(p,a[attr])
    assert p.stat().st_size<30000
for field in ('title','description'):
    vals=[]
    for p,parser in parsed.items():
        if p==policy_page: continue
        s=p.read_text()
        vals.append(re.search(r'<title>(.*?)</title>',s).group(1) if field=='title' else next(a['content'] for t,a in parser.tags if t=='meta' and a.get('name')=='description'))
    assert len(set(vals))==len(vals),field
locs=[e.text for e in ET.parse(ROOT/'sitemap.xml').getroot().iter('{http://www.sitemaps.org/schemas/sitemap/0.9}loc')]
assert len(locs)==len(set(locs)),locs
assert set(locs)=={BASE+p.relative_to(ROOT).as_posix().removesuffix('index.html') for p in pages if p!=policy_page}
css=(ROOT/'assets/style.css').read_text()
for path in re.findall(r'url\("([^"\)]+)"\)',css): assert (ROOT/'assets'/path).is_file(),path
print(f'PASS: SEO metadata on {len(locs)} sitemap pages, language pairs, internal links/assets/fragments, and JSON-LD.')
for p in pages+list((ROOT/'assets').iterdir()): print(f'{p.relative_to(ROOT)}: {p.stat().st_size:,} bytes')
