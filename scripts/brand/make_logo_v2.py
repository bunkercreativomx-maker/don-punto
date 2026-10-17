"""Logo Don Punto v2 (diseño de Pako, oct 2026): D marino cuyo lomo es un ticket blanco,
punto verde lima en el hueco, anillo lima interior y 3 líneas de velocidad.
Redibujado plano en SVG a partir de su lámina de marca. Wordmark "DonPunto.com" (Montserrat 800).
Uso: /opt/data/cache/svgenv/bin/python scripts/brand/make_logo_v2.py
"""
import io, os
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
import cairosvg
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PUB = os.path.join(ROOT, "public")
BRAND = os.path.join(PUB, "brand")
FONT = "/opt/data/cache/fonts/Montserrat.ttf"

NAVY = "#0B1E36"
NAVY_2 = "#14305A"
LIME = "#5EE000"
LIME_D = "#3FA800"
WHITE = "#FFFFFF"
PAPER_SHADE = "#C9D4E0"

# ------------------------------------------------------------------ símbolo (medido sobre la lámina, viewBox 0 0 1000 655)
SYM_VB = (0, 0, 1000, 660)


def d_path(x0, top, bot, cx):
    """D sin lomo: recta superior desde x0, semicírculo a la derecha, recta inferior."""
    R = (bot - top) / 2
    c = 44 if x0 < 260 else 0
    return (f"M{x0 + c},{top} L{cx},{top} A{R},{R} 0 0 1 {cx},{bot} L{x0 + c},{bot} "
            f"Q{x0},{bot} {x0},{bot - c} L{x0},{top + c} Q{x0},{top} {x0 + c},{top} Z")


def symbol(d_color=NAVY, ring=LIME, dot=LIME, speed=LIME, paper=WHITE, lines=NAVY, fold=LIME, edge=None, ox=0, oy=0, k=1.0, speed_on=True):
    parts = []
    if speed_on:
        for y, x in ((262, 18), (370, 58), (478, 100)):
            parts.append(f'<rect x="{x}" y="{y - 27}" width="{300 - x}" height="54" rx="27" fill="{speed}"/>')
    outer = d_path(226, 20, 650, 670)
    hole = d_path(300, 180, 520, 670)
    ring_i = d_path(300, 214, 486, 670)
    parts.append(f'<path fill-rule="evenodd" d="{outer} {hole}" fill="{d_color}"/>')
    parts.append(f'<path fill-rule="evenodd" d="{hole} {ring_i}" fill="{ring}"/>')
    parts.append(f'<circle cx="670" cy="350" r="86" fill="{dot}"/>')
    # ticket = lomo de la D
    x1, x2, t, notch, tip, teeth = 256, 540, 100, 552, 588, 4
    w = (x2 - x1) / teeth
    zig = " ".join(f"L{x2 - (i + 0.5) * w:.1f},{notch} L{x2 - (i + 1) * w:.1f},{tip}" for i in range(teeth))
    parts.append(f'<path d="M{x1},{t + 30} Q{x1},{t} {x1 + 30},{t} L{x2 - 30},{t} Q{x2},{t} {x2},{t + 30} L{x2},{tip} {zig} Z" fill="{paper}"' + (f' stroke="{edge}" stroke-width="16" stroke-linejoin="round"' if edge else '') + '/>')
    for y, xe in ((255, 470), (330, 494), (410, 425)):
        parts.append(f'<rect x="305" y="{y - 17}" width="{xe - 305}" height="34" rx="17" fill="{lines}"/>')
    g = "".join(parts)
    if ox or oy or k != 1.0:
        g = f'<g transform="translate({ox:.2f},{oy:.2f}) scale({k:.5f})">{g}</g>'
    return g


def symbol_svg(**kw):
    x, y, w, h = SYM_VB
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x} {y} {w} {h}">{symbol(**kw)}</svg>'


def tile_svg(size=1024, radius=232, full_bleed=False, scale=1.0, speed_on=True):
    bg = f'<rect width="{size}" height="{size}" fill="url(#g)"/>' if full_bleed else f'<rect width="{size}" height="{size}" rx="{radius}" fill="url(#g)"/>'
    k = size * 0.78 / 1000 * scale
    ox = (size - 1000 * k) / 2 + (0 if speed_on else -0.08 * size * scale)
    oy = (size - 660 * k) / 2
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
        f'<stop offset="0" stop-color="{NAVY_2}"/><stop offset="1" stop-color="{NAVY}"/></linearGradient></defs>{bg}'
        f'{symbol(d_color=WHITE, edge=NAVY, ox=ox, oy=oy, k=k, speed_on=speed_on)}</svg>'
    )


def circle_svg(size=1024):
    k = size * 0.66 / 1000
    ox, oy = (size - 1000 * k) / 2, (size - 660 * k) / 2
    r = size / 2
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}"><circle cx="{r}" cy="{r}" r="{r}" fill="{LIME}"/>'
            f'<circle cx="{r}" cy="{r}" r="{r * 0.9}" fill="{NAVY}"/>{symbol(d_color=WHITE, edge=NAVY, ox=ox, oy=oy, k=k)}</svg>')


# ------------------------------------------------------------------ wordmark
def load_font(weight=800):
    f = TTFont(FONT)
    return instantiateVariableFont(f, {"wght": weight})


FONT_OBJ = None


def word_parts(text, size, tracking=-0.035):
    global FONT_OBJ
    FONT_OBJ = FONT_OBJ or load_font(800)
    gs, cmap, upm = FONT_OBJ.getGlyphSet(), FONT_OBJ.getBestCmap(), FONT_OBJ["head"].unitsPerEm
    s = size / upm
    x, out = 0.0, []
    for ch in text:
        g = gs[cmap[ord(ch)]]
        pen = SVGPathPen(gs); g.draw(pen)
        out.append((ch, x, pen.getCommands()))
        x += (g.width + tracking * upm) * s
    return out, x - tracking * upm * s, s


def wordmark_svg(main=NAVY, accent=LIME, with_mark=False, mark_d=NAVY):
    size = 300
    parts, width, s = word_parts("DonPunto.com", size)
    cap = FONT_OBJ["OS/2"].sCapHeight * s
    desc = 0.0
    mark_h = cap * 1.55 if with_mark else 0
    mark_w = mark_h * 1000 / 660 if with_mark else 0
    gap = size * 0.12 if with_mark else 0
    W = mark_w + gap + width + 8
    H = max(mark_h, cap) + 30
    base = (H + cap) / 2
    ox = mark_w + gap
    paths = []
    for i, (ch, x, d) in enumerate(parts):
        col = accent if i >= 8 else main
        paths.append(f'<path transform="translate({ox + x:.2f},{base:.2f}) scale({s:.5f},{-s:.5f})" d="{d}" fill="{col}"/>')
    mark = ""
    if with_mark:
        k = mark_h / 660
        mark = symbol(d_color=mark_d, edge=(NAVY if mark_d == WHITE else None), ox=0, oy=(H - mark_h) / 2, k=k)
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W:.0f} {H:.0f}">{mark}{"".join(paths)}</svg>'


def png(svg, size, path, h=None):
    cairosvg.svg2png(bytestring=svg.encode(), write_to=path, output_width=size, output_height=h or size)


def main():
    os.makedirs(BRAND, exist_ok=True)
    tile = tile_svg()
    small = tile_svg(speed_on=False, scale=1.12)
    W = lambda n, c: open(os.path.join(BRAND, n), "w").write(c)
    open(os.path.join(PUB, "favicon.svg"), "w").write(tile)
    W("mark.svg", tile)
    W("mark-circle.svg", circle_svg())
    W("mark-bare.svg", symbol_svg())
    W("mark-bare-white.svg", symbol_svg(d_color=WHITE, edge=NAVY))
    W("logo.svg", wordmark_svg(with_mark=True))
    W("logo-white.svg", wordmark_svg(main=WHITE, with_mark=True, mark_d=WHITE))
    W("wordmark.svg", wordmark_svg())
    W("wordmark-white.svg", wordmark_svg(main=WHITE))
    png(tile_svg(full_bleed=True), 180, os.path.join(PUB, "apple-touch-icon.png"))
    png(tile, 192, os.path.join(PUB, "pwa-192.png"))
    png(tile, 512, os.path.join(PUB, "pwa-512.png"))
    png(tile_svg(full_bleed=True, scale=0.72), 512, os.path.join(PUB, "pwa-maskable-512.png"))
    png(tile, 1024, os.path.join(BRAND, "mark-1024.png"))
    cairosvg.svg2png(bytestring=wordmark_svg(with_mark=True).encode(), write_to=os.path.join(BRAND, "logo-1600.png"), output_width=1600)
    # badge de notificación Android: silueta blanca monocroma
    badge = symbol_svg(d_color=WHITE, ring=WHITE, dot=WHITE, speed=WHITE, paper=WHITE, lines="none", fold=WHITE)
    png(badge.replace('viewBox="0 0 1000 660"', 'viewBox="0 -180 1000 1000"'), 96, os.path.join(BRAND, "badge-96.png"))
    imgs = []
    for sz in (16, 32, 48):
        b = io.BytesIO()
        cairosvg.svg2png(bytestring=small.encode(), write_to=b, output_width=sz, output_height=sz)
        imgs.append(Image.open(io.BytesIO(b.getvalue())).convert("RGBA"))
    imgs[2].save(os.path.join(PUB, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)], append_images=imgs[:2])
    print("ok")


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "preview":
        out = sys.argv[2]
        png(symbol_svg(), 1000, out + "/sym.png", 660)
        png(tile_svg(), 512, out + "/tile.png")
        png(circle_svg(), 512, out + "/circle.png")
        cairosvg.svg2png(bytestring=wordmark_svg(with_mark=True).encode(), write_to=out + "/lockup.png", output_width=1400)
        cairosvg.svg2png(bytestring=wordmark_svg(main=WHITE, with_mark=True, mark_d=WHITE).encode(), write_to=out + "/lockup-w.png", output_width=1400, background_color=NAVY)
        print("preview ok")
    else:
        main()
