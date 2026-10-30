#!/usr/bin/env python3
"""api/_lib/support-kb.md → api/_lib/support-kb.ts (las funciones de Vercel no empaquetan .md). Correr tras editar la guía."""
import json, pathlib
d = pathlib.Path(__file__).resolve().parent.parent / 'api/_lib'
md = (d / 'support-kb.md').read_text()
(d / 'support-kb.ts').write_text('// Generado por scripts/build_support_kb.py desde support-kb.md — no editar a mano\nexport const SUPPORT_KB: string = ' + json.dumps(md, ensure_ascii=False) + ';\n')
print(len(md), 'chars')
