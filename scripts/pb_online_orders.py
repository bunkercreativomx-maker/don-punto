#!/usr/bin/env python3
"""Colecciones de Pedidos en línea (idempotente): stores + web_orders.
Uso: python3 scripts/pb_online_orders.py
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pb_admin as p

OWNER = "@request.auth.id != '' && owner = @request.auth.id"
IMG = ["image/jpeg", "image/png", "image/webp"]


def upsert(tok, spec):
    cur = p.get_col(tok, spec["name"])
    if cur:
        have = {f["name"]: f for f in cur["fields"]}
        fields = cur["fields"] + [f for f in spec["fields"] if f["name"] not in have]
        body = {k: v for k, v in spec.items() if k not in ("fields", "type")}
        body["fields"] = fields
        p.req("PATCH", f"/api/collections/{cur['id']}", body, token=tok)
        print(spec["name"], "actualizada")
        return p.get_col(tok, spec["name"])
    p.req("POST", "/api/collections", spec, token=tok)
    print(spec["name"], "creada")
    return p.get_col(tok, spec["name"])


def main():
    tok = p.login()
    users = p.get_col(tok, "users")
    f = lambda name, t, **kw: {"name": name, "type": t, **kw}
    stores = upsert(tok, {
        "name": "stores", "type": "base",
        # Solo el dueño lee/escribe; el público entra por /api/order (no se pueden listar tiendas)
        "listRule": OWNER, "viewRule": OWNER,
        "createRule": "@request.auth.id != '' && @request.body.owner = @request.auth.id",
        "updateRule": OWNER + " && (@request.body.owner:isset = false || @request.body.owner = @request.auth.id)",
        "deleteRule": None,
        "fields": [
            f("owner", "relation", required=True, collectionId=users["id"], maxSelect=1, cascadeDelete=True),
            f("slug", "text", required=True, min=3, max=40, pattern="^[a-z0-9][a-z0-9-]{2,39}$"),
            f("name", "text", max=80), f("tagline", "text", max=140), f("phone", "text", max=30),
            f("address", "text", max=200), f("hours", "text", max=200), f("color", "text", max=9),
            f("logo", "file", maxSelect=1, maxSize=3_000_000, mimeTypes=IMG),
            f("cover", "file", maxSelect=1, maxSize=3_000_000, mimeTypes=IMG),
            f("photos", "file", maxSelect=400, maxSize=2_000_000, mimeTypes=IMG),
            f("published", "bool"), f("accepting", "bool"),
            f("pickup", "bool"), f("delivery", "bool"),
            f("delivery_fee", "number", min=0), f("min_order", "number", min=0),
            f("delivery_area", "text", max=300), f("prep_minutes", "number", min=0),
            f("pay_cash", "bool"), f("pay_codi", "bool"),
            f("codi_qr", "file", maxSelect=1, maxSize=3_000_000, mimeTypes=IMG),
            f("codi_clabe", "text", max=30), f("codi_bank", "text", max=60), f("codi_holder", "text", max=100),
            f("menu", "json", maxSize=3_000_000),
            f("created", "autodate", onCreate=True, onUpdate=False),
            f("updated", "autodate", onCreate=True, onUpdate=True),
        ],
        "indexes": [
            "CREATE UNIQUE INDEX idx_stores_slug ON stores (slug)",
            "CREATE UNIQUE INDEX idx_stores_owner ON stores (owner)",
        ],
    })
    upsert(tok, {
        "name": "web_orders", "type": "base",
        "listRule": OWNER, "viewRule": OWNER,
        "createRule": None,  # solo el servidor (/api/order) crea pedidos y calcula el total
        "updateRule": OWNER + " && @request.body.owner:isset = false && @request.body.total:isset = false && @request.body.items:isset = false",
        "deleteRule": None,
        "fields": [
            f("store", "relation", required=True, collectionId=stores["id"], maxSelect=1, cascadeDelete=True),
            f("owner", "relation", required=True, collectionId=users["id"], maxSelect=1, cascadeDelete=True),
            f("number", "number"), f("token", "text", max=64),
            f("customer_name", "text", max=80), f("customer_phone", "text", max=30),
            f("type", "select", maxSelect=1, values=["pickup", "delivery"]),
            f("address", "text", max=300), f("notes", "text", max=300),
            f("items", "json", maxSize=200_000),
            f("subtotal", "number"), f("delivery_fee", "number"), f("total", "number"),
            f("payment", "select", maxSelect=1, values=["cash", "codi"]),
            f("payment_status", "select", maxSelect=1, values=["pending", "reported", "paid"]),
            f("status", "select", maxSelect=1, values=["new", "accepted", "ready", "on_way", "done", "rejected"]),
            f("reason", "text", max=200), f("sale_id", "text", max=64),
            f("created", "autodate", onCreate=True, onUpdate=False),
            f("updated", "autodate", onCreate=True, onUpdate=True),
        ],
        "indexes": [
            "CREATE UNIQUE INDEX idx_web_orders_token ON web_orders (token)",
            "CREATE INDEX idx_web_orders_owner ON web_orders (owner, created)",
            "CREATE INDEX idx_web_orders_store ON web_orders (store, created)",
        ],
    })


if __name__ == "__main__":
    main()
