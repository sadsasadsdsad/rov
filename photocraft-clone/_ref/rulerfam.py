import re
import subprocess

chrome = r"C:\Program Files\Google\Chrome\Application\chrome.exe"


def dump(url, prof):
    out = subprocess.run([
        chrome, "--headless=new", "--disable-gpu", "--disable-features=LazyImageLoading",
        "--user-data-dir=" + prof,
        "--window-size=1440,900", "--virtual-time-budget=90000",
        "--dump-dom", url,
    ], capture_output=True, timeout=300)
    return out.stdout.decode('utf-8', 'ignore')


h = dump('https://getartcraft.com/apps/photocraft#family', r'C:\Users\andre\AppData\Local\Temp\opencode\profA')
open('dom-orig-family.html', 'w', encoding='utf-8').write(h)
print('len', len(h))
print('ruler-tick count', h.count('ruler-tick'))
tops = [float(x) for x in re.findall(r'ruler-tick-label[^>]*?style="top:\s*([0-9.]+)px"', h)]
print('label tops', tops[:25])
if len(tops) > 2:
    import numpy as np
    print('spacing', [round(x, 1) for x in np.diff(tops)][:25])
