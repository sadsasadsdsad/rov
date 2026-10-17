# -*- coding: utf-8 -*-
"""Мобильное исправление: grid-ячейки ИИ-секции и фигура «Доступ» получают
min-w-0, чтобы длинные строки <pre> скроллились внутри, а не раздували
страницу (иначе на 390px контент срезается справа)."""
h = open('rov.html', encoding='utf-8').read()

old_cell = 'data-reveal="true" class="bg-bg p-6 md:p-10"'
new_cell = 'data-reveal="true" class="min-w-0 bg-bg p-6 md:p-10"'
a = h.count(old_cell)
h = h.replace(old_cell, new_cell)

old_fig = '<figure class="mt-10 w-full max-w-2xl border border-line bg-bg-sunken text-left">'
new_fig = '<figure class="mt-10 w-full max-w-2xl min-w-0 border border-line bg-bg-sunken text-left">'
b = h.count(old_fig)
h = h.replace(old_fig, new_fig)

open('rov.html', 'w', encoding='utf-8', newline='').write(h)
print('ai-cells:', a, 'use-figure:', b)
