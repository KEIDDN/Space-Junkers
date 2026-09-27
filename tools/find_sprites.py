#!/usr/bin/env python3
"""
Dev helper: find sprite bounding boxes on a painted sheet and write an annotated
preview, so manifest rects in build_assets.py don't have to be measured by hand.

    python3 tools/find_sprites.py "Guns/Objects.png" out.png [min_size] [merge_px]

Prints one line per sprite: index and rect (x0, y0, x1, y1), row-major order.
Requires Pillow, numpy and scipy (scipy is only needed for this helper).
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent


def find(sheet: str, min_size: int = 14, merge: int = 3) -> list[tuple[int, int, int, int]]:
    im = Image.open(ROOT / "Assets" / sheet).convert("RGBA")
    solid = np.array(im)[:, :, 3] >= 128
    grown = ndimage.binary_dilation(solid, iterations=merge) if merge else solid
    labels, _ = ndimage.label(grown)
    rects = []
    for sl in ndimage.find_objects(labels):
        if sl is None:
            continue
        ys, xs = sl
        # Tight box on the undilated pixels.
        sub = solid[ys, xs]
        rows = np.where(sub.any(axis=1))[0]
        cols = np.where(sub.any(axis=0))[0]
        if not rows.size:
            continue
        x0, x1 = xs.start + cols[0], xs.start + cols[-1] + 1
        y0, y1 = ys.start + rows[0], ys.start + rows[-1] + 1
        if x1 - x0 < min_size or y1 - y0 < min_size:
            continue
        rects.append((int(x0), int(y0), int(x1), int(y1)))
    # Row-major: bucket by vertical centre.
    rects.sort(key=lambda r: (round(((r[1] + r[3]) / 2) / 60), r[0]))
    return rects


def main() -> None:
    sheet = sys.argv[1]
    out = sys.argv[2]
    min_size = int(sys.argv[3]) if len(sys.argv) > 3 else 14
    merge = int(sys.argv[4]) if len(sys.argv) > 4 else 3
    rects = find(sheet, min_size, merge)
    im = Image.open(ROOT / "Assets" / sheet).convert("RGBA")
    bg = Image.new("RGBA", im.size, (30, 30, 30, 255))
    bg.alpha_composite(im)
    d = ImageDraw.Draw(bg)
    for i, r in enumerate(rects):
        d.rectangle(r, outline=(0, 255, 0, 255))
        d.text((r[0] + 1, r[1] + 1), str(i), fill=(255, 255, 0, 255))
        print(i, r)
    bg.save(out)


if __name__ == "__main__":
    main()
