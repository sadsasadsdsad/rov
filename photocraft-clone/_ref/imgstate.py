import re
import subprocess

chrome = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
out = subprocess.run([
    chrome, "--headless=new", "--disable-gpu", "--hide-scrollbars",
    "--disable-features=LazyImageLoading", "--run-all-compositor-stages-before-draw",
    "--user-data-dir=C:\\Users\\andre\\AppData\\Local\\Temp\\opencode\\profC",
    "--window-size=1440,11200", "--virtual-time-budget=90000",
    "--dump-dom", "http://127.0.0.1:8099/test-local.html",
], capture_output=True, timeout=300)
h = out.stdout.decode('utf-8', 'ignore')
tag = re.search(r'<html[^>]*>', h).group(0)
am = re.search(r'data-imgstate="([^"]*)"', tag)
print('imgstate:', am.group(1) if am else None)
# find the three last hero imgs in the DOM
for key in ('apps_deckcraft_hero', 'apps_cadcraft_hero', 'apps_gridcraft_hero'):
    i = h.find(key)
    print(key, 'idx', i, '->', h[i - 120:i + 60].replace('\n', ' ') if i > 0 else 'NOT FOUND')
