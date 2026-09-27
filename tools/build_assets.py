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

# --- Crew (NPCs.png) --------------------------------------------------------
NPCS = "NPCs.png"
# Column x-ranges of each crew member's four animation frames, and the y-range of each animation row.
CREW_COLUMNS = {
    "smuggler": [(66, 140), (140, 208), (208, 272), (272, 340)],
    "medic": [(384, 446), (446, 510), (510, 574), (574, 640)],
    "merc": [(666, 734), (734, 798), (798, 862), (862, 928)],
    "trader": [(962, 1034), (1034, 1104), (1104, 1172), (1172, 1242)],
    "hacker": [(1276, 1340), (1340, 1400), (1400, 1460), (1460, 1520)],
}
CREW_ROWS = {"idle": (238, 322), "walk": (320, 408), "run": (404, 496), "talk": (492, 584),
             "interact": (580, 674), "sit": (670, 768)}
CREW_PORTRAITS = {
    "smuggler": (64, 45, 310, 236), "medic": (399, 45, 601, 236), "merc": (670, 45, 925, 236),
    "trader": (976, 45, 1233, 236), "hacker": (1287, 45, 1490, 236),
}
# Station props from the crew sheet (world scale).
CREW_PROPS = {
    "smug_crate": (17, 906, 110, 993), "smug_chest": (122, 903, 193, 972), "smug_goods": (179, 950, 278, 1000),
    "smug_box": (282, 908, 332, 955), "smug_bottles": (293, 958, 339, 1001),
    "med_cabinet": (384, 915, 434, 1001), "med_crate": (451, 907, 519, 955), "med_kit": (447, 960, 496, 1002),
    "med_gurney": (508, 964, 588, 1002), "med_monitor": (531, 905, 596, 956), "med_stool": (600, 945, 633, 1002),
    "med_iv": (612, 845, 645, 938),
    "merc_case": (673, 889, 749, 942), "merc_case2": (674, 945, 755, 1002), "merc_tripod": (760, 891, 848, 1002),
    "merc_ammo": (856, 912, 897, 963), "merc_ammo2": (903, 914, 921, 963),
    "trade_stall": (1144, 791, 1228, 899), "trade_crates": (965, 907, 1040, 999), "trade_table": (1028, 901, 1159, 1001),
    "trade_box": (1161, 957, 1196, 997), "trade_lamp": (1202, 905, 1236, 990),
    "hack_antenna": (1270, 776, 1300, 895), "hack_drone": (1401, 789, 1460, 834), "hack_terminal": (1450, 806, 1509, 912),
    "hack_server": (1394, 840, 1442, 912), "hack_rack": (1320, 916, 1367, 997), "hack_stool": (1378, 917, 1409, 1002),
    "hack_console": (1421, 930, 1510, 1001), "hack_box": (1265, 956, 1309, 1002),
}

# --- Ship interior (Tileset spaceship.png), world scale ------------------------
SHIP_PROPS = {
    "ship_console3": (768, 9, 968, 112), "ship_server": (981, 6, 1038, 103), "ship_radar": (1049, 6, 1224, 112),
    "ship_terminal": (1240, 13, 1299, 113), "ship_window": (1318, 6, 1522, 116),
    "ship_rack_a": (768, 125, 814, 244), "ship_rack_b": (824, 126, 872, 245), "ship_desk": (892, 122, 1082, 252),
    "ship_cabinet": (1096, 132, 1182, 249), "ship_server2": (1206, 122, 1257, 218), "ship_chair": (1278, 130, 1322, 210),
    "ship_desk_small": (1264, 218, 1321, 298), "ship_bunk": (1336, 130, 1518, 300), "ship_cabinet_s": (952, 268, 1013, 348),
    "ship_couch": (1028, 262, 1186, 393), "ship_locker_s": (1194, 234, 1238, 317),
    "ship_console_b": (766, 258, 934, 350), "ship_locker": (768, 352, 830, 485), "ship_bucket": (985, 358, 1026, 412),
    "ship_table": (1203, 304, 1355, 434), "ship_banner": (1373, 315, 1462, 424), "ship_poster": (1474, 322, 1518, 380),
    "ship_bed": (833, 392, 972, 485), "ship_plant": (1481, 397, 1513, 460), "ship_rug": (1040, 400, 1218, 505),
    "ship_stool": (1228, 442, 1254, 479), "ship_bin": (1266, 447, 1298, 492), "ship_dartboard": (1309, 433, 1352, 476),
    "ship_plant2": (927, 494, 969, 552), "ship_tall_locker": (1233, 509, 1285, 629),
    "ship_poster2": (1300, 494, 1320, 538), "ship_poster3": (1332, 494, 1348, 538), "ship_poster4": (1360, 486, 1406, 547),
    "ship_workbench": (766, 503, 914, 669), "ship_suit": (986, 522, 1032, 626), "ship_gunrack": (1040, 520, 1220, 632),
    "ship_cab2": (1358, 568, 1407, 618), "ship_cab3": (1422, 582, 1472, 657),
    "ship_capsule": (418, 589, 514, 771), "ship_reactor": (522, 573, 606, 722), "ship_tank": (613, 576, 708, 717),
    "ship_pipe_v": (718, 572, 748, 708), "ship_toolbox": (993, 634, 1059, 679),
    "ship_chair2": (1197, 648, 1230, 718), "ship_armchair": (1252, 643, 1301, 721), "ship_tv": (1324, 634, 1397, 720),
    "ship_crate_y": (925, 688, 988, 752), "ship_crate_g": (998, 710, 1060, 778), "ship_chair3": (1080, 673, 1118, 729),
    "ship_chair4": (1130, 651, 1176, 733), "ship_plant3": (1407, 670, 1439, 756), "ship_shelf": (1458, 677, 1518, 736),
    "ship_cockpit": (11, 577, 406, 1010), "ship_machine": (522, 733, 629, 823), "ship_ladder": (1470, 752, 1508, 857),
    "ship_vent": (769, 848, 828, 910), "ship_vent2": (768, 928, 828, 992), "ship_robot": (1440, 871, 1522, 961),
    "ship_crate_w": (912, 780, 986, 854), "ship_crate_o": (997, 788, 1062, 860),
}
PLANETS = {
    "merzlota": (56, 66, 404, 412), "krasnaya": (484, 62, 843, 412), "tikhaya": (915, 63, 1271, 415),
    "kombinat": (1355, 62, 1714, 416), "otets": (54, 453, 409, 810), "pech": (482, 453, 843, 810),
    "buran": (910, 453, 1271, 810), "sirin": (1302, 453, 1755, 809),
}

# Wall faces seen from the front (3/4 view): plain panel, and the two bevelled end pieces.
WALL_FACE_PLAIN = (445, 12, 506, 92)
WALL_FACE_END_R = (527, 12, 628, 92)
WALL_FACE_END_L = (648, 12, 740, 92)
WALL_FACE_H = 42  # px: taller than a tile, so the wall rises above the floor line

# Unarmed walk (ship): row 2 of the character sheet.
MALE_WALK_UNARMED = [(118, 125, 173, 208), (201, 125, 255, 209), (285, 125, 340, 209), (374, 125, 428, 208),
                     (466, 125, 522, 208), (561, 126, 614, 208)]
FEMALE_WALK_UNARMED = [(915, 128, 968, 210), (1001, 127, 1054, 209), (1085, 128, 1138, 210),
                       (1171, 128, 1226, 210), (1263, 128, 1316, 210), (1350, 128, 1403, 210)]

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


def recolor_trim(img: Image.Image, hue: float, sat_mul: float, body: tuple[float, float, float], desat: float) -> Image.Image:
    """Repaint the rust-red trim of a wall in another hue and grade the rest (facility themes)."""
    arr = np.array(img).astype(np.float32)
    rgb = arr[:, :, :3] / 255.0
    mx = rgb.max(axis=2)
    mn = rgb.min(axis=2)
    delta = mx - mn
    sat = np.where(mx > 0, delta / np.maximum(mx, 1e-6), 0)
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    h = np.zeros_like(mx)
    m = delta > 1e-6
    rm = m & (mx == r)
    gm = m & (mx == g) & ~rm
    bm = m & ~rm & ~gm
    h[rm] = ((g - b)[rm] / delta[rm]) % 6
    h[gm] = (b - r)[gm] / delta[gm] + 2
    h[bm] = (r - g)[bm] / delta[bm] + 4
    h *= 60
    reddish = ((h < 28) | (h > 335)) & (sat > 0.28)
    # Other pixels: desaturate and grade.
    grey = rgb.mean(axis=2, keepdims=True)
    graded = (rgb * (1 - desat) + grey * desat) * np.array(body, dtype=np.float32)
    # Trim pixels: same value, new hue.
    v = mx
    s2 = np.clip(sat * sat_mul, 0, 1)
    hh = (hue / 60.0) % 6
    c = v * s2
    x = c * (1 - np.abs(hh % 2 - 1))
    z = np.zeros_like(v)
    sector = int(hh)
    comps = [(c, x, z), (x, c, z), (z, c, x), (z, x, c), (x, z, c), (c, z, x)][sector]
    trim_rgb = np.stack([comps[0] + (v - c), comps[1] + (v - c), comps[2] + (v - c)], axis=2)
    out = np.where(reddish[:, :, None], trim_rgb, graded)
    arr[:, :, :3] = np.clip(out * 255, 0, 255)
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


# Wall palettes per facility theme: (trim hue, trim saturation, body grade, body desaturation).
WALL_VARIANTS = {
    "ice": (205, 0.45, (0.86, 0.94, 1.04), 0.55),
    "corp": (212, 0.7, (0.92, 0.97, 1.05), 0.7),
    "alien": (282, 0.8, (0.9, 0.84, 1.0), 0.5),
    "ochre": (24, 1.0, (1.04, 0.92, 0.82), 0.2),
}


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



def largest_blob(img: Image.Image) -> Image.Image:
    """Keep only the largest opaque connected region (drops labels and neighbours' edges)."""
    arr = np.array(img)
    solid = arr[:, :, 3] >= ALPHA_CUTOFF
    h, w = solid.shape
    label = np.zeros((h, w), dtype=np.int32)
    best, best_n, cur = 0, 0, 0
    for sy in range(h):
        for sx in range(w):
            if not solid[sy, sx] or label[sy, sx]:
                continue
            cur += 1
            stack = [(sy, sx)]
            label[sy, sx] = cur
            n = 0
            while stack:
                y, x = stack.pop()
                n += 1
                for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                    if 0 <= ny < h and 0 <= nx < w and solid[ny, nx] and not label[ny, nx]:
                        label[ny, nx] = cur
                        stack.append((ny, nx))
            if n > best_n:
                best, best_n = cur, n
    keep = label == best
    arr[~keep, 3] = 0
    return Image.fromarray(arr, "RGBA")


def to_pixels_fit_w(img: Image.Image, width: int) -> Image.Image:
    clean = strip_haze(img)
    h = max(1, round(clean.height * width / clean.width))
    return resample(clean, (width, h))


# Enemy factions: (head rect, body tint (r, g, b, desat), head tint or None, head scale).
ENEMY_VARIANTS = {
    "scav": (HEAD_HOOD, (1.0, 0.86, 0.7, 0.45), None, 0.72),
    "raider": ((433, 717, 480, 789), (1.02, 0.8, 0.6, 0.35), None, 0.8),
    "soldier": ((643, 718, 701, 790), (0.78, 0.92, 0.64, 0.55), (0.85, 0.95, 0.8, 0.3), 0.72),
    "security": ((198, 718, 254, 786), (0.5, 0.56, 0.72, 0.6), (0.82, 0.88, 1.0, 0.2), 0.76),
}


def hooded(body_rect: tuple[int, int, int, int], variant: str = "scav") -> Image.Image:
    """Enemy variant: the operator body re-dyed, with a faction head pasted over the helmet."""
    head_rect, body_tint, head_tint, head_scale = ENEMY_VARIANTS[variant]
    body = strip_haze(crop(CHAR, body_rect, pad=12))
    body = tint(body, body_tint[:3], desat=body_tint[3])
    head = strip_haze(crop(CHAR, head_rect, pad=0))
    if head_tint:
        head = tint(head, head_tint[:3], desat=head_tint[3])
    head = head.resize((round(head.width * head_scale), round(head.height * head_scale)), Image.BOX)
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


    # Operators, unarmed (ship)
    for op, walk in (("m", MALE_WALK_UNARMED), ("f", FEMALE_WALK_UNARMED)):
        add_anim(f"op_{op}_walk_unarmed", [place_in_cell(to_pixels(crop(CHAR, r)), CHAR_CELL, 0.4) for r in walk])

    # Crew
    for crew, cols in CREW_COLUMNS.items():
        for anim_name, (y0, y1) in CREW_ROWS.items():
            imgs = []
            for (x0, x1) in cols:
                cell = largest_blob(sheet(NPCS).crop((x0, y0, x1, y1)))
                imgs.append(place_in_cell(to_pixels(cell), CHAR_CELL, 0.4))
            add_anim(f"crew_{crew}_{anim_name}", imgs)
        frames[f"portrait_{crew}"] = to_pixels(crop(NPCS, CREW_PORTRAITS[crew], pad=0))
    for key, rect in CREW_PROPS.items():
        frames[key] = to_pixels(largest_blob(crop(NPCS, rect)))

    # Planets: small for lists, large for the navigation screen.
    for key, rect in PLANETS.items():
        frames[f"planet_{key}"] = to_pixels(crop("Planets.png", rect, pad=0), 0.25)
        frames[f"planet_{key}_big"] = to_pixels(crop("Planets.png", rect, pad=0), 0.5)

    # Ship furniture
    for key, rect in SHIP_PROPS.items():
        frames[key] = to_pixels(largest_blob(crop(TILES, rect)))

    # Wall faces (taller than a tile) and 2x2-tile floor plates
    frames["wall_face_a"] = to_pixels_fit_w(crop(TILES, WALL_FACE_PLAIN, pad=0), TILE)
    for key, (hue, sat, body, desat) in WALL_VARIANTS.items():
        frames[f"wall_face_a_{key}"] = recolor_trim(frames["wall_face_a"], hue, sat, body, desat)
    for key, rect in (("wall_face_r", WALL_FACE_END_R), ("wall_face_l", WALL_FACE_END_L)):
        full = to_pixels_fit_w(crop(TILES, rect, pad=0), round(TILE * (rect[2] - rect[0]) / (WALL_FACE_PLAIN[2] - WALL_FACE_PLAIN[0])))
        frames[key] = full
    for key, rect in FLOOR_TILES.items():
        plate = resample(strip_haze(crop(TILES, rect, pad=0)), (TILE * 2, TILE * 2))
        frames[f"{key}_2x"] = tint(plate, (0.72, 0.72, 0.74), desat=0.15)

    # Enemy factions
    for variant in ENEMY_VARIANTS:
        walk = [place_in_cell(to_pixels(hooded(r, variant)), CHAR_CELL, 0.4) for r in MALE_WALK]
        add_anim(f"{variant}_walk", walk)
        add_anim(f"{variant}_walk_flash", [silhouette(im) for im in walk])
        # Corpse: first walk frame rotated onto its side (exact 90deg keeps pixels crisp).
        corpse = trim(walk[0]).rotate(90, expand=True)
        add_anim(f"{variant}_dead", [place_in_cell(corpse, DEATH_CELL, None)])

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
