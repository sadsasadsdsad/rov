import re
import subprocess

import numpy as np

chrome = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
out = subprocess.run([
    chrome, "--headless=new", "--disable-gpu", "--hide-scrollbars",
    "--disable-features=LazyImageLoading", "--run-all-compositor-stages-before-draw",
    "--user-data-dir=C:\\Users\\andre\\AppData\\Local\\Temp\\opencode\\profV",
    "--window-size=1440,11200", "--virtual-time-budget=90000",
    "--dump-dom", "http://127.0.0.1:8099/index.html",
], capture_output=True, timeout=300)
h = out.stdout.decode('utf-8', 'ignore')

tag = re.search(r'<html[^>]*>', h).group(0)
print('data-doch left in html:', 'data-doch' in tag, '| data-dbg:', 'data-dbg' in tag)

tops = [float(x) for x in re.findall(r'ruler-tick-label" style="top:\s*([0-9.]+)px', h)]
if not tops:
    tops = [float(x) for x in re.findall(r'ruler-tick-label[^>]*style="top:\s*([0-9.]+)px"', h)]
print('ruler labels:', len(tops))
if len(tops) > 1:
    d = np.diff(tops)
    print('spacing mean/min/max:', round(d.mean(), 1), round(d.min(), 1), round(d.max(), 1))

# detected-OS button styling on the Windows card
i = h.find('Standalone for <!-- -->Windows')
seg = h[max(0, i - 900):i]
m = re.findall(r'class="([^"]*)"', seg)
print('windows btn class tail:', m[-1][-120:] if m else 'NOT FOUND')
print('has bg-invert-bg:', 'bg-invert-bg' in seg)
# macOS button must stay outlined
j = h.find('Standalone for <!-- -->macOS')
seg2 = h[max(0, j - 900):j]
print('macos btn keeps invert-block:', 'invert-block' in seg2, '| no bg-invert-bg:', 'bg-invert-bg' not in seg2)
