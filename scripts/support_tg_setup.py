#!/usr/bin/env python3
"""Conecta el bot de Telegram de soporte de Don Punto.
Lee el token de /opt/data/.donpunto-support-bot.txt (no lo imprime), lo guarda en PB app_kv "support_tg"
y apunta el webhook a https://donpunto.com/api/support?tg=1.
Uso: python3 scripts/support_tg_setup.py [chat_id]
"""
import json, os, secrets, sys, urllib.request

sys.path.insert(0, os.path.dirname(__file__))
import pb_admin as p

TOKEN = open('/opt/data/.donpunto-support-bot.txt').read().strip()
CHAT = sys.argv[1] if len(sys.argv) > 1 else '7433054912'


def tg(method, body=None):
    r = urllib.request.Request(f'https://api.telegram.org/bot{TOKEN}/{method}', data=json.dumps(body or {}).encode(),
                               headers={'Content-Type': 'application/json'}, method='POST')
    return json.loads(urllib.request.urlopen(r, timeout=20).read())


me = tg('getMe')
print('bot:', '@' + me['result']['username'])
t = p.login()
items = p.req('GET', '/api/collections/app_kv/records?perPage=1&filter=' + urllib.request.quote('key = "support_tg"'), token=t)['items']
prev = items[0]['value'] if items else {}
secret = prev.get('secret') if prev.get('token') == TOKEN and prev.get('secret') else secrets.token_hex(24)
value = {'token': TOKEN, 'chat_id': CHAT, 'secret': secret, 'bot': me['result']['username']}
if items:
    p.req('PATCH', f"/api/collections/app_kv/records/{items[0]['id']}", {'value': value}, token=t)
else:
    p.req('POST', '/api/collections/app_kv/records', {'key': 'support_tg', 'value': value}, token=t)
print('app_kv support_tg: ok')
print('webhook:', tg('setWebhook', {'url': 'https://donpunto.com/api/support?tg=1', 'secret_token': secret,
                                     'allowed_updates': ['message'], 'drop_pending_updates': True}).get('description'))
