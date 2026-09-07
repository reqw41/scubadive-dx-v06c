#!/usr/bin/env python3
"""Снимок ЖИВОЙ видеопамяти Emu80 через MCP в PNG (для разбора дефекта на паузе).
   python3 tools/verify/emu_shot.py <out.png> [порт] [масштаб]
Палитра берётся из памяти (PaletteGame), как в hudshot.js."""
import json, subprocess, sys, pathlib
from PIL import Image
OUT = sys.argv[1]; PORT = sys.argv[2] if len(sys.argv) > 2 else "19782"; SC = int(sys.argv[3]) if len(sys.argv) > 3 else 3
HERE = pathlib.Path(__file__).resolve().parent.parent  # tools/
def call(tool, args):
    r = subprocess.run([str(HERE / "emu80_mcp.sh"), tool, json.dumps(args), PORT], capture_output=True, text=True)
    return json.loads(json.loads(r.stdout)["result"]["content"][0]["text"])
def mem(addr, ln):
    out = bytearray()
    while ln > 0:
        n = min(4096, ln)
        out += bytes.fromhex(call("mem_read", {"addr": addr, "len": n})["hex"].replace(" ", ""))
        addr += n; ln -= n
    return bytes(out)
def sym(name, f):
    for line in open(f):
        if line.startswith(name + ":"): return int(line.split()[-1], 16)
    raise SystemExit("нет метки " + name)
pg = sym("PaletteGame", sys.argv[4] if len(sys.argv) > 4 else str(HERE.parent / "build/immortal/scubacod0.sym"))
pal = [(lambda p: ((p & 7) * 36, ((p >> 3) & 7) * 36, ((p >> 6) & 3) * 85))(b) for b in mem(pg, 4)]
v0 = mem(0xC000, 0x2000); v1 = mem(0xE000, 0x2000)
im = Image.new("RGB", (256, 192))
px = im.load()
for y in range(192):
    lo = 191 - y
    for col in range(32):
        a, b = v0[col * 256 + lo], v1[col * 256 + lo]
        for bit in range(7, -1, -1):
            px[col * 8 + (7 - bit), y] = pal[(((a >> bit) & 1) << 1) | ((b >> bit) & 1)]
im.resize((256 * SC, 192 * SC), Image.NEAREST).save(OUT)
print("снимок", OUT)
