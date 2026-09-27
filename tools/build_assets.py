#!/usr/bin/env python3
"""
Space Junkers asset pipeline.

The source sheets in /Assets are painted illustrations: every sprite sits inside a
low-alpha painted haze, is not grid aligned and uses hundreds of thousands of colours.
This script cuts the sprites we need out of those sheets, removes the haze, resamples
them onto a clean pixel grid (binary alpha) and packs everything into a single
Pixi-compatible texture atlas:

    public/assets/sprites.png
    public/assets/sprites.json

The source files are never modified. Re-run after editing the manifest below:

    python3 tools/build_assets.py

Requires: Pillow, numpy.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "Assets"
OUT = ROOT / "public" / "assets"

# Painted sheets are resampled at this factor. Keeps characters at ~46px tall.
PAINT_SCALE = 0.5
ALPHA_CUTOFF = 128  # source alpha below this is painted haze, not sprite

CHAR = "Main Character.png"
TILES = "Tileset spaceship.png"

# ---------------------------------------------------------------------------
# Manifest. Rects are (x0, y0, x1, y1) in source-sheet pixels.
# ---------------------------------------------------------------------------

MALE_WALK = [(31, 228, 94, 310), (117, 228, 174, 310), (201, 228, 258, 309),
             (285, 228, 342, 311), (371, 228, 428, 310), (463, 228, 521, 310)]
MALE_DEATH = [(127, 634, 223, 684), (234, 633, 328, 684), (342, 635, 425, 682),
              (436, 635, 527, 684), (541, 633, 636, 681), (646, 645, 740, 687)]
FEMALE_WALK = [(823, 225, 877, 310), (912, 226, 969, 310), (1002, 226, 1054, 310),
               (1088, 226, 1140, 310), (1171, 225, 1227, 310), (1261, 227, 1317, 310)]
FEMALE_DEATH = [(914, 636, 1006, 686), (1024, 637, 1115, 686), (1129, 637, 1216, 683),
                (1229, 637, 1314, 682), (1329, 637, 1416, 681), (1425, 648, 1521, 686)]

HEAD_HOOD = (567, 718, 629, 792)
PORTRAIT_MALE = (114, 713, 173, 790)
PORTRAIT_FEMALE = (823, 718, 875, 799)

FX_FLASH = [(33, 947, 61, 962), (76, 947, 104, 961), (117, 947, 144, 962)]
FX_SMOKE = [(159, 940, 199, 974), (212, 933, 262, 973), (289, 938, 340, 972)]
FX_BLOOD = [(370, 949, 395, 962), (432, 945, 474, 966), (500, 926, 540, 970)]

# Tiles are resampled to exactly TILE x TILE.
TILE = 32
FLOOR_TILES = {
    "floor_a": (290, 288, 344, 358),
    "floor_b": (358, 288, 418, 358),
    "floor_c": (265, 212, 340, 270),
    "floor_plate": (445, 205, 505, 272),
    "floor_grate": (445, 390, 505, 455),
}
WALL_FACE = (445, 12, 506, 92)
WALL_TOP = (282, 228, 322, 258)  # flat centre of a plain deck panel

# Props keep PAINT_SCALE so they match character scale.
PROPS = {
    "crate_gray": (998, 710, 1060, 778),
    "crate_pale": (912, 780, 986, 854),
    "crate_green": (912, 866, 979, 936),
    "crate_orange": (925, 688, 988, 752),
    "barrel_gray": (1191, 802, 1231, 877),
    "barrel_red": (1295, 802, 1334, 876),
    "barrel_blue": (1243, 801, 1283, 876),
}

LOOT = "Loot Objects.png"
OBJECTS = "Guns/Objects.png"

# Item icons (UI scale). Keys are item ids from src/data/items.ts; the atlas frame is `item_<id>`.
# Each entry: (sheet, rect) or (sheet, rect, tint, scale). tint = (r, g, b multipliers, desaturation).
O = OBJECTS
L = LOOT
ITEM_ICONS: dict[str, tuple] = {
    # Salvage & tools
    "scrap": (L, (25, 32, 102, 118)), "pipe": (L, (302, 40, 391, 121)), "gear": (L, (689, 43, 754, 107)),
    "tape": (O, (734, 919, 818, 987)), "wires": (O, (307, 899, 385, 1000)), "ingots": (O, (28, 906, 138, 995)),
    "wrench": (O, (1426, 642, 1486, 758)), "multitool": (O, (1311, 644, 1399, 745)),
    "toolcase": (O, (1146, 637, 1290, 752)),
    # Electronics & tech
    "coil": (L, (1266, 33, 1318, 123)), "fan": (L, (1084, 33, 1159, 121)), "battery": (O, (1344, 778, 1396, 867)),
    "cable": (L, (1171, 39, 1249, 122)), "capacitor": (L, (992, 35, 1074, 118)), "circuit": (L, (1416, 32, 1509, 121)),
    "motor": (O, (514, 903, 608, 984)), "cell": (L, (1313, 235, 1348, 318)), "camera": (L, (1087, 800, 1161, 866)),
    "seccam": (L, (544, 895, 604, 968)), "pocketpc": (L, (1301, 128, 1346, 217)), "radio": (L, (334, 893, 395, 965)),
    "tablet": (L, (1132, 885, 1185, 978)), "hdd": (L, (20, 881, 107, 968)), "geiger": (L, (1014, 144, 1084, 217)),
    "diagpad": (L, (399, 885, 472, 970)), "terminal": (L, (476, 896, 529, 973)), "optic": (L, (729, 888, 797, 975)),
    "server": (L, (1275, 889, 1350, 981)), "droneeye": (L, (969, 907, 1038, 986)), "core": (L, (1097, 238, 1149, 321)),
    "ai_core": (L, (887, 898, 956, 976)),
    # Fuel & chemicals
    "fuel": (L, (24, 230, 83, 314)), "oxygen": (L, (539, 221, 576, 320)), "coolant": (L, (1426, 238, 1506, 309)),
    "reagent": (L, (425, 223, 466, 321)),
    # Minerals
    "iron_ore": (L, (104, 335, 190, 413)), "copper_ore": (L, (201, 336, 285, 413)), "gold_ore": (L, (299, 339, 375, 411)),
    "verdite": (L, (651, 337, 708, 411)), "cryo": (L, (492, 334, 555, 415)), "amethyst": (L, (720, 335, 797, 413)),
    "frost_quartz": (L, (941, 329, 1023, 413)), "ruby": (L, (568, 336, 639, 413)), "sapphire": (L, (1238, 339, 1291, 409)),
    "fire_opal": (L, (1139, 346, 1218, 409)), "iridium": (L, (1305, 349, 1363, 409)), "void": (L, (810, 329, 929, 416)),
    # Xenobiology
    "bone": (L, (25, 524, 118, 599)), "rustcap": (L, (129, 433, 202, 512)), "skull": (L, (317, 535, 387, 601)),
    "fungus": (L, (390, 430, 450, 516)), "ribcage": (L, (210, 545, 311, 592)), "hide": (L, (858, 524, 948, 607)),
    "beast_skull": (L, (131, 528, 208, 603)), "scales": (L, (1043, 533, 1147, 601)), "tusk": (L, (726, 533, 843, 600)),
    "gland": (L, (1430, 527, 1498, 608)), "egg": (L, (557, 437, 636, 515)), "specimen": (L, (1422, 417, 1502, 518)),
    # Provisions & medical loot
    "rations": (L, (27, 620, 86, 685)), "stew": (L, (178, 616, 225, 688)), "milk": (L, (488, 619, 527, 690)),
    "vodka": (L, (549, 611, 580, 694)), "cigs": (L, (1306, 641, 1334, 687)),
    "antiseptic": (L, (1358, 701, 1402, 781)), "antibiotics": (L, (721, 706, 757, 775)),
    # Valuables
    "coin": (L, (29, 805, 79, 851)), "coinroll": (L, (153, 808, 200, 870)), "compass": (L, (559, 792, 609, 873)),
    "ring": (L, (271, 800, 317, 870)), "watch": (L, (485, 801, 539, 875)), "chain": (L, (328, 795, 397, 873)),
    "emerald": (L, (751, 800, 799, 864)), "gold_bar": (L, (83, 802, 155, 870)), "jewelbox": (L, (1001, 799, 1080, 873)),
    "landscape": (L, (1272, 804, 1347, 873)), "painting": (L, (1361, 792, 1425, 876)), "chalice": (L, (819, 798, 858, 875)),
    "idol": (L, (874, 792, 933, 880)), "crown": (L, (1436, 799, 1507, 866)),
    # Documents & keys
    "orders": (L, (104, 892, 198, 969)), "datachip": (L, (192, 893, 275, 966)), "cryptdrive": (L, (264, 910, 326, 970)),
    "keycard": (L, (1362, 162, 1426, 212)),
    # Ammunition
    "ammo_9x18": (O, (1095, 180, 1142, 243)), "ammo_9x18_ap": (O, (1432, 189, 1503, 242)),
    "ammo_12buck": (O, (889, 167, 956, 242)), "ammo_12slug": (O, (1318, 180, 1401, 242)),
    "ammo_545": (O, (1175, 168, 1236, 242)), "ammo_545_ap": (O, (1261, 168, 1295, 242)),
    "ammo_762": (O, (994, 160, 1066, 243)), "ammo_762_ap": (O, (994, 160, 1066, 243), (0.75, 0.8, 0.95, 0.55)),
    # Armor
    "respcap": (O, (147, 515, 247, 618)), "k6helmet": (O, (31, 517, 124, 612)), "zaslon": (O, (275, 515, 376, 621)),
    "vest_ps2": (O, (402, 515, 511, 625), (0.95, 1.0, 0.8, 0.35)), "vest_zhuk": (O, (402, 515, 511, 625)),
    "vest_granit": (O, (537, 511, 635, 621)),
    # Backpacks (one painted pack, told apart by size and dye)
    "sack": (O, (1021, 520, 1112, 625), (1.05, 0.92, 0.72, 0.6), 0.36),
    "daypack": (O, (1021, 520, 1112, 625), None, 0.5),
    "turist": (O, (1021, 520, 1112, 625), (1.15, 0.95, 0.72, 0.3), 0.55),
    "raidpack": (O, (1021, 520, 1112, 625), (0.62, 0.64, 0.66, 0.7), 0.6),
    # Medical consumables
    "bandage": (O, (317, 404, 399, 480)), "pills": (O, (732, 404, 770, 478)), "carkit": (O, (189, 398, 277, 483)),
    "medkit": (O, (31, 397, 146, 490)), "stim": (O, (420, 396, 510, 478)), "surgkit": (O, (1334, 394, 1396, 497)),
    # Throwables
    "frag": (O, (40, 274, 111, 369)), "smoke": (O, (489, 274, 547, 374)),
}
# Weapons use their gun sprite, trimmed. Item id -> gun sheet number.
WEAPON_ICONS = {"sp5": 6, "pm9": 1, "kedr": 15, "ppd41": 11, "obrez": 22, "toz12": 23, "skv": 41,
                "akr74": 36, "vektor": 33, "mosin": 48, "svk": 49}
ICON_SCALE = 0.5

# Lootable containers (world scale: small objects are drawn smaller than characters' sheet scale).
CONTAINERS = {
    "box_olive": (320, 39, 424, 128),
    "box_dark": (181, 38, 288, 121),
    "box_red": (593, 41, 705, 130),
    "case_green": (1166, 26, 1306, 138),
    "case_red": (1343, 24, 1504, 135),
}
CONTAINER_SCALE = 0.28

# Double sliding door: the two leaves inside the framed door on the tileset.
DOOR_LEAVES = (158, 37, 231, 92)

CHAR_CELL = (48, 48)
DEATH_CELL = (56, 32)


# ---------------------------------------------------------------------------
# Image helpers
# ---------------------------------------------------------------------------

_sheet_cache: dict[str, Image.Image] = {}


def sheet(name: str) -> Image.Image:
    if name not in _sheet_cache:
        _sheet_cache[name] = Image.open(SRC / name).convert("RGBA")
    return _sheet_cache[name]


def crop(name: str, rect: tuple[int, int, int, int], pad: int = 2) -> Image.Image:
    x0, y0, x1, y1 = rect
    return sheet(name).crop((x0 - pad, y0 - pad, x1 + pad, y1 + pad))


def strip_haze(img: Image.Image) -> Image.Image:
    """Make sprite pixels fully opaque and painted haze fully transparent."""
    arr = np.array(img)
    solid = arr[:, :, 3] >= ALPHA_CUTOFF
    arr[:, :, 3] = np.where(solid, 255, 0)
    arr[~solid, :3] = 0
    return Image.fromarray(arr, "RGBA")


def resample(img: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Area-average onto the target grid (premultiplied), then binarise alpha."""
    small = img.convert("RGBa").resize(size, Image.BOX).convert("RGBA")
    arr = np.array(small)
    solid = arr[:, :, 3] >= 128
    arr[:, :, 3] = np.where(solid, 255, 0)
    arr[~solid, :3] = 0
    return Image.fromarray(arr, "RGBA")


def to_pixels(img: Image.Image, scale: float = PAINT_SCALE) -> Image.Image:
    clean = strip_haze(img)
    w = max(1, round(clean.width * scale))
    h = max(1, round(clean.height * scale))
    return trim(resample(clean, (w, h)))


def trim(img: Image.Image) -> Image.Image:
    bbox = img.getchannel("A").getbbox()
    return img.crop(bbox) if bbox else img


def tint(img: Image.Image, mul: tuple[float, float, float], desat: float) -> Image.Image:
    arr = np.array(img).astype(np.float32)
    rgb = arr[:, :, :3]
    grey = rgb.mean(axis=2, keepdims=True)
    rgb = rgb * (1 - desat) + grey * desat
    rgb *= np.array(mul, dtype=np.float32)
    arr[:, :, :3] = np.clip(rgb, 0, 255)
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


def silhouette(img: Image.Image) -> Image.Image:
    arr = np.array(img)
    arr[:, :, :3] = np.where(arr[:, :, 3:4] > 0, 255, 0)
    return Image.fromarray(arr, "RGBA")


def place_in_cell(img: Image.Image, cell: tuple[int, int], align_top_fraction: float | None) -> Image.Image:
    """
    Put a trimmed sprite into a fixed cell, feet on the bottom row.
    Horizontal alignment uses the head/torso centre (top part of the sprite) so walk
    cycles don't jitter when legs swing; pass None to centre on the bounding box.
    """
    cw, ch = cell
    a = np.array(img)[:, :, 3] > 0
    if align_top_fraction is not None:
        rows = max(1, int(img.height * align_top_fraction))
        xs = np.where(a[:rows])[1]
        ref_x = float(xs.mean()) if xs.size else img.width / 2
    else:
        ref_x = img.width / 2
    out = Image.new("RGBA", cell, (0, 0, 0, 0))
    ox = round(cw / 2 - ref_x)
    oy = ch - 1 - img.height
    out.paste(img, (ox, oy), img)  # paste clips safely if the sprite overhangs the cell
    return out


def hooded(body_rect: tuple[int, int, int, int]) -> Image.Image:
    """Scavenger variant: player body, rag-brown tint, red hood + gas mask head."""
    body = strip_haze(crop(CHAR, body_rect, pad=12))
    body = tint(body, (1.0, 0.86, 0.7), desat=0.45)
    head = strip_haze(crop(CHAR, HEAD_HOOD, pad=0))
    head = head.resize((round(head.width * 0.72), round(head.height * 0.72)), Image.BOX)
    a = np.array(body)[:, :, 3] > 0
    ys, _ = np.where(a)
    top = int(ys.min())
    head_xs = np.where(a[top:top + 25])[1]
    cx = float(head_xs.mean())
    canvas = Image.new("RGBA", body.size, (0, 0, 0, 0))
    canvas.alpha_composite(body)
    canvas.alpha_composite(head, (round(cx - head.width / 2) + 1, top - 9))
    return canvas


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

def build() -> None:
    frames: dict[str, Image.Image] = {}
    anims: dict[str, list[str]] = {}

    def add_anim(name: str, images: list[Image.Image]) -> None:
        keys = []
        for i, im in enumerate(images):
            key = f"{name}_{i}"
            frames[key] = im
            keys.append(key)
        anims[name] = keys

    # Player operators
    for op, walk, death in (("m", MALE_WALK, MALE_DEATH), ("f", FEMALE_WALK, FEMALE_DEATH)):
        add_anim(f"op_{op}_walk", [place_in_cell(to_pixels(crop(CHAR, r)), CHAR_CELL, 0.4) for r in walk])
        add_anim(f"op_{op}_death", [place_in_cell(to_pixels(crop(CHAR, r)), DEATH_CELL, None) for r in death])

    # Scavenger enemy
    scav = [place_in_cell(to_pixels(hooded(r)), CHAR_CELL, 0.4) for r in MALE_WALK]
    add_anim("scav_walk", scav)
    add_anim("scav_walk_flash", [silhouette(im) for im in scav])
    # Corpse: first walk frame rotated onto its side (exact 90deg keeps pixels crisp).
    corpse = trim(scav[0]).rotate(90, expand=True)
    add_anim("scav_dead", [place_in_cell(corpse, DEATH_CELL, None)])

    frames["portrait_m"] = to_pixels(crop(CHAR, PORTRAIT_MALE))
    frames["portrait_f"] = to_pixels(crop(CHAR, PORTRAIT_FEMALE))

    # Effects
    add_anim("fx_flash", [to_pixels(crop(CHAR, r)) for r in FX_FLASH])
    add_anim("fx_smoke", [to_pixels(crop(CHAR, r)) for r in FX_SMOKE])
    add_anim("fx_blood", [to_pixels(crop(CHAR, r)) for r in FX_BLOOD])

    # Weapons: already true pixel art, copied untouched (full frame, so grip/muzzle
    # coordinates in src/data/weapons.ts match the original files).
    for i in range(1, 51):
        frames[f"gun_{i}"] = Image.open(SRC / "Guns" / "Guns" / f"{i}.png").convert("RGBA")

    # Tiles
    # Floors are darkened so characters and effects read clearly on top of them.
    for key, rect in FLOOR_TILES.items():
        floor = resample(strip_haze(crop(TILES, rect, pad=0)), (TILE, TILE))
        frames[key] = tint(floor, (0.72, 0.72, 0.74), desat=0.15)
    frames["wall_face"] = resample(strip_haze(crop(TILES, WALL_FACE, pad=0)), (TILE, TILE))
    # Wall caps: the interior of a plain panel (no bevels), very dark. Rims are drawn at runtime.
    top = resample(strip_haze(crop(TILES, WALL_TOP, pad=0)), (TILE, TILE))
    frames["wall_top"] = tint(top, (0.42, 0.4, 0.4), desat=0.4)

    for key, rect in PROPS.items():
        frames[key] = to_pixels(crop(TILES, rect))

    for key, spec in ITEM_ICONS.items():
        sheet_name, rect = spec[0], spec[1]
        tint_spec = spec[2] if len(spec) > 2 else None
        scale = spec[3] if len(spec) > 3 else ICON_SCALE
        icon = to_pixels(crop(sheet_name, rect), scale)
        if tint_spec:
            icon = tint(icon, tint_spec[:3], desat=tint_spec[3])
        frames[f"item_{key}"] = icon
    for key, n in WEAPON_ICONS.items():
        frames[f"item_{key}"] = trim(Image.open(SRC / "Guns" / "Guns" / f"{n}.png").convert("RGBA"))
    for key, rect in CONTAINERS.items():
        frames[key] = to_pixels(crop(OBJECTS, rect), CONTAINER_SCALE)

    # Doors: leaves resampled to two tiles, split into halves; rotated copies for vertical walls.
    leaves = resample(strip_haze(crop(TILES, DOOR_LEAVES, pad=0)), (TILE * 2, TILE))
    left, right = leaves.crop((0, 0, TILE, TILE)), leaves.crop((TILE, 0, TILE * 2, TILE))
    frames["door_h_a"], frames["door_h_b"] = left, right
    frames["door_v_a"], frames["door_v_b"] = left.rotate(-90), right.rotate(-90)

    pack(frames, anims)


def pack(frames: dict[str, Image.Image], anims: dict[str, list[str]], width: int = 1024) -> None:
    """Simple shelf packer with 1px padding (prevents bleeding between frames)."""
    pad = 1
    order = sorted(frames, key=lambda k: (-frames[k].height, k))
    x = y = shelf_h = 0
    placed: dict[str, tuple[int, int]] = {}
    for key in order:
        im = frames[key]
        if x + im.width + pad > width:
            x, y, shelf_h = 0, y + shelf_h, 0
        placed[key] = (x, y)
        x += im.width + pad
        shelf_h = max(shelf_h, im.height + pad)
    height = y + shelf_h
    height = 1 << (height - 1).bit_length()  # power of two

    atlas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    meta_frames = {}
    for key, (fx, fy) in placed.items():
        im = frames[key]
        atlas.alpha_composite(im, (fx, fy))
        meta_frames[key] = {
            "frame": {"x": fx, "y": fy, "w": im.width, "h": im.height},
            "rotated": False,
            "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": im.width, "h": im.height},
            "sourceSize": {"w": im.width, "h": im.height},
        }

    OUT.mkdir(parents=True, exist_ok=True)
    atlas.save(OUT / "sprites.png", optimize=True)
    data = {
        "frames": meta_frames,
        "animations": anims,
        "meta": {"image": "sprites.png", "format": "RGBA8888", "size": {"w": width, "h": height}, "scale": "1"},
    }
    (OUT / "sprites.json").write_text(json.dumps(data, indent=1))
    print(f"atlas {width}x{height}, {len(frames)} frames, {len(anims)} animations")


if __name__ == "__main__":
    build()
