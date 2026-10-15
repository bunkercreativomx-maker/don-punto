#!/usr/bin/env python3
"""Helper admin PocketBase de Don Punto (lee creds de /opt/data/pocketbase-creds.txt, no las imprime).
Uso: python3 scripts/pb_admin.py audit | apply-schema | backup
"""
import json, os, sys, time, urllib.request, urllib.error

BASE = os.environ.get("PB_URL", "http://172.24.0.1:8090")
UA = {"User-Agent": "Mozilla/5.0 Chrome/130", "Content-Type": "application/json"}


def creds():
    for line in open("/opt/data/pocketbase-creds.txt"):
        if line.startswith("pb-don-punto"):
            p = [x.strip() for x in line.split("|")]
            return p[2], p[3]
    raise SystemExit("sin creds pb-don-punto")


def req(method, path, body=None, token=None):
    h = dict(UA)
    if token:
        h["Authorization"] = token
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r, timeout=20) as resp:
            t = resp.read()
            return json.loads(t) if t else {}
    except urllib.error.HTTPError as e:
        raise SystemExit(f"{method} {path} -> {e.code} {e.read().decode()[:800]}")


def login():
    e, p = creds()
    return req("POST", "/api/collections/_superusers/auth-with-password", {"identity": e, "password": p})["token"]


def audit(tok):
    cols = req("GET", "/api/collections?perPage=200", token=tok)["items"]
    for c in cols:
        if c["system"]:
            continue
        n = req("GET", f"/api/collections/{c['name']}/records?perPage=1", token=tok)["totalItems"]
        print(f"\n## {c['name']} ({c['type']}) records={n} id={c['id']}")
        for k in ["listRule", "viewRule", "createRule", "updateRule", "deleteRule"]:
            print(f"  {k}: {c.get(k)!r}")
        print("  fields:", [(f["name"], f["type"]) for f in c["fields"]])
        print("  indexes:", c.get("indexes"))
    s = req("GET", "/api/settings", token=tok)
    print("\nSMTP:", s["smtp"]["enabled"], "| app:", s["meta"].get("appName"), s["meta"].get("appURL"))
    print("backups:", s.get("backups"))


def backup(tok):
    name = f"pre_launch_{time.strftime('%Y%m%d_%H%M%S')}.zip"
    req("POST", "/api/backups", {"name": name}, token=tok)
    print("backup creado:", name)


def get_col(tok, name):
    cols = req("GET", "/api/collections?perPage=200", token=tok)["items"]
    return next((c for c in cols if c["name"] == name), None)


def apply_schema(tok):
    users = get_col(tok, "users")
    owner_only = "@request.auth.id != '' && owner = @request.auth.id"

    # 1) user_items: almacén en la nube de todo lo del POS (ventas, cortes, inventario...)
    ui = get_col(tok, "user_items")
    spec = {
        "name": "user_items",
        "type": "base",
        "listRule": owner_only,
        "viewRule": owner_only,
        "createRule": "@request.auth.id != '' && @request.body.owner = @request.auth.id",
        "updateRule": owner_only + " && (@request.body.owner:isset = false || @request.body.owner = @request.auth.id)",
        "deleteRule": owner_only,
        "fields": [
            {"name": "owner", "type": "relation", "required": True, "collectionId": users["id"], "maxSelect": 1, "cascadeDelete": True},
            {"name": "kind", "type": "text", "required": True, "max": 80},
            {"name": "item_id", "type": "text", "required": True, "max": 120},
            {"name": "data", "type": "json", "maxSize": 2000000},
            {"name": "created", "type": "autodate", "onCreate": True, "onUpdate": False},
            {"name": "updated", "type": "autodate", "onCreate": True, "onUpdate": True},
        ],
        "indexes": ["CREATE UNIQUE INDEX idx_user_items_okey ON user_items (owner, kind, item_id)"],
    }
    if ui:
        print("user_items ya existe; actualizando reglas")
        req("PATCH", f"/api/collections/{ui['id']}", {k: spec[k] for k in ["listRule", "viewRule", "createRule", "updateRule", "deleteRule"]}, token=tok)
    else:
        req("POST", "/api/collections", spec, token=tok)
        print("user_items creada")

    # 2) restaurants: campo menu (json) para dejar de usar stripe_customer_id como respaldo
    r = get_col(tok, "restaurants")
    names = [f["name"] for f in r["fields"]]
    if "menu" not in names:
        r["fields"].append({"name": "menu", "type": "json", "maxSize": 5000000})
        req("PATCH", f"/api/collections/{r['id']}", {"fields": r["fields"]}, token=tok)
        print("restaurants.menu agregado")

    # 2b) restaurants: el dueño solo puede crear/editar SU restaurante (antes se podía asignar a otro owner)
    req("PATCH", f"/api/collections/{r['id']}", {
        "listRule": "@request.auth.id != '' && owner = @request.auth.id",
        "viewRule": "@request.auth.id != '' && owner = @request.auth.id",
        "createRule": "@request.auth.id != '' && @request.body.owner = @request.auth.id",
        "updateRule": "@request.auth.id != '' && owner = @request.auth.id && (@request.body.owner:isset = false || @request.body.owner = @request.auth.id)",
        "deleteRule": None,
    }, token=tok)
    print("restaurants reglas endurecidas")

    # 3) subscriptions: campos de Stripe + solo lectura para el dueño
    s = get_col(tok, "subscriptions")
    names = [f["name"] for f in s["fields"]]
    add = []
    for n, t in [("plan", "text"), ("stripe_customer_id", "text"), ("stripe_subscription_id", "text"), ("cancel_at_period_end", "bool")]:
        if n not in names:
            add.append({"name": n, "type": t})
    if "current_period_end" not in names:
        add.append({"name": "current_period_end", "type": "date"})
    patch = {
        "fields": s["fields"] + add,
        "listRule": "@request.auth.id != '' && owner = @request.auth.id",
        "viewRule": "@request.auth.id != '' && owner = @request.auth.id",
        "createRule": None,
        "updateRule": None,
        "deleteRule": None,
    }
    req("PATCH", f"/api/collections/{s['id']}", patch, token=tok)
    print("subscriptions actualizada (+", [a["name"] for a in add], ") reglas: solo servidor escribe")

    # 4) settings: nombre, URL, respaldos diarios, límites de peticiones
    st = req("GET", "/api/settings", token=tok)
    st["meta"]["appName"] = "Don Punto"
    st["meta"]["appURL"] = "https://donpunto.com"
    st["backups"]["cron"] = "0 9 * * *"
    st["backups"]["cronMaxKeep"] = 14
    rl = st.get("rateLimits") or {}
    rl["enabled"] = True
    if not rl.get("rules"):
        rl["rules"] = [
            {"label": "*:auth", "audience": "", "duration": 3, "maxRequests": 2},
            {"label": "*:create", "audience": "", "duration": 5, "maxRequests": 40},
            {"label": "/api/batch", "audience": "", "duration": 1, "maxRequests": 3},
            {"label": "/api/", "audience": "", "duration": 10, "maxRequests": 600},
        ]
    st["rateLimits"] = rl
    req("PATCH", "/api/settings", {"meta": st["meta"], "backups": st["backups"], "rateLimits": st["rateLimits"]}, token=tok)
    print("settings: appName/URL, respaldo diario 09:00 UTC (14), rate limits ON")


def webhook_user(tok):
    import secrets
    email = "vercel-webhook@donpunto.app"
    path = "/opt/data/.donpunto-vercel-env.txt"
    pw = secrets.token_urlsafe(24)
    found = req("GET", "/api/collections/_superusers/records?perPage=50", token=tok)["items"]
    ex = next((u for u in found if u["email"] == email), None)
    if ex:
        req("PATCH", f"/api/collections/_superusers/records/{ex['id']}", {"password": pw, "passwordConfirm": pw}, token=tok)
    else:
        req("POST", "/api/collections/_superusers/records", {"email": email, "password": pw, "passwordConfirm": pw}, token=tok)
    old = umask = os.umask(0o077)
    with open(path, "w") as f:
        f.write(f"PB_URL=https://donpunto-pb.bunkeragent.cloud\nPB_ADMIN_EMAIL={email}\nPB_ADMIN_PASSWORD={pw}\n")
    os.umask(old)
    os.chmod(path, 0o600)
    print("superusuario webhook listo; variables en", path)


if __name__ == "__main__":
    t = login()
    cmd = sys.argv[1] if len(sys.argv) > 1 else "audit"
    {"audit": audit, "apply-schema": apply_schema, "backup": backup, "webhook-user": webhook_user}[cmd](t)
