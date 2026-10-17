import numpy as np
from PIL import Image

for name in ('shot-orig2500.png', 'shot-clone2500.png'):
    im = np.asarray(Image.open(name).convert('L')).astype(int)
    print(name, im.shape)
    rail = im[100:, 1395:1425]
    rows = rail.max(axis=1)
    med = np.median(rows)
    thr = med + 60
    bands, inb = [], False
    for y, v in enumerate(rows):
        if v > thr and not inb:
            start, inb = y, True
        elif v <= thr and inb:
            if y - start > 4:
                bands.append((start + y) / 2 + 100)
            inb = False
    print('  centers:', [round(b, 1) for b in bands])
    if len(bands) > 1:
        print('  spacings:', [round(x, 1) for x in np.diff(bands)])
