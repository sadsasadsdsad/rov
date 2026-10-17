# -*- coding: utf-8 -*-
"""Проверяет, что каждый class из rov.html существует в style.css / clone.css / rov.css.

Компилированный style.css содержит только утилиты, которые применялись на
оригинальной странице PhotoCraft — новая страница не может свободно пользоваться
произвольными классами Tailwind. Всё, чего нет, должно быть либо в rov.css,
либо заменено на существующий аналог.
"""
import re
import sys

html = open('rov.html', encoding='utf-8').read()
css = ''
for f in ('style.css', 'clone.css', 'rov.css'):
    css += open(f, encoding='utf-8').read() + '\n'

# убираем экранирование в селекторах: .md\:grid-cols-3 -> .md:grid-cols-3
flat = css.replace('\\', '')

tokens = set()
for m in re.finditer(r'class="([^"]*)"', html):
    for t in m.group(1).split():
        if t:
            tokens.add(t)

missing = sorted(t for t in tokens if t not in flat and not t.startswith('lucide'))
print('всего классов:', len(tokens))
if missing:
    print('НЕ НАЙДЕНЫ в css (%d):' % len(missing))
    for t in missing:
        print('  -', t)
    sys.exit(1)
print('все классы найдены')
