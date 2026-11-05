#!/usr/bin/env python3
"""Siembra la réplica de Litestream en R2 con una copia (solo lectura) del PocketBase de Don Punto.

Uso: python3 seed.py <ls_path>     p.ej. live/solace-pb/test-1/data.db
1) Copia consistente de /DATA/AppData/pocketbase-don-punto/data.db con sqlite `.backup` desde URI mode=ro.
2) En la COPIA activa almacenamiento S3 (R2, bucket bunker-backups) para archivos.
3) Sube /storage de la copia a R2 (mismas llaves que usa PocketBase).
4) Corre la imagen donpunto-pb-cf:local con la copia → Litestream sube snapshot a <ls_path>. Lo detiene limpio.
Nunca escribe en el PocketBase en vivo.
"""
import base64, io, json, os, sys, tarfile, time
sys.path.insert(0, "/opt/data/mugan/ops")
import pt

LS_PATH = sys.argv[1]
SEED = "/DATA/AppData/donpunto-pb-seed"
LIVE = "/DATA/AppData/pocketbase-don-punto"
ENV = dict(l.strip().split("=", 1) for l in open("/opt/data/.r2-backups.env") if "=" in l and not l.startswith("#"))
BUCKET = "bunker-backups"

S3 = {"enabled": True, "bucket": BUCKET, "region": "auto", "endpoint": ENV["R2_ENDPOINT"],
      "accessKey": ENV["R2_ACCESS_KEY_ID"], "secret": ENV["R2_SECRET_ACCESS_KEY"], "forcePathStyle": True}

PY = r'''
import sqlite3, json, sys, os, shutil
os.makedirs("/seed", exist_ok=True)
for f in os.listdir("/seed"):
    p = os.path.join("/seed", f)
    shutil.rmtree(p) if os.path.isdir(p) else os.remove(p)
src = sqlite3.connect("file:/live/data.db?mode=ro&immutable=1", uri=True)
dst = sqlite3.connect("/seed/data.db")
src.backup(dst); src.close()
s3 = json.loads(os.environ["S3"])
row = dst.execute("select value from _params where id='settings' or key='settings'").fetchone() if False else None
cols = [r[1] for r in dst.execute("pragma table_info(_params)")]
key = "id" if "id" in cols else "key"
val = dst.execute(f"select value from _params where {key}='settings'").fetchone()[0]
st = json.loads(val)
st["s3"] = s3
dst.execute(f"update _params set value=? where {key}='settings'", (json.dumps(st),))
dst.commit()
print("integrity", dst.execute("pragma integrity_check").fetchone()[0])
print("journal", dst.execute("pragma journal_mode=wal").fetchone()[0])
for t in ["users","subscriptions","restaurants","user_items","web_orders","push_subscriptions","app_kv"]:
    print("count", t, dst.execute(f"select count(*) from {t}").fetchone()[0])
dst.close()
shutil.copytree("/live/storage", "/seed/storage")
os.system("chown -R 0:0 /seed")
'''


def main():
    b = base64.b64encode(PY.encode()).decode()
    s3 = base64.b64encode(json.dumps(S3).encode()).decode()
    print(pt.run_temp(f"export S3=$(echo {s3}|base64 -d); echo {b}|base64 -d>/tmp/s.py && python3 /tmp/s.py",
                      image="python:3.12-alpine", binds=[f"{LIVE}:/live:ro", f"{SEED}:/seed"]))
    # archivos → R2 (se leen de la copia en tar base64)
    raw = pt.run_temp("cd /seed/storage && tar czf - . | base64 -w0; echo", image="alpine:3.20", binds=[f"{SEED}:/seed:ro"])
    tf = tarfile.open(fileobj=io.BytesIO(base64.b64decode(raw.strip().splitlines()[-1])), mode="r:gz")
    import boto3
    s = boto3.client("s3", endpoint_url=ENV["R2_ENDPOINT"], aws_access_key_id=ENV["R2_ACCESS_KEY_ID"],
                     aws_secret_access_key=ENV["R2_SECRET_ACCESS_KEY"], region_name="auto")
    n = 0
    for m in tf.getmembers():
        if m.isfile():
            k = m.name.lstrip("./")
            s.put_object(Bucket=BUCKET, Key=k, Body=tf.extractfile(m).read()); n += 1
    print("archivos subidos", n)
    # litestream: snapshot inicial
    name = f"donpunto-seed-{int(time.time())}"
    env = [f"LS_BUCKET={BUCKET}", f"LS_PATH={LS_PATH}", f"LS_ENDPOINT={ENV['R2_ENDPOINT']}",
           f"LS_KEY={ENV['R2_ACCESS_KEY_ID']}", f"LS_SECRET={ENV['R2_SECRET_ACCESS_KEY']}"]
    pt.req("POST", f"/api/endpoints/3/docker/containers/create?name={name}",
           {"Image": "donpunto-pb-cf:local", "Env": env, "HostConfig": {"Binds": [f"{SEED}:/pb_data"], "NetworkMode": "bridge"}})
    pt.req("POST", f"/api/endpoints/3/docker/containers/{name}/start")
    time.sleep(40)
    pt.req("POST", f"/api/endpoints/3/docker/containers/{name}/stop?t=20")
    print(pt.frames(pt.req("GET", f"/api/endpoints/3/docker/containers/{name}/logs?stdout=1&stderr=1&tail=40", raw=True))[-2500:])
    pt.req("DELETE", f"/api/endpoints/3/docker/containers/{name}?force=1")
    objs = s.list_objects_v2(Bucket=BUCKET, Prefix=LS_PATH.rsplit("/", 1)[0] + "/").get("Contents", [])
    print("objetos litestream", len(objs), sum(o["Size"] for o in objs), "bytes")


if __name__ == "__main__":
    main()
