import re

h = open('dom-orig900.html', encoding='utf-8', errors='ignore').read()
i = h.find('ruler-track')
print('ruler-track idx', i)
if i < 0:
    # find the rail container by another marker
    i = h.find('ruler-digits')
    print('ruler-digits idx', i)
seg = h[max(0, i - 2000):i + 6000]
# tick tops
tops = [float(x) for x in re.findall(r'top:\s*([0-9.]+)px', seg)]
print('tops sample', tops[:30])
print('n tops', len(tops))
