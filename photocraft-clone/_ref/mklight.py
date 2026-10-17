# -*- coding: utf-8 -*-
"""Временная светлая копия rov.html для проверки светлой темы."""
h = open('rov.html', encoding='utf-8').read()
h = h.replace('<html lang="ru">', '<html lang="ru" data-theme="light">', 1)
open('rov-light.html', 'w', encoding='utf-8', newline='').write(h)
print('ok rov-light.html')
