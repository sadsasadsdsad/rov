import re
from collections import Counter

h = open('page.html', encoding='utf-8').read()
imgs = re.findall(r'<img[^>]*>', h)
print('total imgs:', len(imgs))
c = Counter()
lazy_urls = []
for t in imgs:
    src_m = re.search(r'src="([^"]*)"', t)
    src = src_m.group(1) if src_m else ''
    lazy = 'loading="lazy"' in t
    host = re.sub(r'(https?://[^/]+).*', r'\1', src) if src else 'none'
    c[(host, lazy)] += 1
    if lazy:
        lazy_urls.append(src)
for k, v in sorted(c.items()):
    print(k, v)
print()
for u in lazy_urls:
    print(u)
