import re
import subprocess

chrome = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
out = subprocess.run([
    chrome, "--headless=new", "--disable-gpu", "--disable-features=LazyImageLoading",
    "--user-data-dir=C:\\Users\\andre\\AppData\\Local\\Temp\\opencode\\profB",
    "--window-size=1440,900", "--virtual-time-budget=60000",
    "--dump-dom", "http://127.0.0.1:8099/index.html",
], capture_output=True, timeout=240)
h = out.stdout.decode('utf-8', 'ignore')
open('dom-clone900.html', 'w', encoding='utf-8').write(h)
i = h.find('ruler')
print('len', len(h), 'ruler idx', i)
print(h[i - 200:i + 1500] if i > 0 else 'NO RULER')
m = re.search(r'<html[^>]*>', h)
tag = m.group(0) if m else ''
for attr in ('data-doch', 'data-doch2', 'data-ruler'):
    am = re.search(attr + r'="([^"]*)"', tag)
    print(attr, '->', am.group(1) if am else None)
