import numpy as np
from PIL import Image

o = np.asarray(Image.open('shot-orig.png').convert('RGB')).astype(int)
c = np.asarray(Image.open('shot-clone.png').convert('RGB')).astype(int)
print('sizes', o.shape, c.shape)
d = np.abs(o - c).mean(axis=2)
print('mean diff', round(d.mean(), 3))
print()
for y0 in range(0, o.shape[0], 400):
    m = d[y0:y0 + 400].mean()
    flag = '  <<<' if m > 3 else ''
    print(y0, round(m, 1), flag)
