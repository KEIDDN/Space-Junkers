import { useEffect, useRef } from 'react';
import type { TacticalSnapshot } from '../game/tactical';
import { Tile } from '../game/world/tilemap';
import { useRaid } from '../state/raidStore';
import { ByDevice, Key } from './Glyph';

const ROOM_NAMES: Record<string, string> = {
  entry: 'LANDING', exfil: 'SHUTTLE PAD', vault: 'VAULT', storage: 'STORAGE', barracks: 'BARRACKS', office: 'OFFICE',
  servers: 'SERVERS', workshop: 'WORKSHOP', medbay: 'MEDBAY', mess: 'MESS HALL', reactor: 'REACTOR', armory: 'ARMOURY',
};

const C = {
  bg: '#030a06',
  grid: 'rgba(125,255,154,0.05)',
  floor: '#0d3120',
  prop: '#1c5234',
  wall: '#4fb872',
  door: '#9ef0b0',
  locked: '#e0443a',
  label: 'rgba(160,240,180,0.55)',
  box: '#f2a33a',
  searched: '#6a5a3a',
  pad: '#7dff9a',
  lift: '#f2d03a',
  vault: '#e0443a',
  player: '#ffffff',
};

/**
 * [M] Wrist map. Shows only what the operator has seen (plus exits and the vault with the
 * scanner upgrade). Redraws a few times a second while open, from a snapshot the game builds.
 */
export function TacticalMap({ snapshot, name, timeLeft }: { snapshot: () => TacticalSnapshot | null; name: string; timeLeft: number }) {
  const open = useRaid((s) => s.mapOpen);
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!open) return;
    let blink = false;
    const draw = () => {
      const snap = snapshot();
      if (!snap || !canvas.current || !wrap.current) return;
      blink = !blink;
      drawMap(canvas.current, wrap.current, snap, blink);
    };
    draw();
    const id = window.setInterval(draw, 250);
    return () => window.clearInterval(id);
  }, [open, snapshot]);

  if (!open) return null;
  const t = Math.max(0, timeLeft);
  return (
    <div className="tac-screen" data-nav-scope="map">
      <div className="panel tac-panel crt">
        <div className="panel-title">
          {name} <span className="dim">// TACTICAL</span>
          <span className="grow" />
          {timeLeft >= 0 && <span className={t < 120 ? 'bad' : t < 300 ? 'warn' : 'dim'}>ORBIT {fmt(t)}</span>}
        </div>
        <div ref={wrap} className="tac-wrap"><canvas ref={canvas} /></div>
        <div className="tac-legend">
          <span><i style={{ background: C.box }} /> UNSEARCHED</span>
          <span><i style={{ background: C.searched }} /> SEARCHED</span>
          <span><i style={{ background: C.pad }} /> EXFIL</span>
          <span><i style={{ background: C.lift }} /> LIFT</span>
          <span><i style={{ background: C.locked }} /> SEALED</span>
          <span className="grow" />
          <span className="dim"><ByDevice kbm={<>[M] CLOSE</>} pad={<><Key a="back" /> CLOSE</>} /></span>
        </div>
      </div>
    </div>
  );
}

export function fmt(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function drawMap(cv: HTMLCanvasElement, wrap: HTMLDivElement, m: TacticalSnapshot, blink: boolean): void {
  const cell = Math.max(3, Math.floor(Math.min(wrap.clientWidth / m.width, wrap.clientHeight / m.height)));
  const W = m.width * cell;
  const H = m.height * cell;
  const dpr = window.devicePixelRatio || 1;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    cv.style.width = `${W}px`;
    cv.style.height = `${H}px`;
  }
  const g = cv.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = C.bg;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = C.grid;
  g.lineWidth = 1;
  for (let x = 0; x <= m.width; x += 4) {
    g.beginPath();
    g.moveTo(x * cell + 0.5, 0);
    g.lineTo(x * cell + 0.5, H);
    g.stroke();
  }
  for (let y = 0; y <= m.height; y += 4) {
    g.beginPath();
    g.moveTo(0, y * cell + 0.5);
    g.lineTo(W, y * cell + 0.5);
    g.stroke();
  }

  const seen = (tx: number, ty: number) => tx >= 0 && ty >= 0 && tx < m.width && ty < m.height && m.explored[ty * m.width + tx] === 1;
  const tile = (tx: number, ty: number) => m.tiles[ty * m.width + tx];

  // Floors and props that were seen; walls bordering them.
  for (let ty = 0; ty < m.height; ty++) {
    for (let tx = 0; tx < m.width; tx++) {
      const t = tile(tx, ty);
      if (t === Tile.Wall) {
        if (seen(tx + 1, ty) || seen(tx - 1, ty) || seen(tx, ty + 1) || seen(tx, ty - 1)
          || seen(tx + 1, ty + 1) || seen(tx - 1, ty - 1) || seen(tx + 1, ty - 1) || seen(tx - 1, ty + 1)) {
          g.fillStyle = C.wall;
          g.fillRect(tx * cell, ty * cell, cell, cell);
        }
        continue;
      }
      if (!seen(tx, ty)) continue;
      g.fillStyle = t === Tile.Prop ? C.prop : C.floor;
      g.fillRect(tx * cell, ty * cell, cell, cell);
    }
  }

  // Doors.
  for (const d of m.doors) {
    if (!d.tiles.some((q) => seen(q.tx, q.ty) || seen(q.tx + 1, q.ty) || seen(q.tx - 1, q.ty) || seen(q.tx, q.ty + 1) || seen(q.tx, q.ty - 1))) continue;
    g.fillStyle = d.locked ? C.locked : C.door;
    for (const q of d.tiles) g.fillRect(q.tx * cell + cell * 0.2, q.ty * cell + cell * 0.2, cell * 0.6, cell * 0.6);
  }

  // Containers seen.
  for (const c of m.containers) {
    if (!seen(c.tx, c.ty) && !seen(c.tx, c.ty + 1) && !seen(c.tx + 1, c.ty) && !seen(c.tx - 1, c.ty)) continue;
    const s = Math.max(2, Math.round(cell * 0.5));
    const o = (cell - s) / 2;
    if (!c.searched) {
      g.fillStyle = C.box;
      g.fillRect(c.tx * cell + o, c.ty * cell + o, s, s);
    } else {
      g.strokeStyle = c.empty ? '#3a3a34' : C.searched;
      g.strokeRect(c.tx * cell + o + 0.5, c.ty * cell + o + 0.5, s - 1, s - 1);
    }
  }

  // Room labels for rooms you've been in; the vault with the scanner too.
  g.font = `${Math.max(9, Math.round(cell * 1.1))}px 'Share Tech Mono', monospace`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const r of m.rooms) {
    let known = false;
    for (let y = r.y; y < r.y + r.h && !known; y++) for (let x = r.x; x < r.x + r.w; x++) if (seen(x, y)) { known = true; break; }
    const vault = r.role === 'vault';
    if (!known && !(vault && m.scanner)) continue;
    if (vault) {
      g.strokeStyle = C.vault;
      g.setLineDash([3, 2]);
      g.strokeRect(r.x * cell + 0.5, r.y * cell + 0.5, r.w * cell - 1, r.h * cell - 1);
      g.setLineDash([]);
    }
    g.fillStyle = vault ? C.vault : C.label;
    g.fillText(ROOM_NAMES[r.kind] ?? r.kind.toUpperCase(), (r.x + r.w / 2) * cell, (r.y + r.h - 0.9) * cell);
  }

  // Exits.
  for (const e of m.exits) {
    let known = m.scanner;
    for (let y = e.y; y < e.y + e.h && !known; y++) for (let x = e.x; x < e.x + e.w; x++) if (seen(x, y)) { known = true; break; }
    if (known) {
      const col = e.kind === 'pad' ? C.pad : C.lift;
      g.strokeStyle = col;
      g.lineWidth = 2;
      g.strokeRect(e.x * cell + 1, e.y * cell + 1, e.w * cell - 2, e.h * cell - 2);
      g.lineWidth = 1;
      g.fillStyle = col;
      const label = e.kind === 'pad' ? 'EXFIL' : e.powered ? 'LIFT' : 'LIFT · NO POWER';
      g.fillText(label, (e.x + e.w / 2) * cell, (e.y + e.h / 2) * cell);
    }
    if (e.breaker && e.breakerKnown) {
      g.fillStyle = e.powered ? C.pad : C.lift;
      g.fillRect(e.breaker.tx * cell + 1, e.breaker.ty * cell + 1, cell - 2, cell - 2);
      g.fillText('BREAKER', (e.breaker.tx + 0.5) * cell, (e.breaker.ty + 1.6) * cell);
    }
  }

  // You.
  const px = m.player.x * cell;
  const py = m.player.y * cell;
  const r = Math.max(5, cell * 0.9);
  g.save();
  g.translate(px, py);
  g.rotate(m.player.aim);
  g.fillStyle = blink ? C.player : C.pad;
  g.beginPath();
  g.moveTo(r, 0);
  g.lineTo(-r * 0.6, -r * 0.55);
  g.lineTo(-r * 0.6, r * 0.55);
  g.closePath();
  g.fill();
  g.restore();
}
