#!/usr/bin/env python3
"""Search scale + dx/dy that aligns the source photo to the reference's right (overlay-free) side."""
import numpy as np
from PIL import Image

REF = "/home/gaurav/Documents/dev/marketing-project/image.png"
SRC = "/home/gaurav/Documents/dev/marketing-project/assets/landing-screen-bg.png"
ref = Image.open(REF).convert("RGB")
src = Image.open(SRC).convert("RGB")
W, H = ref.size
SW, SH = src.size
R = np.asarray(ref, np.float64)

xs = np.arange(1150, 1628, 7)
ys = np.arange(20, 950, 7)
RY = ys[:, None]
RX = xs[None, :]

results = []
for scale in np.arange(0.98, 1.22, 0.01):
    nw, nh = int(round(SW * scale)), int(round(SH * scale))
    B = np.asarray(src.resize((nw, nh), Image.LANCZOS), np.float64)
    for dy in range(int(-(nh - H)) + 5, H - int(0.2 * nh), 4):
        sy = RY - dy
        okr = (sy >= 0) & (sy < nh)
        if okr.sum() < 0.6 * len(ys):
            continue
        for dx in range(-(nw - W) + 5, int(0.2 * nw), 4):
            sx = RX - dx
            okc = (sx >= 0) & (sx < nw)
            m = okr & okc
            if m.sum() < 0.6 * len(ys) * len(xs):
                continue
            syb = np.broadcast_to(sy, m.shape)
            sxb = np.broadcast_to(sx, m.shape)
            sub = B[syb[m], sxb[m]]
            err = np.abs(sub - R[np.broadcast_to(RY, m.shape)[m], np.broadcast_to(RX, m.shape)[m]]).mean()
            results.append((err, round(scale, 3), dx, dy, nw, nh))

results.sort()
print("top 12 (err, scale, dx, dy, nw, nh):")
for r in results[:12]:
    print("  ", round(r[0], 3), r[1], r[2], r[3], r[4], r[5])

e, scale, dx, dy, nw, nh = results[0]
print("\nbest scale", scale, "scaled", nw, nh, " dx", dx, " dy", dy)
print("centered would be dx", (W - nw) // 2, " dy", (H - nh) // 2)
