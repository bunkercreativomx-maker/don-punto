"""Genera el logo de Don Punto (SVG con texto en curvas) + íconos PNG/ICO.
Concepto: una "D" cuyo hueco es un punto color maíz → "Don Punto."
Uso: /opt/data/cache/svgenv/bin/python scripts/brand/make_logo.py
"""
import io, os
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen
import cairosvg
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PUB = os.path.join(ROOT, "public")
BRAND = os.path.join(PUB, "brand")
os.makedirs(BRAND, exist_ok=True)

AGAVE_700 = "#0C5A40"
AGAVE_600 = "#0E6F4D"
AGAVE_500 = "#16895F"
MAIZ = "#F5B323"
INK = "#0D100E"
WHITE = "#FFFFFF"

# ------------------------------------------------------------------ geometría del símbolo
# Monograma "D." : una D arquitectónica (lomo recto, tazón semicircular, hueco en forma de D)
# seguida de un punto maíz sobre la línea base → se lee "D." = Don Punto.

def d_shape(x0, top, R, straight, corner):
    """Contorno de D: lomo recto a la izquierda, tramo recto arriba/abajo y semicírculo a la derecha."""
    cxr = x0 + straight
    bot = top + 2 * R
    c = corner
    return (
        f"M{x0 + c:.2f},{top:.2f} L{cxr:.2f},{top:.2f} "
        f"A{R:.2f},{R:.2f} 0 0 1 {cxr:.2f},{bot:.2f} "
        f"L{x0 + c:.2f},{bot:.2f} Q{x0:.2f},{bot:.2f} {x0:.2f},{bot - c:.2f} "
        f"L{x0:.2f},{top + c:.2f} Q{x0:.2f},{top:.2f} {x0 + c:.2f},{top:.2f} Z"
    )


def mark_group(cx=512, cy=512, scale=1.0, d_color=WHITE, dot_color=MAIZ):
    R = 228 * scale          # radio del tazón (altura = 2R)
    straight = 118 * scale   # tramo recto antes del tazón
    t = 116 * scale          # grosor del trazo
    r_dot = 62 * scale
    gap = 34 * scale
    W = straight + R + gap + 2 * r_dot
    x0 = cx - W / 2
    top = cy - R
    outer = d_shape(x0, top, R, straight, 26 * scale)
    inner = d_shape(x0 + t, top + t, R - t, straight - t, 6 * scale)
    dot_x = x0 + straight + R + gap + r_dot
    dot_y = top + 2 * R - r_dot
    return (
        f'<path fill-rule="evenodd" d="{outer} {inner}" fill="{d_color}"/>'
        f'<circle cx="{dot_x:.2f}" cy="{dot_y:.2f}" r="{r_dot:.2f}" fill="{dot_color}"/>'
    )


def tile_svg(size=1024, radius=232, full_bleed=False, scale=1.0):
    bg = (
        f'<rect width="{size}" height="{size}" fill="url(#g)"/>'
        if full_bleed
        else f'<rect width="{size}" height="{size}" rx="{radius}" fill="url(#g)"/>'
    )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}">'
        f'<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
        f'<stop offset="0" stop-color="{AGAVE_500}"/><stop offset="1" stop-color="{AGAVE_700}"/></linearGradient></defs>'
        f"{bg}{mark_group(size / 2, size / 2, scale)}</svg>"
    )


def bare_mark_svg(color=AGAVE_600, dot=MAIZ):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="150 260 724 504">{mark_group(512, 512, 1.0, color, dot)}</svg>'


# ------------------------------------------------------------------ wordmark en curvas
FONT_WOFF2 = os.path.join(ROOT, "node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2")


def load_font(weight=800):
    f = TTFont(FONT_WOFF2)
    f.flavor = None
    axes = {a.axisTag: a for a in f["fvar"].axes}
    loc = {"wght": weight}
    if "opsz" in axes:
        loc["opsz"] = axes["opsz"].maxValue
    if "wdth" in axes:
        loc["wdth"] = 100
    return instantiateVariableFont(f, loc)


def word_paths(font, text, size, tracking=-0.02):
    gs = font.getGlyphSet()
    cmap = font.getBestCmap()
    upm = font["head"].unitsPerEm
    s = size / upm
    x = 0.0
    parts = []
    for ch in text:
        gname = cmap.get(ord(ch))
        if gname is None:
            continue
        g = gs[gname]
        if ch != " ":
            pen = SVGPathPen(gs)
            g.draw(pen)
            parts.append((ch, x, pen.getCommands()))
        x += (g.width + tracking * upm) * s
    return parts, x, s


def wordmark_svg(text_color=INK, with_mark=True, mark_style="tile", dot_color="#D18E07"):
    font = load_font(800)
    size = 300
    parts, width, s = word_paths(font, "Don Punto", size)
    cap = font["OS/2"].sCapHeight * s
    asc = cap
    # punto final color maíz (un círculo perfecto, no el glifo)
    dot_r = size * 0.085
    gap = size * 0.025
    total_w = width + gap + dot_r * 2
    mark_size = cap * 1.36 if with_mark else 0
    mark_gap = size * 0.22 if with_mark else 0
    W = mark_size + mark_gap + total_w
    H = max(mark_size, cap) + 40
    base_y = (H + cap) / 2
    ox = mark_size + mark_gap
    out = []
    for ch, x, d in parts:
        out.append(f'<path transform="translate({ox + x:.2f},{base_y:.2f}) scale({s:.5f},{-s:.5f})" d="{d}" fill="{text_color}"/>')
    out.append(f'<circle cx="{ox + width + gap + dot_r:.2f}" cy="{base_y - dot_r:.2f}" r="{dot_r:.2f}" fill="{dot_color}"/>')
    mark = ""
    if with_mark:
        k = mark_size / 1024
        my = (H - mark_size) / 2
        inner = tile_svg().split(">", 1)[1].rsplit("</svg>", 1)[0]
        mark = f'<g transform="translate(0,{my:.2f}) scale({k:.5f})">{inner}</g>'
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W:.0f} {H:.0f}">{mark}{"".join(out)}</svg>'


def png(svg, size, path):
    cairosvg.svg2png(bytestring=svg.encode(), write_to=path, output_width=size, output_height=size)


def main():
    tile = tile_svg()
    open(os.path.join(PUB, "favicon.svg"), "w").write(tile)
    open(os.path.join(BRAND, "mark.svg"), "w").write(tile)
    open(os.path.join(BRAND, "mark-bare.svg"), "w").write(bare_mark_svg())
    open(os.path.join(BRAND, "mark-bare-white.svg"), "w").write(bare_mark_svg(WHITE))
    open(os.path.join(BRAND, "logo.svg"), "w").write(wordmark_svg(INK))
    open(os.path.join(BRAND, "logo-white.svg"), "w").write(wordmark_svg(WHITE, dot_color=MAIZ))
    open(os.path.join(BRAND, "wordmark.svg"), "w").write(wordmark_svg(INK, with_mark=False))
    open(os.path.join(BRAND, "wordmark-white.svg"), "w").write(wordmark_svg(WHITE, with_mark=False, dot_color=MAIZ))

    # PWA / iOS
    png(tile_svg(full_bleed=True), 180, os.path.join(PUB, "apple-touch-icon.png"))
    png(tile, 192, os.path.join(PUB, "pwa-192.png"))
    png(tile, 512, os.path.join(PUB, "pwa-512.png"))
    png(tile_svg(full_bleed=True, scale=0.64), 512, os.path.join(PUB, "pwa-maskable-512.png"))
    png(tile, 1024, os.path.join(BRAND, "mark-1024.png"))
    cairosvg.svg2png(bytestring=wordmark_svg(INK).encode(), write_to=os.path.join(BRAND, "logo-1600.png"), output_width=1600)

    # favicon.ico (16/32/48)
    imgs = []
    for sz in (16, 32, 48):
        b = io.BytesIO()
        cairosvg.svg2png(bytestring=tile.encode(), write_to=b, output_width=sz, output_height=sz)
        imgs.append(Image.open(io.BytesIO(b.getvalue())).convert("RGBA"))
    imgs[2].save(os.path.join(PUB, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)], append_images=imgs[:2])
    print("ok")


if __name__ == "__main__":
    main()
