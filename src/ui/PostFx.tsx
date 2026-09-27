import { useEffect, useRef } from 'react';
import { useSettings } from '../state/settingsStore';

const GW = 240;
const GH = 135;

/**
 * A restrained finish over the game picture, done in the page, not the renderer, so the
 * pixel art underneath stays crisp: the corners fall off into dark, a fine grain crawls
 * over everything at a low frame rate, and the whole picture is graded a little colder and
 * denser. Off in settings (FILM FINISH).
 */
export function PostFx() {
  const on = useSettings((s) => s.filmic);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!on) return;
    const c = ref.current;
    if (!c) return;
    const g = c.getContext('2d')!;
    const img = g.createImageData(GW, GH);
    const draw = () => {
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() * 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    };
    draw();
    const id = window.setInterval(draw, 90);
    return () => window.clearInterval(id);
  }, [on]);
  useEffect(() => {
    document.body.classList.toggle('filmic', on);
  }, [on]);
  if (!on) return null;
  return (
    <div className="post-fx" aria-hidden>
      <canvas ref={ref} width={GW} height={GH} className="post-grain" />
      <div className="post-vignette" />
    </div>
  );
}
