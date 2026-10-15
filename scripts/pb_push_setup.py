"""Colecciones para notificaciones push + llaves VAPID (solo superusuario).
Uso: python3 scripts/pb_push_setup.py /ruta/vapid.json
"""
import json, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pb_admin as p


def main():
    tok = p.login()
    users = p.get_col(tok, "users")

    if not p.get_col(tok, "push_subscriptions"):
        owner_only = "@request.auth.id != '' && owner = @request.auth.id"
        p.req("POST", "/api/collections", {
            "name": "push_subscriptions",
            "type": "base",
            "listRule": owner_only,
            "viewRule": owner_only,
            "createRule": "@request.auth.id != '' && @request.body.owner = @request.auth.id",
            "updateRule": owner_only + " && (@request.body.owner:isset = false || @request.body.owner = @request.auth.id)",
            "deleteRule": owner_only,
            "fields": [
                {"name": "owner", "type": "relation", "required": True, "collectionId": users["id"], "maxSelect": 1, "cascadeDelete": True},
                {"name": "endpoint", "type": "text", "required": True, "max": 1000},
                {"name": "p256dh", "type": "text", "required": True, "max": 300},
                {"name": "auth", "type": "text", "required": True, "max": 100},
                {"name": "user_agent", "type": "text", "max": 400},
                {"name": "daily_summary", "type": "bool"},
                {"name": "created", "type": "autodate", "onCreate": True, "onUpdate": False},
                {"name": "updated", "type": "autodate", "onCreate": True, "onUpdate": True},
            ],
            "indexes": ["CREATE UNIQUE INDEX idx_push_endpoint ON push_subscriptions (endpoint)"],
        }, token=tok)
        print("push_subscriptions creada")

    if not p.get_col(tok, "app_kv"):
        p.req("POST", "/api/collections", {
            "name": "app_kv",
            "type": "base",
            "listRule": None, "viewRule": None, "createRule": None, "updateRule": None, "deleteRule": None,
            "fields": [
                {"name": "key", "type": "text", "required": True, "max": 100},
                {"name": "value", "type": "json", "maxSize": 200000},
            ],
            "indexes": ["CREATE UNIQUE INDEX idx_app_kv_key ON app_kv (key)"],
        }, token=tok)
        print("app_kv creada (solo superusuario)")

    if len(sys.argv) > 1:
        vapid = json.load(open(sys.argv[1]))
        found = p.req("GET", "/api/collections/app_kv/records?filter=(key%3D'vapid')", token=tok)["items"]
        body = {"key": "vapid", "value": {"publicKey": vapid["publicKey"], "privateKey": vapid["privateKey"], "subject": "mailto:soporte@donpunto.com"}}
        if found:
            p.req("PATCH", f"/api/collections/app_kv/records/{found[0]['id']}", body, token=tok)
        else:
            p.req("POST", "/api/collections/app_kv/records", body, token=tok)
        print("llaves VAPID guardadas en app_kv")


if __name__ == "__main__":
    main()
