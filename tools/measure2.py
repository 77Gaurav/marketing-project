#!/usr/bin/env python3
"""Precise geometry of the UI layer: restricted to the white (text-on-white) zone."""
import numpy as np
from PIL import Image

REF = "/home/gaurav/Documents/dev/marketing-project/image.png"
A = np.asarray(Image.open(REF).convert("RGB"), dtype=np.int16)
H, W, _ = A.shape
lum = A.mean(axis=2)

# Restrict to x<700 (solid white zone) so the photograph can't pollute the profile.
XMAX = 700
zone = lum[:, :XMAX]
ink = zone < 200

print("=== text/ink row runs in x<700 ===")
rowsum = ink.sum(axis=1)
runs, inrun = [], False
for y in range(H):
    if rowsum[y] > 1 and not inrun:
        inrun, start = True, y
    elif rowsum[y] <= 1 and inrun:
        inrun = False
        runs.append((start, y - 1))
if inrun:
    runs.append((start, H - 1))

for s, e in runs:
    if e - s < 2:
        continue
    band = ink[s:e+1]
    colsum = band.sum(axis=0)
    xs = np.where(colsum > 0)[0]
    print(f"  y {s:4d}-{e:4d} h={e-s+1:3d}   x {xs.min():4d}->{xs.max():4d} w={xs.max()-xs.min()+1:4d}  inkpx={int(band.sum()):6d}")

print("\n=== column runs inside the headline block (y 290..560) ===")
head = ink[290:560]
colsum = head.sum(axis=0)
xs = np.where(colsum > 0)[0]
groups, gstart = [], xs[0]
for a, b in zip(xs, xs[1:]):
    if b - a > 14:
        groups.append((gstart, a))
        gstart = b
groups.append((gstart, xs[-1]))
print("  glyph groups (>14px gap):", [(int(a), int(b)) for a, b in groups])

print("\n=== glyph gaps per headline line (find word boundaries + measure) ===")
for (y0, y1, label) in ((294, 380, "L1"), (384, 465, "L2"), (477, 555, "L3")):
    band = ink[y0:y1]
    colsum = band.sum(axis=0)
    nz = np.where(colsum > 0)[0]
    if not len(nz):
        continue
    grp, gs = [], nz[0]
    for a, b in zip(nz, nz[1:]):
        if b - a > 8:
            grp.append((int(gs), int(a)))
            gs = b
    grp.append((int(gs), int(nz[-1])))
    print(f"  {label} y{y0}-{y1}: words {grp}")

print("\n=== exact white-overlay edge per row (x<800) ===")
for row in range(0, 966, 60):
    l = lum[row]
    seg = l[:820]
    idx = np.where(seg < 246)[0]
    # ignore isolated dark text pixels: require a run of >=6 dark px
    edge = -1
    for i in idx:
        if (seg[i:i+6] < 246).sum() >= 5:
            edge = int(i)
            break
    prof = " ".join(f"{x}:{l[x]:.0f}" for x in (560, 600, 620, 640, 660, 680, 700, 720, 760, 800))
    print(f"  y={row:4d} photoEdge={edge:4d}  {prof}")
