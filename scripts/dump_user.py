#!/usr/bin/env python3
import sys, json, collections, urllib.parse
sys.path.insert(0, "/opt/data/don-punto-gh/scripts")
import pb_admin as A
tok = A.login()
uid = sys.argv[1]
items, page = [], 1
while True:
    q = urllib.parse.quote(f'owner = "{uid}"')
    r = A.req("GET", f"/api/collections/user_items/records?perPage=500&page={page}&filter={q}", token=tok)
    items += r["items"]
    if page >= r["totalPages"]: break
    page += 1
c = collections.Counter(i["kind"] for i in items)
for k, n in sorted(c.items()): print(f"{n:5d} {k}")
if len(sys.argv) > 2:
    out = collections.defaultdict(list)
    for i in items: out[i["kind"]].append({"item_id": i["item_id"], "data": i["data"]})
    json.dump(out, open(sys.argv[2], "w"), ensure_ascii=False, indent=1)
