#!/usr/bin/env python3
"""
Recorded sound effects: cut, clean and export the CC0 recordings the game uses.

The raw packs are not kept in the repository (hundreds of MB). Download them into a
folder and point SFX_SRC at it (see ASSET_SOURCES.md for every source and licence):

  $SFX_SRC/firearms/Prepared SFX Library/...   The Free Firearm Sound Library (CC0)
  $SFX_SRC/impact-sounds/Audio/...             Kenney Impact Sounds (CC0)
  $SFX_SRC/rpg-audio/...                       Kenney RPG Audio (CC0)
  $SFX_SRC/sci-fi-sounds/...                   Kenney Sci-fi Sounds (CC0)
  $SFX_SRC/ui-audio/...                        Kenney UI Audio (CC0)
  $SFX_SRC/oga/...                             OpenGameArt reload and handling sounds (CC0)
  $SFX_SRC/music/...                           OpenGameArt music (CC0), see MUSIC below

Every sample becomes mono 48 kHz Ogg Vorbis, trimmed to its useful part, with a short
fade in, a shaped fade out and its peak at -1 dBFS. The game sets the levels.

  SFX_SRC=/path/to/raw python3 tools/build_sfx.py
"""
import glob
import json
import os
import sys

import numpy as np
import soundfile as sf
from scipy.signal import butter, resample_poly, sosfilt

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'assets', 'sfx')
MANIFEST = os.path.join(ROOT, 'src', 'engine', 'sampleManifest.ts')
SRC = os.environ.get('SFX_SRC')
RATE = 48000

FA = 'firearms/Prepared SFX Library'


def load(path):
    x, sr = sf.read(os.path.join(SRC, path), always_2d=True)
    m = x.mean(axis=1)
    if sr != RATE:
        from math import gcd
        g = gcd(RATE, sr)
        m = resample_poly(m, RATE // g, sr // g)
    # Rumble and DC out.
    m = sosfilt(butter(2, 28, 'highpass', fs=RATE, output='sos'), m)
    return m


def cut(m, start_s, length_s, hold_s, curve=2.5):
    """Window [start, start+length], 2 ms fade in, flat until hold, then a curved fade out."""
    a = max(0, int((start_s - 0.004) * RATE))
    seg = m[a:a + int(length_s * RATE)].copy()
    n = len(seg)
    fi = int(0.002 * RATE)
    seg[:fi] *= np.linspace(0, 1, fi)
    h = min(n, int(hold_s * RATE))
    if n > h:
        k = np.linspace(0, 1, n - h)
        seg[h:] *= (1 - k) ** curve
    return seg


def trim_start(m, thresh=0.02):
    """Drop leading silence (below thresh of the peak)."""
    peak = np.abs(m).max() + 1e-9
    idx = np.where(np.abs(m) > peak * thresh)[0]
    return m[max(0, idx[0] - int(0.002 * RATE)):] if len(idx) else m


def normalise(seg, db=-1.0):
    peak = np.abs(seg).max() + 1e-9
    return seg * (10 ** (db / 20) / peak)


groups = {}


def emit(group, seg):
    seg = normalise(seg)
    i = len(groups.setdefault(group, []))
    name = f'{group}_{i}.ogg'
    sf.write(os.path.join(OUT, name), seg.astype(np.float32), RATE, format='OGG', subtype='VORBIS', compression_level=0.4)
    groups[group].append(name)


# --- Gunshots: near and far takes of the real counterpart of each gun. -------------
# (file, [shot onsets in ms]); automatic guns get shorter tails so bursts stay clean.
GUNS = {
    #        near take                              far take                               len  hold
    'pm9':    (('Bersa/F_47P.wav', [334, 4409]),            ('Bersa/F_41P.wav', [438, 4807]),            0.65, 0.07),
    'sp5':    (('1911/A_42P.wav', [941, 5001]),             ('1911/A_34P.wav', [1542, 6655]),            0.7, 0.08),
    'kedr':   (('Carl Gustav M45/G_31P.wav', [310, 3501, 6727]), ('Carl Gustav M45/G_20P.wav', [347, 2259, 5266]), 0.42, 0.05),
    'ppd41':  (('PPSh/P_30P.wav', [968, 4387, 8242, 11421]), ('PPSh/P_16P.wav', [291, 5250, 12999]),     0.45, 0.05),
    'obrez':  (('CD/H_21P.wav', [464, 3075]),               ('CD/H_16P.wav', [606, 4117]),               1.0, 0.12),
    'toz12':  (('Nova/O_21P.wav', [431, 3465]),             ('Nova/O_17P.wav', [693, 3708]),             0.95, 0.11),
    'skv':    (('SKS/U_14P.wav', [3577, 6755, 10210]),      ('SKS/U_19P.wav', [2614, 8016, 12786]),      0.75, 0.08),
    'akr74':  (('AK-47/C_28P.wav', [611, 3257, 6020, 9156]), ('AK-47/C_31P.wav', [356, 4419]),           0.5, 0.06),
    'vektor': (('AR-15/D_32P.wav', [703, 5647]),            ('AR-15/D_24P.wav', [549, 3910]),            0.48, 0.055),
    'mosin':  (('Mosin Nagant/M_21P.wav', [1033, 5019, 9155]), ('Mosin Nagant/M_26P.wav', [1137, 6104, 10742]), 1.1, 0.13),
    'svk':    (('Tikka/W_29P.wav', [577, 5664]),            ('Tikka/W_24P.wav', [755, 5377]),            1.0, 0.12),
}


def build_guns():
    for gun, ((nf, nons), (ff, fons), length, hold) in GUNS.items():
        near = load(f'{FA}/{nf}')
        for o in nons:
            emit(f'gun_{gun}_n', cut(near, o / 1000, length, hold))
        far = load(f'{FA}/{ff}')
        for o in fons:
            # Far takes keep more of their roll.
            emit(f'gun_{gun}_f', cut(far, o / 1000, length * 1.5, hold * 2, curve=2))


# --- Foley, impacts and handling. ---------------------------------------------------
def kenney(pattern, group, length=None, hold=None, curve=2.0, rate_trim=True):
    for p in sorted(glob.glob(os.path.join(SRC, pattern))):
        m = load(os.path.relpath(p, SRC))
        if rate_trim:
            m = trim_start(m)
        if length:
            m = cut(m, 0.004, length, hold if hold is not None else length * 0.4, curve)
        emit(group, m)


def onsets(m, rel=0.3, gap=0.12):
    hop = RATE // 1000
    n = len(m) // hop
    e = np.abs(m[:n * hop]).reshape(n, hop).max(axis=1)
    peak = e.max()
    out, i = [], 5
    while i < n:
        if e[i] > rel * peak and e[i - 5:i].min() < rel * 0.4 * peak:
            out.append(i / 1000)
            i += int(gap * 1000)
        else:
            i += 1
    return out


def events(path, group, picks, length, hold, rel=0.3):
    """Split a handling recording at its transients and keep the chosen events."""
    m = load(path)
    ons = onsets(m, rel)
    for k in picks:
        if k < len(ons):
            emit(group, cut(m, ons[k], length, hold))


def build_foley():
    # Boots on hard floor (ten takes), and what a floor adds: plate ring, grate rattle.
    kenney('rpg-audio/**/footstep0*.ogg', 'step', 0.22, 0.08)
    kenney('impact-sounds/Audio/impactPlate_light_*.ogg', 'plate', 0.45, 0.1)
    kenney('impact-sounds/Audio/impactMetal_light_*.ogg', 'metal', 0.3, 0.06)
    # Bullets: concrete chips, flesh, a round flattening on armour plate.
    kenney('impact-sounds/Audio/impactGeneric_light_*.ogg', 'hit_wall', 0.14, 0.04)
    kenney('impact-sounds/Audio/impactPunch_medium_*.ogg', 'hit_flesh', 0.32, 0.08)
    kenney('impact-sounds/Audio/impactSoft_heavy_*.ogg', 'bodyfall', 0.5, 0.15)
    # Grenades: the crack and the debris, and the low boom under it.
    kenney('sci-fi-sounds/**/explosionCrunch_*.ogg', 'blast', 1.4, 0.35, curve=1.6)
    kenney('sci-fi-sounds/**/lowFrequency_explosion_*.ogg', 'boom', 1.6, 0.4, curve=1.6)
    # Kit: webbing, a bag set down, coins counted out.
    kenney('rpg-audio/**/cloth[1-4].ogg', 'cloth', 0.5, 0.2)
    kenney('rpg-audio/**/dropLeather.ogg', 'bagdrop', 0.35, 0.12)
    kenney('rpg-audio/**/handleCoins*.ogg', 'coins', 0.7, 0.3)
    kenney('rpg-audio/**/metalLatch.ogg', 'latch', 0.2, 0.05)
    # Weapon handling.
    events('oga/clipload1.wav', 'magin', [0], 0.22, 0.06)
    events('oga/clipload2.wav', 'magin', [0], 0.2, 0.06)
    events('oga/gun_reload_-_starninjas/gun_reload.2.ogg', 'magout', [0], 0.3, 0.1)
    events('oga/reload.wav', 'magout', [0], 0.25, 0.08)
    events('oga/gun_reload_-_starninjas/gun_reload.2.ogg', 'rack', [2], 0.3, 0.1)
    events('oga/reload.wav', 'rack', [2], 0.3, 0.1)
    events('oga/singlebullet1.wav', 'shell', [0], 0.2, 0.06)
    events('oga/shotgunsounds/ShotgunSounds/Subsequent Shells.mp3', 'shell', [0, 2], 0.2, 0.06)
    events('oga/shotgunsounds/ShotgunSounds/Rack.mp3', 'pump', [0], 0.42, 0.25, rel=0.25)
    # Interface: mechanical switches for committing, a light tick for moving.
    for n in ('switch2', 'switch3', 'switch9', 'switch22', 'switch27'):
        kenney(f'ui-audio/**/{n}.ogg', 'ui_switch', 0.16, 0.05)
    for n in ('click3', 'click4'):
        kenney(f'ui-audio/**/{n}.ogg', 'ui_tick', 0.06, 0.02)


# --- Music: three pieces, used sparingly (see AudioService.music). --------------------
MUSIC = {
    # Title: dark old-school synths. Ruskerdax, "Pondering the Cosmos" (CC0).
    'title': 'music/Ruskerdax%20-%20Pondering%20the%20Cosmos_0.mp3',
    # Aboard the Lastochka: warm pads and piano. The Cynic Project, "Sirens in Darkness" (CC0).
    'ship': 'music/012_Sirens_in_Darkness_0.mp3',
    # Raid tension layer, low and dark so it never masks footsteps. tinyworlds, "Narrow Corridors" (CC0).
    'raid': 'music/narrow_corridors_short.ogg',
}


def build_music():
    out = os.path.join(ROOT, 'public', 'assets', 'music')
    os.makedirs(out, exist_ok=True)
    for name, path in MUSIC.items():
        x, sr = sf.read(os.path.join(SRC, path), always_2d=True)
        x = x[:, :2] if x.shape[1] >= 2 else np.repeat(x, 2, axis=1)
        n = len(x)
        fi, fo = int(2 * sr), int(4 * sr)
        x[:fi] *= np.linspace(0, 1, fi)[:, None]
        x[n - fo:] *= np.linspace(1, 0, fo)[:, None]
        peak = np.abs(x).max() + 1e-9
        x = x * (10 ** (-1 / 20) / peak)
        dst = os.path.join(out, f'{name}.ogg')
        # libsndfile's Vorbis encoder crashes on one huge write: feed it in blocks.
        with sf.SoundFile(dst, 'w', sr, 2, format='OGG', subtype='VORBIS', compression_level=0.8) as f:
            for i in range(0, n, 32768):
                f.write(x[i:i + 32768].astype(np.float32))
        print(f'music/{name}.ogg {n / sr:.0f}s {os.path.getsize(dst) / 1024:.0f} KB')


def main():
    if not SRC or not os.path.isdir(SRC):
        sys.exit('Set SFX_SRC to the folder with the raw packs (see the docstring).')
    os.makedirs(OUT, exist_ok=True)
    for old in glob.glob(os.path.join(OUT, '*.ogg')):
        os.remove(old)
    build_guns()
    build_foley()
    build_music()
    counts = {g: len(v) for g, v in sorted(groups.items())}
    with open(MANIFEST, 'w') as f:
        f.write('// Generated by tools/build_sfx.py. Do not edit.\n')
        f.write('/** Recorded sample groups: files are public/assets/sfx/<group>_<n>.ogg. */\n')
        f.write('export const SAMPLE_GROUPS: Record<string, number> = ')
        f.write(json.dumps(counts, indent=2).replace('"', "'") + ';\n')
    total = sum(os.path.getsize(os.path.join(OUT, n)) for v in groups.values() for n in v)
    print(f'{sum(counts.values())} samples in {len(counts)} groups, {total / 1024:.0f} KB')
    for g, n in counts.items():
        print(f'  {g}: {n}')


if __name__ == '__main__':
    main()
