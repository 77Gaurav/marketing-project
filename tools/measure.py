#!/usr/bin/env python3
"""Measure the reference screenshot numerically: locate text/UI bounding boxes."""
import numpy as np
from PIL import Image

REF = "/home/gaurav/Documents/dev/marketing-project/image.png"
img = Image.open(REF).convert("RGB")
A = np.asarray(img, dtype=np.int16)
H, W, _ = A.shape
print("size", W, H)

# ---- 1. White overlay edge: per row, the x where the photo starts becoming visible ----
lum = A.mean(axis=2)
print("\n=== per-row: first x with lum<248, and lum at sample x ===")
for row in (10, 60, 200, 400, 600, 800, 950):
    l = lum[row]
    idx = np.where(l < 248)[0]
    edge = int(idx[0]) if len(idx) else -1
    samples = {x: round(float(l[x]), 1) for x in (0, 100, 300, 450, 500, 550, 600, 650, 700, 750, 800, 850, 900, 1000, 1200, 1500, 1600)}
    print(f" y={row:4d} edge={edge:5d}  {samples}")

# ---- 2. Find dark-ink text rows in the left region (x 60..760) ----
print("\n=== left-region dark pixel row profile (x 60..760, lum<170) ===")
left = lum[:, 60:760]
dark = (left < 170).sum(axis=1)
runs = []
inrun = False
for y in range(H):
    if dark[y] > 2 and not inrun:
        inrun, start = True, y
    elif dark[y] <= 2 and inrun:
        inrun = False
        runs.append((start, y - 1, int(dark[start:y].max())))
if inrun:
    runs.append((start, H - 1, int(dark[start:H].max())))
for s, e, m in runs:
    if e - s >= 1:
        print(f"  rows {s:4d}-{e:4d}  h={e-s+1:3d}  maxdark={m}")

# ---- 3. For each text band, the x extent ----
print("\n=== per-band x extent (dark pixels) ===")
for s, e, m in runs:
    if e - s < 4:
        continue
    band = lum[s:e+1, :]
    colmask = (band < 170).sum(axis=0)
    xs = np.where(colmask > 0)[0]
    xs = xs[xs < 800]
    if len(xs):
        print(f"  y {s:4d}-{e:4d}: x {xs.min():4d} -> {xs.max():4d}  (w={xs.max()-xs.min()+1})")

# ---- 4. The dark navy button blocks (very dark, wide) ----
print("\n=== dark navy blocks (lum<60) row/col profile ===")
navy = lum < 70
rowsum = navy[:, :800].sum(axis=1)
runs2 = []
inrun = False
for y in range(H):
    if rowsum[y] > 40 and not inrun:
        inrun, start = True, y
    elif rowsum[y] <= 40 and inrun:
        inrun = False
        runs2.append((start, y - 1))
if inrun:
    runs2.append((start, H - 1))
for s, e in runs2:
    band = navy[s:e+1, :]
    colmask = band.sum(axis=0)
    xs = np.where(colmask > (e - s) * 0.3)[0]
    if len(xs):
        print(f"  block y {s:4d}-{e:4d} (h={e-s+1})  x {xs.min():4d} -> {xs.max():4d} (w={xs.max()-xs.min()+1})")

# ---- 5. Colours sampled at key points ----
print("\n=== sampled colours ===")
pts = {
    "eyebrow": (90, 258),
    "headline L1": (100, 330),
    "headline L3 grad-start": (95, 515),
    "headline L3 grad-end": (520, 515),
    "body": (100, 610),
    "primary btn": (200, 795),
    "body bg": (700, 940),
}
for k, (x, y) in pts.items():
    print(f"  {k:24s} ({x},{y}) = {tuple(int(v) for v in A[y, x])}")
