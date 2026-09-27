import { audio } from '../engine/audio';
import { useDevice } from '../state/deviceStore';
import { useSettings } from '../state/settingsStore';
import { Key, type GlyphId } from './Glyph';

function Slider({ label, value, min, max, step, show, onChange }: {
  label: string; value: number; min: number; max: number; step: number; show: string; onChange: (v: number) => void;
}) {
  return (
    <label className="setting">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="dim">{show}</span>
    </label>
  );
}

function Toggle({ label, on, note, onChange }: { label: string; on: boolean; note: string; onChange: (v: boolean) => void }) {
  return (
    <label className="setting">
      <span>{label}</span>
      <button className={`toggle ${on ? 'on' : ''}`} onClick={() => { audio.ui('click'); onChange(!on); }}>
        {on ? 'ON' : 'OFF'}
      </button>
      <span className="dim small">{note}</span>
    </label>
  );
}

/** Sliders shared by the title screen and the pause menus. Controller rows appear when a pad is connected. */
export function SettingsRows() {
  const s = useSettings();
  const pad = useDevice((d) => d.padConnected);
  return (
    <>
      <Slider label="VOLUME" value={s.volume} min={0} max={1} step={0.05} show={String(Math.round(s.volume * 100))}
        onChange={(v) => { s.setVolume(v); audio.setMasterVolume(v); }} />
      <Slider label="SCREEN SHAKE" value={s.shake} min={0} max={1} step={0.1} show={String(Math.round(s.shake * 100))} onChange={s.setShake} />
      <Slider label="BRIGHTNESS" value={s.brightness} min={0.8} max={1.6} step={0.1} show={String(Math.round(s.brightness * 100))} onChange={s.setBrightness} />
      <Toggle label="SOUND CUES" on={s.soundCues} note="arrows toward unseen gunfire" onChange={s.setSoundCues} />
      {pad && (
        <>
          <Slider label="AIM SPEED" value={s.aimSpeed} min={0.5} max={1.5} step={0.1} show={String(Math.round(s.aimSpeed * 100))} onChange={s.setAimSpeed} />
          <Toggle label="AIM ASSIST" on={s.aimAssist} note="a light pull toward a hostile you can see" onChange={s.setAimAssist} />
          <Slider label="VIBRATION" value={s.vibration} min={0} max={1} step={0.1} show={s.vibration ? String(Math.round(s.vibration * 100)) : 'OFF'} onChange={s.setVibration} />
        </>
      )}
    </>
  );
}

const KB_CONTROLS: [string, string][] = [
  ['WASD', 'Move'],
  ['SHIFT', 'Sprint'],
  ['C', 'Sneak'],
  ['MOUSE', 'Aim · fire'],
  ['RMB', 'Steady aim'],
  ['R', 'Reload · unjam'],
  ['1 2 Q', 'Weapons'],
  ['G · H', 'Grenade · treat wounds'],
  ['3–6', 'Quick slots'],
  ['F', 'Flashlight'],
  ['E', 'Use · hold to search'],
  ['TAB', 'Inventory'],
  ['M', 'Map'],
  ['ESC', 'Pause'],
];

const PAD_CONTROLS: [GlyphId, string][] = [
  ['move', 'Move'],
  ['sprint', 'Sprint (click)'],
  ['sneak', 'Sneak'],
  ['aim', 'Aim'],
  ['fire', 'Fire'],
  ['steady', 'Steady aim'],
  ['reload', 'Reload · unjam'],
  ['switchWeapon', 'Switch weapon'],
  ['grenade', 'Grenade'],
  ['heal', 'Treat wounds'],
  ['quick', 'Quick slots'],
  ['flashlight', 'Flashlight'],
  ['interact', 'Use · hold to search'],
  ['inventory', 'Bag · hold for map'],
  ['pause', 'Pause'],
];

export function ControlsList() {
  const device = useDevice((d) => d.device);
  if (device === 'pad') {
    return (
      <div className="controls">
        {PAD_CONTROLS.map(([k, v]) => (
          <div key={k} className="controls-row"><span className="key"><Key a={k} /></span><span className="dim">{v}</span></div>
        ))}
      </div>
    );
  }
  return (
    <div className="controls">
      {KB_CONTROLS.map(([k, v]) => (
        <div key={k} className="controls-row"><span className="key">{k}</span><span className="dim">{v}</span></div>
      ))}
    </div>
  );
}
