import { useEffect, useState } from 'react';
import { itemDef } from '../data/items';
import { liveTracker } from '../core/quests';
import { foundItems, haulValue } from '../core/raidResult';
import { useProfile } from '../state/profileStore';
import { facilityName } from '../data/themes';
import { fmt } from './TacticalMap';
import { EXTRACT_SECONDS, useRaid, type FeedEntry } from '../state/raidStore';
import { useHud } from '../state/hudStore';
import { AtlasSprite } from './AtlasSprite';
import { ByDevice, Key, Prompt } from './Glyph';
import { QUICK_PAD } from './inventory/GridView';

function Pips({ frac, n = 5 }: { frac: number; n?: number }) {
  const lit = Math.ceil(frac * n);
  return (
    <span className="pips">
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className={`pip ${i < lit ? (frac < 0.35 ? 'bad' : 'on') : ''}`} />
      ))}
    </span>
  );
}

function Vitals() {
  const hp = useHud((s) => s.hp);
  const maxHp = useHud((s) => s.maxHp);
  const bleeding = useHud((s) => s.bleeding);
  const regen = useHud((s) => s.regen);
  const boosted = useHud((s) => s.boosted);
  const armor = useHud((s) => s.armor);
  const helmet = useHud((s) => s.helmet);
  const stamina = useHud((s) => s.stamina);
  const gait = useHud((s) => s.gait);
  const frac = hp / maxHp;
  const tone = frac < 0.35 ? 'bad' : frac < 0.65 ? 'warn' : 'ok';
  return (
    <div className="hud-bl crt-text">
      <div className="hud-row">
        <span className="label">VITALS</span>
        {hp > 0 && frac < 0.3 && <span className="status bad blink">▲ CRITICAL · HEAL</span>}
        {bleeding && <span className="status bad blink">BLEEDING</span>}
        {regen && <span className="status ok">REGEN</span>}
        {boosted && <span className="status warn">STIM</span>}
        {gait === 'sneak' && <span className="status dim">SNEAK <Key a="sneak" /></span>}
      </div>
      <div className="hp-row">
        <div className={`hp-bar ${frac < 0.3 && hp > 0 ? 'critical' : ''}`}>
          <div className={`hp-fill ${tone}`} style={{ width: `${frac * 100}%` }} />
          {[0.25, 0.5, 0.75].map((m) => <span key={m} className="hp-tick" style={{ left: `${m * 100}%` }} />)}
        </div>
        <span className={`big ${tone}`}>{String(Math.max(0, hp)).padStart(3, '0')}</span>
      </div>
      <div className="stamina-bar"><div className={stamina < 30 ? 'low' : ''} style={{ width: `${stamina}%` }} /></div>
      <div className="hud-row small">
        <span className="dim">BODY</span> {armor < 0 ? <span className="dim">NONE</span> : <Pips frac={armor} />}
        <span className="dim">HEAD</span> {helmet < 0 ? <span className="dim">NONE</span> : <Pips frac={helmet} />}
      </div>
    </div>
  );
}

function WeaponBlock() {
  const armed = useHud((s) => s.armed);
  const weaponName = useHud((s) => s.weaponName);
  const weaponSlot = useHud((s) => s.weaponSlot);
  const ammo = useHud((s) => s.ammo);
  const magSize = useHud((s) => s.magSize);
  const reserve = useHud((s) => s.reserve);
  const ammoName = useHud((s) => s.ammoName);
  const reloading = useHud((s) => s.reloading);
  const jammed = useHud((s) => s.jammed);
  if (!armed) {
    return (
      <div className="hud-br crt-text">
        <div className="label">NO WEAPON</div>
        <div className="dim small"><Key a="inventory" /> INVENTORY</div>
      </div>
    );
  }
  const low = ammo <= Math.ceil(magSize * 0.25);
  return (
    <div className="hud-br crt-text">
      <div className="label">[{weaponSlot + 1}] {weaponName}</div>
      <div className="ammo">
        <span className={`big ${reloading ? 'dim' : low ? 'bad' : ''}`}>{ammo}</span>
        <span className="dim"> / {reserve}</span>
      </div>
      <div className="dim small">{ammoName}</div>
      {jammed && <div className="bad blink">JAMMED · <Key a="reload" /> CLEAR</div>}
      {!jammed && reloading && <div className="warn blink">RELOADING</div>}
      {!jammed && !reloading && ammo === 0 && <div className="bad blink">{reserve ? <>EMPTY · <Key a="reload" /></> : 'NO AMMO'}</div>}
    </div>
  );
}

function QuickHud() {
  const quick = useHud((s) => s.quick);
  const using = useHud((s) => s.using);
  const usingName = useHud((s) => s.usingName);
  const slots = quick.split('|');
  return (
    <div className="hud-bc crt-text">
      {using >= 0 && (
        <div className="using">
          <span className="warn">APPLYING {usingName?.toUpperCase()}</span>
          <span className="use-bar"><span style={{ width: `${using * 100}%` }} /></span>
        </div>
      )}
      <div className="hud-quick">
        {slots.map((s, i) => {
          const [id, n] = s.split(':');
          return (
            <div key={i} className={`hq-slot ${id && n === '0' ? 'empty' : ''}`}>
              <span className="hq-key"><ByDevice kbm={<>{i + 3}</>} pad={<>{QUICK_PAD[i]}</>} /></span>
              {id && <AtlasSprite name={itemDef(id).icon} fit={{ w: 26, h: 22 }} />}
              {id && <span className="hq-count">×{n}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * YOU ARE EXTRACTING. Big, central, one glance: what's happening, how long, and whether the
 * clock is running. Off the pad it turns red and says the clock stopped.
 */
function ExtractBanner({ countdown, inZone, kind }: { countdown: number; inZone: boolean; kind: 'pad' | 'lift' }) {
  const total = EXTRACT_SECONDS[kind];
  const frac = Math.max(0, Math.min(1, 1 - countdown / total));
  const final = inZone && countdown <= 5;
  return (
    <div className={`hud-extract crt-text ${inZone ? 'holding' : 'paused'} ${final ? 'final' : ''}`}>
      <div className="extract-head">{kind === 'lift' ? 'EXTRACTING · MAINTENANCE LIFT' : 'EXTRACTING · SHUTTLE INBOUND'}</div>
      <div className="extract-row">
        <span className="extract-bar"><span style={{ width: `${frac * 100}%` }} /></span>
        <span className={`big ${inZone ? 'ok' : 'bad'}`}>{countdown.toFixed(1)}</span>
      </div>
      <div className={inZone ? 'dim small' : 'bad blink'}>
        {inZone ? (kind === 'lift' ? 'STAY ON THE PLATFORM' : 'HOLD THE PAD · THEY HEARD THE ALARM') : 'OFF THE PAD · CLOCK STOPPED · GET BACK ON'}
      </div>
    </div>
  );
}

/** Active contract objectives, live with this raid's progress. */
function Tracker() {
  const quests = useProfile((s) => s.quests);
  const log = useRaid((s) => s.log);
  const destination = useRaid((s) => s.destination);
  const loadout = useRaid((s) => s.loadout);
  const brought = useRaid((s) => s.brought);
  const lines = liveTracker({ ...useProfile.getState(), quests }, log, destination, foundItems(loadout, brought)).slice(0, 3);
  if (!lines.length) return null;
  return (
    <div className="hud-tracker crt-text">
      {lines.map((l, i) => (
        <div key={i} className={l.have >= l.need ? 'ok' : ''}>
          {l.have >= l.need ? '■' : '□'} {l.text} <span className="dim">{l.have}/{l.need}</span>
          {l.note && l.have < l.need && <span className="obj-note"> · {l.note}</span>}
        </div>
      ))}
    </div>
  );
}

function Feed() {
  const feed = useRaid((s) => s.feed);
  const [now, setNow] = useState(() => Date.now());
  const [born] = useState(() => new Map<number, number>());
  for (const f of feed) if (!born.has(f.id)) born.set(f.id, Date.now());
  useEffect(() => {
    if (!feed.length) return;
    const h = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(h);
  }, [feed.length]);
  // Crew on the radio stay up long enough to read.
  const live = feed.filter((f: FeedEntry) => now - (born.get(f.id) ?? now) < (f.tone === 'radio' ? 8500 : 3500));
  return (
    <div className="hud-feed">
      {live.map((f) => (
        <div key={f.id} className={`feed-line ${f.tone} crt-text`}>
          {f.itemId && <AtlasSprite name={itemDef(f.itemId).icon} fit={{ w: 20, h: 16 }} />}
          <Prompt text={f.text} />
        </div>
      ))}
    </div>
  );
}

/**
 * The HUD carries no permanent key list: prompts appear where they matter (a container,
 * an empty magazine, a jam) and the full controls live in the pause menu. The operator's
 * very first raid shows the keys that matter for a few seconds, then gets out of the way.
 */
function FirstRaidHint() {
  const first = useProfile((s) => s.stats.raids <= 1 && s.stats.extractions + s.stats.deaths === 0);
  const [show, setShow] = useState(true);
  useEffect(() => {
    const id = window.setTimeout(() => setShow(false), 14000);
    return () => window.clearTimeout(id);
  }, []);
  if (!first || !show) return null;
  return (
    <div className="hud-hint crt-text">
      <ByDevice
        kbm={
          <>
            <div><b>WASD</b> MOVE · <b>SHIFT</b> SPRINT · <b>C</b> SNEAK · <b>F</b> FLASHLIGHT · <b>R</b> RELOAD · <b>RMB</b> STEADY</div>
            <div><b>E</b> SEARCH / USE · <b>TAB</b> BAG · <b>M</b> MAP &amp; JOBS · <b>G</b> GRENADE · <b>H</b> TREAT · <b>ESC</b> PAUSE</div>
          </>
        }
        pad={
          <>
            <div><Key a="move" /> MOVE · <Key a="sprint" /> SPRINT · <Key a="sneak" /> SNEAK · <Key a="aim" /> AIM · <Key a="fire" /> FIRE · <Key a="steady" /> STEADY · <Key a="reload" /> RELOAD</div>
            <div><Key a="interact" /> SEARCH / USE · <Key a="inventory" /> BAG · <Key a="map" /> MAP &amp; JOBS · <Key a="grenade" /> GRENADE · <Key a="heal" /> TREAT · <Key a="flashlight" /> LIGHT</div>
          </>
        }
      />
      <div className="dim">Find what you came for, then the shuttle pad or the lift. Loot is only yours once you're out.</div>
    </div>
  );
}

/** Every raid: a one-line reminder of where the map and the controls are, fading out. */
function EntryHint() {
  const first = useProfile((s) => s.stats.raids <= 1 && s.stats.extractions + s.stats.deaths === 0);
  const [show, setShow] = useState(!first);
  useEffect(() => {
    const id = window.setTimeout(() => setShow(false), 7000);
    return () => window.clearTimeout(id);
  }, []);
  if (!show) return null;
  return (
    <div className="hud-entry dim small">
      <Key a="map" /> MAP &amp; JOBS · <Key a="inventory" /> BAG · <Key a="pause" /> CONTROLS
    </div>
  );
}

export function Hud() {
  const hostiles = useHud((s) => s.hostiles);
  const dead = useHud((s) => s.dead);
  const cleared = useHud((s) => s.cleared);
  const weight = useHud((s) => s.weight);
  const exfil = useHud((s) => s.exfil);

  const mode = useRaid((s) => s.mode);
  const seed = useRaid((s) => s.seed);
  const loadout = useRaid((s) => s.loadout);
  const brought = useRaid((s) => s.brought);
  const prompt = useRaid((s) => s.prompt);
  const countdown = useRaid((s) => s.extractCountdown);
  const inZone = useRaid((s) => s.extractInZone);
  const flashlight = useRaid((s) => s.flashlight);
  const inventoryOpen = useRaid((s) => s.inventoryOpen || s.mapOpen || s.terminal !== null);
  const extractKind = useRaid((s) => s.extractKind);
  const destination = useRaid((s) => s.destination);
  const timeLeft = useHud((s) => s.timeLeft);
  const facility = mode === 'facility';
  const haul = facility ? haulValue(loadout, brought) : 0;

  return (
    <div className={`hud ${inventoryOpen ? 'menu-open' : ''}`}>
      <div className="hud-tl crt-text">
        {facility ? (
          <>
            <div>{facilityName(destination, seed)} <span className="dim">#{String(seed).padStart(6, '0')}</span></div>
            {timeLeft >= 0 && (
              <div className={timeLeft <= 60 ? 'bad blink' : timeLeft <= 120 ? 'bad' : timeLeft <= 300 ? 'warn' : 'dim'}>
                ORBIT WINDOW {fmt(timeLeft)}
              </div>
            )}
            <div className={flashlight ? 'warn' : 'dim'}>FLASHLIGHT {flashlight ? 'ON' : 'OFF'}</div>
            <Tracker />
            <EntryHint />
          </>
        ) : (
          <>
            <div>TEST RANGE // SECTOR 0</div>
            <div className={hostiles ? 'warn' : 'ok'}>HOSTILES: {hostiles}</div>
          </>
        )}
      </div>

      {facility && (
        <div className="hud-tr crt-text">
          <div className="label">FOUND IN RAID · AT RISK</div>
          <div><span className="big-mid">{haul.toLocaleString()}</span> <span className="dim">KR</span></div>
          <div className={`small ${weight > 34 ? 'bad' : weight > 22 ? 'warn' : 'dim'}`}>{weight} KG CARRIED</div>
        </div>
      )}

      {exfil && <div className="hud-exfil crt-text">{exfil}</div>}
      {facility && !inventoryOpen && !dead && countdown === null && <FirstRaidHint />}
      <Feed />

      {countdown !== null && !dead && (
        <ExtractBanner countdown={countdown} inZone={inZone} kind={extractKind ?? 'pad'} />
      )}

      {prompt && !dead && !inventoryOpen && <div className="hud-prompt crt-text"><Prompt text={prompt} /></div>}

      <Vitals />
      <QuickHud />
      <WeaponBlock />

      {dead && !facility && (
        <div className="hud-center crt-text">
          <div className="big bad">K.I.A.</div>
          <div>PRESS <Key a="reload" /> TO REDEPLOY · <Key a="pause" /> MENU</div>
        </div>
      )}
      {!dead && !facility && cleared && (
        <div className="hud-top crt-text ok">SECTOR CLEAR. PRESS <Key a="pause" /> FOR MENU</div>
      )}
    </div>
  );
}
