import { useCallback, useEffect, useRef, useState } from 'react';
import { audio } from '../engine/audio';
import { Game } from '../game/Game';
import { applyRaid } from '../core/quests';
import { die, extract, foundItems } from '../core/raidResult';
import { getProfile, useProfile } from '../state/profileStore';
import { raid, useRaid } from '../state/raidStore';
import { useSettings } from '../state/settingsStore';
import { useHud } from '../state/hudStore';
import { facilityName } from '../data/themes';
import { Hud } from './Hud';
import { TacticalMap } from './TacticalMap';
import { TerminalView } from './TerminalView';
import { ControlsList, SettingsRows } from './Settings';
import { RaidInventory } from './inventory/InventoryScreen';
import { Results } from './Results';
import { Key } from './Glyph';

/** Bank or lose the loadout. Runs once per raid, from whichever path ends it first. */
export function settleRaid(status: 'extracted' | 'dead'): void {
  const s = useRaid.getState();
  if (s.mode !== 'facility') return;
  const p = getProfile();
  if (!p.raid) return; // already settled
  const extracted = status === 'extracted';
  const after = extracted ? extract(p, s.loadout, s.brought, s.kills) : die(p, s.kills);
  const { profile, progressed } = applyRaid(after, {
    destination: s.destination,
    extracted,
    kills: s.log.kills,
    searched: s.log.searched,
    visited: s.log.visited,
    found: extracted ? foundItems(s.loadout, s.brought) : [],
  });
  useProfile.getState().apply(profile);
  useRaid.setState({ progressed });
}

function PauseMenu({ facility, onResume, onAbandon }: { facility: boolean; onResume: () => void; onAbandon: () => void }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="pause-screen" data-nav-scope="pause">
      <div className="panel pause-panel">
        <div className="panel-title">SIGNAL HOLD <span className="dim">// PAUSED</span></div>
        <button className="menu-btn" data-nav-default onClick={onResume} onPointerEnter={() => audio.ui('hover')}>RESUME <Key a="back" /></button>
        <SettingsRows />
        <ControlsList />
        {!confirm ? (
          <button className="menu-btn danger" onClick={() => { audio.ui('click'); setConfirm(true); }} onPointerEnter={() => audio.ui('hover')}>
            {facility ? 'ABANDON RAID' : 'LEAVE RANGE'}
          </button>
        ) : (
          <div className="confirm">
            {facility && <div className="bad small">You will be listed missing in action. Everything you carry is lost.</div>}
            <div className="confirm-row">
              <button className="menu-btn danger" data-nav-default onClick={onAbandon}>CONFIRM</button>
              <button className="menu-btn" onClick={() => setConfirm(false)}>CANCEL</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** The last beat of a raid, over the game: relief, loss, or being left behind. */
function RaidEnding() {
  const ending = useRaid((s) => s.ending);
  const extractKind = useRaid((s) => s.extractKind);
  if (!ending) return null;
  const text = ending === 'extracted'
    ? { big: 'SIGNAL ACQUIRED', small: extractKind === 'lift' ? 'THE LIFT CLEARS THE SHAFT. YOU\'RE OUT.' : 'THE SHUTTLE LIFTS. YOU\'RE OUT.' }
    : ending === 'mia'
      ? { big: 'M.I.A.', small: 'THE LASTOCHKA BROKE ORBIT WITHOUT YOU' }
      : { big: 'K.I.A.', small: 'SIGNAL LOST' };
  return (
    <div className={`raid-ending ${ending}`}>
      <div className="raid-ending-text">
        <div className="big">{text.big}</div>
        <div className="small">{text.small}</div>
      </div>
    </div>
  );
}

/** Mounts the Pixi game. React never touches the game per frame. */
export function GameView({ mode, seed, onExit }: { mode: 'range' | 'facility'; seed: number; onExit: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const operator = useProfile((s) => s.operator);
  const volume = useSettings((s) => s.volume);
  const status = useRaid((s) => s.status);
  const [paused, setPaused] = useState(false);
  const over = mode === 'facility' && status !== 'active';

  useEffect(() => {
    if (over) return;
    const game = new Game({ mode, seed, operator, volume: useSettings.getState().volume, onEnd: settleRaid });
    gameRef.current = game;
    void game.init(hostRef.current!).catch((err) => console.error('Game init failed', err));
    return () => {
      game.destroy();
      gameRef.current = null;
    };
    // Volume changes are applied live below, not by restarting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, seed, operator, over]);

  useEffect(() => {
    gameRef.current?.setVolume(volume);
    audio.setMasterVolume(volume);
  }, [volume]);

  const shake = useSettings((s) => s.shake);
  useEffect(() => {
    gameRef.current?.setShake(shake);
  }, [shake]);

  const brightness = useSettings((s) => s.brightness);
  useEffect(() => {
    gameRef.current?.setBrightness(brightness);
  }, [brightness]);

  useEffect(() => {
    if (gameRef.current) gameRef.current.paused = paused;
  }, [paused]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Tab') e.preventDefault(); // never let TAB move browser focus mid-raid
      if (e.code !== 'Escape') return;
      if (raid.closeOverlay()) {
        audio.ui('close');
        return;
      }
      setPaused((p) => !p);
      audio.ui('tab');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const snapshot = useCallback(() => gameRef.current?.tacticalSnapshot() ?? null, []);
  const destination = useRaid((s) => s.destination);
  const timeLeft = useHud((s) => s.timeLeft);

  const abandon = () => {
    audio.ui('click');
    if (mode === 'facility') {
      raid.end('dead', true);
      settleRaid('dead');
      setPaused(false);
    } else onExit();
  };

  if (over) return <Results onContinue={onExit} />;

  return (
    <div className="screen game-screen">
      <div className="game-frame">
        <div ref={hostRef} className="game-host" />
        <Hud />
        <RaidInventory />
        <TerminalView />
        <RaidEnding />
        {mode === 'facility' && <TacticalMap snapshot={snapshot} name={facilityName(destination, seed)} timeLeft={timeLeft} />}
        {paused && <PauseMenu facility={mode === 'facility'} onResume={() => setPaused(false)} onAbandon={abandon} />}
      </div>
    </div>
  );
}
