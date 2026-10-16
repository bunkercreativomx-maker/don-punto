"""Conecta Resend como servidor de correo de Don Punto (PocketBase) y manda un correo de prueba.

Uso:  python3 /opt/data/don-punto-gh/scripts/setup_resend.py tu@correo.com
La API key se pide oculta (no se muestra ni se guarda en el historial).
"""
import getpass
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
to = sys.argv[1].strip() if len(sys.argv) > 1 else input("Correo para la prueba: ").strip()
sys.argv = [sys.argv[0]]
import pb_admin as p  # noqa: E402

key = getpass.getpass("Pega la API key de Resend (empieza con re_, no se ve): ").strip()
if not key.startswith("re_"):
    sys.exit("Esa no parece una API key de Resend (debe empezar con re_)")

tok = p.login()
p.req("PATCH", "/api/settings", {
    "smtp": {"enabled": True, "host": "smtp.resend.com", "port": 465, "username": "resend",
             "password": key, "tls": True, "authMethod": "PLAIN"},
    "meta": {"senderName": "Don Punto", "senderAddress": "no-reply@donpunto.com"},
}, token=tok)
print("SMTP configurado (smtp.resend.com:465).")

# Guardar copia en el .env del servidor (permisos 600) para uso futuro
env = "/opt/data/.env"
lines = [l for l in open(env).read().splitlines() if not l.startswith("RESEND_API_KEY" + chr(61))] if os.path.exists(env) else []
lines.append("RESEND_API_KEY" + chr(61) + key)
open(env, "w").write("\n".join(lines) + "\n")
os.chmod(env, 0o600)

try:
    p.req("POST", "/api/settings/test/email", {"email": to, "template": "password-reset", "collection": "users"}, token=tok)
    print(f"Correo de prueba enviado a {to}. Revisa tu bandeja (y spam).")
except SystemExit as e:
    print("La prueba falló:", e)
    print("Si dice 'domain is not verified', faltan los registros DNS de donpunto.com en Resend.")
