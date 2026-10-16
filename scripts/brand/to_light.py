"""Codemod: pasa la interfaz de la app de tema oscuro a tema claro (mismo lenguaje que la página de ventas).
- text-white / hover:text-white → text-carbon-950, EXCEPTO cuando el mismo string trae un fondo de color sólido
  (botones verdes, rojos, degradados), donde el texto blanco sí es correcto.
- bg-white/N, border-white/N, divide-white/N, ring-white/N → carbon-950 con la misma opacidad.
Los grises (slate) y acentos se invierten/oscurecen por tokens en index.css.
Uso: python3 scripts/brand/to_light.py
"""
import glob, os, re

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "src")
SKIP = {"components/landing/LandingPage.tsx", "components/pwa/InstallApp.tsx", "components/brand/Logo.tsx",
        "components/pos/POSTicket.tsx", "components/pos/CorteTicket.tsx", "components/pwa/UpdateBanner.tsx"}

SOLID_BG = re.compile(
    r"(?<![\w:/-])(?:hover:|active:|group-hover:)?bg-(?:indigo|emerald|rose|pink|amber|orange|green|violet|teal|cyan|red|blue|sky|yellow|lime|purple|fuchsia|agave|maiz|uber|didi|rappi|black)(?:-(?:4|5|6|7|8|9)00)?(?![\w/-])"
    r"|bg-gradient-to|bg-\[#"
)
LIT = re.compile(r'"[^"\n]*"|\'[^\'\n]*\'|`[^`]*`')


def fix_literal(lit: str) -> str:
    body = lit
    solid = bool(SOLID_BG.search(body))
    # translúcidos y bordes → tinta
    body = re.sub(r"(?<![\w-])((?:hover:|focus:|group-hover:|active:)?)(bg|border|divide|ring)-white/(\[?[0-9.]+\]?)", r"\1\2-carbon-950/\3", body)
    body = re.sub(r"(?<![\w-])((?:hover:|focus:|group-hover:|active:)?)border-white(?![\w/-])", r"\1border-carbon-950/10", body)
    if not solid:
        body = re.sub(r"(?<![\w-])((?:hover:|group-hover:|focus:)?)text-white(/\[?[0-9.]+\]?)?(?![\w-])",
                      lambda m: f"{m.group(1)}text-carbon-950{m.group(2) or ''}", body)
    return body


changed = {}
for f in glob.glob(os.path.join(ROOT, "**", "*.tsx"), recursive=True):
    rel = os.path.relpath(f, ROOT)
    if rel in SKIP:
        continue
    s = open(f).read()
    n = LIT.sub(lambda m: fix_literal(m.group(0)), s)
    if n != s:
        open(f, "w").write(n)
        changed[rel] = sum(1 for a, b in zip(s.split("\n"), n.split("\n")) if a != b)
print(changed)
