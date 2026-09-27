import { useEffect } from 'react';
import { CATEGORY_NAME, ITEMS, RARITY_COLOR, itemDef } from '../../data/items';
import { CALIBER_NAME, WEAPONS } from '../../data/weapons';
import { itemValueDeep, itemWeight, loadoutItems, type ItemInstance } from '../../core/inventory';
import { locate } from '../../core/transfer';
import { audio } from '../../engine/audio';
import { grabOffset } from './drag';
import { useDrag } from './dragStore';
import { ItemTile } from './ItemTile';
import { useOps, type InventoryOps } from './ops';

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
        ['CALIBER', CALIBER_NAME[w.caliber]],
        ['DAMAGE', w.pellets > 1 ? `${w.damage} × ${w.pellets}` : String(w.damage)],
        ['RATE', `${Math.round(w.fireRate * 60)} RPM ${w.automatic ? 'AUTO' : w.cycled ? 'MANUAL' : 'SEMI'}`],
        ['MAGAZINE', `${w.magSize}${w.reloadPerRound ? ' (single rounds)' : ''}`],
        ['ACCURACY', w.spread <= 0.3 ? 'EXCELLENT' : w.spread <= 1.2 ? 'GOOD' : w.spread <= 3 ? 'FAIR' : 'POOR'],
        ['NOISE', w.noiseRadius >= 650 ? 'DEAFENING' : w.noiseRadius >= 520 ? 'LOUD' : 'MODERATE'],
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
      if (d.pooled) lines.push(['RESOURCE', `${Math.round(item.dur ?? d.heal)} / ${d.heal} HP`]);
      else if (d.heal) lines.push(['HEALS', `${d.heal} HP`]);
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
      {statLines(item).map(([k, v]) => (
        <div className="tt-row" key={k}><span>{k}</span><span>{v}</span></div>
      ))}
      <div className="tt-foot">
        <span>{itemWeight(item).toFixed(item.qty > 1 || itemWeight(item) < 1 ? 2 : 1)} KG</span>
        {item.crew ? <span className="dim">CREW ISSUE · NO RESALE</span>
          : price != null ? <span className="warn">SELLS {price.toLocaleString()} CR</span>
            : <span>≈ {itemValueDeep(item).toLocaleString()} CR</span>}
      </div>
    </div>
  );
}

function menuActions(ops: InventoryOps, uid: string): { label: string; run: () => boolean | void }[] {
  const loc = locate(ops.ws, uid);
  if (!loc) return [];
  const item = loc.item;
  const d = itemDef(item.id);
  const out: { label: string; run: () => boolean | void }[] = [];
  const inSlot = 'slot' in loc.where;
  if (ops.mode === 'raid' && d.kind === 'med') out.push({ label: 'USE', run: () => ops.activate(uid) });
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
  if (item.qty > 1) out.push({ label: 'SPLIT HALF', run: () => ops.split(uid) });
  if (d.kind === 'med' || d.kind === 'grenade') {
    for (let i = 0; i < 4; i++) out.push({ label: `BIND TO [${i + 3}]`, run: () => ops.bindQuick(i, d.id) });
  }
  if (ops.sell && (ops.sellPrice?.(item) ?? 0) > 0) out.push({ label: `SELL (${ops.sellPrice!(item)!.toLocaleString()} CR)`, run: () => ops.sell!(uid) });
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
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [menu]);
  if (!menu) return null;
  const actions = menuActions(ops, menu.uid);
  if (!actions.length) return null;
  return (
    <div className="inv-menu" style={{ left: Math.min(menu.x, window.innerWidth - 200), top: Math.min(menu.y, window.innerHeight - actions.length * 26 - 10) }}>
      {actions.map((a) => (
        <button
          key={a.label}
          onPointerEnter={() => audio.ui('hover')}
          onClick={() => {
            const r = a.run();
            audio.ui(r === false ? 'error' : 'click');
            useDrag.setState({ menu: null });
          }}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}

/** Floating layer above the inventory: drag ghost, tooltip, context menu. */
export function DragLayer() {
  return (
    <>
      <Ghost />
      <Tooltip />
      <ContextMenu />
    </>
  );
}
