import numpy as np
from PIL import Image

for name in ('shot-orig.png', 'shot-clone.png'):
    im = np.asarray(Image.open(name).convert('L')).astype(int)
    rail = im[1000:, 1395:1425]  # label column only
    rows = rail.max(axis=1)
    med = np.median(rows)
    thr = med + 60
    bands, inb = [], False
    for y, v in enumerate(rows):
        if v > thr and not inb:
            start, inb = y, True
        elif v <= thr and inb:
            if y - start > 4:
                bands.append(((start + y) / 2 + 1000, rail[start:y].max()))
            inb = False
    centers = [round(b[0], 1) for b in bands]
    print(name, len(centers))
    print('  centers:', centers)
    if len(centers) > 1:
        print('  spacings:', [round(x, 1) for x in np.diff(centers)])
