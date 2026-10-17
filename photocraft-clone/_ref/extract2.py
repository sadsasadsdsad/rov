# -*- coding: utf-8 -*-
"""Достаёт из index.html (клон PhotoCraft) эталонные блоки разметки
для сборки rov.html в том же стиле."""
import re

h = open('index.html', encoding='utf-8').read()


def grab(start_pat, length, out, back=0):
    m = re.search(start_pat, h)
    if not m:
        print('NOT FOUND:', start_pat)
        return
    i = m.start() - back
    open(out, 'w', encoding='utf-8').write(h[i:i + length])
    print('ok', out, length)


# шапка целиком (вместе с mobile-nav)
grab(r'<nav id="site-nav"', 6000, '_ref/b-nav.txt')
# мобильное меню (если после шапки не влезло)
i = h.find('id="mobile-nav"')
if i > 0:
    open('_ref/b-mobilenav.txt', 'w', encoding='utf-8').write(h[i - 200:i + 2500])
    print('ok _ref/b-mobilenav.txt')
# герой: <main> … первый </section>
m = re.search(r'<main[^>]*>', h)
j = h.find('</section>', m.start())
open('_ref/b-hero.txt', 'w', encoding='utf-8').write(h[m.start():j + 12])
print('ok _ref/b-hero.txt', j - m.start())
# первая карточка highlights
k = h.find('id="highlights"')
a = h.find('<article', k)
b = h.find('</article>', a)
open('_ref/b-card.txt', 'w', encoding='utf-8').write(h[a:b + 10])
print('ok _ref/b-card.txt', b - a)
# блок с терминалом/кодом (для секции ИИ)
c = h.find('data-track="copy_command"')
if c > 0:
    f = h.rfind('<figure', 0, c)
    g = h.find('</figure>', c)
    open('_ref/b-code.txt', 'w', encoding='utf-8').write(h[f:g + 10])
    print('ok _ref/b-code.txt')
# футер
f = h.rfind('<footer')
g = h.find('</footer>', f)
open('_ref/b-footer.txt', 'w', encoding='utf-8').write(h[f:g + 10])
print('ok _ref/b-footer.txt', g - f)
# статус-полоса hero-меты ( hud-label под героем ) — просто первые2000 символов секции get-it
gi = h.find('id="get-it"')
if gi > 0:
    s = h.rfind('<section', 0, gi)
    e = h.find('</section>', gi)
    open('_ref/b-getit.txt', 'w', encoding='utf-8').write(h[s:e + 12])
    print('ok _ref/b-getit.txt', e - s)
