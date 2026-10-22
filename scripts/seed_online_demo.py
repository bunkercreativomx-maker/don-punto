#!/usr/bin/env python3
"""Página de pedidos en línea para la cuenta demo (demo@donpunto.com → donpunto.com/donchuy).
Re-ejecutable: actualiza la tienda y vuelve a subir fotos. Fotos en DEMO_DIR (webp por slug del platillo).
Uso: python3 scripts/seed_online_demo.py [DEMO_DIR]
"""
import json, os, subprocess, sys, unicodedata, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pb_admin as p

DEMO_DIR = sys.argv[1] if len(sys.argv) > 1 else "/opt/data/cache/scratch/dpdemo"
EMAIL = "demo@donpunto.com"
SLUG = "donchuy"
DESC = {
    "Taco al pastor": "Trompo al carbón con piña, cebolla y cilantro.",
    "Taco de asada": "Arrachera a la parrilla con cebolla, cilantro y salsa verde.",
    "Taco de suadero": "Suadero suavecito, picado al momento.",
    "Taco de tripa": "Tripita dorada y crujiente, como debe ser.",
    "Campechano": "Asada con chorizo en tortilla doble.",
    "Gringa": "Tortilla de harina con queso asadero derretido y pastor.",
    "Quesadilla de asada": "Tortilla de harina grande con asada y queso. Incluye guacamole.",
    "Volcán al pastor": "Tostada con queso gratinado y pastor encima.",
    "Orden de 5 al pastor": "Cinco tacos al pastor con rábano, limón y salsas.",
    "Agua de horchata": "Medio litro, hecha en casa con canela.",
    "Agua de jamaica": "Medio litro, natural y bien fría.",
    "Refresco": "De vidrio, bien frío. Pregunta por sabores.",
}
PHOTO = {
    "Taco al pastor": "taco-al-pastor", "Taco de asada": "taco-de-asada", "Taco de suadero": "taco-de-suadero",
    "Taco de tripa": "taco-de-tripa", "Campechano": "campechano", "Gringa": "gringa", "Quesadilla de asada": "quesadilla-de-asada",
    "Volcán al pastor": "volcan-al-pastor", "Orden de 5 al pastor": "orden-5-al-pastor", "Agua de horchata": "agua-de-horchata",
    "Agua de jamaica": "agua-de-jamaica", "Refresco": "refresco",
}


def items(tok, uid, kind):
    q = urllib.parse.quote(f"owner='{uid}' && kind='{kind}'")
    out = p.req("GET", f"/api/collections/user_items/records?perPage=500&filter={q}", token=tok)["items"]
    rows = [x["data"] for x in out]
    if len(rows) == 1 and x_is_single(rows[0]):
        return rows[0]["v"]
    return [r["v"] for r in sorted(rows, key=lambda r: r.get("__i", 0))]


def x_is_single(d):
    return "__i" not in d


def curl_files(tok, rid, files):
    args = ["curl", "-sS", "-X", "PATCH", "-H", f"Authorization: {tok}", "-H", "User-Agent: Mozilla/5.0 Chrome/130"]
    for field, path in files:
        args += ["-F", f"{field}=@{path}"]
    args.append(f"{p.BASE}/api/collections/stores/records/{rid}")
    out = subprocess.run(args, capture_output=True, text=True, check=True).stdout
    d = json.loads(out)
    if "id" not in d:
        raise SystemExit(f"upload falló: {out[:400]}")
    return d


def main():
    tok = p.login()
    uid = p.req("GET", "/api/collections/users/records?filter=" + urllib.parse.quote(f"email='{EMAIL}'"), token=tok)["items"][0]["id"]
    rows = items(tok, uid, "deliveryCalcRows")
    cats = items(tok, uid, "deliveryCalcCategories")
    groups = items(tok, uid, "deliveryCalcModifierGroups") or []
    menu = {
        "categories": [{"id": c["id"], "name": c["name"]} for c in cats],
        "groups": [{"id": g["id"], "name": g["name"], "type": g.get("selectionType", "single"), "min": g.get("minSelect") or 0,
                    "max": g.get("maxSelect"), "options": [{"id": o["id"], "name": o["name"], "price": o.get("extraPrice", 0)} for o in g.get("options", [])]} for g in groups],
        "products": [],
    }
    base = {
        "owner": uid, "slug": SLUG, "name": "Taquería Don Chuy", "tagline": "Tacos al carbón y al pastor desde 1998",
        "phone": "656 000 0000", "address": "Av. 16 de Septiembre, Cd. Juárez", "hours": "Lun a Dom · 1:00 pm a 12:00 am",
        "color": "#C2410C", "published": True, "accepting": True, "pickup": True, "delivery": True,
        "delivery_fee": 30, "min_order": 100, "delivery_area": "Centro, Partido Romero, Chaveña y 4 km a la redonda", "prep_minutes": 20,
        "pay_cash": True, "pay_codi": True, "codi_clabe": "000000000000000000", "codi_bank": "Banco demo", "codi_holder": "Cuenta de demostración (no transferir)",
    }
    q = urllib.parse.quote(f"owner='{uid}'")
    cur = p.req("GET", f"/api/collections/stores/records?perPage=1&filter={q}", token=tok)["items"]
    if cur:
        rid = cur[0]["id"]
        p.req("PATCH", f"/api/collections/stores/records/{rid}", {**base, "photos": [], "menu": menu}, token=tok)
    else:
        rid = p.req("POST", "/api/collections/stores/records", {**base, "menu": menu}, token=tok)["id"]
    print("tienda", rid)

    files = [("logo", f"{DEMO_DIR}/logo.webp"), ("cover", f"{DEMO_DIR}/cover.webp"), ("codi_qr", f"{DEMO_DIR}/codi-demo.png")]
    order = []
    for r in rows:
        ph = PHOTO.get(r["name"])
        if ph and os.path.exists(f"{DEMO_DIR}/{ph}.webp"):
            files.append(("photos+", f"{DEMO_DIR}/{ph}.webp"))
            order.append(r["id"])
    rec = curl_files(tok, rid, files)
    # PocketBase agrega un sufijo al nombre: casar por prefijo del archivo original
    photos = rec["photos"]
    by_prefix = {}
    for n in photos:
        by_prefix.setdefault(n.rsplit("_", 1)[0], n)
    products = []
    for r in rows:
        ph = PHOTO.get(r["name"])
        products.append({
            "id": r["id"], "name": r["name"], "price": r.get("salePrice", 0), "categoryId": r.get("categoryId", ""),
            "groups": [g["id"] for g in groups if g["id"] in (r.get("modifierGroupIds") or []) or (r.get("categoryId") and r.get("categoryId") in (g.get("appliedToCategories") or []))],
            "description": DESC.get(r["name"], ""), "photo": by_prefix.get(ph.replace("-", "_")) if ph else None,
            "hidden": False, "soldOut": False,
        })
    missing = [x["name"] for x in products if not x["photo"]]
    menu["products"] = products
    p.req("PATCH", f"/api/collections/stores/records/{rid}", {"menu": menu}, token=tok)
    print("platillos", len(products), "sin foto:", missing, "| fotos:", len(photos))


if __name__ == "__main__":
    main()
