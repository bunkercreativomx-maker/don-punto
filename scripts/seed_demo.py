"""Cuenta demo con datos realistas (taquería) para capturas y demos de venta.
Uso: python3 scripts/seed_demo.py
Credenciales en /opt/data/.donpunto-demo.txt (600).
"""
import json, os, random, secrets, sys, uuid, datetime as dt
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pb_admin as p

EMAIL = "demo@donpunto.com"
CRED = "/opt/data/.donpunto-demo.txt"
random.seed(7)

tok = p.login()

import urllib.parse
found = p.req("GET", "/api/collections/users/records?perPage=1&filter=" + urllib.parse.quote(f"email='{EMAIL}'"), token=tok)["items"]
if os.path.exists(CRED):
    pw = open(CRED).read().split("password=")[1].strip()
else:
    pw = secrets.token_urlsafe(12)
    old = os.umask(0o077)
    open(CRED, "w").write(f"email={EMAIL}\npassword={pw}\n")
    os.umask(old)
if found:
    uid = found[0]["id"]
    p.req("PATCH", f"/api/collections/users/records/{uid}", {"password": pw, "passwordConfirm": pw, "verified": True}, token=tok)
else:
    uid = p.req("POST", "/api/collections/users/records", {"email": EMAIL, "password": pw, "passwordConfirm": pw, "verified": True}, token=tok)["id"]

# restaurante + membresía de cortesía (Pro)
rest = p.req("GET", "/api/collections/restaurants/records?perPage=1&filter=" + urllib.parse.quote(f"owner='{uid}'"), token=tok)["items"]
if not rest:
    p.req("POST", "/api/collections/restaurants/records", {"name": "Taquería Don Chuy", "owner": uid}, token=tok)
plans = {x["name"]: x["id"] for x in p.req("GET", "/api/collections/plans/records", token=tok)["items"]}
sub = p.req("GET", "/api/collections/subscriptions/records?perPage=1&filter=" + urllib.parse.quote(f"owner='{uid}'"), token=tok)["items"]
body = {"owner": uid, "status": "active", "plan": plans.get("Pro", "")}
if sub:
    p.req("PATCH", f"/api/collections/subscriptions/records/{sub[0]['id']}", body, token=tok)
else:
    p.req("POST", "/api/collections/subscriptions/records", body, token=tok)

# limpiar datos previos
while True:
    items = p.req("GET", "/api/collections/user_items/records?perPage=200&filter=" + urllib.parse.quote(f"owner='{uid}'"), token=tok)["items"]
    if not items:
        break
    for it in items:
        p.req("DELETE", f"/api/collections/user_items/records/{it['id']}", token=tok)

cats = [{"id": "c-tacos", "name": "Tacos"}, {"id": "c-esp", "name": "Especialidades"}, {"id": "c-beb", "name": "Bebidas"}]
menu = [
    ("Taco al pastor", 9, 25, "c-tacos"), ("Taco de asada", 13, 32, "c-tacos"), ("Taco de suadero", 11, 28, "c-tacos"),
    ("Taco de tripa", 12, 30, "c-tacos"), ("Campechano", 13, 32, "c-tacos"), ("Gringa", 28, 75, "c-esp"),
    ("Quesadilla de asada", 30, 80, "c-esp"), ("Volcán al pastor", 18, 45, "c-esp"), ("Orden de 5 al pastor", 45, 115, "c-esp"),
    ("Agua de horchata", 8, 30, "c-beb"), ("Agua de jamaica", 7, 30, "c-beb"), ("Refresco", 14, 30, "c-beb"),
]
rows = []
for name, cost, price, cat in menu:
    rows.append({"id": str(uuid.uuid4()), "name": name, "costPrice": cost, "salePrice": price, "targetProfit": price, "categoryId": cat, "modifierGroupIds": []})

tz = dt.timezone(dt.timedelta(hours=-6))
now = dt.datetime.now(tz)
txs = []
weights = [10, 7, 5, 3, 3, 4, 3, 3, 2, 5, 4, 5]
for d in range(13, -1, -1):
    day = now - dt.timedelta(days=d)
    n = random.randint(38, 62) if day.weekday() < 4 else random.randint(60, 90)
    if d == 0:
        n = min(n, 54)
    for _ in range(n):
        hour = random.choice([13, 14, 14, 15, 19, 20, 20, 21, 21, 22])
        t = day.replace(hour=hour, minute=random.randint(0, 59), second=random.randint(0, 59), microsecond=0)
        if d == 0 and t > now:
            t = now - dt.timedelta(minutes=random.randint(5, 600))
        dest = random.choices(["Tienda", "Uber", "Didi", "Rappi"], [70, 14, 10, 6])[0]
        pm = {"Uber": "Uber", "Didi": "Didi", "Rappi": "Rappi"}.get(dest) or random.choices(["Efectivo", "Tarjeta"], [65, 35])[0]
        items, total = [], 0
        for _ in range(random.randint(1, 4)):
            r = random.choices(rows, weights)[0]
            q = random.randint(1, 4) if r["categoryId"] == "c-tacos" else 1
            items.append({"cartId": str(uuid.uuid4()), "rowId": r["id"], "quantity": q, "selectedModifiers": []})
            total += r["salePrice"] * q
        if dest != "Tienda":
            total = round(total * 1.75)
        txs.append({"id": str(uuid.uuid4()), "date": t.astimezone(dt.timezone.utc).isoformat().replace("+00:00", "Z"), "amount": total,
                    "paymentMethod": pm, "destination": dest, "items": items, "customerName": ""})
txs.sort(key=lambda x: x["date"])

pos_settings = {"ivaPercentage": 16, "printCustomerTicket": True, "printKitchenTicket": True, "paperSize": "58mm", "adminPin": "4821",
                "businessName": "Taquería Don Chuy", "businessPhone": "656 000 0000", "businessAddress": "Av. 16 de Septiembre, Cd. Juárez"}


import time


def post_item(body):
    for attempt in range(6):
        try:
            time.sleep(0.13)
            return p.req("POST", "/api/collections/user_items/records", body, token=tok)
        except SystemExit as e:
            if "429" in str(e):
                time.sleep(3)
                continue
            raise


def put(kind, value):
    if isinstance(value, list) and value and all(isinstance(v, dict) and "id" in v for v in value):
        for i, v in enumerate(value):
            post_item({"owner": uid, "kind": kind, "item_id": str(v["id"]), "data": {"__i": i, "v": v}})
    else:
        post_item({"owner": uid, "kind": kind, "item_id": "_", "data": {"v": value}})


put("deliveryCalcCategories", cats)
put("deliveryCalcRows", rows)
put("delivery_calculator_pos_settings", pos_settings)
put("delivery_calculator_pos_txs", txs)
print("demo listo:", uid, "ventas:", len(txs))
