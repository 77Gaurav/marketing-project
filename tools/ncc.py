#!/usr/bin/env python3
"""NCC alignment with edge-padded source so sub-window crops are allowed."""
import numpy as np
from PIL import Image

R = np.asarray(Image.open("/home/gaurav/Documents/dev/marketing-project/image.png").convert("L"), np.float64)
S_IMG = Image.open("/home/gaurav/Documents/dev/marketing-project/assets/landing-screen-bg.png").convert("L")
H, W = R.shape

RX0, RX1, RY0, RY1 = 1000, 1628, 60, 930
target = R[RY0:RY1, RX0:RX1]
t = (target - target.mean()) / (target.std() + 1e-6)
th, tw = target.shape

rows = []
for scale in np.arange(0.74, 1.20, 0.02):
    nw, nh = int(round(1536 * scale)), int(round(1024 * scale))
    B = np.asarray(S_IMG.resize((nw, nh), Image.LANCZOS), np.float64)
    P = np.pad(B, ((0, 0), (0, 0)), mode="edge")
    # pad generously so any dx/dy index is valid; use reflect-ish via edge replication
    P = np.pad(B, ((2000, 2000), (2000, 2000)), mode="edge")
    best = (1e9, None)
    for dy in range(-1400, 1401, 4):
        yoff = dy + 2000 + RY0
        if yoff < 0 or yoff + th > P.shape[0]:
            continue
        strip = P[yoff:yoff + th]
        for dx in range(-1200, 1201, 4):
            xoff = dx + 2000 + RX0
            if xoff < 0 or xoff + tw > P.shape[1]:
                continue
            sub = strip[:, xoff:xoff + tw]
            s = (sub - sub.mean()) / (sub.std() + 1e-6)
            v = -float((s * t).mean())
            if v < best[0]:
                best = (v, (round(scale, 3), dx, dy, nw, nh))
    rows.append((best[0], best[1]))
    print(f"  scale {scale:.2f}  ncc={-best[0]:.4f}  dx={best[1][1]} dy={best[1][2]} size={best[1][3]}x{best[1][4]}")

rows.sort()
print("\nBEST:", rows[0])
