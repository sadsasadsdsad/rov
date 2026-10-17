import re

h = open('rendered.html', encoding='utf-8', errors='ignore').read()
for k in range(3):
    seg = open('btnseg%d.txt' % k, encoding='utf-8').read()
    m = re.search(r'<a href="[^"]*standalone[^"]*"[^>]*>', seg, re.I)
    if not m:
        # find the <a ...>Standalone pattern
        m = re.search(r'<a href="[^"]*"[^>]*class="([^"]*)"[^>]*data-cta=""', seg)
    cls = re.search(r'class="([^"]*)"', seg[seg.find('<a href'):seg.find('<a href') + 700])
    print(k, '->', (cls.group(1)[:200] if cls else 'no class'))
