import os
import re
import urllib.request

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cache = os.path.join(root, '_ref', 'imgcache')
os.makedirs(cache, exist_ok=True)

h = open(os.path.join(root, 'index.html'), encoding='utf-8').read()
urls = sorted(set(re.findall(r'src="(https://getartcraft\.com/images/[^"]+)"', h)))
print('images to cache:', len(urls))
ok = 0
for u in urls:
    name = u.replace('https://getartcraft.com/images/', '').replace('/', '_')
    path = os.path.join(cache, name)
    if os.path.exists(path) and os.path.getsize(path) > 0:
        ok += 1
        continue
    try:
        req = urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0'})
        data = urllib.request.urlopen(req, timeout=60).read()
        open(path, 'wb').write(data)
        ok += 1
    except Exception as e:
        print('FAIL', u, e)
print('cached ok:', ok)

# build a local test copy of index.html that points at the cached images
test = h
for u in urls:
    name = u.replace('https://getartcraft.com/images/', '').replace('/', '_')
    test = test.replace('src="' + u + '"', 'src="_ref/imgcache/' + name + '"')
out = os.path.join(root, 'test-local.html')
test = test.replace('</body>', '<script>addEventListener("load", function () { setTimeout(function () {'
                  ' document.querySelectorAll("[data-reveal],[data-draw-rule],[data-draw-tick],[data-draw-eyebrow]")'
                  '.forEach(function (el) { el.classList.add("is-in"); el.style.transitionDelay = "0ms"; });'
                  ' var bad = [].filter.call(document.images, function (i) { return !(i.complete && i.naturalWidth > 0); })'
                  '.map(function (i) { return (i.currentSrc || i.src).split("/").pop(); });'
                  ' document.documentElement.setAttribute("data-imgstate", "bad=" + bad.length + ":" + bad.join(","));'
                  '}, 50);'
                  '});</script></body>')
open(out, 'w', encoding='utf-8').write(test)
print('wrote', out)
