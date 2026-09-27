import { useEffect, useState } from 'react';
import { ITEMS, RARITY_COLOR } from '../data/items';
import { useExpedition } from '../state/expeditionStore';
import { useHud } from '../state/hudStore';
import { AtlasSprite } from './AtlasSprite';

export function Hud() {
  const hp = useHud((s) => s.hp);
  const maxHp = useHud((s) => s.maxHp);
  const weaponName = useHud((s) => s.weaponName);
  const weaponSlot = useHud((s) => s.weaponSlot);
  const ammo = useHud((s) => s.ammo);
  const magSize = useHud((s) => s.magSize);
  const reserve = useHud((s) => s.reserve);
  const reloading = useHud((s) => s.reloading);
  const hostiles = useHud((s) => s.hostiles);
  const dead = useHud((s) => s.dead);
  const cleared = useHud((s) => s.cleared);

  const mode = useExpedition((s) => s.mode);
  const seed = useExpedition((s) => s.seed);
  const bag = useExpedition((s) => s.bag);
  const prompt = useExpedition((s) => s.prompt);
  const countdown = useExpedition((s) => s.extractCountdown);
  const inZone = useExpedition((s) => s.extractInZone);
  const flashlight = useExpedition((s) => s.flashlight);

  const hpFrac = hp / maxHp;
  const hpClass = hpFrac < 0.35 ? 'bad' : hpFrac < 0.65 ? 'warn' : 'ok';
  const lowAmmo = ammo <= Math.ceil(magSize * 0.25);
  const bagValue = bag.reduce((n, id) => n + (ITEMS[id]?.value ?? 0), 0);
  const facility = mode === 'facility';

  return (
    <div className="hud">
      <div className="hud-tl crt-text">
        {facility ? (
          <>
            <div>FACILITY #{String(seed).padStart(6, '0')}</div>
            <div className={flashlight ? 'warn' : 'dim'}>FLASHLIGHT {flashlight ? 'ON' : 'OFF'} [F]</div>
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
          <div className="label">EXPEDITION BAG · AT RISK</div>
          <div><span className="big-mid">{bagValue.toLocaleString()}</span> <span className="dim">CR · {bag.length} ITEMS</span></div>
        </div>
      )}

      <Toasts />

      {countdown !== null && !dead && (
        <div className="hud-extract crt-text">
          <div className={inZone ? 'ok' : 'bad blink'}>{inZone ? 'EXTRACTION INBOUND. HOLD THE ZONE' : 'RETURN TO EXTRACTION ZONE'}</div>
          <div className="big ok">{countdown.toFixed(1)}</div>
        </div>
      )}

      {prompt && !dead && <div className="hud-prompt crt-text">{prompt}</div>}

      <div className="hud-bl crt-text">
        <div className="label">VITALS</div>
        <div className="hp-bar">
          <div className={`hp-fill ${hpClass}`} style={{ width: `${hpFrac * 100}%` }} />
        </div>
        <div className={`big ${hpClass}`}>{String(hp).padStart(3, '0')}</div>
      </div>

      <div className="hud-br crt-text">
        <div className="label">[{weaponSlot + 1}] {weaponName}</div>
        <div className="ammo">
          <span className={`big ${reloading ? 'dim' : lowAmmo ? 'bad' : ''}`}>{reloading ? '--' : ammo}</span>
          <span className="dim"> / {reserve === Infinity ? '∞' : reserve}</span>
        </div>
        {reloading && <div className="warn blink">RELOADING</div>}
        {!reloading && ammo === 0 && <div className="bad blink">EMPTY</div>}
      </div>

      {dead && (
        <div className="hud-center crt-text">
          <div className="big bad">K.I.A.</div>
          <div>{facility ? 'SIGNAL LOST…' : 'PRESS [R] TO REDEPLOY · [ESC] MENU'}</div>
        </div>
      )}
      {!dead && !facility && cleared && (
        <div className="hud-top crt-text ok">SECTOR CLEAR. PRESS [ESC] FOR MENU</div>
      )}
    </div>
  );
}

/** Loot pickup feed. Each toast removes itself after a few seconds. */
function Toasts() {
  const toasts = useExpedition((s) => s.toasts);
  const [now, setNow] = useState(() => Date.now());
  const [born] = useState(() => new Map<number, number>());
  for (const t of toasts) if (!born.has(t.id)) born.set(t.id, Date.now());
  useEffect(() => {
    if (!toasts.length) return;
    const h = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(h);
  }, [toasts.length]);
  const live = toasts.filter((t) => now - (born.get(t.id) ?? now) < 4000);
  return (
    <div className="hud-toasts">
      {live.map((t) => {
        const it = ITEMS[t.itemId];
        return (
          <div key={t.id} className="toast crt-text">
            <AtlasSprite name={it.icon} scale={1} />
            <span style={{ color: RARITY_COLOR[it.rarity] }}>+ {it.name}</span>
            <span className="dim">{it.value} CR</span>
          </div>
        );
      })}
    </div>
  );
}
