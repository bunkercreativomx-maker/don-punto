#!/bin/sh
# 1) Restaura data.db desde R2. 2) Si NO hay réplica, se niega a arrancar vacío (evita que una
#    base vacía se convierta en la "última versión" en R2). 3) PocketBase corre bajo litestream.
set -e
mkdir -p /pb_data
if [ ! -f /pb_data/data.db ]; then
  echo "[start] restaurando desde R2..."
  litestream restore -if-replica-exists /pb_data/data.db || { echo "[start] restore FALLÓ"; exit 1; }
fi
if [ ! -f /pb_data/data.db ]; then
  echo "[start] NO hay réplica en R2 y no hay base local: no arranco vacío"; exit 1
fi
echo "[start] data.db $(stat -c %s /pb_data/data.db) bytes; arrancando PocketBase"
exec litestream replicate -exec "pocketbase serve --http=0.0.0.0:8090 --dir=/pb_data --hooksDir=/pb_hooks"
