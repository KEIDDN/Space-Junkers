import { create } from 'zustand';
import type { PadFamily } from '../engine/pad';

export type Device = 'kbm' | 'pad';

/**
 * Which hands are on the game: keyboard and mouse, or a controller. Prompts and hints
 * follow it. Changes only when the player switches, never per frame.
 */
interface DeviceState {
  device: Device;
  family: PadFamily;
  /** A controller is plugged in (even if the keyboard is in use). */
  padConnected: boolean;
}

export const useDevice = create<DeviceState>(() => ({ device: 'kbm', family: 'xbox', padConnected: false }));

export function noteDevice(device: Device, family?: PadFamily): void {
  const s = useDevice.getState();
  if (s.device === device && (!family || s.family === family)) return;
  useDevice.setState({ device, family: family ?? s.family, ...(device === 'pad' ? { padConnected: true } : {}) });
}

let installed = false;
let lastMouse: { x: number; y: number } | null = null;

/** Keyboard or mouse use switches prompts back to keys. Installed once for the page. */
export function installDeviceWatch(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('keydown', (e) => {
    if (e.isTrusted) noteDevice('kbm');
  }, true);
  window.addEventListener('mousedown', (e) => {
    if (e.isTrusted) noteDevice('kbm');
  }, true);
  window.addEventListener('mousemove', (e) => {
    // A resting hand on the mouse jitters; only a real move counts.
    if (!lastMouse) lastMouse = { x: e.clientX, y: e.clientY };
    if (Math.hypot(e.clientX - lastMouse.x, e.clientY - lastMouse.y) > 24) {
      lastMouse = { x: e.clientX, y: e.clientY };
      noteDevice('kbm');
    }
  }, true);
  window.addEventListener('gamepadconnected', () => useDevice.setState({ padConnected: true }));
  window.addEventListener('gamepaddisconnected', () => {
    const any = navigator.getGamepads?.().some((p) => p && p.connected);
    useDevice.setState({ padConnected: !!any, ...(any ? {} : { device: 'kbm' as const }) });
  });
}
