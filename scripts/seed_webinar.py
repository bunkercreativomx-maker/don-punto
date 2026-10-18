#!/usr/bin/env python3
"""Cuenta para WEBINAR / demo en vivo: crea o reinicia webinar@donpunto.com (Pro) con 30 días de operación
de "Taquería Don Chuy": menú con modificadores, ventas (tienda + Uber/DiDi/Rappi), equipo con PIN, clientes con
lealtad, cancelaciones, cuentas abiertas, insumos con alertas, recetas ligadas al menú, cierres de inventario y gastos.

Uso:  python3 scripts/seed_webinar.py      (re-ejecutable: borra los datos de esa cuenta y los vuelve a cargar)
Contraseña en /opt/data/.donpunto-webinar.txt (600). No toca demo@donpunto.com (eso es seed_demo.py).
"""
import os, random, secrets, string, sys, time, urllib.parse, uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pb_admin as A

EMAIL = "webinar@donpunto.com"
PWFILE = "/opt/data/.donpunto-webinar.txt"
TZ = timezone(timedelta(hours=-6))  # Cd. Juárez (horario de verano hasta nov)
R = random.Random(2026)
U = lambda: str(uuid.UUID(int=R.getrandbits(128)))
q = urllib.parse.quote


def req(method, path, body=None):
    for attempt in range(8):
        try:
            return A.req(method, path, body, token=tok)
        except SystemExit as e:
            if "429" in str(e) or "-> 5" in str(e):
                time.sleep(1.5 * (attempt + 1)); continue
            raise
    raise SystemExit(f"{method} {path}: demasiados reintentos")


def password():
    if os.path.exists(PWFILE):
        return open(PWFILE).read().split("password=")[-1].strip()
    pw = "DonChuy-" + "".join(secrets.choice(string.digits) for _ in range(4))
    old = os.umask(0o077)
    open(PWFILE, "w").write(f"email={EMAIL}\npassword={pw}\n")
    os.umask(old)
    return pw


# ------------------------------------------------------------------ cuenta + plan Pro
tok = A.login()
pw = password()
found = req("GET", f"/api/collections/users/records?filter={q(f'email = \"{EMAIL}\"')}")["items"]
if found:
    uid = found[0]["id"]
    req("PATCH", f"/api/collections/users/records/{uid}", {"password": pw, "passwordConfirm": pw, "verified": True})
else:
    uid = req("POST", "/api/collections/users/records", {"email": EMAIL, "password": pw, "passwordConfirm": pw, "verified": True, "name": "Don Chuy"})["id"]
if not req("GET", f"/api/collections/restaurants/records?perPage=1&filter={q(f'owner = \"{uid}\"')}")["items"]:
    req("POST", "/api/collections/restaurants/records", {"name": "Taquería Don Chuy", "owner": uid})
plans = {x["name"]: x["id"] for x in req("GET", "/api/collections/plans/records")["items"]}
subs = req("GET", f"/api/collections/subscriptions/records?filter={q(f'owner = \"{uid}\"')}")["items"]
sub = {"owner": uid, "plan": plans["Pro"], "status": "active", "cancel_at_period_end": False}
if subs: req("PATCH", f"/api/collections/subscriptions/records/{subs[0]['id']}", sub)
else: req("POST", "/api/collections/subscriptions/records", sub)

old, page = [], 1
while True:
    r = req("GET", f"/api/collections/user_items/records?perPage=500&page={page}&fields=id&filter={q(f'owner = \"{uid}\"')}")
    old += [x["id"] for x in r["items"]]
    if page >= r["totalPages"]: break
    page += 1
with ThreadPoolExecutor(4) as ex:
    list(ex.map(lambda i: req("DELETE", f"/api/collections/user_items/records/{i}"), old))
# uso de promos del mes (para que el webinar empiece con 20 disponibles)
kv = req("GET", f"/api/collections/app_kv/records?perPage=1&filter={q(f'key = \"promo_usage:{uid}\"')}")["items"]
if kv: req("DELETE", f"/api/collections/app_kv/records/{kv[0]['id']}")
print("usuario", uid, "· borrados", len(old))

# ------------------------------------------------------------------ menú
cats = [{"id": "c-tacos", "name": "Tacos"}, {"id": "c-esp", "name": "Especialidades"}, {"id": "c-beb", "name": "Bebidas"}]
MENU = [  # nombre, categoría, precio, costo, popularidad este mes, descripción
    ("Taco al pastor", "c-tacos", 25, 9, 30, "tortilla de maíz, carne al pastor, piña, cebolla y cilantro"),
    ("Taco de asada", "c-tacos", 32, 13, 18, "tortilla de maíz, carne asada, cebolla y cilantro"),
    ("Taco de suadero", "c-tacos", 28, 11, 12, "tortilla de maíz, suadero, cebolla y cilantro"),
    ("Taco de tripa", "c-tacos", 30, 12, 0.07, "tripa dorada, cebolla y cilantro"),
    ("Campechano", "c-tacos", 32, 13, 7, "asada con chorizo"),
    ("Gringa", "c-esp", 75, 28, 9, "tortilla de harina, queso fundido y pastor"),
    ("Quesadilla de asada", "c-esp", 80, 30, 6, "tortilla de harina, queso y asada"),
    ("Volcán al pastor", "c-esp", 45, 18, 0.06, "tostada con queso fundido y carne al pastor"),
    ("Orden de 5 al pastor", "c-esp", 115, 45, 8, "cinco tacos al pastor"),
    ("Agua de horchata", "c-beb", 30, 8, 14, "medio litro"),
    ("Agua de jamaica", "c-beb", 30, 7, 0.05, "medio litro"),
    ("Refresco", "c-beb", 30, 14, 13, "lata 355 ml"),
]
rows = [{"id": U(), "name": n, "description": desc, "categoryId": c, "salePrice": p, "costPrice": cost, "targetProfit": p,
         "modifierGroupIds": ["mg-extras"] if c != "c-beb" else []} for n, c, p, cost, w, desc in MENU]
BYID = {r["id"]: r for r in rows}
W_NOW = {r["id"]: m[4] for r, m in zip(rows, MENU)}
W_PREV = {r["id"]: (m[4] if m[4] >= 1 else 2.5) for r, m in zip(rows, MENU)}  # el mes pasado sí se vendían
mods = [{"id": "mg-extras", "name": "Extras", "selectionType": "multiple", "minSelect": 0, "maxSelect": 3, "appliedToCategories": ["c-tacos", "c-esp"],
         "options": [{"id": "m-queso", "name": "Queso extra", "extraPrice": 10}, {"id": "m-aguacate", "name": "Aguacate", "extraPrice": 12},
                     {"id": "m-cebolla", "name": "Cebollitas asadas", "extraPrice": 8}]}]


def platform_price(base):  # misma fórmula que el POS: comisión 30 % + IVA comisión + retenciones con RFC
    return round(base / (1 - 0.30 - 0.30 * 0.16 - (0.08 + 0.025) / 1.16), 2)


# ------------------------------------------------------------------ equipo y clientes
team = [
    {"id": "e-marcos", "name": "Marcos", "pin": "2468", "role": "gerente", "active": True},
    {"id": "e-lupita", "name": "Lupita", "pin": "1357", "role": "cajero", "active": True},
    {"id": "e-andrea", "name": "Andrea", "pin": "8642", "role": "cajero", "active": True},
    {"id": "e-tono", "name": "Toño", "pin": "1122", "role": "mesero", "active": True},
    {"id": "e-beto", "name": "Beto", "pin": "3344", "role": "mesero", "active": True},
]
NAMES = ["Juan Pérez", "María López", "Carlos Ramírez", "Ana Torres", "Luis Hernández", "Sofía Martínez", "Jorge Sánchez", "Daniela Flores",
         "Miguel Ángel Ruiz", "Fernanda Castro", "Ricardo Morales", "Paola Jiménez", "Alejandro Vargas", "Gabriela Ortiz", "Eduardo Mendoza",
         "Valeria Chávez", "Roberto Silva", "Mariana Reyes", "Fernando Aguilar", "Claudia Navarro", "Héctor Domínguez", "Lucía Gutiérrez",
         "Óscar Medina", "Brenda Rojas", "Raúl Castillo", "Karen Herrera", "Arturo Vega", "Diana Salazar"]
clients = [{"id": f"cl-{i}", "name": n, "phone": "", "notes": "", "visits": 0, "total": 0, "stamps": 0, "rewardsUsed": 0} for i, n in enumerate(NAMES)]
cweights = [R.uniform(0.3, 3) for _ in clients]

# ------------------------------------------------------------------ 30 días de ventas
now_local = datetime.now(TZ)
end_day = now_local.date()                              # incluye hoy hasta la hora actual
start_day = end_day - timedelta(days=59)                 # 60 días: el mes anterior sirve de comparación
LAPSED = set(R.sample(range(len(clients)), 5))           # clientes que dejaron de venir (para "no vienen hace 30+ días")
DOW = {0: 0.85, 1: 0.6, 2: 0.9, 3: 1.0, 4: 1.3, 5: 1.45, 6: 1.15}  # lun..dom; martes = día más flojo
HOURS = [(12, 4), (13, 8), (14, 10), (15, 7), (16, 3), (17, 3), (18, 5), (19, 8), (20, 10), (21, 9), (22, 5)]
iso = lambda t: t.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
txs = []
d = start_day
while d <= end_day:
    weights = W_NOW if (d.year, d.month) == (now_local.year, now_local.month) else W_PREV
    ids = list(weights)
    for _ in range(int(R.gauss(64, 6) * DOW[d.weekday()])):
        h = R.choices([x[0] for x in HOURS], [x[1] for x in HOURS])[0]
        t_local = datetime(d.year, d.month, d.day, h, R.randint(0, 59), R.randint(0, 59), tzinfo=TZ)
        if t_local > now_local - timedelta(minutes=10):
            continue
        dest = R.choices(["Tienda", "Uber", "Didi", "Rappi"], [72, 12, 10, 6])[0]
        pm = R.choices(["Efectivo", "Tarjeta"], [58, 42])[0] if dest == "Tienda" else (R.choices(["Didi", "Didi Efectivo"], [80, 20])[0] if dest == "Didi" else dest)
        items, amount = [], 0.0
        for _ in range(R.choices([1, 2, 3, 4, 5], [22, 35, 24, 12, 7])[0]):
            row = BYID[R.choices(ids, [weights[i] for i in ids])[0]]
            qty = R.choices([1, 2, 3, 4], [55, 25, 12, 8])[0] if row["categoryId"] == "c-tacos" else R.choices([1, 2], [80, 20])[0]
            sel = [{"groupId": "mg-extras", "modifiers": [R.choice(mods[0]["options"])]}] if row["modifierGroupIds"] and R.random() < 0.15 else []
            extra = sum(m["extraPrice"] for g in sel for m in g["modifiers"])
            amount += ((row["salePrice"] + extra) if dest == "Tienda" else platform_price(row["salePrice"] + extra)) * qty
            items.append({"cartId": U(), "rowId": row["id"], "quantity": qty, "selectedModifiers": sel})
        tx = {"id": U(), "date": iso(t_local), "paymentMethod": pm, "destination": dest, "items": items, "customerName": ""}
        if dest == "Tienda":
            cashier = team[0] if R.random() < 0.08 else (team[1] if h < 17 else team[2])
            tx.update(employeeId=cashier["id"], employeeName=cashier["name"])
            if R.random() < 0.35:
                w = R.choice(team[3:]); tx.update(waiterId=w["id"], waiterName=w["name"], customerName=f"Mesa {R.randint(1, 8)}")
            if R.random() < 0.18:
                ci = R.choices(range(len(clients)), cweights)[0]
                if ci in LAPSED and d > end_day - timedelta(days=35):
                    ci = (ci + 1) % len(clients)
                    if ci in LAPSED: ci = (ci + 7) % len(clients)
                c = clients[ci]
                tx["clientId"] = c["id"]; tx["customerName"] = c["name"]; c["visits"] += 1
                if c["visits"] % 10 == 0:
                    tx["rewardApplied"] = True; tx["discountAmount"] = round(amount, 2); c["rewardsUsed"] += 1
                c["stamps"] = c["visits"] % 10
                c.setdefault("createdAt", tx["date"]); c["lastVisit"] = tx["date"]
            elif R.random() < 0.03:
                tx["discountAmount"] = round(amount * 0.10, 2); tx["notes"] = "Descuento 10% cliente frecuente"
        elif R.random() < 0.4:
            tx["customerName"] = R.choice(NAMES).split()[0]
        tx["amount"] = round(amount - tx.get("discountAmount", 0), 2)
        if tx.get("clientId"):
            c = next(x for x in clients if x["id"] == tx["clientId"]); c["total"] = round(c["total"] + tx["amount"], 2)
        txs.append(tx)
    d += timedelta(days=1)
txs.sort(key=lambda t: t["date"], reverse=True)  # el POS guarda la más reciente primero
clients = [c for c in clients if c["visits"] > 0]

cancels = []
for t in R.sample([t for t in txs if t["destination"] == "Tienda"], 7):
    who = R.choice([team[0], {"id": "owner", "name": "Don Chuy"}])
    cancels.append({"id": U(), "date": t["date"], "txId": U(), "amount": t["amount"],
                    "detail": R.choice(["Cliente se arrepintió", "Orden duplicada", "Error de captura", "Cobro con método equivocado"]), "byId": who["id"], "byName": who["name"]})
cancels.sort(key=lambda c: c["date"], reverse=True)

open_t = []
for mesa, its, w in [("Mesa 3", [("Taco al pastor", 4), ("Agua de horchata", 2)], team[3]), ("Mesa 6", [("Gringa", 1), ("Taco de asada", 3), ("Refresco", 2)], team[4])]:
    c = [{"cartId": U(), "rowId": next(r["id"] for r in rows if r["name"] == n), "quantity": qy, "selectedModifiers": []} for n, qy in its]
    open_t.append({"id": U(), "customerName": mesa, "createdAt": iso(datetime.now(TZ) - timedelta(minutes=25)), "items": c, "destination": "Tienda",
                   "total": sum(BYID[i["rowId"]]["salePrice"] * i["quantity"] for i in c), "waiterId": w["id"], "waiterName": w["name"]})

# ------------------------------------------------------------------ insumos, recetas, cierres
INS = [  # nombre, unidad, grupo, área, costo, consumo/día (min, max), días de reposición
    ("Carne al pastor", "KG", "Carnes", "Cocina", 140, 7, 10, 2), ("Carne asada (arrachera)", "KG", "Carnes", "Cocina", 230, 4, 6, 2),
    ("Suadero", "KG", "Carnes", "Cocina", 170, 2, 3, 2), ("Tripa", "KG", "Carnes", "Cocina", 120, 0.2, 0.5, 3),
    ("Chorizo", "KG", "Carnes", "Cocina", 110, 0.8, 1.2, 3), ("Tortilla de maíz", "KG", "Tortillas", "Cocina", 24, 9, 13, 1),
    ("Tortilla de harina", "KG", "Tortillas", "Cocina", 45, 1.5, 2.5, 2), ("Queso asadero", "KG", "Lácteos", "Cocina", 150, 2, 3, 3),
    ("Piña", "PZA", "Verduras", "Cocina", 35, 2, 3, 2), ("Cebolla", "KG", "Verduras", "Cocina", 28, 2, 3, 2),
    ("Cilantro", "MANOJO", "Verduras", "Cocina", 8, 4, 6, 1), ("Base de horchata", "LT", "Bebidas", "Barra", 38, 3, 5, 3),
    ("Flor de jamaica", "KG", "Bebidas", "Barra", 180, 0.05, 0.1, 5), ("Refresco lata", "PZA", "Bebidas", "Barra", 14, 18, 26, 4),
]
insumos = [{"id": U(), "nombre": n, "unidad": un, "grupo": g, "area": ar, "costoUnitario": cu, "consumoMinDiario": mn, "consumoMaxDiario": mx,
            "tiempoReposicion": rep, "saldoActual": round(R.uniform(mx * rep * 1.2, mx * rep * 2.2), 2)} for n, un, g, ar, cu, mn, mx, rep in INS]
ins = {i["nombre"]: i for i in insumos}
ins["Queso asadero"]["saldoActual"] = 3.5     # alerta: alcanza ~1 día
ins["Tortilla de harina"]["saldoActual"] = 2  # alerta crítica
RECETAS = {
    "Taco al pastor": [("Carne al pastor", 0.06), ("Tortilla de maíz", 0.03), ("Piña", 0.02), ("Cebolla", 0.01), ("Cilantro", 0.05)],
    "Taco de asada": [("Carne asada (arrachera)", 0.05), ("Tortilla de maíz", 0.03), ("Cebolla", 0.01), ("Cilantro", 0.05)],
    "Taco de suadero": [("Suadero", 0.055), ("Tortilla de maíz", 0.03), ("Cebolla", 0.01), ("Cilantro", 0.05)],
    "Taco de tripa": [("Tripa", 0.07), ("Tortilla de maíz", 0.03), ("Cebolla", 0.01), ("Cilantro", 0.05)],
    "Campechano": [("Carne asada (arrachera)", 0.035), ("Chorizo", 0.025), ("Tortilla de maíz", 0.03), ("Cebolla", 0.01)],
    "Gringa": [("Carne al pastor", 0.1), ("Tortilla de harina", 0.08), ("Queso asadero", 0.06), ("Piña", 0.03)],
    "Quesadilla de asada": [("Carne asada (arrachera)", 0.08), ("Tortilla de harina", 0.08), ("Queso asadero", 0.07)],
    "Volcán al pastor": [("Carne al pastor", 0.07), ("Tortilla de maíz", 0.04), ("Queso asadero", 0.05), ("Piña", 0.02)],
    "Orden de 5 al pastor": [("Carne al pastor", 0.3), ("Tortilla de maíz", 0.15), ("Piña", 0.1), ("Cebolla", 0.05), ("Cilantro", 0.25)],
    "Agua de horchata": [("Base de horchata", 0.5)], "Agua de jamaica": [("Flor de jamaica", 0.02)], "Refresco": [("Refresco lata", 1)],
}
FAM = {"c-tacos": "Tacos", "c-esp": "Especialidades", "c-beb": "Bebidas"}
recipes = [{"id": U(), "nombre": r["name"], "familia": FAM[r["categoryId"]], "porciones": 1, "pvp": r["salePrice"],
            "tiempoMin": 7 if r["categoryId"] == "c-esp" else 3, "equipo": "Barra" if r["categoryId"] == "c-beb" else "Trompo / plancha",
            "conservacion": "Servir al momento", "productoId": r["id"],
            "ingredientes": [{"id": U(), "nombre": n, "cantidad": qy, "unidad": ins[n]["unidad"], "costoUnitario": ins[n]["costoUnitario"], "insumoId": ins[n]["id"]}
                             for n, qy in RECETAS[r["name"]]]} for r in rows]
REC_BY_ROW = {x["productoId"]: x for x in recipes}

use = {}
for t in txs:
    day = datetime.strptime(t["date"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).astimezone(TZ).date().isoformat()
    for it in t["items"]:
        for ing in REC_BY_ROW[it["rowId"]]["ingredientes"]:
            use.setdefault(day, {})[ing["insumoId"]] = use.get(day, {}).get(ing["insumoId"], 0) + ing["cantidad"] * it["quantity"]
saldo = {i["id"]: i["saldoActual"] for i in insumos}
cierres, historial = [], []
for day in sorted((x for x in use if x != now_local.date().isoformat()), reverse=True)[:30]:  # últimos 30 cierres, reconstruidos hacia atrás desde el saldo actual
    regs = []
    for i in insumos:
        cons = round(use[day].get(i["id"], 0), 3)
        fin = saldo[i["id"]]
        comprado = round(cons * R.uniform(0.8, 1.3), 2) if R.random() < 0.6 else 0
        ini = max(0.0, round(fin + cons - comprado, 3))
        regs.append({"id": U(), "fecha": day, "insumoId": i["id"], "insumoNombre": i["nombre"], "unidad": i["unidad"], "saldoInicial": ini,
                     "comprado": comprado, "saldoFinal": round(fin, 3), "consumido": cons, "costoUnitario": i["costoUnitario"]})
        saldo[i["id"]] = ini
    cierres.append({"id": U(), "fecha": day, "registros": regs, "costoSaldoActual": round(sum(r["saldoFinal"] * r["costoUnitario"] for r in regs), 2),
                    "costoCompradoHoy": round(sum(r["comprado"] * r["costoUnitario"] for r in regs), 2)})
    historial += regs
compras_hoy = [{"id": U(), "fecha": now_local.date().isoformat(), "insumoId": ins[n]["id"], "insumoNombre": n, "unidad": ins[n]["unidad"], "cantidad": qy}
               for n, qy in [("Carne al pastor", 8), ("Tortilla de maíz", 12), ("Cilantro", 6)]]

ventas = sum(t["amount"] for t in txs)
expenses = {"luz": 2350, "telefonica": 299, "agua": 480, "internet": 499, "renta": 9500, "comprasInsumos": round(ventas * 0.31, -2), "comprasEquipos": 0,
            "nomina": 28800, "custom": [{"id": "x-gas", "concept": "Gas LP", "amount": 2600}, {"id": "x-desech", "concept": "Desechables", "amount": 1450}]}
DATA = {
    "deliveryCalcCategories": cats, "deliveryCalcRows": rows, "deliveryCalcModifierGroups": mods,
    "deliveryCalcSettings": {"baseCommissionPct": 30, "hasValidRFC": True, "ivaRate": 0.16, "paymentMethod": "Transferencia", "platform": "Uber", "taxRegime": "PFAE"},
    "delivery_calculator_pos_settings": {"adminPin": "4821", "businessAddress": "Av. 16 de Septiembre 1450, Centro, Cd. Juárez", "businessName": "Taquería Don Chuy",
                                         "businessPhone": "656 000 0000", "ivaPercentage": 16, "paperSize": "58mm", "printCustomerTicket": True, "printKitchenTicket": True},
    "delivery_calculator_pos_txs": txs, "delivery_calculator_pos_tickets": open_t, "donPuntoEquipo": team, "donPuntoClientes": clients,
    "donPuntoLealtad": {"enabled": True, "every": 10, "type": "percent", "value": 100, "label": "Tu orden número 10 va por la casa"},
    "donPuntoCancelaciones": cancels, "donPuntoInsumos2": insumos, "donPuntoRecetario": recipes, "donPuntoCierresDiarios": cierres,
    "donPuntoHistorial": historial, "donPuntoComprasHoy": compras_hoy, "donPuntoFinancialExpenses": expenses,
}

# ------------------------------------------------------------------ subir (mismo formato que cloudStore.explode)
recs = []
for key, val in DATA.items():
    if isinstance(val, list) and val and all(isinstance(x, dict) and "id" in x for x in val):
        recs += [{"owner": uid, "kind": key, "item_id": str(x["id"]), "data": {"__i": i, "v": x}} for i, x in enumerate(val)]
    else:
        recs.append({"owner": uid, "kind": key, "item_id": "_", "data": {"v": val}})
done = [0]
def up(r):
    req("POST", "/api/collections/user_items/records", r); done[0] += 1
    if done[0] % 500 == 0: print("  subidos", done[0], "/", len(recs), flush=True)
with ThreadPoolExecutor(4) as ex:
    list(ex.map(up, recs))

sold = {}
for t in txs:
    if t["date"][:7] == now_local.strftime("%Y-%m"):
        for it in t["items"]: sold[it["rowId"]] = sold.get(it["rowId"], 0) + it["quantity"]
print(f"LISTO · registros {len(recs)} · ventas {len(txs)} ({start_day} a {end_day}) · ${ventas:,.0f} MXN")
print("rezagados del mes:", [(r["name"], sold.get(r["id"], 0)) for r in rows if sold.get(r["id"], 0) < 5])
print(f"clientes {len(clients)} · cancelaciones {len(cancels)} · cierres {len(cierres)} · historial {len(historial)}")
