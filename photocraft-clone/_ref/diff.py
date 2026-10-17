import re, html as H, difflib, sys
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ref = Path(r'D:\work\rov\photocraft-clone\_ref')

def text(p):
    s = Path(p).read_text(encoding='utf-8', errors='replace')
    m = re.search(r'<body.*?>(.*)</body>', s, re.S)
    b = m.group(1) if m else s
    b = re.sub(r'<(script|style)[^>]*>.*?</\1>', ' ', b, flags=re.S)
    b = re.sub(r'<[^>]+>', '\n', b)
    b = H.unescape(b)
    lines = [re.sub(r'\s+', ' ', l).strip() for l in b.split('\n')]
    return [l for l in lines if l]

a = text(ref / 'rendered.html')
c = text(ref.parent / 'index.html')
d = list(difflib.unified_diff(a, c, fromfile='original(client)', tofile='clone', lineterm='', n=1))
print('orig lines', len(a), 'clone lines', len(c))
print('\n'.join(d))
