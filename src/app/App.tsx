import { useEffect, useRef, useState, type ReactElement } from 'react';
import { useSettings } from '../state/settingsStore';
import { DESTINATION } from '../data/destinations';
import { facilityName } from '../data/themes';
import { audio } from '../engine/audio';
import { deploy as deployProfile } from '../core/raidResult';
import { getProfile, useProfile } from '../state/profileStore';
import { raid, rangeLoadout, useRaid } from '../state/raidStore';
import { GameView } from '../ui/GameView';
import { recentRaid } from '../ui/ship/CrewPanel';
import { ShipView } from '../ui/ship/ShipView';
import { TitleScreen } from '../ui/TitleScreen';
import { SceneCover, type Cover } from '../ui/SceneCover';
import { PadNav } from '../ui/nav/PadNav';
import { AudioGate } from '../ui/AudioGate';
import { IntroCrawl } from '../ui/IntroCrawl';

type Scene =
  | { kind: 'title' }
  | { kind: 'intro' }
  | { kind: 'ship' }
  | { kind: 'raid'; mode: 'range' | 'facility'; seed: number; destination: string; key: number };

/** How long the screen takes to go dark, and to come back. */
const FADE_IN = 320;
const FADE_OUT = 650;

/** Scene flow: title → ship ⇄ raid (→ results) → ship, always through a dark cover. */
export function App() {
  const [scene, setScene] = useState<Scene>({ kind: 'title' });
  const [cover, setCover] = useState<Cover | null>(null);
  const timers = useRef<number[]>([]);
  const musicVolume = useSettings((s) => s.music);
  useEffect(() => audio.setMusicVolume(musicVolume), [musicVolume]);

  // What plays under each place: a theme on the title, something warm and quiet aboard,
  // and in a raid nothing at all until there is danger (the game raises it).
  useEffect(() => {
    audio.unlock();
    if (scene.kind === 'title') audio.music('title', 1, 3);
    else if (scene.kind === 'intro') audio.music('title', 0.45, 4);
    else if (scene.kind === 'ship') audio.music('ship', 1, 4);
    else audio.music(scene.mode === 'facility' ? 'raid' : null, 0, 2);
  }, [scene]);

  /** Go dark, swap scenes behind the cover, type the lines, then reveal. */
  const transition = (next: Scene, lines: string[], hold: number, tone: Cover['tone'] = 'plain') => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    setCover({ lines, phase: 'in', tone });
    const at = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));
    at(FADE_IN, () => {
      setScene(next);
      setCover({ lines, phase: 'hold', tone });
    });
    at(FADE_IN + hold, () => setCover({ lines, phase: 'out', tone }));
    at(FADE_IN + hold + FADE_OUT, () => setCover(null));
  };

  const toShip = () => {
    const p = getProfile();
    transition({ kind: 'ship' }, [`LASTOCHKA // ЛАСТОЧКА`, `DAY ${p.day} · HOLDING OVER OTETS`, `${p.credits.toLocaleString()} KR ABOARD`], 900);
  };

  const deploy = (destination: string, seed: number) => {
    let p = getProfile();
    // Going down for the first time ends the first morning aboard.
    if (p.flags.prologue && !p.flags.pro_done) {
      useProfile.getState().apply({ flags: { ...p.flags, pro_done: true } });
      p = getProfile();
    }
    // Mark the raid in the save before anything else: from here on, leaving means losing the kit.
    useProfile.getState().apply({ ...deployProfile(p, destination, seed), course: null });
    raid.start('facility', seed, destination, p.loadout);
    const d = DESTINATION[destination];
    audio.descent();
    transition(
      { kind: 'raid', mode: 'facility', seed, destination, key: Date.now() },
      [
        'AIRLOCK CYCLING . . .',
        `DESCENT · ${d?.name ?? destination.toUpperCase()} · ${d?.subtitle ?? ''}`,
        `${facilityName(destination, seed)} · SIGNAL #${String(seed).padStart(6, '0')}`,
        `ORBIT WINDOW ${d?.minutes ?? 18} MIN · EVERYTHING YOU CARRY IS AT RISK`,
        'GOOD HUNTING.',
      ],
      2300,
    );
  };

  const range = () => {
    raid.start('range', 0, 'range', rangeLoadout());
    transition({ kind: 'raid', mode: 'range', seed: 0, destination: 'range', key: Date.now() }, ['TEST RANGE // SECTOR 0', 'LIVE FIRE AUTHORISED'], 700);
  };

  const backFromRaid = () => {
    const s = useRaid.getState();
    if (s.mode === 'facility') {
      recentRaid.outcome = s.status === 'extracted' ? 'extracted' : 'dead';
      recentRaid.greeted.clear();
      const p = getProfile();
      transition({ kind: 'ship' }, [
        s.status === 'extracted' ? 'DOCKING WITH THE LASTOCHKA . . .' : 'RECOVERY BEACON RECEIVED . . .',
        `DAY ${p.day} · ${p.credits.toLocaleString()} KR ABOARD`,
      ], 1100, s.status === 'extracted' ? 'ok' : 'bad');
    } else transition({ kind: 'title' }, ['LEAVING THE RANGE'], 350);
  };

  let view: ReactElement;
  const firstMorning = () => {
    const p = getProfile();
    transition({ kind: 'ship' }, ['LASTOCHKA // ЛАСТОЧКА', `DAY ${p.day} · 06:40 SHIP TIME · HOLDING OVER OTETS`], 1300);
  };

  if (scene.kind === 'title') view = <TitleScreen onContinue={toShip} onNewGame={() => transition({ kind: 'intro' }, [''], 250)} onRange={range} />;
  else if (scene.kind === 'intro') view = <IntroCrawl onDone={firstMorning} />;
  else if (scene.kind === 'ship') view = <ShipView onDeploy={deploy} onQuit={() => transition({ kind: 'title' }, ['SIGNING OFF'], 350)} />;
  else view = <GameView key={scene.key} mode={scene.mode} seed={scene.seed} onExit={backFromRaid} />;
  return (
    <>
      {view}
      <SceneCover cover={cover} />
      <PadNav />
      <AudioGate />
    </>
  );
}
