import { audio } from '../engine/audio';
import { useSettings } from '../state/settingsStore';

/** Sliders shared by the title screen and the pause menu. */
export function SettingsRows() {
  const volume = useSettings((s) => s.volume);
  const shake = useSettings((s) => s.shake);
  const setVolume = useSettings((s) => s.setVolume);
  const setShake = useSettings((s) => s.setShake);
  const brightness = useSettings((s) => s.brightness);
  const setBrightness = useSettings((s) => s.setBrightness);
  return (
    <>
      <label className="setting">
        <span>VOLUME</span>
        <input type="range" min={0} max={1} step={0.05} value={volume}
          onChange={(e) => { setVolume(Number(e.target.value)); audio.setMasterVolume(Number(e.target.value)); }} />
        <span className="dim">{Math.round(volume * 100)}</span>
      </label>
      <label className="setting">
        <span>SCREEN SHAKE</span>
        <input type="range" min={0} max={1} step={0.1} value={shake} onChange={(e) => setShake(Number(e.target.value))} />
        <span className="dim">{Math.round(shake * 100)}</span>
      </label>
      <label className="setting">
        <span>BRIGHTNESS</span>
        <input type="range" min={0.8} max={1.6} step={0.1} value={brightness} onChange={(e) => setBrightness(Number(e.target.value))} />
        <span className="dim">{Math.round(brightness * 100)}</span>
      </label>
    </>
  );
}

const CONTROLS: [string, string][] = [
  ['WASD', 'Move'],
  ['SHIFT', 'Sprint'],
  ['C', 'Sneak'],
  ['MOUSE', 'Aim · fire'],
  ['R', 'Reload · unjam'],
  ['1 2 Q', 'Weapons'],
  ['3–6', 'Meds · grenades'],
  ['F', 'Flashlight'],
  ['E', 'Use · hold to search'],
  ['TAB', 'Inventory'],
  ['M', 'Map'],
  ['ESC', 'Pause'],
];

export function ControlsList() {
  return (
    <div className="controls">
      {CONTROLS.map(([k, v]) => (
        <div key={k} className="controls-row"><span className="key">{k}</span><span className="dim">{v}</span></div>
      ))}
    </div>
  );
}
