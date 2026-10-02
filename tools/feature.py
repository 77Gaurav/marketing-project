#!/usr/bin/env python3
"""Two-point correspondence: locate the distinctive blue ad panel in both images to solve scale+offset."""
import numpy as np
from PIL import Image

R = np.asarray(Image.open("/home/gaurav/Documents/dev/marketing-project/image.png").convert("RGB"), np.float64)
S = np.asarray(Image.open("/home/gaurav/Documents/dev/marketing-project/assets/landing-screen-bg.png").convert("RGB"), np.float64)

def blue_mask(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    return (b > 150) & (b - r > 70) & (b - g > 50)

def blobs(mask, minpix=1500):
    H, W = mask.shape
    lab = np.zeros((H, W), int)
    cur = 0
    out = []
    seen = np.zeros((H, W), bool)
    ys, xs = np.nonzero(mask)
    for y0, x0 in zip(ys, xs):
        if seen[y0, x0]:
            continue
        cur += 1
        stack = [(y0, x0)]
        seen[y0, x0] = True
        pts = []
        while stack:
            y, x = stack.pop()
            pts.append((y, x))
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < H and 0 <= nx < W and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        stack.append((ny, nx))
        if len(pts) >= minpix:
            p = np.array(pts)
            out.append({
                "n": len(pts),
                "y0": int(p[:, 0].min()), "y1": int(p[:, 0].max()),
                "x0": int(p[:, 1].min()), "x1": int(p[:, 1].max()),
                "cy": float(p[:, 0].mean()), "cx": float(p[:, 1].mean()),
            })
    return sorted(out, key=lambda d: -d["n"])

print("=== REF blue blobs ===")
for b in blobs(blue_mask(R)):
    print("  ", b)
print("=== SRC blue blobs ===")
for b in blobs(blue_mask(S)):
    print("  ", b)
