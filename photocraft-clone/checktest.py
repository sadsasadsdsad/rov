import re

h = open('test-local.html', encoding='utf-8').read()
print('remaining remote imgs:', len(re.findall(r'src="https://getartcraft\.com/images', h)))
print('local imgs:', len(re.findall(r'src="_ref/imgcache/', h)))
i = h.find('filmcraft/color')
print(repr(h[i - 260:i + 160]))
# verify cache file validity (webp magic)
import os
bad = []
d = os.path.join('_ref', 'imgcache')
for f in os.listdir(d):
    with open(os.path.join(d, f), 'rb') as fh:
        head = fh.read(16)
    if not (head.startswith(b'RIFF') and head[8:12] == b'WEBP'):
        bad.append((f, head))
print('invalid webp:', bad)
