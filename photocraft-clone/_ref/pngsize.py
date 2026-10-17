# -*- coding: utf-8 -*-
"""Печатает размеры PNG (IHDR) для контроля скриншотов."""
import struct
import glob

for f in sorted(glob.glob('_ref/rov-*.png')):
    with open(f, 'rb') as fh:
        d = fh.read(33)
    w, h = struct.unpack('>II', d[16:24])
    print('%-28s %dx%d' % (f, w, h))
