import re
import subprocess

chrome = r"C:\Program Files\Google\Chrome\Application\chrome.exe"


def dump(url, w, hgt, profile):
    out = subprocess.run([
        chrome, "--headless=new", "--disable-gpu", "--disable-features=LazyImageLoading",
        "--user-data-dir=" + profile,
        "--window-size=%d,%d" % (w, hgt), "--virtual-time-budget=60000",
        "--dump-dom", url,
    ], capture_output=True, timeout=240)
    return out.stdout.decode('utf-8', 'ignore')


for label, url, prof in (
    ('orig', 'https://getartcraft.com/apps/photocraft', r'C:\Users\andre\AppData\Local\Temp\opencode\profA'),
    ('clone', 'http://127.0.0.1:8099/index.html', r'C:\Users\andre\AppData\Local\Temp\opencode\profB'),
):
    for w, hgt in ((1440, 900),):
        h = dump(url, w, hgt, prof)
        tops = [float(x) for x in re.findall(r'ruler-tick-label" style="top:\s*([0-9.]+)px"', h)]
        if not tops:
            tops = [float(x) for x in re.findall(r'ruler-tick-label[^>]*style="top:\s*([0-9.]+)px"', h)]
        print(label, w, 'x', hgt, '-> labels:', len(tops))
        if len(tops) > 1:
            import numpy as np
            print('   first/last:', tops[0], tops[-1], 'spacing:', round(np.diff(tops).mean(), 2))
