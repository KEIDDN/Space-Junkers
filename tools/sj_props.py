"""
Small storytelling props, drawn for this game: the things people left behind. A note, a
child's drawing, a clock stopped at the Blackout, a bedroll, a half-eaten meal, spent brass.
Same ASCII convention as sj_heads.py ('.' is empty). Muted, worn colours.
"""
from __future__ import annotations

from PIL import Image

INK = {
    "o": "#16130f",  # outline
    "P": "#c9bfa6", "p": "#9f957d", "q": "#6f6755",  # paper, light to shadow
    "k": "#3a3530",  # pencil
    "r": "#a8412c", "R": "#c65a3a",  # red crayon / enamel
    "b": "#4a6f9a", "y": "#d2a93a", "g": "#5f7f4a",  # crayon blue, yellow, green
    "W": "#b8b2a2", "w": "#7d786c", "c": "#4a4640",  # enamel white, grey, dark
    "G": "#8fa0a2",  # glass glint
    "B": "#b98a3e", "n": "#7a5a2a",  # brass
    "M": "#2a2c2f", "m": "#1c1d20",  # blued steel
    "T": "#5d6650", "t": "#3f4636",  # army canvas
    "S": "#8a3e22", "s": "#5e2a17",  # stew / soup
    "F": "#f2c46a", "f": "#e0822e",  # flame
    "C": "#d8d0bc",  # candle wax
}

ART: dict[str, list[str]] = {
    "deco_note": [
        "ooooooo",
        "oPPPPPo",
        "oPkkkPo",
        "oPPPPpo",
        "oPkkPpo",
        "opppqqo",
        "ooooooo",
    ],
    "deco_drawing": [
        "ooooooooooo",
        "oPPPPPPPyPo",
        "oPPbPPPyyyo",
        "oPbbbPPPyPo",
        "oPPbPPrrrPo",
        "oPPbPrPPPro",
        "oPbPbrPbPro",
        "oggggrrrrgo",
        "ooooooooooo",
    ],
    "deco_clock": [
        "...oooo...",
        "..oWWWWo..",
        ".oWWkWWwo.",
        "oWWWkWWWwo",
        "oWwWkWWGwo",
        "oWWWWWWGwo",
        "oWWWWWWwwo",
        ".oWwWWwwo.",
        "..owwwwo..",
        "...oooo...",
    ],
    "deco_bedroll": [
        "..oooooooooooooooooo..",
        ".oPPPooTTTTTTTTTTTTTo.",
        "oPPPPPoTTtTTTTtTTTTTto",
        "oPpPPPoTTTTTtTTTTTtTto",
        "oPPPPpoTtTTTTTTtTTTTto",
        "opppppotTTTtTTTTTTtTto",
        ".ooooooottttttttttttto",
        "......ooooooooooooooo.",
    ],
    "deco_plate": [
        "..ooooooo..",
        ".oWWWWWWWo.",
        "oWWSSSsWWwo",
        "oWSSsSSSwwo",
        ".owWWWWwwo.",
        "..ooooooo..",
    ],
    "deco_mug": [
        ".oooo.",
        "oWWWwoo",
        "oWssWo.o",
        "oWWWwoo",
        "owwwwo.",
        ".oooo..",
    ],
    "deco_casings": [
        "..........on",
        ".oBo.......",
        "..o...on...",
        "......oBo..",
        ".on........",
        ".........Bo",
    ],
    "deco_mag": [
        ".oo.",
        "oMMo",
        "oMmo",
        "oMmo",
        "oMmo",
        ".oMo",
        "..oo",
    ],
    "deco_candle": [
        ".F.",
        ".f.",
        "oCo",
        "oCo",
        "oCo",
        "ooo",
    ],
    "deco_photo": [
        "oooooo",
        "oWWWWo",
        "owccwo",
        "owcWwo",
        "oWWWWo",
        "oooooo",
    ],
}


def _hex(h: str) -> tuple[int, int, int, int]:
    h = h.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255


def props() -> dict[str, Image.Image]:
    out: dict[str, Image.Image] = {}
    for name, rows in ART.items():
        w = max(len(r) for r in rows)
        img = Image.new("RGBA", (w, len(rows)))
        for y, row in enumerate(rows):
            for x, ch in enumerate(row):
                if ch != ".":
                    img.putpixel((x, y), _hex(INK[ch]))
        out[name] = img
    return out
