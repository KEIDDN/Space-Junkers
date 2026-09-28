import { useEffect, useRef, useState } from 'react';
import { CATEGORY_NAME, ITEMS, RARITY_COLOR, itemDef } from '../../data/items';
import { CALIBER_NAME, WEAPONS, loudness } from '../../data/weapons';
import { QUICK_SLOTS, itemValueDeep, itemWeight, loadoutCount, loadoutItems, quickUsable, type ItemInstance } from '../../core/inventory';
import { locate, parseSplitQty, splitRange, splitStackAuto } from '../../core/transfer';
import { audio } from '../../engine/audio';
import { ByDevice, Key } from '../Glyph';
import { useDevice } from '../../state/deviceStore';
import { QUICK_PAD } from './GridView';
import { grabOffset } from './drag';
import { useDrag } from './dragStore';
import { ItemTile } from './ItemTile';
import { useOps, type InventoryOps } from './ops';
import { effectText } from './readout';

function Ghost() {
  const drag = useDrag((s) => s.drag);
  const ok = useDrag((s) => s.ok);
  const hasTarget = useDrag((s) => !!s.target);
  if (!drag) return null;
  const g = grabOffset(drag);
  return (
    <div className={`drag-ghost ${hasTarget ? (ok ? 'ok' : 'bad') : ''}`} style={{ left: drag.px - g.x, top: drag.py - g.y }}>
      <ItemTile item={drag.item} rot={drag.rot} />
    </div>
  );
}

function statLines(item: ItemInstance): [string, string][] {
  const d = itemDef(item.id);
  switch (d.kind) {
    case 'weapon': {
      const w = WEAPONS[d.weapon];
      const lines: [string, string][] = [
        ['USE', w.role],
        ['CALIBER', CALIBER_NAME[w.caliber]],
        ['DAMAGE', w.pellets > 1 ? `${w.damage} × ${w.pellets}` : String(w.damage)],
        ['RATE', `${Math.round(w.fireRate * 60)} RPM ${w.automatic ? 'AUTO' : w.cycled ? 'MANUAL' : 'SEMI'}`],
        ['MAGAZINE', `${w.magSize}${w.reloadPerRound ? ' (single rounds)' : ''}`],
        ['ACCURACY', w.spread <= 0.3 ? 'EXCELLENT' : w.spread <= 1.2 ? 'GOOD' : w.spread <= 3 ? 'FAIR' : 'POOR'],
        ['NOISE', loudness(w.noiseRadius)],
      ];
      if (item.loaded) lines.push(['LOADED', `${item.loaded} × ${ITEMS[item.ammoType!]?.short ?? '?'}`]);
      if (w.jamChance) lines.push(['CONDITION', 'WORN, MAY JAM']);
      return lines;
    }
    case 'ammo':
      return [
        ['CALIBER', CALIBER_NAME[d.caliber]],
        ['PENETRATION', `CLASS ${d.pen}`],
        ...(d.pellets ? [['PROJECTILE', 'SOLID SLUG'] as [string, string]] : []),
        ...(d.damageMul !== 1 && !d.pellets ? [['DAMAGE', `${Math.round(d.damageMul * 100)}%`] as [string, string]] : []),
      ];
    case 'armor':
    case 'helmet':
      return [
        ['PROTECTION', `CLASS ${d.cls}`],
        ['DURABILITY', `${Math.round(item.dur ?? d.durability)} / ${d.durability}`],
        ['COVERS', d.kind === 'helmet' ? 'HEAD' : 'TORSO'],
        ...(d.speedMul < 1 ? [['MOVEMENT', `-${Math.round((1 - d.speedMul) * 100)}%`] as [string, string]] : []),
      ];
    case 'backpack':
      return [['CAPACITY', `${d.grid.w} × ${d.grid.h}`]];
    case 'med': {
      const lines: [string, string][] = [];
      if (d.heal) lines.push(['HEALS', `${d.heal} HP EACH`]);
      if (d.regen) lines.push(['REGEN', `${d.regen.hp} HP / ${d.regen.seconds}s`]);
      if (d.boost) lines.push(['SPEED', `+${Math.round((d.boost.speedMul - 1) * 100)}% / ${d.boost.seconds}s`]);
      if (d.stopsBleed) lines.push(['BLEEDING', 'STOPS']);
      lines.push(['USE TIME', `${d.useTime}s`]);
      return lines;
    }
    case 'key':
      return [['OPENS', 'FACILITY VAULT'], ['USES LEFT', String(item.dur ?? d.uses)]];
    case 'grenade':
      return [['EFFECT', d.effect === 'frag' ? 'FRAGMENTATION' : 'SMOKE SCREEN']];
    default:
      return [];
  }
}

function Tooltip() {
  const ops = useOps();
  const hover = useDrag((s) => s.hover);
  const drag = useDrag((s) => s.drag);
  const menu = useDrag((s) => s.menu);
  if (!hover || drag || menu) return null;
  const item = hover.item;
  const d = itemDef(item.id);
  const price = ops.sellPrice?.(item);
  const left = Math.min(hover.x + 18, window.innerWidth - 300);
  const top = Math.min(hover.y + 14, window.innerHeight - 260);
  return (
    <div className="inv-tooltip" style={{ left, top, ['--rarity' as string]: RARITY_COLOR[d.rarity] }}>
      <div className="tt-name">{d.name}</div>
      <div className="tt-sub">
        <span style={{ color: RARITY_COLOR[d.rarity] }}>{d.rarity.toUpperCase()}</span> · {CATEGORY_NAME[d.category].toUpperCase()}
      </div>
      <div className="tt-desc">{d.description}</div>
      {d.stack > 1 && (
        <div className="tt-row tt-qty"><span>QUANTITY</span><span>×{item.qty} <span className="dim">/ {d.stack} PER STACK</span></span></div>
      )}
      {statLines(item).map(([k, v]) => (
        <div className="tt-row" key={k}><span>{k}</span><span>{v}</span></div>
      ))}
      <div className="tt-foot">
        <span>{itemWeight(item).toFixed(item.qty > 1 || itemWeight(item) < 1 ? 2 : 1)} KG{item.qty > 1 ? ` · ${d.w}×${d.h}` : ` · ${d.w}×${d.h} CELLS`}</span>
        {item.crew ? <span className="dim">CREW ISSUE · NO RESALE</span>
          : price != null ? <span className="warn">SELLS {price.toLocaleString()} KR</span>
            : <span>≈ {itemValueDeep(item).toLocaleString()} KR</span>}
      </div>
    </div>
  );
}

interface MenuAction {
  label: string;
  run: () => boolean | void;
  /** Opens something else (the split picker): the menu closes without a click sound. */
  keep?: boolean;
}

function menuActions(ops: InventoryOps, uid: string): MenuAction[] {
  const loc = locate(ops.ws, uid);
  if (!loc) return [];
  const item = loc.item;
  const d = itemDef(item.id);
  const out: MenuAction[] = [];
  const inSlot = 'slot' in loc.where;
  if (ops.mode === 'raid' && d.kind === 'med') out.push({ label: `USE · ${effectText(d.id) ?? ''}`, run: () => ops.activate(uid) });
  if (ops.openBag && d.kind === 'backpack' && !inSlot && 'grid' in loc.where && loc.where.grid === 'stash') {
    out.push({ label: 'OPEN', run: () => ops.openBag!(uid) });
  }
  if (!inSlot && ['weapon', 'armor', 'helmet', 'backpack'].includes(d.kind)) out.push({ label: 'EQUIP', run: () => ops.activate(uid) });
  if (inSlot) out.push({ label: 'UNEQUIP', run: () => ops.quick(uid) });
  if (d.kind === 'weapon' && item.loaded) out.push({ label: 'UNLOAD', run: () => ops.unload(uid) });
  if (d.kind === 'ammo' || d.kind === 'weapon') {
    const guns = loadoutItems(ops.ws.loadout).filter((g) => {
      const gd = itemDef(g.id);
      return d.kind === 'ammo' && gd.kind === 'weapon' && WEAPONS[gd.weapon].caliber === d.caliber;
    });
    for (const g of guns) out.push({ label: `LOAD INTO ${itemDef(g.id).short.toUpperCase()}`, run: () => ops.load(g.uid, uid) });
  }
  if (splitRange(item.qty) && !inSlot) out.push({ label: 'SPLIT…', run: () => useDrag.setState({ split: { uid } }), keep: true });
  // Quick use points at a type you carry; a stack in a container or the stash can't be bound.
  if (quickUsable(d.id) && loadoutCount(ops.ws.loadout, d.id) > 0) {
    for (let i = 0; i < QUICK_SLOTS; i++) {
      const bound = ops.ws.loadout.quick[i] === d.id;
      const key = useDevice.getState().device === 'pad' ? QUICK_PAD[i] : String(i + 3);
      out.push({ label: bound ? `UNBIND QUICK [${key}]` : `QUICK USE [${key}]`, run: () => ops.bindQuick(i, bound ? null : d.id) });
    }
  }
  const fix = ops.repairPrice?.(item);
  if (ops.repair && fix) out.push({ label: `REPAIR (${fix.toLocaleString()} KR)`, run: () => ops.repair!(uid) });
  if (ops.sell && (ops.sellPrice?.(item) ?? 0) > 0) out.push({ label: `SELL (${ops.sellPrice!(item)!.toLocaleString()} KR)`, run: () => ops.sell!(uid) });
  if (ops.drop) out.push({ label: 'DROP', run: () => ops.drop!(uid) });
  return out;
}

function ContextMenu() {
  const ops = useOps();
  const menu = useDrag((s) => s.menu);
  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest('.inv-menu')) useDrag.setState({ menu: null });
    };
    // Listen from the next task on: React runs this effect while the right-click that
    // opened the menu is still bubbling, and that press must not count as "clicked outside"
    // (it used to close the menu the instant it opened, so mouse actions never showed).
    const id = window.setTimeout(() => window.addEventListener('pointerdown', close), 0);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener('pointerdown', close);
    };
  }, [menu]);
  if (!menu) return null;
  const actions = menuActions(ops, menu.uid);
  if (!actions.length) return null;
  return (
    <div className="inv-menu" data-nav-scope="menu" style={{ left: Math.min(menu.x, window.innerWidth - 200), top: Math.min(menu.y, window.innerHeight - actions.length * 26 - 10) }}>
      {actions.map((a) => (
        <button
          key={a.label}
          onPointerEnter={() => audio.ui('hover')}
          onClick={() => {
            const r = a.run();
            audio.ui(r === false ? 'error' : a.keep ? 'tab' : 'click');
            useDrag.setState({ menu: null });
          }}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}

/**
 * SPLIT STACK: pick how many to take off. Type a number (Enter confirms), drag the slider,
 * or on a controller nudge it left/right and press A. The rest stays where it was; the new
 * stack takes the first free spot. Nothing changes until CONFIRM.
 */
function SplitDialog() {
  const ops = useOps();
  const split = useDrag((s) => s.split);
  const loc = split ? locate(ops.ws, split.uid) : null;
  const qty = loc?.item.qty ?? 0;
  const range = splitRange(qty);
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const uid = split?.uid;

  useEffect(() => {
    if (!uid) return;
    setText(String(Math.floor(qty / 2)));
    // Keyboard first: the amount is selected, ready to be typed over.
    window.setTimeout(() => inputRef.current?.select(), 0);
    // Only when a different stack is picked, not whenever its quantity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  // The stack went away (used, moved into a container that closed): nothing to split.
  useEffect(() => {
    if (uid && !range) useDrag.setState({ split: null });
  }, [uid, range]);

  if (!split || !loc || !range) return null;
  const d = itemDef(loc.item.id);
  const n = parseSplitQty(text, qty);
  // Probe the real operation, so "no room" shows before you press anything.
  const fits = n !== null && !!splitStackAuto(ops.ws, split.uid, n, 'probe');
  const set = (v: number) => setText(String(Math.max(range.min, Math.min(range.max, v))));
  const confirm = () => {
    if (n === null || !fits) {
      audio.ui('error');
      return;
    }
    const ok = ops.split(split.uid, n);
    audio.ui(ok ? 'drop' : 'error');
    if (ok) useDrag.setState({ split: null });
  };
  const cancel = () => {
    audio.ui('close');
    useDrag.setState({ split: null });
  };
  return (
    <div className="split-backdrop" onPointerDown={(e) => e.target === e.currentTarget && cancel()}>
      <div
        className="panel split-dialog"
        data-nav-scope="split"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            confirm();
          }
        }}
      >
        <div className="panel-title">SPLIT STACK</div>
        <div className="split-item">
          <ItemTile item={loc.item} rot={false} />
          <div>
            <div>{d.name}</div>
            <div className="dim small">×{qty} IN THIS STACK</div>
          </div>
        </div>
        <div className="split-row">
          <span className="dim small">TAKE</span>
          <input
            ref={inputRef}
            className={`split-num ${n === null ? 'bad' : ''}`}
            inputMode="numeric"
            value={text}
            onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                set((n ?? Math.floor(qty / 2)) + (e.key === 'ArrowUp' ? 1 : -1));
              }
            }}
            data-nav-skip=""
          />
          <span className="dim small">LEAVE ×{n === null ? '?' : qty - n}</span>
        </div>
        <input
          type="range"
          className="split-range"
          min={range.min}
          max={range.max}
          step={1}
          value={n ?? Math.floor(qty / 2)}
          onChange={(e) => setText(e.target.value)}
          data-nav-default=""
        />
        <div className="split-presets">
          <button className="btn" data-pad-shortcut="LT" onClick={() => set(1)}>1 <ByDevice kbm={null} pad={<Key a="steady" />} /></button>
          <button className="btn" onClick={() => set(Math.floor(qty / 2))}>HALF</button>
          <button className="btn" data-pad-shortcut="RT" onClick={() => set(range.max)}>MAX {range.max} <ByDevice kbm={null} pad={<Key a="fire" />} /></button>
        </div>
        <div className={`small ${n === null || !fits ? 'bad' : 'dim'}`}>
          {n === null ? `ENTER ${range.min}–${range.max}` : !fits ? 'NO ROOM FOR A NEW STACK HERE' : `×${n} + ×${qty - n}`}
        </div>
        <div className="split-actions">
          <button className="btn accent" data-nav-submit="" disabled={n === null || !fits} onClick={confirm}>
            CONFIRM <ByDevice kbm={<>[ENTER]</>} pad={<Key a="confirm" />} />
          </button>
          <button className="btn" onClick={cancel}>CANCEL <ByDevice kbm={<>[ESC]</>} pad={<Key a="back" />} /></button>
        </div>
      </div>
    </div>
  );
}

/** Floating layer above the inventory: drag ghost, tooltip, context menu, split picker. */
export function DragLayer() {
  return (
    <>
      <Ghost />
      <Tooltip />
      <ContextMenu />
      <SplitDialog />
    </>
  );
}
