import { useEffect, useRef, useState } from 'react';
import type { Operator } from '../core/profile';
import { audio } from '../engine/audio';
import { useProfile } from '../state/profileStore';
import { AtlasSprite } from './AtlasSprite';
import { ControlsList, SettingsRows } from './Settings';
import { ByDevice, Key } from './Glyph';

const OPERATORS: { id: Operator; callsign: string; portrait: string; line: string }[] = [
  { id: 'm', callsign: 'VOLK', portrait: 'portrait_m', line: 'Ex-miner. Doesn\'t talk about the collapse at Shaft 9.' },
  { id: 'f', callsign: 'ZORYA', portrait: 'portrait_f', line: 'Ex-courier. Knows every dead station between here and Kharon.' },
];

/** Slow drifting stars behind the title. */
function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const g = c.getContext('2d')!;
    const stars = Array.from({ length: 220 }, () => ({ x: Math.random(), y: Math.random(), z: Math.random(), t: Math.random() * 6 }));
    let raf = 0;
    const draw = (now: number) => {
      c.width = Math.floor(window.innerWidth / 3);
      c.height = Math.floor(window.innerHeight / 3);
      g.fillStyle = '#030306';
      g.fillRect(0, 0, c.width, c.height);
      for (const s of stars) {
        const x = ((s.x * c.width - now * 0.002 * (0.3 + s.z)) % c.width + c.width) % c.width;
        const a = 0.35 + 0.65 * Math.abs(Math.sin(now / 1500 + s.t)) * s.z;
        g.fillStyle = s.z > 0.85 ? `rgba(207,224,255,${a})` : `rgba(140,145,165,${a * 0.8})`;
        g.fillRect(Math.round(x), Math.round(s.y * c.height), 1, 1);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="title-stars" />;
}

const TICKER = [
  'RELAY OTETS-2 · NO CARRIER',
  'CENTRAL · LAST HANDSHAKE 00:00:00.000',
  'TIKHAYA · 14 STATIONS ON RESERVE POWER',
  'CH.9 · PATTERN · 11 MIN INTERVAL · DO NOT ANSWER',
  'LASTOCHKA · REACTOR PUMP 2 · SERVICE OVERDUE',
  'MERZLOTA · HEAT RESERVED FOR SHAFT 9',
  'KRASNAYA DEPOT 4 · ORDERS NOT COUNTERMANDED',
  'ORBIT HOLD · OTETS · CREW ABOARD: 5',
];

/**
 * The nav set's readout in the corner: what the relays are saying (nothing), a signal meter
 * that never settles, and a red lamp that has been blinking for forty years.
 */
function NavReadout() {
  const [i, setI] = useState(0);
  const [bars, setBars] = useState(3);
  useEffect(() => {
    const t1 = window.setInterval(() => setI((n) => (n + 1) % TICKER.length), 3800);
    const t2 = window.setInterval(() => setBars(Math.random() < 0.8 ? 1 + Math.floor(Math.random() * 3) : 5), 260);
    return () => {
      window.clearInterval(t1);
      window.clearInterval(t2);
    };
  }, []);
  return (
    <div className="title-nav">
      <div className="title-nav-head"><span className="warn-lamp" /> NAV-7 <span className="cyr">ЛАСТОЧКА</span></div>
      <div className="title-nav-row"><span className="dim">CARRIER</span><span className="signal">{'▮'.repeat(bars)}<span className="dim">{'▯'.repeat(6 - bars)}</span></span></div>
      <div key={i} className="title-nav-ticker">{TICKER[i]}</div>
    </div>
  );
}

interface Props {
  onContinue: () => void;
  /** A fresh operator: the premise, then the first morning aboard. */
  onNewGame: () => void;
  onRange: () => void;
}

const CREDITS: [string, string[]][] = [
  ['CHARACTERS', [
    'Heads, headgear and packs drawn for Space Junkers; bodies animated with',
    'the Liberated Pixel Cup & the Universal LPC Spritesheet Generator (CC-BY-SA 3.0 / GPL 3.0)',
    'bluecarrot16 · BenCreating · ElizaWy · JaidynReiman · wulax · Redshrike · makrohn · pvigier',
    'Durrani · Evert · TheraHedwig · MuffinElZangano · bigbeargames · pennomi',
    'castelonia · Napsio · Nila122 · Joe White · Luke Mehl · dalonedrau · laetissima · macmanmatty',
    'Per-file credits: Assets/LPC/CREDITS.csv',
  ]],
  ['MUSIC', [
    'Pondering the Cosmos · Ruskerdax',
    'Sirens in Darkness · The Cynic Project (cynicmusic.com · pixelsphere.org)',
    'Narrow Corridors · tinyworlds',
  ]],
  ['RECORDED SOUND', [
    'The Free Firearm Sound Library · Ben Jaszczak, Brian Nelson, Kevin Heras, Matthew Nanney',
    'Impact, RPG, Sci-fi and UI Audio · Kenney (kenney.nl)',
    'Reload and handling recordings · bmaczero, StarNinjas, zer0sol',
  ]],
  ['TYPE', ['Share Tech Mono · VT323 · Russo One (SIL Open Font License)']],
  ['EVERYTHING ELSE', ['Pixel art from the project sheets; synthesized sound, lighting and effects in code.']],
];

/** Who made what: shown from the title screen. */
function Credits() {
  return (
    <div className="credits-list">
      <div className="nav-title">SPACE JUNKERS <span className="dim">// СКРАПЕРЫ</span></div>
      {CREDITS.map(([head, lines]) => (
        <div key={head} className="credits-block">
          <div className="dim small">{head}</div>
          {lines.map((l) => <div key={l}>{l}</div>)}
        </div>
      ))}
      <div className="dim small">Full sources and licenses: ASSET_SOURCES.md</div>
    </div>
  );
}

export function TitleScreen({ onContinue, onNewGame, onRange }: Props) {
  const started = useProfile((s) => !!s.flags.started);
  const stats = useProfile((s) => s.stats);
  const credits = useProfile((s) => s.credits);
  const resetProfile = useProfile((s) => s.resetProfile);
  const [view, setView] = useState<'menu' | 'pick' | 'settings' | 'credits'>('menu');
  const [confirmWipe, setConfirmWipe] = useState(false);

  const newGame = (op: Operator) => {
    resetProfile(op);
    useProfile.getState().apply({ flags: { started: true, prologue: true } });
    audio.ui('equip');
    onNewGame();
  };

  const hover = () => audio.ui('hover');
  const open = (v: typeof view) => {
    audio.ui(v === 'menu' ? 'close' : 'click');
    setView(v);
  };

  // Back out of a sub-screen (or a pending wipe) with Esc / the pad's back button.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return;
      if (view !== 'menu') open('menu');
      else if (confirmWipe) setConfirmWipe(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="screen title-screen" data-nav-scope="title" onPointerDown={() => audio.unlock()}>
      <Starfield />
      <div className="title-planet"><AtlasSprite name="planet_otets_big" scale={3} /></div>
      <div className="title-scan" />
      <div className="title-interference" />
      <NavReadout />
      <div className="title-content">
        <div className="title-logo" data-text="SPACE JUNKERS">SPACE<br />JUNKERS</div>
        <div className="title-sub">СКРАПЕРЫ · SALVAGE CREW OF THE LASTOCHKA</div>

        {view === 'menu' && (
          <div className="title-menu">
            {started && (
              <button className="menu-btn big" onPointerEnter={hover} onClick={() => { audio.ui('click'); onContinue(); }}>
                CONTINUE <span className="dim">· DAY {useProfile.getState().day} · {credits.toLocaleString()} KR · {stats.extractions} EXTRACTION{stats.extractions === 1 ? '' : 'S'}</span>
              </button>
            )}
            <button className={`menu-btn big ${confirmWipe ? 'danger armed' : ''}`} onPointerEnter={hover} onClick={() => {
              audio.ui(confirmWipe || !started ? 'click' : 'error');
              if (started && !confirmWipe) setConfirmWipe(true);
              else open('pick');
            }}>
              {confirmWipe ? 'NEW GAME: THIS ERASES YOUR SAVE. CONFIRM AGAIN' : 'NEW GAME'}
            </button>
            <button className="menu-btn" onPointerEnter={hover} onClick={() => { audio.ui('click'); onRange(); }}>GUNPLAY RANGE</button>
            <button className="menu-btn" onPointerEnter={hover} onClick={() => open('settings')}>SETTINGS &amp; CONTROLS</button>
            <button className="menu-btn" onPointerEnter={hover} onClick={() => open('credits')}>CREDITS</button>
          </div>
        )}
        {view === 'credits' && (
          <div className="title-credits panel">
            <Credits />
            <button className="link" onClick={() => open('menu')}>[BACK] <Key a="back" /></button>
          </div>
        )}
        {view === 'settings' && (
          <div className="title-settings panel">
            <div className="pause-body">
              <div className="pause-col"><SettingsRows /></div>
              <div className="pause-col controls-col">
                <div className="dim small">CONTROLS</div>
                <ControlsList />
              </div>
            </div>
            <button className="link" onClick={() => open('menu')}>[BACK] <Key a="back" /></button>
          </div>
        )}
        {view === 'pick' && (
          <div className="title-pick">
            <div className="dim small">CHOOSE YOUR OPERATOR</div>
            <div className="operators">
              {OPERATORS.map((op) => (
                <button key={op.id} className="operator" onPointerEnter={hover} onClick={() => newGame(op.id)}>
                  <AtlasSprite name={op.portrait} scale={4} />
                  <span className="warn">{op.callsign}</span>
                  <span className="dim small op-line">{op.line}</span>
                </button>
              ))}
            </div>
            <button className="link" onClick={() => open('menu')}>[BACK] <Key a="back" /></button>
          </div>
        )}
      </div>
      <div className="title-foot dim small">
        BUILD 1.0 ·{' '}
        <ByDevice
          kbm={<>WASD MOVE · MOUSE AIM · E INTERACT · TAB INVENTORY · ESC PAUSE</>}
          pad={<><Key a="move" /> MOVE · <Key a="aim" /> AIM · <Key a="fire" /> FIRE · <Key a="interact" /> INTERACT · <Key a="inventory" /> BAG · <Key a="pause" /> PAUSE</>}
        />
      </div>
    </div>
  );
}
