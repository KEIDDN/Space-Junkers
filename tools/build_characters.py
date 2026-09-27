#!/usr/bin/env python3
"""
Space Junkers character pipeline.

Characters move with hand-animated bodies from the Liberated Pixel Cup (LPC) and the
Universal LPC Spritesheet Character Generator (see ASSET_SOURCES.md for authors and
licenses): bodies, clothes and armour, every layer on the same 64x64 grid for the same
frames. Everything that gives a character its identity is drawn for this game in
sj_heads.py: heads and faces at adult proportions, hair, helmets, hoods, masks, scarves,
and the packs. They are placed on the neck of every LPC frame, so they move with it.

This script
  * recolours each LPC layer onto the game's palette (charcoal drab, canvas, gunmetal, rust),
  * places the drawn heads, headgear and packs on every frame,
  * builds the animations the game needs from the LPC ones, including the gun-carrying
    walk: the torso of the LPC two-handed hold over the legs of the walk and run cycles,
  * packs one texture atlas of layer "sets": a base (body, head and clothes), hair, and
    one set per piece of equipment, which the game stacks at runtime:

    public/assets/chars.png
    public/assets/chars.json

Frame names are `c:<set>:<anim>:<dir>` animations (dir 0 up, 1 left, 2 down, 3 right;
`die` has no direction). The sources in Assets/LPC are never modified.

    python3 tools/build_characters.py
    python3 tools/build_characters.py --fetch <path to a Universal-LPC checkout>

Requires: Pillow, numpy.
"""
from __future__ import annotations

import colorsys
import hashlib
import json
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sj_heads as heads  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "Assets" / "LPC"
OUT = ROOT / "public" / "assets"
FRAME = 64

# LPC animation sheets: columns per row. Rows are up, left, down, right (hurt has one row).
LPC_COLS = {"walk": 9, "run": 8, "thrust": 8, "idle": 2, "hurt": 6, "sit": 3, "spellcast": 7, "emote": 3}
LPC_ANIMS = list(LPC_COLS)
# Sheets that only come in colours: the neutral one is taken and recoloured.
VARIANTS = ["gray", "steel", "white"]

# ---------------------------------------------------------------------------
# Palette. Ramps run dark to light; recoloured layers map onto them by brightness.
# ---------------------------------------------------------------------------

RAMPS: dict[str, list[str]] = {
    "olive": ["#0e100c", "#1a1e16", "#282e22", "#384030", "#4c5641", "#657056"],
    "drab": ["#100e0b", "#1e1a15", "#2d271f", "#3f372b", "#554a3a", "#6f6350"],
    "khaki": ["#14110b", "#282218", "#403727", "#5a4f39", "#76694c", "#948764"],
    "suit": ["#0b0b0a", "#161613", "#23221e", "#32302a", "#46433a", "#5e5a4e"],
    "worker": ["#0c0e12", "#181d25", "#252d39", "#34404f", "#4a5768", "#66758a"],
    "grey": ["#0c0d0f", "#191b1e", "#282b2f", "#3a3e43", "#52575d", "#70757a"],
    "black": ["#050607", "#0c0e10", "#14171a", "#1c2024", "#262b30", "#353c42"],
    "rust": ["#160a07", "#32130b", "#53200f", "#7a3115", "#9f481d", "#c2672b"],
    "red": ["#130606", "#2b0b0b", "#48110f", "#681813", "#892217", "#aa3322"],
    "leather": ["#110b08", "#21160e", "#332216", "#47301f", "#5e412b", "#78563a"],
    "steel": ["#0a0b0d", "#181a1e", "#292c32", "#3e424a", "#5a5f67", "#80858c"],
    "olivesteel": ["#0b0d0a", "#181c15", "#272d21", "#384131", "#505b46", "#6f7a62"],
    "gunmetal": ["#08090b", "#121418", "#1d2026", "#2a2e36", "#3c414b", "#565c67"],
    "white": ["#18181a", "#36363a", "#5a5a5d", "#83827f", "#aba89f", "#cfcabd"],
    "teal": ["#061012", "#0a1d21", "#102f35", "#16454c", "#1d666b", "#2f9b9a"],
    "visor": ["#04191c", "#083039", "#0d4f5a", "#15808a", "#35b8bf", "#98eef0"],
    "amber": ["#1a0c02", "#3d1d04", "#6b3507", "#a0560d", "#d17f1c", "#f2ae45"],
    "maroon": ["#120607", "#260b0d", "#3d1114", "#56181b", "#702124", "#8e2f2e"],
    "tan": ["#16110b", "#2c2218", "#453626", "#604c35", "#7d6546", "#9c825c"],
}

# Skin and hair use the LPC artists' own ramps (exact colour-for-colour remaps).
LPC_SKIN_BASE = ["#271920", "#99423c", "#cc8665", "#e4a47c", "#f9d5ba", "#faece7"]
# Body skin (necks, hands) follows the drawn heads' tones, so a face and its hands match.
SKIN = {name: ["#1a1214", n, sh, b, hi, hi] for name, (hi, b, sh, n) in heads.SKIN.items()}
LPC_HAIR_BASE = ["#260d14", "#6a1108", "#a42600", "#bf4000", "#e55600", "#ff8a00"]
HAIR = {
    "black": ["#050404", "#0c0a0a", "#151212", "#211c1b", "#2f2927", "#403836"],
    "darkbrown": ["#0a0605", "#1a0f0a", "#2c1a10", "#402616", "#57341e", "#6e4428"],
    "brown": ["#120a07", "#2a170e", "#452716", "#5f371f", "#7b4a2a", "#955e37"],
    "grey": ["#121212", "#272727", "#414141", "#5e5e5e", "#7f7d7a", "#a19e98"],
    "raven": ["#020306", "#060b12", "#0a1520", "#0f222f", "#1a3b4b", "#2e6070"],
    "copper": ["#1a0906", "#3a130b", "#5e2412", "#80351a", "#a04a24", "#bd6331"],
}
LPC_EYE = {"#2a3c49": 0, "#5686ae": 1, "#57cee4": 2, "#293d4b": 0, "#5187b3": 1, "#50d4ec": 2}
EYES = {"brown": ["#1d1712", "#3c2c1e", "#5a4430"], "grey": ["#26282a", "#4b4f52", "#6d7275"], "dark": ["#120d0b", "#261b16", "#3a2a22"]}


def hexrgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def lum(rgb) -> float:
    r, g, b = rgb
    return 0.299 * r + 0.587 * g + 0.114 * b


# ---------------------------------------------------------------------------
# Layers. A layer is one LPC sheet folder, recoloured.
#
#   path   folder under Assets/LPC, holding <anim>.png (or <anim>/<variant>.png)
#   paint  how to recolour it:
#            {"skin": name}                   exact remap of the LPC skin ramp
#            {"hair": name}                   exact remap of the LPC hair ramp
#            {"neutral": ramp, "warm": ramp}  brightness remap by colour family
#            {"all": ramp}                    everything onto one ramp
# ---------------------------------------------------------------------------


def L(path: str, **paint) -> dict:
    return {"path": path, "paint": paint}


def body_path(kind: str) -> str:
    return f"body/bodies/{kind}"


# Most clothing is drawn for the "male" and "thin" (female) frames; the muscular body
# shares the male clothing where the LPC artists made it fit.
def fit(kind: str, male: str, thin: str | None = None, muscular: str | None = None) -> str:
    if kind == "female":
        return thin or male
    if kind == "muscular":
        return muscular or male
    return male


def base_layers(kind: str, skin: str) -> list[dict]:
    """The LPC body only: its head is replaced by a drawn one (sj_heads.py)."""
    return [L(body_path(kind), skin=skin)]


def D(*drawings: dict, skin: str = "light", hair: str = "darkbrown", **ink: str) -> dict:
    """A drawn head stack (sj_heads.py) and the tones it is inked in."""
    return {"stack": list(drawings), "pal": {**heads.tones(skin, hair), **ink}}


def pants(kind: str, ramp: str) -> dict:
    return L(fit(kind, "legs/pants/male", "legs/pants/thin", "legs/pants/muscular"), all=ramp)


def boots(kind: str, ramp: str = "black") -> dict:
    return L(fit(kind, "feet/boots/revised/male", "feet/boots/revised/thin"), all=ramp)


def shirt(kind: str, ramp: str) -> dict:
    return L(fit(kind, "torso/clothes/longsleeve/longsleeve/male", "torso/clothes/longsleeve/longsleeve/female"), all=ramp)


def gloves(kind: str, ramp: str = "black") -> dict:
    return L(fit(kind, "arms/hands/gloves/male", "arms/hands/gloves/thin"), all=ramp)


def belt(kind: str, ramp: str = "leather") -> dict:
    return L(fit(kind, "torso/waist/belt_leather/male", "torso/waist/belt_leather/female"), warm=ramp, neutral="steel")


# Jackets, coats and vests exist only for the male frame.
def jacket(ramp: str) -> dict:
    return L("torso/jacket/collared/male", all=ramp)


def trench(ramp: str) -> dict:
    return L("torso/jacket/trench/male", all=ramp)


# Every character set: which body frames it follows, which layers it stacks, which animations it needs.
HOLD = ["hold", "holdrun", "holdidle", "kneel", "die"]
UNARMED = ["walk", "idle"]
CREW = ["walk", "idle", "spellcast", "emote", "sit", "kneel"]


def operator(kind: str) -> dict:
    # A salvage operator's padded coverall: charcoal drab, gloves, a worn belt. The face
    # is drawn (sj_heads.py): Volk cropped and stubbled, Zorya with her hair knotted back
    # and the red scarf.
    if kind == "male":
        head = D(heads.BARE_SHORT, heads.STUBBLE, skin="light", hair="darkbrown")
    else:
        head = D(heads.BARE_BUN, heads.SCARF, skin="olive", hair="brown")
    return {
        "body": kind,
        "anims": HOLD + UNARMED,
        "layers": base_layers(kind, "light" if kind == "male" else "olive")
        + [pants(kind, "suit"), boots(kind), shirt(kind, "suit"), gloves(kind), belt(kind)],
        "heads": [head],
    }


SETS: dict[str, dict] = {
    # --- Operators (the player). Headgear is drawn over the face and covers the hair.
    "op_m": operator("male"),
    "op_f": operator("female"),
}

# --- Equipment: one set per item and body. The game shows the set for what is worn.
GEAR: dict[str, list[dict]] = {
    # Helmets
    "respcap": [D(heads.RESPCAP)],
    "k6helmet": [D(heads.K6)],
    "zaslon": [D(heads.ZASLON)],
    # Body armour
    "vest_ps2": [L("torso/clothes/vest/male", all="khaki")],
    "vest_zhuk": [L("torso/armour/leather/male", warm="olive", neutral="steel")],
    "vest_granit": [L("torso/armour/plate/male", neutral="steel", warm="rust"),
                    L("shoulders/pauldrons/male", all="steel")],
    # Backpacks: drawn (sj_heads.py), each a size up from the last.
    "sack": [{"pack": heads.SACK}],
    "daypack": [{"pack": heads.RD54}],
    "turist": [{"pack": heads.TURIST}],
    "raidpack": [{"pack": heads.BETA7}],
}
# The female frame has no vest: soft armour is her leather cover, plate carriers are plate.
GEAR_FEMALE: dict[str, list[dict]] = {
    "vest_ps2": [L("torso/armour/leather/female", warm="khaki", neutral="steel")],
    "vest_zhuk": [L("torso/armour/plate/female", neutral="olivesteel", warm="leather")],
    "vest_granit": [L("torso/armour/plate/female", neutral="steel", warm="rust"),
                    L("shoulders/pauldrons/thin", all="steel")],
}
GEAR_HIDES_HAIR = {"respcap", "k6helmet", "zaslon"}


def gear_layers(item: str, kind: str) -> list[dict]:
    thin = "thin" if kind == "female" else "male"
    pack = "female" if kind == "female" else "male"
    out = []
    src = GEAR_FEMALE.get(item, GEAR[item]) if kind == "female" else GEAR[item]
    for l in src:
        if "stack" in l or "pack" in l:
            continue
        path = l["path"].format(kind="female" if kind == "female" else "male", thin=thin, pack=pack)
        out.append({"path": path, "paint": l["paint"]})
    return out


for item in GEAR:
    for kind, suffix in (("male", "m"), ("female", "f")):
        drawn = [l for l in GEAR[item] if "stack" in l]
        packs = [l["pack"] for l in GEAR[item] if "pack" in l]
        SETS[f"g_{item}_{suffix}"] = {"body": kind, "anims": HOLD + UNARMED, "layers": gear_layers(item, kind),
                                      "heads": drawn, "pack": packs[0] if packs else None, "flash": True}

# --- Enemy factions: the clothes they wear under whatever armour they carry. Two looks each.
ENEMY_BASES: dict[str, dict] = {
    # Scavengers: rags, a hood, a gas mask.
    "scav_a": {"body": "male", "layers": base_layers("male", "bronze") + [
        pants("male", "drab"), boots("male", "leather"), shirt("male", "drab"), trench("leather")],
        "face": D(heads.BARE_SHORT, heads.STUBBLE, skin="bronze", hair="black"),
        "head": D(heads.HOOD, heads.GASMASK, A="#5a4f3d", a="#443b2d", b="#2f281f")},
    "scav_b": {"body": "female", "layers": base_layers("female", "light") + [
        pants("female", "drab"), boots("female", "leather"), shirt("female", "khaki"), belt("female")],
        "face": D(heads.BARE_BUN, skin="light", hair="darkbrown"),
        "head": D(heads.HOOD, heads.FACEWRAP, A="#6f6350", a="#554a3a", b="#3a3226", W="#1c1d1f", X="#2c2d30")},
    # Salvage gangs: red rags, bandanas, leather.
    "raider_a": {"body": "male", "layers": base_layers("male", "olive") + [
        pants("male", "black"), boots("male"), shirt("male", "maroon"), jacket("leather")],
        "face": D(heads.BARE_SHORT, heads.BANDANA_FACE, skin="olive", hair="black", W="#7a2117", X="#4d140e"),
        "head": D(heads.BANDANA_CAP, W="#8f2619", X="#5a170f")},
    "raider_b": {"body": "female", "layers": base_layers("female", "brown") + [
        pants("female", "black"), boots("female"), shirt("female", "red"),
        L("torso/armour/leather/female", all="black")],
        "face": D(heads.BARE_BUN, heads.BANDANA_FACE, skin="brown", hair="black", W="#7a2117", X="#4d140e"),
        "head": D(heads.BANDANA_CAP, W="#2a2a2a", X="#161616")},
    # Garrison: olive drab, a field cap with the star, an ushanka.
    "soldier_a": {"body": "male", "layers": base_layers("male", "light") + [
        pants("male", "olive"), boots("male"), shirt("male", "olive"), belt("male", "olive"), gloves("male", "olive")],
        "face": D(heads.BARE_SHORT, skin="light", hair="darkbrown"),
        "head": D(heads.PILOTKA)},
    "soldier_b": {"body": "male", "layers": base_layers("male", "bronze") + [
        pants("male", "olive"), boots("male"), jacket("olive"), belt("male", "leather"), gloves("male")],
        "face": D(heads.BARE_SHORT, heads.BEARD, skin="bronze", hair="black"),
        "head": D(heads.USHANKA)},
    # Corporate security: black, balaclavas, lit goggles.
    "security_a": {"body": "male", "layers": base_layers("male", "light") + [
        pants("male", "black"), boots("male"), shirt("male", "black"), gloves("male"), belt("male", "black")],
        "face": D(heads.BARE_SHORT, skin="light", hair="grey"),
        "head": D(heads.BALACLAVA)},
    "security_b": {"body": "female", "layers": base_layers("female", "light") + [
        pants("female", "black"), boots("female"), shirt("female", "black"), gloves("female"), belt("female", "black")],
        "face": D(heads.BARE_BUN, skin="light", hair="black"),
        "head": D(heads.BALACLAVA)},
}
for name, spec in ENEMY_BASES.items():
    SETS[f"en_{name}"] = {"body": spec["body"], "layers": spec["layers"], "heads": [spec["face"]], "anims": HOLD, "flash": True}
    # What they wear on their heads is its own sheet: a helmet replaces it.
    SETS[f"en_{name}_h"] = {"body": spec["body"], "layers": [], "heads": [spec["head"]], "anims": HOLD, "flash": True}

# --- Crew of the Lastochka. Each keeps the identity of their portrait.
CREW_SETS: dict[str, dict] = {
    # Lis: red hood, face wrapped, amber goggles, a pack of other people's goods.
    "smuggler": {"body": "male", "layers": base_layers("male", "olive") + [
        pants("male", "black"), boots("male", "leather"), shirt("male", "black"), trench("maroon"),
        gloves("male", "leather"), L("backpack/squarepack/male", all="leather")],
        "heads": [D(heads.BARE_SHORT, heads.HOOD, heads.FACEWRAP, heads.GOGGLES_SLIT, skin="olive", hair="black",
                    A="#8f2619", a="#6a1b12", b="#43110b", W="#141416", X="#232327", G="#d99a3a")]},
    # Doc: white coat over dark clothes, hair in a knot, a red belt.
    "medic": {"body": "female", "layers": base_layers("female", "light") + [
        pants("female", "black"), boots("female"), shirt("female", "black"),
        L("torso/clothes/robe/female", all="white"), belt("female", "red")],
        "heads": [D(heads.BARE_BUN, heads.COLLAR, skin="light", hair="brown", W="#1d1f22", X="#2c2f33")]},
    # Molot: bald, Black, heavy: a veteran in scarred plate and rust-red webbing, in shades.
    "merc": {"body": "muscular", "layers": base_layers("muscular", "black") + [
        pants("muscular", "black"), boots("muscular"), L("torso/aprons/suspenders/male", all="rust"),
        L("arms/armour/plate/male", neutral="gunmetal", warm="rust"), L("shoulders/bauldron/male", all="gunmetal"),
        L("shoulders/pauldrons/male", all="gunmetal"), gloves("muscular")],
        "heads": [D(heads.BARE_BALD, heads.SHADES, heads.SCARF, skin="black", hair="black")]},
    # Fedya: an old trader in a canvas hood and coat, a grey beard, round red goggles.
    "trader": {"body": "male", "layers": base_layers("male", "grey") + [
        pants("male", "drab"), boots("male", "leather"), shirt("male", "drab"), trench("khaki"),
        L("backpack/backpack/male", all="leather")],
        "heads": [D(heads.BARE_SHORT, heads.BEARD, heads.HOOD, heads.GOGGLES_ROUND, skin="grey", hair="grey",
                    A="#8c7a57", a="#6b5c40", b="#4a3f2c")]},
    # Shura: young, a dark hoodie, dark hair with a dyed streak, headphones.
    "hacker": {"body": "male", "layers": base_layers("male", "light") + [
        pants("male", "black"), boots("male"), shirt("male", "teal"), jacket("black")],
        "heads": [D(heads.BARE_MESSY, heads.HEADPHONES, skin="light", hair="raven", c="#2f9b9a")]},
}
for name, spec in CREW_SETS.items():
    SETS[f"crew_{name}"] = {**spec, "anims": CREW}

# The operator gun grip in each direction (px from the feet, frame space), used by the game.
FEET_Y = 62

# ---------------------------------------------------------------------------
# Loading and recolouring
# ---------------------------------------------------------------------------

_cache: dict[tuple[str, str], np.ndarray | None] = {}


def load(path: str, anim: str) -> np.ndarray | None:
    key = (path, anim)
    if key not in _cache:
        img = None
        for cand in [SRC / path / f"{anim}.png"] + [SRC / path / anim / f"{v}.png" for v in VARIANTS]:
            if cand.exists():
                img = np.array(Image.open(cand).convert("RGBA"))
                img[img[:, :, 3] < 128] = 0
                img[:, :, 3] = np.where(img[:, :, 3] > 0, 255, 0)
                break
        _cache[key] = img
    return _cache[key]


def family(rgb) -> str:
    r, g, b = (c / 255 for c in rgb)
    h, s, v = colorsys.rgb_to_hsv(r, g, b)
    if v < 0.16:
        return "outline"
    if s > 0.28 and (h < 0.14 or h > 0.9):
        return "warm"
    return "neutral"


def build_lut(path: str, paint: dict) -> dict[tuple, tuple]:
    """Colour lookup for one layer across all its animation sheets."""
    colours: set[tuple] = set()
    for a in LPC_ANIMS:
        img = load(path, a)
        if img is not None:
            px = img[img[:, :, 3] > 0][:, :3]
            colours.update(map(tuple, np.unique(px, axis=0)))
    lut: dict[tuple, tuple] = {}
    if "skin" in paint or "hair" in paint or "eyes" in paint:
        exact: dict[tuple, tuple] = {}
        if "skin" in paint:
            for s, t in zip(LPC_SKIN_BASE, SKIN[paint["skin"]]):
                exact[hexrgb(s)] = hexrgb(t)
        if "hair" in paint:
            for s, t in zip(LPC_HAIR_BASE, HAIR[paint["hair"]]):
                exact[hexrgb(s)] = hexrgb(t)
        if "eyes" in paint:
            for s, i in LPC_EYE.items():
                exact[hexrgb(s)] = hexrgb(EYES[paint["eyes"]][i])
        for c in colours:
            lut[c] = exact.get(c, c)
        # Anything the ramps didn't cover (eye whites, stray tones): toned down, not neon.
        for c in colours:
            if c not in exact:
                g = lum(c)
                lut[c] = tuple(int(g * 0.55 + v * 0.35) for v in c)
        if "hair" in paint and set(colours) - set(exact):
            # Hair drawn in some other ramp: map by brightness onto the target.
            ramp = [hexrgb(x) for x in HAIR[paint["hair"]]]
            others = sorted((c for c in colours if c not in exact), key=lum)
            for c in others:
                lut[c] = ramp[_rank(lum(c), others, len(ramp))]
        return lut

    groups: dict[str, list[tuple]] = {}
    if "white" in paint:
        # The brightest pixels are a lit part (a visor): one flat glow colour.
        for c in [c for c in colours if lum(c) > 235]:
            lut[c] = hexrgb(paint["white"])
            colours.discard(c)
    for c in colours:
        groups.setdefault(family(c), []).append(c)
    paint = {k: v for k, v in paint.items() if k != "white"}
    primary = paint.get("all") or paint.get("neutral") or next(iter(paint.values()))
    for fam, cols in groups.items():
        ramp_name = paint.get("all") or paint.get(fam) or (primary if fam == "outline" else paint.get("neutral", primary))
        ramp = [hexrgb(x) for x in RAMPS[ramp_name]]
        if fam == "outline" and "all" not in paint:
            for c in cols:
                lut[c] = ramp[0] if lum(c) < 18 else ramp[1]
            continue
        cols = sorted(cols, key=lum)
        for c in cols:
            lut[c] = ramp[_rank(lum(c), cols, len(ramp))]
    return lut


def _rank(l: float, cols: list[tuple], n: int) -> int:
    lo = lum(cols[0])
    hi = lum(cols[-1])
    if hi - lo < 1:
        return n // 2
    t = (l - lo) / (hi - lo)
    return max(0, min(n - 1, round(t * (n - 1))))


_luts: dict[tuple, dict] = {}
_painted: dict[tuple, np.ndarray | None] = {}


def painted(layer: dict, anim: str) -> np.ndarray | None:
    pkey = (layer["path"], json.dumps(layer["paint"], sort_keys=True), anim)
    if pkey not in _painted:
        _painted[pkey] = _paint(layer, anim)
    return _painted[pkey]


def _paint(layer: dict, anim: str) -> np.ndarray | None:
    img = load(layer["path"], anim)
    if img is None:
        return None
    key = (layer["path"], json.dumps(layer["paint"], sort_keys=True))
    if key not in _luts:
        _luts[key] = build_lut(layer["path"], layer["paint"])
    lut = _luts[key]
    out = img.copy()
    mask = out[:, :, 3] > 0
    px = out[mask][:, :3]
    uniq, inv = np.unique(px, axis=0, return_inverse=True)
    mapped = np.array([lut.get(tuple(c), tuple(c)) for c in uniq], dtype=np.uint8)
    out[mask, :3] = mapped[inv.reshape(-1)]
    return out


def cell(sheet: np.ndarray, row: int, col: int) -> np.ndarray:
    return sheet[row * FRAME:(row + 1) * FRAME, col * FRAME:(col + 1) * FRAME]


# ---------------------------------------------------------------------------
# Composite animations
# ---------------------------------------------------------------------------

BODY_GLOVES = {"male": "arms/hands/gloves/male", "muscular": "arms/hands/gloves/male", "female": "arms/hands/gloves/thin"}
# Torso/legs split (frame rows) for the gun-carrying walk. Above: the hold; below: the walk.
CUT = 44
HOLD_COL = 1  # thrust frame: both hands on the weapon, not yet lunging


def top_row(a: np.ndarray) -> int:
    ys = np.where(a[:, :, 3].max(axis=1) > 0)[0]
    return int(ys[0]) if len(ys) else 0


def dilate(m: np.ndarray, n: int = 1) -> np.ndarray:
    out = m.copy()
    for _ in range(n):
        o = out.copy()
        o[1:, :] |= out[:-1, :]
        o[:-1, :] |= out[1:, :]
        o[:, 1:] |= out[:, :-1]
        o[:, :-1] |= out[:, 1:]
        out = o
    return out


_hands: dict[tuple, np.ndarray] = {}


def hand_mask(body: str, anim: str, row: int, col: int) -> np.ndarray:
    key = (body, anim, row, col)
    if key not in _hands:
        _hands[key] = _hand_mask(body, anim, row, col)
    return _hands[key].copy()


def _hand_mask(body: str, anim: str, row: int, col: int) -> np.ndarray:
    g = load(BODY_GLOVES[body], anim)
    if g is None:
        return np.zeros((FRAME, FRAME), bool)
    return dilate(cell(g, row, col)[:, :, 3] > 0, 1)


def inpaint_rows(a: np.ndarray, holes: np.ndarray) -> np.ndarray:
    """Fill erased pixels from the nearest kept pixel in the same row (a thigh behind a hand)."""
    out = a.copy()
    solid = a[:, :, 3] > 0
    ys, xs = np.where(holes)
    for y, x in zip(ys, xs):
        left = right = None
        for d in range(1, 5):
            if left is None and x - d >= 0 and solid[y, x - d] and not holes[y, x - d]:
                left = x - d
            if right is None and x + d < FRAME and solid[y, x + d] and not holes[y, x + d]:
                right = x + d
        if left is not None and right is not None:
            src = left if x - left <= right - x else right
            out[y, x] = a[y, src]
        else:
            out[y, x] = 0
    return out


def legs_frame(layer_sheet: np.ndarray, body: str, anim: str, row: int, col: int) -> np.ndarray:
    """A walk/run frame below the waist with the swinging hand taken out."""
    f = cell(layer_sheet, row, col).copy()
    f[:CUT] = 0
    hands = hand_mask(body, anim, row, col)
    hands[:CUT] = False
    solid = f[:, :, 3] > 0
    # Holes the hand punched into this layer are filled when the layer surrounds them.
    return inpaint_rows(f, hands & (solid | _enclosed(solid)))


def _enclosed(solid: np.ndarray) -> np.ndarray:
    out = np.zeros_like(solid)
    for y in range(FRAME):
        xs = np.where(solid[y])[0]
        if len(xs) >= 2:
            out[y, xs[0]:xs[-1] + 1] = True
    return out


def torso_frame(layer_sheet: np.ndarray, body: str, row: int) -> np.ndarray:
    """The hold pose above the waist, plus the hands wherever they reach below it."""
    f = cell(layer_sheet, row, HOLD_COL).copy()
    keep = np.zeros((FRAME, FRAME), bool)
    keep[:CUT] = True
    keep |= hand_mask(body, "thrust", row, HOLD_COL)
    f[~keep] = 0
    return f


def paste(dst: np.ndarray, src: np.ndarray, dy: int = 0, dx: int = 0) -> None:
    h = FRAME
    s = src
    if dy or dx:
        s = np.zeros_like(src)
        ys0, ys1 = max(0, dy), min(h, h + dy)
        xs0, xs1 = max(0, dx), min(h, h + dx)
        s[ys0:ys1, xs0:xs1] = src[ys0 - dy:ys1 - dy, xs0 - dx:xs1 - dx]
    m = s[:, :, 3] > 0
    dst[m] = s[m]


_body_tops: dict[tuple, int] = {}


def body_top(body: str, anim: str, row: int, col: int) -> int:
    key = (body, anim, row, col)
    if key not in _body_tops:
        sheet = load(body_path(body), anim)
        if sheet is None or sheet.shape[0] < (row + 1) * FRAME or sheet.shape[1] < (col + 1) * FRAME:
            sheet, row, col = load(body_path(body), "walk"), min(row, 3), 0
        _body_tops[key] = top_row(cell(sheet, row, col))
    return _body_tops[key]


def fallback(layer: dict, body: str, anim: str, row: int, col: int) -> np.ndarray | None:
    """A layer drawn without this animation: its standing frame, carried with the body."""
    walk = painted(layer, "walk")
    if walk is None:
        return None
    r = 0 if anim == "hurt" else row
    if anim == "hurt":
        r = 2
    dy = body_top(body, anim if anim != "hurt" else "hurt", row if anim != "hurt" else 0, col) - body_top(body, "walk", r, 0)
    out = np.zeros((FRAME, FRAME, 4), np.uint8)
    paste(out, cell(walk, r, 0), dy)
    return out


def layer_cell(layer: dict, body: str, anim: str, row: int, col: int) -> np.ndarray | None:
    sheet = painted(layer, anim)
    if sheet is None:
        if anim == "hurt":
            return None  # no death frames: this piece falls away with the body (hidden)
        return fallback(layer, body, anim, row, col)
    if sheet.shape[0] < (row + 1) * FRAME or sheet.shape[1] < (col + 1) * FRAME:
        return None
    return cell(sheet, row, col)


def composite(layers: list[dict], body: str, anim: str) -> list[list[np.ndarray]]:
    """Frames [dir][i] of one game animation for a stack of layers."""
    dirs = [0] if anim == "die" else [0, 1, 2, 3]
    out: list[list[np.ndarray]] = []
    for d in dirs:
        frames: list[np.ndarray] = []
        if anim in ("hold", "holdrun", "holdidle"):
            src = {"hold": "walk", "holdrun": "run", "holdidle": "walk"}[anim]
            n = {"hold": 9, "holdrun": 8, "holdidle": 2}[anim]
            hold_top = body_top(body, "thrust", d, HOLD_COL)
            for i in range(n):
                col = 0 if anim == "holdidle" else i
                bob = body_top(body, src, d, col) - hold_top
                if anim == "holdidle":
                    bob += i  # breathing: shoulders settle a pixel
                if anim == "holdrun":
                    bob += 1  # a lower, driving carriage
                f = np.zeros((FRAME, FRAME, 4), np.uint8)
                lean = (-1 if d == 1 else 1 if d == 3 else 0) if anim == "holdrun" else 0
                for layer in layers:
                    sheet = painted(layer, src)
                    if sheet is None:
                        sheet = painted(layer, "walk")
                        lc = min(col + 1, 8) if src == "run" else col
                    else:
                        lc = col
                    if sheet is not None:
                        paste(f, legs_frame(sheet, body, src if painted(layer, src) is not None else "walk", d, lc))
                    th = painted(layer, "thrust")
                    if th is not None:
                        paste(f, torso_frame(th, body, d), bob, lean)
                frames.append(f)
        else:
            src, cols = {
                "walk": ("walk", list(range(9))),
                "idle": ("idle", [0, 1]),
                "kneel": ("sit", [1]),
                "sit": ("sit", [2]),
                "die": ("hurt", list(range(6))),
                "spellcast": ("spellcast", list(range(7))),
                "emote": ("emote", list(range(3))),
            }[anim]
            for col in cols:
                f = np.zeros((FRAME, FRAME, 4), np.uint8)
                for layer in layers:
                    c = layer_cell(layer, body, src, d, col)
                    if c is not None:
                        paste(f, c)
                frames.append(f)
        out.append(frames)
    return out


# ---------------------------------------------------------------------------
# Drawn heads
# ---------------------------------------------------------------------------

LPC_HEAD = {"male": "head/heads/human/male", "muscular": "head/heads/human/male", "female": "head/heads/human/female"}
VIEW = {0: "u", 1: "l", 2: "d", 3: "r"}
_anchors: dict[tuple, list[list[tuple | None]]] = {}
_head_masks: dict[tuple, list[list[np.ndarray]]] = {}


def head_anchors(body: str, anim: str) -> list[list[tuple | None]]:
    """Where the LPC head sits in each frame [dir][i]: (x0, x1, y0, y1), or None."""
    key = (body, anim)
    if key not in _anchors:
        out = []
        masks = []
        for fs in composite([L(LPC_HEAD[body], skin="light")], body, anim):
            row = []
            mrow = []
            for f in fs:
                ys, xs = np.where(f[:, :, 3] > 0)
                row.append((int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())) if len(ys) else None)
                mrow.append(f[:, :, 3] > 0)
            out.append(row)
            masks.append(mrow)
        _anchors[key] = out
        _head_masks[key] = masks
    return _anchors[key]


# The LPC head's chin sits this far above the bottom of its box (the neck); the drawn neck
# goes there. Sideways, the drawn head sits a pixel toward the face.
NECK_SINK = 1
SIDE_LEAN = 1


_SKIN_RGB = {hexrgb(c) for ramp in SKIN.values() for c in ramp[1:]}
COLLAR = (24, 23, 21)


def hide_neck(frame: np.ndarray, body: str, anim: str, d: int, i: int) -> None:
    """Bare skin the LPC head used to cover (the neck, the upper back in a fall) becomes collar."""
    head_anchors(body, anim)
    mask = _head_masks[(body, anim)][d][i] & (frame[:, :, 3] > 0)
    ys, xs = np.where(mask)
    for y, x in zip(ys, xs):
        if tuple(int(v) for v in frame[y, x, :3]) in _SKIN_RGB:
            frame[y, x, :3] = COLLAR


def paste_heads(frame: np.ndarray, drawn: list[dict], body: str, anim: str, d: int, i: int) -> None:
    box = head_anchors(body, anim)[d][i]
    if box is None:
        return
    x0, x1, y0, y1 = box
    view = VIEW[d]
    flip = False
    if anim == "die":
        # Falling forward: the face goes down, then only the crown shows; the last frame
        # lies with the head toward the camera.
        view = "d" if i < 4 else "u"
        flip = i == 5
    for spec in drawn:
        img = heads.stack_image(spec["stack"], view, spec["pal"])
        if flip:
            img = img[::-1]
        c = heads.CANVAS
        cx = (x0 + x1 + 1) // 2 + (SIDE_LEAN if view == "r" else -SIDE_LEAN if view == "l" else 0)
        if anim == "die" and i >= 4:
            # Lying down: centre the head on where the LPC one was.
            neck = heads.NECK_Y if not flip else heads.CANVAS_H - 1 - heads.NECK_Y
            top = (y0 + y1) // 2 - (neck - 5 if not flip else neck + 5)
        else:
            top = y1 - NECK_SINK - heads.NECK_Y
        left = cx - c // 2
        paste_at(frame, img, top, left)


def paste_at(dst: np.ndarray, src: np.ndarray, top: int, left: int) -> None:
    h, w = src.shape[:2]
    for yy in range(h):
        y = top + yy
        if not 0 <= y < FRAME:
            continue
        for xx in range(w):
            x = left + xx
            if 0 <= x < FRAME and src[yy, xx, 3]:
                dst[y, x] = src[yy, xx]


def despeckle(f: np.ndarray) -> None:
    """Drop lone pixels (strays in the source sheets, once hidden by the big LPC heads)."""
    a = f[:, :, 3] > 0
    n = np.zeros(a.shape, np.int8)
    n[1:] += a[:-1]
    n[:-1] += a[1:]
    n[:, 1:] += a[:, :-1]
    n[:, :-1] += a[:, 1:]
    f[a & (n == 0)] = 0


_head_sil: dict[str, np.ndarray] = {}


def head_silhouette(view: str) -> np.ndarray:
    """Where any bare head is, on the head canvas (packs stay behind it)."""
    if view not in _head_sil:
        v = "r" if view == "l" else view
        m = np.zeros((heads.CANVAS_H, heads.CANVAS), bool)
        for bare in (heads.BARE_SHORT, heads.BARE_BUN):
            m |= heads.stack_image([bare], v, heads.tones("light"))[:, :, 3] > 0
        _head_sil[view] = m[:, ::-1] if view == "l" else m
    return _head_sil[view]


_body_sil: dict[tuple, list[list[np.ndarray]]] = {}


def body_silhouette(body: str, anim: str, d: int, i: int) -> np.ndarray:
    key = (body, anim)
    if key not in _body_sil:
        shirt_path = fit(body, "torso/clothes/longsleeve/longsleeve/male", "torso/clothes/longsleeve/longsleeve/female")
        dirs = composite([L(body_path(body), skin="light"), L(shirt_path, all="grey")], body, anim)
        _body_sil[key] = [[f[:, :, 3] > 0 for f in fs] for fs in dirs]
    return _body_sil[key][d][i]


def clear_face(frame: np.ndarray, body: str, anim: str, d: int, i: int) -> None:
    box = head_anchors(body, anim)[d][i]
    if box is None or (anim == "die" and i >= 4):
        return
    x0, x1, y0, y1 = box
    view = VIEW[d] if anim != "die" else "d"
    cx = (x0 + x1 + 1) // 2 + (SIDE_LEAN if view == "r" else -SIDE_LEAN if view == "l" else 0)
    top = y1 - NECK_SINK - heads.NECK_Y
    left = cx - heads.CANVAS // 2
    hs = head_silhouette(view)
    for yy in range(heads.NECK_Y - 1):  # the neck itself goes under the collar
        for xx in range(hs.shape[1]):
            y, x = top + yy, left + xx
            if hs[yy, xx] and 0 <= y < FRAME and 0 <= x < FRAME:
                frame[y, x] = 0


def paste_pack(frame: np.ndarray, pack: dict, body: str, anim: str, d: int, i: int) -> None:
    """A pack on the operator's back: over the body from behind, around it from the front."""
    box = head_anchors(body, anim)[d][i]
    if box is None:
        return
    x0, x1, y0, y1 = box
    view = VIEW[d]
    flip = False
    if anim == "die":
        view = "d" if i < 4 else "u"
        flip = i == 5
    cx = (x0 + x1 + 1) // 2 + (SIDE_LEAN if view == "r" else -SIDE_LEAN if view == "l" else 0)
    neck = y1 - NECK_SINK
    img = heads.pack_image(pack, view)
    h, w = img.shape[:2]
    if view in ("u", "d"):
        left = cx - w // 2
        top = neck - pack["neck"]["u"]
    else:
        top = neck - pack["neck"]["r"]
        left = cx - pack["back"] - w + 1 if view == "r" else cx + pack["back"]
    if anim == "die" and i >= 4:
        mid = (y0 + y1) // 2
        if flip:
            img = img[::-1]
            top = mid - h - 1
        else:
            top = mid - 2
    layer = np.zeros((FRAME, FRAME, 4), np.uint8)
    paste_at(layer, img, top, left)
    # The head is always in front of the pack; from the front, so is the body.
    hs = head_silhouette(view if not (anim == "die" and i >= 4) else "u")
    if flip:
        hs = hs[::-1]
    hm = np.zeros((FRAME, FRAME), bool)
    htop = y1 - NECK_SINK - heads.NECK_Y if not (anim == "die" and i >= 4) else None
    if htop is None:
        n = heads.NECK_Y if not flip else heads.CANVAS_H - 1 - heads.NECK_Y
        htop = (y0 + y1) // 2 - (n - 5 if not flip else n + 5)
    hleft = cx - heads.CANVAS // 2
    for yy in range(hs.shape[0]):
        for xx in range(hs.shape[1]):
            if hs[yy, xx] and 0 <= htop + yy < FRAME and 0 <= hleft + xx < FRAME:
                hm[htop + yy, hleft + xx] = True
    hide = hm
    if view == "d":
        hide = hide | body_silhouette(body, anim, d, i)
    layer[hide] = 0
    if view == "d" and not (anim == "die" and i >= 4) and pack.get("straps"):
        st = heads.straps_image(pack)
        paste_at(layer, st, neck + 1, cx - st.shape[1] // 2)
    paste(frame, layer)


_frames: dict[tuple, list[list[np.ndarray]]] = {}


def frames_of(name: str, anim: str) -> list[list[np.ndarray]]:
    """All frames [dir][i] of one set's animation: its LPC layers, then its drawn heads."""
    key = (name, anim)
    if key not in _frames:
        spec = SETS[name]
        dirs = composite(spec["layers"], spec["body"], anim)
        for fs in dirs:
            for f in fs:
                despeckle(f)
        if spec.get("heads"):
            for d, fs in enumerate(dirs):
                for i, f in enumerate(fs):
                    if spec["layers"]:
                        hide_neck(f, spec["body"], anim, d, i)
                    paste_heads(f, spec["heads"], spec["body"], anim, d, i)
        if name.startswith("g_") and spec["layers"]:
            # Worn over the body, but never over the face.
            for d, fs in enumerate(dirs):
                for i, f in enumerate(fs):
                    clear_face(f, spec["body"], anim, d, i)
        if spec.get("pack"):
            for d, fs in enumerate(dirs):
                for i, f in enumerate(fs):
                    paste_pack(f, spec["pack"], spec["body"], anim, d, i)
        _frames[key] = dirs
    return _frames[key]


def flash(a: np.ndarray) -> np.ndarray:
    out = np.zeros_like(a)
    m = a[:, :, 3] > 0
    out[m] = (255, 255, 255, 255)
    return out


# ---------------------------------------------------------------------------
# Packing
# ---------------------------------------------------------------------------


def pack(frames: dict[str, np.ndarray], anims: dict[str, list[str]], width: int = 2048) -> None:
    # Trim and de-duplicate identical frames.
    rects: dict[str, tuple[int, int, int, int]] = {}
    unique: dict[str, tuple[np.ndarray, tuple[int, int]]] = {}
    alias: dict[str, str] = {}
    empty = []
    for name, a in frames.items():
        ys, xs = np.where(a[:, :, 3] > 0)
        if not len(ys):
            empty.append(name)
            a = np.zeros((1, 1, 4), np.uint8)
            off = (0, 0)
            t = a
        else:
            y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
            t = a[y0:y1, x0:x1]
            off = (int(x0), int(y0))
        h = hashlib.sha1(t.tobytes() + bytes(str(t.shape) + str(off), "ascii")).hexdigest()
        if h not in unique:
            unique[h] = (t, off)
        alias[name] = h
    order = sorted(unique, key=lambda k: -unique[k][0].shape[0])
    x = y = row_h = 0
    pos: dict[str, tuple[int, int]] = {}
    for k in order:
        t = unique[k][0]
        h, w = t.shape[:2]
        if x + w + 1 > width:
            x = 0
            y += row_h + 1
            row_h = 0
        pos[k] = (x, y)
        x += w + 1
        row_h = max(row_h, h)
    height = y + row_h + 1
    height = 1 << (height - 1).bit_length()
    atlas = np.zeros((height, width, 4), np.uint8)
    for k, (px, py) in pos.items():
        t = unique[k][0]
        atlas[py:py + t.shape[0], px:px + t.shape[1]] = t
    out_frames = {}
    for name, k in alias.items():
        t, off = unique[k]
        px, py = pos[k]
        h, w = t.shape[:2]
        out_frames[name] = {
            "frame": {"x": px, "y": py, "w": w, "h": h},
            "rotated": False,
            "trimmed": True,
            "spriteSourceSize": {"x": off[0], "y": off[1], "w": w, "h": h},
            "sourceSize": {"w": FRAME, "h": FRAME},
        }
    Image.fromarray(atlas, "RGBA").save(OUT / "chars.png", optimize=True)
    data = {
        "frames": out_frames,
        "animations": anims,
        "meta": {"image": "chars.png", "format": "RGBA8888", "size": {"w": width, "h": height}, "scale": 1},
    }
    (OUT / "chars.json").write_text(json.dumps(data, separators=(",", ":")))
    print(f"chars atlas {width}x{height}, {len(unique)} unique of {len(frames)} frames, {len(anims)} animations")


def build() -> None:
    frames: dict[str, np.ndarray] = {}
    anims: dict[str, list[str]] = {}
    for name, spec in SETS.items():
        for anim in spec["anims"]:
            dirs = frames_of(name, anim)
            for d, fs in enumerate(dirs):
                key = f"c:{name}:{anim}" + ("" if anim == "die" else f":{d}")
                names = []
                for i, f in enumerate(fs):
                    fn = f"{key}:{i}"
                    frames[fn] = f
                    names.append(fn)
                anims[key] = names
                if spec.get("flash") and anim in ("hold", "holdrun", "holdidle"):
                    wn = []
                    for i, f in enumerate(fs):
                        fn = f"{key}:w{i}"
                        frames[fn] = flash(f)
                        wn.append(fn)
                    anims[key + ":w"] = wn
    pack(frames, anims)


def still(sets: list[str], anim: str, d: int, i: int) -> np.ndarray:
    """One frame of several sets stacked (for pictures made from the sheets)."""
    out = np.zeros((FRAME, FRAME, 4), np.uint8)
    for name in sets:
        paste(out, frames_of(name, anim)[d][i])
    return out


def corpse() -> np.ndarray:
    """A body on the floor (searchable remains), trimmed."""
    f = still(["en_scav_a", "en_scav_a_h"], "die", 0, 5)
    ys, xs = np.where(f[:, :, 3] > 0)
    return f[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def used_paths() -> set[str]:
    paths = {body_path(b) for b in ("male", "female", "muscular")} | set(BODY_GLOVES.values())
    for spec in SETS.values():
        for l in spec["layers"]:
            paths.add(l["path"])
    return paths


def fetch(checkout: Path) -> None:
    """Copy the sheets this game uses out of a Universal-LPC checkout into Assets/LPC."""
    src_root = checkout / "spritesheets"
    n = 0
    for p in sorted(used_paths()):
        for a in LPC_ANIMS:
            for rel in [f"{p}/{a}.png"] + [f"{p}/{a}/{v}.png" for v in VARIANTS]:
                s = src_root / rel
                if s.exists():
                    d = SRC / rel
                    d.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copyfile(s, d)
                    n += 1
                    break
    print(f"copied {n} sheets into {SRC}")
    write_credits(checkout / "CREDITS.csv")


def write_credits(source: Path) -> None:
    """Attribution for every sheet copied (LPC licenses require crediting each artist)."""
    import csv
    rows = [[c.strip() for c in r] for r in csv.reader(source.open(encoding="utf-8")) if r]
    header, body = rows[0], rows[1:]
    by_name = {r[0]: r for r in body}
    out = [header]
    for f in sorted(p.relative_to(SRC).as_posix() for p in SRC.rglob("*.png")):
        row = by_name.get(f)
        if not row:
            # Colour variants are credited under their folder.
            folder = f.rsplit("/", 1)[0]
            row = next((r for r in body if r[0].startswith(folder + "/") or r[0].startswith(folder + ".")), None)
        if row:
            out.append([f] + row[1:])
        else:
            print("no credit found for", f)
    with (SRC / "CREDITS.csv").open("w", newline="", encoding="utf-8") as fh:
        csv.writer(fh).writerows(out)


if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "--fetch":
        fetch(Path(sys.argv[2]))
    else:
        build()
