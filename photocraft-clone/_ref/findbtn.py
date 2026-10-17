import re

h = open('rendered.html', encoding='utf-8', errors='ignore').read()
hits = list(re.finditer('(?i)standalone for', h))
print('hits', len(hits))
for k, m in enumerate(hits[:3]):
    s = max(0, m.start() - 800)
    open('btnseg%d.txt' % k, 'w', encoding='utf-8').write(h[s:m.start() + 200].replace('\n', ' '))
    print('wrote btnseg%d.txt' % k)
