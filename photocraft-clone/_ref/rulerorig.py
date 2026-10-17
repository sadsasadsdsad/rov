import re
import subprocess

chrome = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
out = subprocess.run([
    chrome, "--headless=new", "--disable-gpu", "--disable-features=LazyImageLoading",
    "--user-data-dir=C:\\Users\\andre\\AppData\\Local\\Temp\\opencode\\profA",
    "--window-size=1440,900", "--virtual-time-budget=60000",
    "--dump-dom", "https://getartcraft.com/apps/photocraft",
], capture_output=True, timeout=300)
h = out.stdout.decode('utf-8', 'ignore')
open('dom-orig900.html', 'w', encoding='utf-8').write(h)
print('len', len(h))
i = h.find('ruler-track')
print('ruler-track idx', i)
if i > 0:
    seg = h[i - 500:i + 2000]
    print(seg)
