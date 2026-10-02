#!/usr/bin/env python3
"""Recover the exact background cover-crop AND the white overlay alpha from the reference."""
import numpy as np
from PIL import Image

REF = "/home/gaurav/Documents/dev/marketing-project/image.png"
SRC = "/home/gaurav/Documents/dev/marketing-project/assets/landing-screen-bg.png"

ref = Image.open(REF).convert("RGB")
src = Image.open(SRC).convert("RGB")
print("ref", ref.size, "src", src.size)

W, H = ref.size
SW, SH = src.size
R = np.asarray(ref, np.float64)

best = None
# object-fit: cover => scale = max(W/SW, H/SH); search dy offset around centered
base = max(W / SW, H / SH)
print("cover scale =", round(base, 5), "-> scaled", round(SW * base, 2), "x", round(SH * base, 2))

for dy_off in np.arange(-40, 41, 2):          # extra vertical offset px
    nw, nh = round(SW * base), round(SH * base)
    big = src.resize((nw, nh), Image.LANCZOS)
    dy = (H - nh) / 2 + dy_off
    canvas = Image.new("RGB", (W, H), (255, 255, 255))
    canvas.paste(big, (0, int(round(dy))))
    C = np.asarray(canvas, np.float64)
    # measure only in the right half where the overlay is ~0
    d = np.abs(R[:, 850:] - C[:, 850:]).mean()
    if best is None or d < best[1]:
        best = (dy_off, d)
print("best dy offset (cover-center baseline):", best)

dy_off = best[0]
nw, nh = round(SW * base), round(SH * base)
big = src.resize((nw, nh), Image.LANCZOS)
canvas = Image.new("RGB", (W, H), (255, 255, 255))
canvas.paste(big, (0, int(round((H - nh) / 2 + dy_off))))
C = np.asarray(canvas, np.float64)
print("right-half mean abs err:", round(float(np.abs(R[:, 850:] - C[:, 850:]).mean()), 3))

# Solve alpha:  R = a*255 + (1-a)*C  =>  a = (R - C) / (255 - C)
denom = 255.0 - C
with np.errstate(divide="ignore", invalid="ignore"):
    A = np.where(np.abs(denom) > 12, (R - C) / denom, np.nan)

print("\n=== overlay alpha: median per column (rows 40..930, median over 5-row bands) ===")
def med_col(x0, x1):
    return np.nanmedian(A[:, x0:x1])

for x in range(0, 1100, 25):
    print(f"  x={x:4d}  alpha={med_col(x, x+25):.3f}")
