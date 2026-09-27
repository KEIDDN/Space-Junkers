/** Internal render resolution. The canvas is scaled up by whole numbers only. */
export const VIEW_W = 640;
export const VIEW_H = 360;

/** World tile size in pixels. */
export const TILE = 32;

/** Height (px) at which guns and bullets are drawn above an actor's feet. */
export const GUN_HEIGHT = 17;

/** Largest simulation step; longer frames are clamped to avoid tunnelling. */
export const MAX_DT = 1 / 30;
