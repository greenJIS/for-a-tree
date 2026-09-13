#!/usr/bin/env python3
"""Build src/assets/spritesheet.png and src/assets/ground.png from raw art.

Inputs  : src/assets/raw/01.png .. 16.png, src/assets/raw/ground.png
Outputs : src/assets/spritesheet.png  (2048x2048, 4x4 grid of 512px cells)
          src/assets/ground.png       (512x512, seamlessly tileable)

Frame order and the 40px margin rule come from
docs/superpowers/specs/2026-09-13-for-a-tree-loop-correction-design.md
section 11.

Run: python3 scripts/build-spritesheet.py
Requires: pillow, numpy
"""

from PIL import Image
import numpy as np

CELL = 512
SHEET = 2048
MARGIN = 40
# Max distance from a sprite's pivot to any of its content edges.
REACH = CELL // 2 - MARGIN

RAW = 'src/assets/raw'
FRAMES = [f'{i:02d}' for i in range(1, 17)]

# Frame 0 is the player mech. Its barrel skews the bounding box to the right,
# so it is centred on its alpha centroid — which the round body dominates —
# rather than on the bbox. Phaser rotates about the cell centre, so a bbox
# pivot would make the mech wobble as it tracks the mouse.
CENTROID_PIVOT = {'01'}


def content_box(img):
    """Bounding box of pixels that are neither transparent nor near-black."""
    a = np.array(img)
    mask = (a[..., 3] > 16) & (a[..., :3].max(axis=2) > 24)
    ys, xs = np.where(mask)
    if len(xs) == 0:
        raise ValueError('frame has no visible content')
    return (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)


def pivot(crop, key):
    if key not in CENTROID_PIVOT:
        return crop.width / 2, crop.height / 2
    alpha = np.array(crop)[..., 3].astype(float)
    total = alpha.sum()
    px = (alpha.sum(axis=0) * np.arange(crop.width)).sum() / total
    py = (alpha.sum(axis=1) * np.arange(crop.height)).sum() / total
    return float(px), float(py)


def build_sheet():
    sheet = Image.new('RGBA', (SHEET, SHEET), (0, 0, 0, 0))

    for index, key in enumerate(FRAMES):
        source = Image.open(f'{RAW}/{key}.png').convert('RGBA')
        crop = source.crop(content_box(source))
        px, py = pivot(crop, key)

        # Scale from the pivot's reach, not the bounding box: centring on an
        # off-centre pivot would otherwise push content past the margin.
        scale = REACH / max(px, py, crop.width - px, crop.height - py)
        crop = crop.resize(
            (max(1, round(crop.width * scale)),
             max(1, round(crop.height * scale))),
            Image.LANCZOS,
        )
        px *= scale
        py *= scale

        col, row = index % 4, index // 4
        sheet.alpha_composite(
            crop,
            (col * CELL + CELL // 2 - round(px),
             row * CELL + CELL // 2 - round(py)),
        )

    sheet.save('src/assets/spritesheet.png')
    return sheet


def build_ground(blend=0.2):
    """Force the tile seamless by wrap-blending opposite edges, then cropping.

    The generated source had a top/bottom discontinuity roughly ten times the
    typical adjacent-row variation, which reads as hard banding once tiled.
    Blending column 0 into column w-bw and cropping the merged strip leaves
    the new edges adjacent in the original, so the wrap is continuous.
    """
    g = np.array(Image.open(f'{RAW}/ground.png').convert('RGB')).astype(float)

    h, w, _ = g.shape
    bw = int(w * blend)
    ramp = np.linspace(0, 1, bw)[None, :, None]
    g[:, :bw] = g[:, :bw] * ramp + g[:, w - bw:] * (1 - ramp)
    g = g[:, :w - bw]

    h, w, _ = g.shape
    bh = int(h * blend)
    ramp = np.linspace(0, 1, bh)[:, None, None]
    g[:bh, :] = g[:bh, :] * ramp + g[h - bh:, :] * (1 - ramp)
    g = g[:h - bh, :]

    tile = Image.fromarray(g.astype(np.uint8)).resize((CELL, CELL), Image.LANCZOS)
    tile.save('src/assets/ground.png')
    return tile


def verify(sheet, tile):
    ok = True
    s = np.array(sheet)

    for i in range(16):
        col, row = i % 4, i // 4
        alpha = s[row * CELL:(row + 1) * CELL, col * CELL:(col + 1) * CELL, 3]
        ys, xs = np.where(alpha > 16)
        margin = min(xs.min(), ys.min(),
                     CELL - 1 - xs.max(), CELL - 1 - ys.max())
        if margin < MARGIN:
            print(f'  FAIL frame {i}: margin {margin}px < {MARGIN}px')
            ok = False

    straddle = sum(
        int((s[:, i * CELL - 2:i * CELL + 2, 3] > 16).sum())
        + int((s[i * CELL - 2:i * CELL + 2, :, 3] > 16).sum())
        for i in range(1, 4)
    )
    if straddle:
        print(f'  FAIL {straddle} pixels straddle cell borders')
        ok = False

    t = np.array(tile).astype(int)
    th, tw, _ = t.shape
    lr = np.abs(t[:, 0, :] - t[:, tw - 1, :]).mean()
    tb = np.abs(t[0, :, :] - t[th - 1, :, :]).mean()
    iv = np.mean([np.abs(t[:, i, :] - t[:, i + 1, :]).mean()
                  for i in range(tw // 4, 3 * tw // 4, 17)])
    ih = np.mean([np.abs(t[i, :, :] - t[i + 1, :, :]).mean()
                  for i in range(th // 4, 3 * th // 4, 17)])
    if lr / iv >= 2 or tb / ih >= 2:
        print(f'  FAIL ground seam L|R {lr / iv:.1f}x  T|B {tb / ih:.1f}x')
        ok = False

    print('OK' if ok else 'FAILED')
    return ok


if __name__ == '__main__':
    sheet = build_sheet()
    tile = build_ground()
    print(f'spritesheet.png {sheet.size}, cell {CELL}px')
    print(f'ground.png {tile.size}')
    raise SystemExit(0 if verify(sheet, tile) else 1)
