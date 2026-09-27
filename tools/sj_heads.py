"""
Space Junkers heads: original pixel art for every head in the game.

The LPC bodies bring the motion (walk, run, the gun carry, the fall). The heads, hair,
helmets, hoods and masks are drawn here, for this game, at adult proportions: a head is
about 10 px across on a 30 px body, where the LPC head was 22. build_characters.py places
them on the neck of every frame.

Each drawing is ASCII, one character per pixel:
    d  facing the camera        u  facing away        r  facing right (left is mirrored)
Letters are looked up in the drawing's palette, then in BASE. '.' is empty.

A head is a stack of drawings: a bare head (face, hair), then headgear over it. Headgear is
drawn to cover every bare head, so a helmet fits whoever puts it on.
"""
from __future__ import annotations

# Shared ink. Skin and hair letters are filled from the character's tones.
BASE = {
    "o": "#0c0b0c",  # outline
    "e": "#141011",  # eyes
    "w": "#6d6a64",  # a glint in the eye (dim, never a cartoon white)
}

SKIN = {
    #          H light    S base     s shade    n deep
    "light": ["#d9b39a", "#b88a70", "#8c6150", "#5e3e36"],
    "olive": ["#cf9d77", "#ae7c58", "#83573d", "#58392a"],
    "bronze": ["#a8774f", "#8a5d3d", "#654229", "#442b1b"],
    "brown": ["#8c5c3e", "#6e4630", "#4f3122", "#342018"],
    "black": ["#6a4a3a", "#523628", "#3a261d", "#261813"],
    "grey": ["#b5a597", "#958477", "#6f6056", "#4b3f38"],
}
HAIR = {
    #            j light    h base
    "darkbrown": ["#4a3222", "#2c1d14"],
    "brown": ["#6b4630", "#46291a"],
    "black": ["#26201d", "#141011"],
    "grey": ["#8c8a86", "#5e5c59"],
    "raven": ["#1c2a33", "#0d1419"],
    "stubble": ["#3b2c26", "#2b201c"],
}


def tones(skin: str, hair: str = "darkbrown") -> dict[str, str]:
    H, S, s, n = SKIN[skin]
    j, h = HAIR[hair]
    return {"H": H, "S": S, "s": s, "n": n, "h": h, "j": j}


# ---------------------------------------------------------------------------
# Bare heads. 10 wide; the last row is the neck, which sinks into the collar.
# ---------------------------------------------------------------------------

BARE_SHORT = {  # cropped hair, a square jaw
    "d": [
        "..oooooo..",
        ".ohjjjjho.",
        "ohjhhhhhho",
        "ohHHSSSSho",
        "oHSSSSSSso",
        "oSeSSSSesn",
        "oSSSSsSSsn",
        ".oSSSSSso.",
        ".oSSnnSso.",
        "..osSSso..",
        "...osso...",
    ],
    "u": [
        "..oooooo..",
        ".ohjjjjho.",
        "ohjjhhhhho",
        "ohjhhhhhho",
        "ohhhhhhhho",
        "ohhhhhhhho",
        "oShhhhhhso",
        ".oShhhhso.",
        ".oSSSSSso.",
        "..osssso..",
        "...osso...",
    ],
    "r": [
        "..ooooo...",
        ".ohjjjho..",
        "ohjhhhhho.",
        "ohhhhHSSo.",
        "ohhhSSSSSo",
        "ohhSSSSeSo",
        "ohSSSSSSSo",
        ".oSSSSSso.",
        ".osSSSnno.",
        "..osSSoo..",
        "..osso....",
    ],
}

BARE_BUN = {  # hair pulled back into a knot
    "d": [
        "...oooo...",
        "..ojjhho..",
        ".ojjhhhho.",
        "ohjhhhhhho",
        "ohjHSSShho",
        "ohSSSSSSho",
        "ohSeSSSesn",
        "oSSSSsSSso",
        ".oSSSSSso.",
        ".oSSnnSso.",
        "..osSSso..",
        "...osso...",
    ],
    "u": [
        "...oooo...",
        "..ojjjho..",
        "..ojhhho..",
        ".oojhhoo..",
        "ohjjhhhhho",
        "ohjhhhhhho",
        "ohhhhhhhho",
        "ohhhhhhhho",
        ".ohhhhhho.",
        ".oShhhhso.",
        "..osssso..",
        "...osso...",
    ],
    "r": [
        "....ooo...",
        "ooooojho..",
        "ojhooohho.",
        "ohhjjjhho.",
        "ohhjhhHSo.",
        "ohhhhSSSSo",
        "ohhhSSSeSo",
        ".ohhSSSSSo",
        ".ohSSSSso.",
        "..osSSnno.",
        "..osSSoo..",
        "..osso....",
    ],
}

BARE_BALD = {  # shaved head, heavier jaw
    "d": [
        "..oooooo..",
        ".oHHSSSso.",
        "oHHSSSSSso",
        "oHSSSSSSsn",
        "oSSSSSSSsn",
        "oSeSSSSesn",
        "oSSSSsSSsn",
        "oSSSSSSSsn",
        ".oSnnnnso.",
        ".ossssssn.",
        "..osssso..",
    ],
    "u": [
        "..oooooo..",
        ".oHHSSSso.",
        "oHHSSSSSso",
        "oHSSSSSSsn",
        "oSSSSSSSsn",
        "oSSSSSSSsn",
        "oSSSSSSSsn",
        "osSSSSSssn",
        ".osssssso.",
        ".onssssnn.",
        "..osssso..",
    ],
    "r": [
        "..ooooo...",
        ".oSHHSSo..",
        "oSSHSSSSo.",
        "osSSSSSSSo",
        "osSSSSSSSo",
        "osSSSSSeSo",
        "osSSSSSSSo",
        "osSSSSSSso",
        ".osSSSnnno",
        ".ossssso..",
        "..osso....",
    ],
}

BARE_MESSY = {  # a tangle of dark hair, a dyed streak
    "d": [
        ".o.oooo.o.",
        "ohojjjjoho",
        "ohjjhhhhho",
        "ohjhhhcchh",
        "ohhSShhcho",
        "ohSSSSSSho",
        "ohSeSSSeso",
        "oSSSSsSSso",
        ".oSSSSSso.",
        ".oSSnnSso.",
        "..osSSso..",
        "...osso...",
    ],
    "u": [
        ".o.oooo.o.",
        "ohojjjjoho",
        "ohjjhhhhho",
        "ohjhhhcchh",
        "ohhhhhhcho",
        "ohhhhhhhho",
        "ohhhhhhhho",
        "ohhhhhhhho",
        ".ohhhhhho.",
        ".oShhhhso.",
        "..osssso..",
        "...osso...",
    ],
    "r": [
        "..o.ooo...",
        ".ohojjjo..",
        "ohjjhhhhoo",
        "ohhhhhccho",
        "ohhhhSSSco",
        "ohhhSSSSSo",
        "ohhhSSSeSo",
        ".ohSSSSSSo",
        ".ohSSSSso.",
        "..osSSnno.",
        "..osSSoo..",
        "..osso....",
    ],
}

# ---------------------------------------------------------------------------
# Headgear. 12 wide, drawn over a bare head (centred, bottoms aligned).
# ---------------------------------------------------------------------------

# K-6: pressed steel, repainted a worn pale grey with a red centre stripe. The Space
# Junkers helmet: it's on the operator in every old picture of this crew.
K6 = {
    "lift": {"d": 5, "u": 4, "r": 5},
    "pal": {"A": "#b9b4a8", "a": "#8d8981", "b": "#5f5c57", "c": "#3d3b38", "R": "#a3301f", "r": "#6b1d14",
            "V": "#16181b", "v": "#2b3136"},
    "d": [
        "...oooooo...",
        "..oAARRAao..",
        ".oAAARRaaao.",
        ".oAAaRRaabo.",
        "oAAaaRraabbo",
        "oaaaarrabbbo",
        "occccccccco.",
    ],
    "u": [
        "...oooooo...",
        "..oAARRAao..",
        ".oAAARRaaao.",
        ".oAaaRRaabo.",
        "oAaaaRraabbo",
        "oaaaarrabbbo",
        "obbbbrrbbbco",
        ".occccccco..",
    ],
    "r": [
        "...ooooo....",
        "..oRRAAAoo..",
        ".oRRAAAaaao.",
        "oRRAAaaaaabo",
        "orraaaaabbbo",
        "obbbbbbbccco",
        "..occccccco.",
        "............",
    ],
}

# Zaslon: a heavy dome and a flat armoured visor with a lit slit. You breathe loudly in it.
ZASLON = {
    "lift": {"d": 1, "u": 1, "r": 1},
    "pal": {"A": "#5a6068", "a": "#3f444b", "b": "#2b2f35", "c": "#1a1d21", "G": "#8ff0ec", "g": "#2e8f93",
            "V": "#22262b", "v": "#30353c"},
    "d": [
        "...oooooo...",
        "..oAAAAaao..",
        ".oAAaaaaabo.",
        "oAAaaaaaabbo",
        "oaoooooooobo",
        "oaoVVVVVVoco",
        "oaoGGGggvoco",
        "oaoVVVVVVoco",
        "oboovvvvooco",
        ".obbccccbco.",
        "..occcccco..",
    ],
    "u": [
        "...oooooo...",
        "..oAAAAaao..",
        ".oAAaaaaabo.",
        "oAAaaaaaabbo",
        "oaaaaaaabbbo",
        "oaaaaaabbbco",
        "oabbbbbbbcco",
        "obbbbbbbccco",
        "obccccccccco",
        ".occcccccco.",
        "..oooooooo..",
    ],
    "r": [
        "...ooooo....",
        "..oAAAAaoo..",
        ".oAAaaaaaao.",
        "oAaaaaaaoooo",
        "oaaaaaaoVVVo",
        "oaaaaaaoGGgo",
        "oabbbbboVVvo",
        "obbbbbbooovo",
        "obccccccccbo",
        ".occcccccco.",
        "..oooooooo..",
    ],
}

# Padded cap and respirator: quilted canvas, ear flaps, a filter on the mouth.
RESPCAP = {
    "lift": {"d": 0, "u": 1, "r": 0},
    "pal": {"A": "#8e8266", "a": "#6c624b", "b": "#4b4434", "c": "#2e2a21", "M": "#565a5d", "m": "#3a3d40",
            "F": "#787c7e", "f": "#23262a"},
    "d": [
        "............",
        "...oooooo...",
        "..oAAbAAao..",
        ".oAAaAbaaao.",
        ".oabbbbbbbo.",
        ".oao....oao.",
        ".oao....obo.",
        ".oaoMMMMobo.",
        ".obMMFFMmbo.",
        "..omFffFmo..",
        "...oFFFFo...",
        "....oooo....",
    ],
    "u": [
        "............",
        "...oooooo...",
        "..oAAbAAao..",
        ".oAAaAbaaao.",
        ".oaaabaaabo.",
        ".oaaaabaabo.",
        ".oabbbbbbbo.",
        ".oaboooobbo.",
        ".obo....obo.",
        "..o......o..",
        "............",
        "............",
    ],
    "r": [
        "............",
        "...ooooo....",
        "..oAAbAAo...",
        ".oAAAbaaao..",
        ".obbbbbbbo..",
        ".oaab...o...",
        ".oaab.......",
        ".obbo..MMo..",
        "..oo.MMMFFo.",
        ".....oMmFffo",
        "......oMFFo.",
        ".......ooo..",
    ],
}


# ---------------------------------------------------------------------------
# Face pieces: 10 wide, on the bare head's grid. `lift` is how far the drawing's bottom row
# sits above the neck (the eyes are at lift 5 on every bare head).
# ---------------------------------------------------------------------------

STUBBLE = {
    "lift": {"d": 1, "u": 1, "r": 1},
    "pal": {"k": "#6b5249"},
    "d": [
        ".k......k.",
        ".kk....kk.",
        "..kk..kk..",
        "...kkkk...",
    ],
    "u": ["..........", "..........", "..........", ".........."],
    "r": [
        "......k...",
        "......kk..",
        "....kk....",
        "...k......",
    ],
}

BEARD = {
    "lift": {"d": 0, "u": 1, "r": 0},
    "d": [
        "oj......jo",
        "ohj....jho",
        "ohhjSSjhho",
        ".ohjnnjho.",
        "..ohhhho..",
        "...oooo...",
    ],
    "u": [
        "o........o",
        "oh......ho",
        ".o......o.",
    ],
    "r": [
        "..oj......",
        "..ohj..j..",
        "..ohhjjhjo",
        "...ohhhhho",
        "....ohhho.",
        ".....ooo..",
    ],
}

SHADES = {
    "lift": {"d": 5, "u": 5, "r": 5},
    "pal": {"K": "#0e0f11", "G": "#5b6770"},
    "d": [
        ".oooooooo.",
        ".oGKooKKo.",
    ],
    "u": [
        "o........o",
        "o........o",
    ],
    "r": [
        "....oooooo",
        "......oGKo",
    ],
}

GOGGLES_ROUND = {  # Fedya's welding goggles, red glass
    "lift": {"d": 5, "u": 5, "r": 5},
    "pal": {"R": "#b8452a", "r": "#6e2416"},
    "d": [
        ".oo....oo.",
        "oRro..oRro",
        ".oo....oo.",
    ],
    "u": [
        "..........",
        "oooooooooo",
        "..........",
    ],
    "r": [
        "........oo",
        "oooooooRro",
        "........oo",
    ],
}

GOGGLES_SLIT = {  # Lis: a narrow amber visor over the wrap
    "lift": {"d": 5, "u": 5, "r": 5},
    "pal": {"G": "#d99a3a", "g": "#7a4c14"},
    "d": [
        ".oooooooo.",
        ".oGGggGGo.",
        ".oooooooo.",
    ],
    "u": [
        "..........",
        "oooooooooo",
        "..........",
    ],
    "r": [
        ".....ooooo",
        "oooooogGGo",
        ".....ooooo",
    ],
}

GASMASK = {  # a GP-5: grey rubber over the whole head, two round eyes, a filter
    "lift": {"d": 0, "u": 0, "r": 0},
    "pal": {"M": "#4c5052", "m": "#353839", "n": "#26292a", "g": "#172022", "G": "#6f8a8a",
            "F": "#62676a", "f": "#2b2e31"},
    "d": [
        "..oooooo..",
        ".oMMMMMmo.",
        "oMMMMMMmmo",
        "oMMMMMmmmo",
        "oMooMMoomo",
        "oogGomgGoo",
        "oogggoggoo",
        "oMooMmoomo",
        ".oMmoomno.",
        "..ooFFoo..",
        "..oFffFo..",
        "...oooo...",
    ],
    "u": [
        "..oooooo..",
        ".oMMMMMmo.",
        "oMMMMMMmmo",
        "oMMMMMmmmo",
        "oMMMMMmmmo",
        "oMMMMmmmno",
        "ommmmmmnno",
        "ommmmmmnno",
        ".ommmmnno.",
        "..onnnno..",
        "...oooo...",
    ],
    "r": [
        "..ooooo...",
        ".oMMMMMo..",
        "oMMMMMMmo.",
        "oMMMMMMMo.",
        "omMMMMooo.",
        "omMMMogGo.",
        "omMMMoggo.",
        "ommMMMooMo",
        ".ommMMMoFo",
        "..onmmoFfo",
        "...oooooFo",
        ".......oo.",
    ],
}

FACEWRAP = {  # cloth wound over nose and mouth
    "lift": {"d": 0, "u": 1, "r": 0},
    "pal": {"W": "#1c1d1f", "X": "#2c2d30"},
    "d": [
        "oWWWWWWWWo",
        "oWXXWWWXWo",
        "oWWWXXWWWo",
        ".oWWWWWXo.",
        "..oXWWWo..",
        "...oWWo...",
    ],
    "u": [
        "oWWWWWWWWo",
        ".oWXWWXWo.",
        "..oooooo..",
    ],
    "r": [
        "...oWWWWWo",
        "..oWXWWXWo",
        "..oWWWXWWo",
        "...oWWWWo.",
        "...oXWWo..",
        "...oWWo...",
    ],
}

BANDANA_FACE = {  # a rag tied over the lower face, point hanging
    "lift": {"d": -1, "u": 1, "r": -1},
    "d": [
        "oWWWWWWWWo",
        "oWWXWWWWXo",
        "oXWWWWWXWo",
        ".oWWWWWWo.",
        "..oWWXWo..",
        "...oWWo...",
        "....oo....",
    ],
    "u": [
        "oWWWWWWWWo",
        ".oWXooXWo.",
        "...oWo....",
    ],
    "r": [
        "...oWWWWWo",
        "..oWWXWWXo",
        "..oXWWWWWo",
        "...oWWWWo.",
        "...oWWWo..",
        "...oWWo...",
        "....oo....",
    ],
}

# ---------------------------------------------------------------------------
# Headgear. 12 wide, over any bare head.
# ---------------------------------------------------------------------------

HOOD = {  # a canvas cowl: covers crown, sides and neck, the face looks out
    "lift": {"d": 0, "u": 0, "r": 0},
    "d": [
        "...oooooo...",
        "..oAAAAAao..",
        ".oAAAaaaaao.",
        ".oAAoooooabo",
        "oAAo......bo",
        "oAo.......bo",
        "oAo.......bo",
        "oao.......bo",
        "oao.......bo",
        "oabo.....obo",
        "oabbo...obbo",
        ".oabbooobbo.",
    ],
    "u": [
        "...oooooo...",
        "..oAAAAAao..",
        ".oAAAAaaaao.",
        ".oAAAaaaaabo",
        "oAAAaaaaaabo",
        "oAAaaaaaabbo",
        "oAaaaaaabbbo",
        "oaaaaaaabbbo",
        "oaaaaaabbbbo",
        "oaaaabbbbbbo",
        "oabbbbbbbbbo",
        ".oobbbbbbbo.",
    ],
    "r": [
        "...ooooo....",
        "..oAAAAAoo..",
        ".oAAAAaaaao.",
        ".oAAAaaaaoo.",
        "oAAAaaaao...",
        "oAAaaaaao...",
        "oAaaaaaao...",
        "oaaaaaaao...",
        "oaaaaaabo...",
        "oaaaabbbo...",
        "oabbbbbbbo..",
        ".oobbbbbbo..",
    ],
}

BANDANA_CAP = {  # a rag knotted over the crown, tails at the back
    "lift": {"d": 7, "u": 5, "r": 6},
    "d": [
        "...oooooo...",
        "..oWWWWWWo..",
        ".oWWXWWWWXo.",
        ".oXXXXXXXXo.",
        "..oooooooo..",
    ],
    "u": [
        "...oooooo...",
        "..oWWWWWWo..",
        ".oWWWWXWWWo.",
        ".oXXXXWXXXo.",
        "..ooooWXoo..",
        ".....oWXo...",
        ".....oXo....",
    ],
    "r": [
        "...ooooo....",
        "..oWWWWWo...",
        ".oWWWXWWWo..",
        "oWXXXXXXXXo.",
        "oWXoooooooo.",
        "oXo.........",
    ],
}

PILOTKA = {  # the garrison side cap, star on the front
    "lift": {"d": 8, "u": 8, "r": 8},
    "pal": {"A": "#5c6649", "a": "#454d37", "b": "#2f3526", "R": "#c0412a"},
    "d": [
        "...oooooo...",
        "..oAAAAAao..",
        ".oAAAARAaao.",
        ".oaaaaaaabo.",
        "..oooooooo..",
    ],
    "u": [
        "...oooooo...",
        "..oAAAAAao..",
        ".oAAAAaaaao.",
        ".oaaaaaaabo.",
        "..oooooooo..",
    ],
    "r": [
        "............",
        "..ooooooo...",
        ".oAAAAAAAo..",
        "oRaaaaaaabo.",
        ".ooooooooo..",
    ],
}

USHANKA = {  # fur flaps down, olive crown, the star on the front flap
    "lift": {"d": 3, "u": 3, "r": 3},
    "pal": {"A": "#56604a", "a": "#414836", "F": "#6b6558", "f": "#4a4539", "R": "#c0412a"},
    "d": [
        "...oooooo...",
        "..oAAAAAao..",
        ".oFFFFRFFFo.",
        "oFFFFFFFFFfo",
        "oFfffffffffo",
        "oFfo....offo",
        "oFfo....offo",
        "oFfo....offo",
        ".oFo....ofo.",
        ".oo......oo.",
    ],
    "u": [
        "...oooooo...",
        "..oAAAAAao..",
        ".oAAAAaaaao.",
        "oFFFFFFFFFfo",
        "oFfffffffffo",
        "oFfffffffffo",
        "oFfffffffffo",
        "oFfo....offo",
        ".oFo....ofo.",
        ".oo......oo.",
    ],
    "r": [
        "...ooooo....",
        "..oAAAAAo...",
        ".oFFFFFFFRo.",
        "oFFFFFFFFFFo",
        "offfffffffo.",
        "oFfFFFfo....",
        "oFffffFo....",
        "oFfffffo....",
        ".oFfffo.....",
        "..oooo......",
    ],
}

BALACLAVA = {  # knitted black, lit goggles
    "lift": {"d": 0, "u": 0, "r": 0},
    "pal": {"K": "#1b1d20", "k": "#2a2d31", "G": "#8ff0ec", "g": "#2e8f93"},
    "d": [
        "...oooooo...",
        "..okKKKKKo..",
        ".okKKKKKKKo.",
        ".okKKKKKKKo.",
        ".oKKKKKKKKo.",
        ".oooooooooo.",
        ".oGGgoogGGo.",
        ".oooooooooo.",
        ".oKKKKKKKKo.",
        "..oKKKKKKo..",
        "...oKKKKo...",
        "...oKKKKo...",
    ],
    "u": [
        "...oooooo...",
        "..okKKKKKo..",
        ".okKKKKKKKo.",
        ".okKKKKKKKo.",
        ".okKKKKKKKo.",
        ".oooooooooo.",
        ".okKKKKKKKo.",
        ".oKKKKKKKKo.",
        ".oKKKKKKKKo.",
        "..oKKKKKKo..",
        "...oKKKKo...",
        "...oKKKKo...",
    ],
    "r": [
        "...ooooo....",
        "..okKKKKo...",
        ".okKKKKKKo..",
        ".okKKKKKKKo.",
        ".okKKKKKKKo.",
        ".oooooooooo.",
        ".okKKKoGGgo.",
        ".okKKKKooooo",
        ".oKKKKKKKKo.",
        "..oKKKKKKo..",
        "...oKKKKo...",
        "...oKKKo....",
    ],
}

HEADPHONES = {  # Shura never takes them off
    "lift": {"d": 4, "u": 4, "r": 4},
    "pal": {"K": "#15171a", "C": "#2f9b9a", "c": "#1d666b"},
    "d": [
        "....oooo....",
        "...oKKKKo...",
        "..oK....Ko..",
        ".oK......Ko.",
        ".oK......Ko.",
        "oCCo....oCco",
        "oCco....occo",
        ".oo......oo.",
    ],
    "u": [
        "....oooo....",
        "...oKKKKo...",
        "..oK....Ko..",
        ".oK......Ko.",
        ".oK......Ko.",
        "oCCo....oCco",
        "oCco....occo",
        ".oo......oo.",
    ],
    "r": [
        "............",
        "....oooo....",
        "...oKKKKo...",
        "...oK..oK...",
        "..oCCo..K...",
        "..oCCco.....",
        "..oCcco.....",
        "...ooo......",
    ],
}

SCARF = {  # knotted at the throat, hanging over the collar
    "lift": {"d": -3, "u": -3, "r": -3},
    "pal": {"R": "#9b2a1c", "r": "#65180f", "q": "#b8412a"},
    "d": [
        "..oRRqRRRo..",
        ".oRRRRRrRRo.",
        ".orRRRRRrro.",
        "..oorRRroo..",
        "....oRro....",
        "....orro....",
    ],
    "u": [
        "..oRRRRRRo..",
        ".oRRRRRRrro.",
        ".orrRRRRrro.",
        "..oooooooo..",
        "............",
        "............",
    ],
    "r": [
        "...oRRRRRo..",
        "..oRRRRRRqo.",
        "..orRRRRRRo.",
        "...oorRRRo..",
        "......oRro..",
        "......oro...",
    ],
}

COLLAR = {  # Doc's high black collar
    "lift": {"d": -2, "u": -2, "r": -2},
    "d": [
        ".oWWo..oWWo.",
        ".oWXWooWXWo.",
        ".oWWXWWXWWo.",
        "..oooooooo..",
    ],
    "u": [
        ".oWWWWWWWWo.",
        ".oWXWWWWXWo.",
        ".oWWWWWWWWo.",
        "..oooooooo..",
    ],
    "r": [
        "..oWWWWWo...",
        "..oWXWWWWo..",
        "..oWWWWXWo..",
        "...oooooo...",
    ],
}

# ---------------------------------------------------------------------------
# Composition
# ---------------------------------------------------------------------------

CANVAS = 18  # a head stack is drawn on an 18 px wide canvas...
CANVAS_H = 22  # ...22 tall, the neck on row NECK_Y (scarves and collars hang below it)
NECK_Y = 17
_NECK_Y = NECK_Y


def _hex(h: str) -> tuple[int, int, int, int]:
    h = h.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255


def _rows(drawing: dict, view: str) -> list[str]:
    if view == "l":
        return [r[::-1] for r in drawing["r"]]
    return drawing[view]


def stack_image(stack: list[dict], view: str, pal: dict[str, str]):
    """Draw a head stack facing `view` ('d', 'u', 'r', 'l'). Returns an RGBA numpy array."""
    import numpy as np

    out = np.zeros((CANVAS_H, CANVAS, 4), np.uint8)
    for drawing in stack:
        rows = _rows(drawing, view)
        colours = {**BASE, **pal, **drawing.get("pal", {})}
        lift = drawing.get("lift", {}).get("r" if view == "l" else view, 0)
        dx = drawing.get("dx", {}).get("r" if view == "l" else view, 0)
        if view == "l":
            dx = -dx
        w = len(rows[0])
        left = CANVAS // 2 - w // 2 + dx
        top = _NECK_Y - lift - (len(rows) - 1)
        for y, row in enumerate(rows):
            for x, ch in enumerate(row):
                if ch == ".":
                    continue
                if ch == "_":  # erase: headgear that cuts away what's under it
                    out[top + y, left + x] = 0
                    continue
                out[top + y, left + x] = _hex(colours[ch])
    return out


# ---------------------------------------------------------------------------
# Packs. Drawn from behind ('u') and from the side ('r'); from the front only what shows
# around the body is kept, plus the straps. `neck` is the drawing's row level with the
# neck; `back` is how far the side view sits behind the neck's centre.
# ---------------------------------------------------------------------------

SACK = {  # veshmeshok: a canvas sack on a drawstring, slung low
    "neck": {"u": -2, "r": -2},
    "back": 3,
    "pal": {"A": "#8e8266", "a": "#6c624b", "b": "#4b4434", "K": "#2e2a21"},
    "u": [
        "....ooo....",
        "...oKAKo...",
        "..oAAAaao..",
        ".oAAAAAaao.",
        "oAAAAAAaabo",
        "oAAAAAaaabo",
        "oAAAAaaabbo",
        "oaAAaaabbbo",
        ".oaaabbbbo.",
        "..ooooooo..",
    ],
    "r": [
        "..oo..",
        ".oKAo.",
        "oAAAo.",
        "oAAaao",
        "oAAaao",
        "oAaabo",
        "oaaabo",
        "oaabbo",
        ".obbo.",
        "..oo..",
    ],
    "straps": [
        "......oo..",
        ".......Ko.",
        "........K.",
    ],
}

RD54 = {  # paratrooper daypack: compact, olive, side pouches
    "neck": {"u": 0, "r": 0},
    "back": 3,
    "pal": {"A": "#5c6649", "a": "#454d37", "b": "#2f3526", "K": "#1e2219", "s": "#8a8d86",
            "P": "#4f5840"},
    "u": [
        "..oooooooo..",
        ".oAAAAAAaao.",
        ".oKKKKKKKKo.",
        "ooAAAAsAaaoo",
        "oPoAAAsAaoPo",
        "oPoAAAAAaoPo",
        "oPoAAAAaaoPo",
        "oPoAAAaaboPo",
        "oooaaaabbooo",
        ".oaabbbbbbo.",
        "..oooooooo..",
    ],
    "r": [
        "oo.....",
        "oAoo...",
        "oKAAo..",
        "oAAAao.",
        "oPAAao.",
        "oPAAao.",
        "oPAaao.",
        "oPabbo.",
        "oaabbo.",
        ".ooooo.",
    ],
    "straps": [
        ".oo....oo.",
        ".oK....Ko.",
        ".oK....Ko.",
        "..s....s..",
    ],
}

TURIST = {  # expedition rucksack: tall canvas, a bedroll strapped on top
    "neck": {"u": 5, "r": 5},
    "back": 4,
    "pal": {"A": "#9c825c", "a": "#7d6546", "b": "#604c35", "K": "#3a2e20", "s": "#8a8d86",
            "P": "#8a7250", "R": "#5d6650", "r": "#3f4636"},
    "u": [
        "..ooooooooo..",
        ".oRRRRRRRRRo.",
        "oRRrRRRRrRRro",
        ".oorrrrrrroo.",
        "..oAAAAAAAo..",
        ".oAAAAAAAaao.",
        ".oKKKKKKKKKo.",
        ".oAAAAsAAaao.",
        ".oAAAAsAAaao.",
        "oPoAAAAAaaoPo",
        "oPoAAAAAaaoPo",
        "oPoAAAAaaboPo",
        "oPoAAAaaaboPo",
        "oooaaaabbbooo",
        ".oaabbbbbbbo.",
        "..ooooooooo..",
    ],
    "r": [
        "ooooo...",
        "oRRRo...",
        "orRRro..",
        ".ooooo..",
        "oAAAAo..",
        "oKAAAao.",
        "oAAAAao.",
        "oAAAAao.",
        "oPAAAao.",
        "oPAAAao.",
        "oPAAaao.",
        "oPAaaao.",
        "oaaaabo.",
        "oaaabbo.",
        ".oooooo.",
    ],
    "straps": [
        ".oo....oo.",
        ".oK....Ko.",
        ".oK....Ko.",
        ".oK....Ko.",
        "..s....s..",
    ],
}

BETA7 = {  # military cargo frame: steel rails, a big drab load, rust-red tabs
    "neck": {"u": 11, "r": 11},
    "back": 4,
    "pal": {"A": "#4d5640", "a": "#3a4131", "b": "#282d22", "K": "#1a1d16", "s": "#8a8d86",
            "P": "#434b37", "F": "#6f7479", "f": "#4a4e53", "R": "#8a2b1b"},
    "u": [
        ".oo.........oo.",
        ".oFo.......oFo.",
        ".oFooooooooofo.",
        ".oFFFFFFFFFFfo.",
        ".oFoAAAAAAAofo.",
        ".oFAAAAAAAAafo.",
        "ooFKKKKRKKKKfoo",
        "oPoAAAAsAAAaoPo",
        "oPoAAAAsAAAaoPo",
        "oPoAAAAAAAaaoPo",
        "oPoAAAAAAAaaoPo",
        "oPoKKKKKKKKKoPo",
        "oPoAAAAAAaaaoPo",
        "oPoAAAAAaaaboPo",
        "oooAAAAaaabbooo",
        ".oFaaaaabbbbfo.",
        ".oFbbbbbbbbbfo.",
        ".oooooooooooo..",
    ],
    "r": [
        "......oo.",
        ".....oFo.",
        ".....oFo.",
        "..ooooFo.",
        ".oAAAoFo.",
        "oAAAAoFo.",
        "oKKRKoFo.",
        "oAAAAaFo.",
        "oPAAAaFo.",
        "oPAAAaFo.",
        "oPAAaaFo.",
        "oKKKKKFo.",
        "oPAAaaFo.",
        "oPAaaaFo.",
        "oaaabbFo.",
        "oabbbbFo.",
        ".ooooooo.",
    ],
    "straps": [
        ".oo....oo.",
        ".oK....Ko.",
        ".oKR..RKo.",
        ".oK....Ko.",
        "..s....s..",
    ],
}


def pack_image(pack: dict, view: str):
    """One pack drawing as RGBA (no placement). 'd' is the back view (masked by the caller)."""
    import numpy as np

    src = "r" if view == "l" else ("u" if view == "d" else view)
    rows = pack[src]
    if view == "l":
        rows = [r[::-1] for r in rows]
    colours = {**BASE, **pack.get("pal", {})}
    h, w = len(rows), len(rows[0])
    out = np.zeros((h, w, 4), np.uint8)
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch != ".":
                out[y, x] = _hex(colours[ch])
    return out


def straps_image(pack: dict):
    import numpy as np

    rows = pack["straps"]
    colours = {**BASE, **pack.get("pal", {})}
    out = np.zeros((len(rows), len(rows[0]), 4), np.uint8)
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch != ".":
                out[y, x] = _hex(colours[ch])
    return out
