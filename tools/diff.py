#!/usr/bin/env python3
"""Numeric + visual diff between the rendered hero and the reference screenshot."""
import sys
import numpy as np
from PIL import Image

REF = "/home/gaurav/Documents/dev/marketing-project/image.png"
cur_path = sys.argv[1] if len(sys.argv) > 1 else "/tmp/opencode/shot/current.png"
cur_path2 = sys.argv[2] if len(sys.argv) > 2 else None

ref = Image.open(REF).convert("RGB")
cur = Image.open(cur_path).convert("RGB")
print(f"ref {ref.size}  cur {cur.size}")
if ref.size != cur.size:
    print("!! SIZE MISMATCH")
    sys.exit(1)

R = np.asarray(ref, dtype=np.int16)
C = np.asarray(cur, dtype=np.int16)
D = np.abs(R - C).mean(axis=2)
print(f"mean abs diff: {D.mean():.2f}   >16: {(D>16).mean()*100:.2f}%   >40: {(D>40).mean()*100:.2f}%")

# Row-band diff to find vertical rhythm errors
print("\nrow bands (y0-y1): mean diff, %>24")
for y0 in range(0, 966, 48):
    band = D[y0:y0+48]
    print(f"  {y0:4d}-{y0+48:4d}: {band.mean():6.2f}  {(band>24).mean()*100:5.1f}%")

# Column-band diff to find horizontal placement errors
print("\ncol bands (x0-x1): mean diff")
for x0 in range(0, 1628, 100):
    band = D[:, x0:x0+100]
    print(f"  {x0:4d}-{x0+100:4d}: {band.mean():6.2f}  {(band>24).mean()*100:5.1f}%")

# Column profile: where is white-vs-photo boundary in each?
def white_edge(img, row):
    """first x where pixel is meaningfully darker than white"""
    px = np.asarray(img, dtype=np.int16)
    lum = px[row].mean(axis=1)
    idx = np.where(lum < 250)[0]
    return int(idx[0]) if len(idx) else -1

print("\nleft white edge (first non-white x) per row:")
for row in (60, 300, 500, 800, 940):
    print(f"  y={row}: ref={white_edge(ref,row)}  cur={white_edge(cur,row)}")

# Where does the white overlay finish? scan row 900 (below text)
def alpha_profile(img, row):
    px = np.asarray(img, dtype=np.int16).astype(float)
    return px[row].mean(axis=1)

if cur_path2:
    cur2 = Image.open(cur_path2).convert("RGB")
    D2 = np.abs(np.asarray(ref, np.int16) - np.asarray(cur2, np.int16)).mean(axis=2)
    print(f"\n2nd candidate {cur_path2}: mean abs diff {D2.mean():.2f}  >16 {(D2>16).mean()*100:.2f}%")
    best = D2 if D2.mean() < D.mean() else D
    bestcur = cur_path2 if D2.mean() < D.mean() else cur_path
else:
    best, bestcur = D, cur

# Side-by-side + amplified diff sheet
sheet = Image.new("RGB", (1628 * 2, 966 * 2 + 8), (255, 0, 0))
sheet.paste(ref, (0, 0))
sheet.paste(Image.open(bestcur).convert("RGB"), (1628, 0))
heat = np.clip(best * 5, 0, 255).astype("uint8")
sheet.paste(Image.fromarray(heat).convert("RGB"), (0, 974))
sheet.paste(ref.crop((0, 0, 1628, 966)), (1628, 974))
sheet.save("/tmp/opencode/shot/diff.png")
print("\nwrote /tmp/opencode/shot/diff.png  [ref | current / heat x5 | ref again]")
