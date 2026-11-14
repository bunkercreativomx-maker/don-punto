#!/usr/bin/env python3
"""Socios de Don Punto (código de recomendación + reporte mensual).

  python3 scripts/affiliates.py list
  python3 scripts/affiliates.py add "Lic. Nombre" CODIGO [--email x] [--phone x] [--start 2026-11-14]
  python3 scripts/affiliates.py off CODIGO        # desactiva el código (ya no liga cuentas nuevas)

Al crear un socio imprime su link para invitar y el link privado de su reporte.
Solo cuentan cuentas creadas desde --start (fecha de firma): los clientes que ya eran de Don Punto no le cuentan.
"""
import argparse, secrets, sys, os, urllib.parse
sys.path.insert(0, os.path.dirname(__file__))
import pb_admin as P

APP = 'https://donpunto.com'


def links(a):
    return f"{APP}/?ref={a['code']}", f"{APP}/api/referral?r={a['report_token']}"


def main():
    ap = argparse.ArgumentParser()
    sp = ap.add_subparsers(dest='cmd', required=True)
    sp.add_parser('list')
    a = sp.add_parser('add'); a.add_argument('name'); a.add_argument('code')
    a.add_argument('--email', default=''); a.add_argument('--phone', default=''); a.add_argument('--start', default='')
    o = sp.add_parser('off'); o.add_argument('code')
    args = ap.parse_args()
    t = P.login()

    if args.cmd == 'list':
        r = P.req('GET', '/api/collections/affiliates/records?perPage=200&sort=created', token=t)
        for x in r['items']:
            n = P.req('GET', '/api/collections/referrals/records?perPage=1&filter=' + urllib.parse.quote(f'affiliate="{x["id"]}"'), token=t)['totalItems']
            inv, rep = links(x)
            print(f"{x['code']:<12} {x['name']:<28} activo={x['active']} desde={x['start_date'][:10]} registrados={n}\n   invitar: {inv}\n   reporte: {rep}")
        return

    code = ''.join(ch for ch in args.code.upper() if ch.isalnum() or ch == '-')[:20]
    if args.cmd == 'off':
        x = P.req('GET', '/api/collections/affiliates/records?filter=' + urllib.parse.quote(f'code="{code}"'), token=t)['items']
        if not x: sys.exit('No existe ' + code)
        P.req('PATCH', f"/api/collections/affiliates/records/{x[0]['id']}", {'active': False}, token=t)
        print('Desactivado', code); return

    start = args.start or __import__('datetime').datetime.utcnow().strftime('%Y-%m-%d')
    rec = P.req('POST', '/api/collections/affiliates/records', {
        'name': args.name, 'code': code, 'email': args.email, 'phone': args.phone, 'active': True,
        'start_date': f'{start} 07:00:00.000Z', 'report_token': secrets.token_urlsafe(24).replace('-', 'x').replace('_', 'y'),
    }, token=t)
    inv, rep = links(rec)
    print(f"Socio creado: {rec['name']} · código {rec['code']}\nLink para invitar: {inv}\nReporte privado: {rep}")


if __name__ == '__main__':
    main()
