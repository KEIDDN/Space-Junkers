import { useEffect, useState, type CSSProperties } from 'react';

interface Frame { x: number; y: number; w: number; h: number }
type Atlas = { frames: Record<string, { frame: Frame }>; meta: { size: { w: number; h: number } } };

let atlas: Atlas | null = null;
let atlasPromise: Promise<Atlas> | null = null;

export function loadAtlas(): Promise<Atlas> {
  atlasPromise ??= fetch(`${import.meta.env.BASE_URL}assets/sprites.json`)
    .then((r) => r.json())
    .then((a: Atlas) => (atlas = a));
  return atlasPromise;
}

function useAtlas(): Atlas | null {
  const [a, setA] = useState<Atlas | null>(atlas);
  useEffect(() => {
    if (a) return;
    let live = true;
    void loadAtlas().then((x) => live && setA(x));
    return () => {
      live = false;
    };
  }, [a]);
  return a;
}

export function frameSize(name: string): { w: number; h: number } | null {
  const f = atlas?.frames[name]?.frame;
  return f ? { w: f.w, h: f.h } : null;
}

interface Props {
  name: string;
  /** Fixed integer scale. Ignored when `fit` is given. */
  scale?: number;
  /** Fit inside this box: largest whole-number scale, or a downscale if even 1x is too big. */
  fit?: { w: number; h: number };
  /** Rotate 90° (rotated inventory items). */
  rotate?: boolean;
  className?: string;
  style?: CSSProperties;
}

/** Draws one atlas frame in the DOM (menus, HUD, inventory), pixel-perfect. */
export function AtlasSprite({ name, scale = 4, fit, rotate, className, style }: Props) {
  const a = useAtlas();
  const f = a?.frames[name]?.frame;
  if (!a || !f) return null;
  let s = scale;
  if (fit) {
    const fw = rotate ? f.h : f.w;
    const fh = rotate ? f.w : f.h;
    const k = Math.min(fit.w / fw, fit.h / fh);
    s = k >= 1 ? Math.floor(k) : k;
  }
  return (
    <div
      className={`atlas-sprite ${className ?? ''}`}
      style={{
        width: f.w * s,
        height: f.h * s,
        backgroundImage: `url(${import.meta.env.BASE_URL}assets/sprites.png)`,
        backgroundPosition: `-${f.x * s}px -${f.y * s}px`,
        backgroundSize: `${a.meta.size.w * s}px ${a.meta.size.h * s}px`,
        transform: rotate ? 'rotate(90deg)' : undefined,
        ...style,
      }}
    />
  );
}
