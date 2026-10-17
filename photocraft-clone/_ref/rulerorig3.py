import re

h = open('dom-orig900.html', encoding='utf-8', errors='ignore').read()
print('ruler-tick count', h.count('ruler-tick'))
print('ruler-tick-label count', h.count('ruler-tick-label'))
i = h.find('ruler-tick')
print(repr(h[max(0, i - 600):i + 900]) if i > 0 else 'none')
