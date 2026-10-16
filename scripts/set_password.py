"""Cambia la contraseña de un usuario de Don Punto sin mostrarla en pantalla.

Uso:  python3 /opt/data/don-punto-gh/scripts/set_password.py correo@ejemplo.com
"""
import getpass
import sys
import urllib.parse

sys.path.insert(0, __import__("os").path.dirname(__file__))
email = sys.argv[1].strip().lower() if len(sys.argv) > 1 else input("Correo: ").strip().lower()
sys.argv = [sys.argv[0]]
import pb_admin as p  # noqa: E402

tok = p.login()
found = p.req("GET", "/api/collections/users/records?perPage=1&filter=" + urllib.parse.quote(f"email='{email}'"), token=tok)["items"]
if not found:
    sys.exit(f"No existe el usuario {email}")
pw = getpass.getpass("Nueva contraseña (mín. 8, no se ve al escribir): ")
if len(pw) < 8:
    sys.exit("Muy corta: mínimo 8 caracteres")
if getpass.getpass("Repítela: ") != pw:
    sys.exit("No coinciden")
p.req("PATCH", "/api/collections/users/records/" + found[0]["id"], {"password": pw, "passwordConfirm": pw, "verified": True}, token=tok)
print(f"Listo: {email} ya puede entrar con la nueva contraseña.")
