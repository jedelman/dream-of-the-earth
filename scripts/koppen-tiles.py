#!/usr/bin/env python3
"""Cut the Köppen-Geiger 1991-2020 map (Beck et al. 2023, 0.1°) into 30° tiles.

Usage: python3 -I scripts/koppen-tiles.py <koppen_geiger_0p1.tif> <out_dir>

Input: koppen_geiger_tif.zip -> 1991_2020/koppen_geiger_0p1.tif from
https://figshare.com/articles/dataset/koppen_geiger_tif_zip/21937571
(3600 x 1800, upper-left corner at 180°W 90°N, values 0 = no data/sea, 1-30 =
classes Af..EF as in the archive's legend.txt). Output: 12 x 6 grayscale PNGs,
<col>-<row>.png, 300 x 300 px each, col = floor((lon + 180) / 30),
row = floor((90 - lat) / 30). Pixel values are the class numbers, unchanged.
"""
import sys
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
im = Image.open(src)
assert im.size == (3600, 1800), im.size
gray = Image.frombytes("L", im.size, im.tobytes())  # palette indices are the class numbers
assert max(gray.getextrema()) <= 30
for row in range(6):
    for col in range(12):
        tile = gray.crop((col * 300, row * 300, col * 300 + 300, row * 300 + 300))
        tile.save(f"{out}/{col}-{row}.png", optimize=True)
print("wrote 72 tiles")
