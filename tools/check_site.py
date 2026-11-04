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
pages=list(ROOT.glob('index.html'))+list(ROOT.glob('*/index.html'))
parsed={}
for p in pages:
    s=p.read_text(); parser=Parser(); parser.feed(s); parsed[p]=parser
    assert sum(t=='h1' for t,a in parser.tags)==1,p
    assert ('html',{'lang':'ru'}) in parser.tags,p
    assert 'noindex' not in s.lower(),p
    canonical=[a['href'] for t,a in parser.tags if t=='link' and a.get('rel')=='canonical']
    expected=BASE+('' if p.parent==ROOT else p.parent.name+'/')
    assert canonical==[expected],(p,canonical)
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
        s=p.read_text()
        vals.append(re.search(r'<title>(.*?)</title>',s).group(1) if field=='title' else next(a['content'] for t,a in parser.tags if t=='meta' and a.get('name')=='description'))
    assert len(set(vals))==len(vals),field
locs=[e.text for e in ET.parse(ROOT/'sitemap.xml').getroot().iter('{http://www.sitemaps.org/schemas/sitemap/0.9}loc')]
assert set(locs)=={BASE,BASE+'vakansii/',BASE+'rabotodatelyam/'}
css=(ROOT/'assets/style.css').read_text()
for path in re.findall(r'url\("([^"\)]+)"\)',css): assert (ROOT/'assets'/path).is_file(),path
print('PASS: 3 pages, unique metadata, one H1 each, canonical, JSON-LD, internal links/assets/fragments, sitemap; no noindex or JobPosting.')
for p in pages+list((ROOT/'assets').iterdir()): print(f'{p.relative_to(ROOT)}: {p.stat().st_size:,} bytes')
