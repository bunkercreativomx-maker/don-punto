"""Genera assets del logo 3D DonPunto.com desde el PNG fuente (fondo transparente).
Uso: python3 scripts/brand/make_logo_3d.py <ruta_png_fuente>
"""
import sys, io
from pathlib import Path
from PIL import Image
import numpy as np

src = Image.open(sys.argv[1]).convert('RGBA')
root = Path(__file__).resolve().parents[2]
pub = root / 'public'
brand = pub / 'brand'

a = np.array(src)
alpha = a[..., 3]

def bbox(x0, x1, y0=0, y1=None, thr=8):
    sub = alpha[y0:y1, x0:x1] > thr
    ys = np.where(sub.any(axis=1))[0]; xs = np.where(sub.any(axis=0))[0]
    return (x0 + xs[0], y0 + ys[0], x0 + xs[-1] + 1, y0 + ys[-1] + 1)

SPLIT = 650          # columna vacía entre ícono y texto
TAG_Y = 505          # filas del tagline empiezan ~520

full = src.crop(bbox(0, a.shape[1]))
icon = src.crop(bbox(0, SPLIT))
words = src.crop(bbox(SPLIT, a.shape[1], 0, TAG_Y))
# logo sin tagline (ícono + DonPunto.com) para headers pequeños
ib, wb = bbox(0, SPLIT), bbox(SPLIT, a.shape[1], 0, TAG_Y)
_c = a.copy(); _c[TAG_Y:, SPLIT:, 3] = 0
compact = Image.fromarray(_c).crop((ib[0], min(ib[1], wb[1]), wb[2], max(ib[3], wb[3])))

def fit(im, h):
    return im.resize((round(im.width * h / im.height), h), Image.LANCZOS)

def save(im, name):
    im.save(brand / f'{name}.webp', quality=90, method=6)  # webp: ligero para precache PWA

save(fit(full, 360), 'logo-3d')            # completo con tagline
save(fit(compact, 200), 'logo-3d-compact')  # sin tagline
save(fit(words, 160), 'wordmark-3d')        # solo texto
save(fit(icon, 256), 'mark-3d')             # solo ícono D

# favicon: solo el cuerpo de la D (sin estelas verdes) para que se lea a 16-32px
fav = src.crop(bbox(165, SPLIT))

def square(im, size, pad=0.08, bg=None):
    canvas = Image.new('RGBA', (size, size), bg or (0, 0, 0, 0))
    inner = round(size * (1 - 2 * pad))
    s = inner / max(im.size)
    ic = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    canvas.alpha_composite(ic, ((size - ic.width) // 2, (size - ic.height) // 2))
    return canvas

WHITE = (255, 255, 255, 255)
# favicon transparente (multi-tamaño)
square(fav, 256, pad=0.0).save(pub / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
square(fav, 32, pad=0.0).save(pub / 'favicon-32.png', optimize=True)
square(fav, 96, pad=0.0).save(pub / 'favicon-96.png', optimize=True)
# iOS/Android requieren fondo sólido
square(icon, 180, pad=0.10, bg=WHITE).convert('RGB').save(pub / 'apple-touch-icon.png', optimize=True)
square(icon, 192, pad=0.08, bg=WHITE).save(pub / 'pwa-192.png', optimize=True)
square(icon, 512, pad=0.08, bg=WHITE).save(pub / 'pwa-512.png', optimize=True)
square(icon, 512, pad=0.20, bg=WHITE).save(pub / 'pwa-maskable-512.png', optimize=True)
square(icon, 1024, pad=0.08).save(brand / 'mark-1024.png', optimize=True)
fit(full, 480).save(brand / 'logo-1600.png', optimize=True)

# og-image 1200x630 fondo blanco
og = Image.new('RGBA', (1200, 630), WHITE)
lg = full.resize((1080, round(full.height * 1080 / full.width)), Image.LANCZOS)
og.alpha_composite(lg, ((1200 - lg.width) // 2, (630 - lg.height) // 2))
og.convert('RGB').save(pub / 'og-image.png', optimize=True)
print('ok', full.size, icon.size, words.size, compact.size)
