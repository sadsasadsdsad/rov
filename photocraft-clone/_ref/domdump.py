import re
import subprocess

chrome = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
out = subprocess.run([
    chrome, "--headless=new", "--disable-gpu", "--disable-features=LazyImageLoading",
    "--user-data-dir=C:\\Users\\andre\\AppData\\Local\\Temp\\opencode\\shotprof2",
    "--window-size=1440,11200", "--virtual-time-budget=60000",
    "--dump-dom", "http://127.0.0.1:8099/index.html",
], capture_output=True, timeout=180)
h = out.stdout.decode('utf-8', 'ignore')
print('len', len(h))
m = re.search(r'<html[^>]*>', h)
tag = m.group(0) if m else 'NO HTML TAG'
for attr in ('data-doch', 'data-doch2', 'data-dbg', 'data-dbg2', 'data-ruler'):
    am = re.search(attr + r'="([^"]*)"', tag)
    print(attr, '->', am.group(1) if am else None)
ticks = len(re.findall(r'class="ruler-tick', h))
labels = re.findall(r'class="ruler-tick-label"[^>]*style="top:([0-9.]+)px"', h)
print('ticks', ticks)
print('label tops', labels[:6], '...', labels[-3:] if len(labels) > 6 else '')
