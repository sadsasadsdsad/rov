import re

h = open('index.html', encoding='utf-8').read()

# hero: find the first <main> section
i = h.find('<main')
open('_ref/hero.txt', 'w', encoding='utf-8').write(h[i:i + 3500])

# a section header pattern (eyebrow + rule): find "What's inside"
j = h.find("inside")
open('_ref/section.txt', 'w', encoding='utf-8').write(h[max(0, j - 1500):j + 1500])

# footer
k = h.rfind('<footer')
open('_ref/footer.txt', 'w', encoding='utf-8').write(h[k:k + 2500])
print('ok')
