import type { Environment } from "@bld/storage";
import type { Star } from "./starfield-model";

export interface SceneryState {
  readonly width: number; readonly height: number; readonly scrollY: number; readonly reducedMotion: boolean; readonly travel: number;
}

/** Bounded depth movement from deliberate scroll/navigation; never wall-clock drift. */
export function sceneryPosition(point: Star, state: SceneryState): { x: number; y: number; trail: number } {
  const depth = 0.08 + point.layer * 0.09;
  const shift = state.reducedMotion ? 0 : state.scrollY * depth;
  const travel = state.reducedMotion ? 0 : Math.max(0, Math.min(1, state.travel));
  return {
    x: state.width / 2 + (point.x - 0.5) * state.width * (1 + travel * depth),
    y: (((point.y * state.height - shift) % state.height) + state.height) % state.height,
    trail: travel * (10 + point.layer * 16),
  };
}

export function paintScenery(ctx: CanvasRenderingContext2D, points: readonly Star[], scene: Environment, state: SceneryState, colour: string, accent: string): void {
  ctx.clearRect(0, 0, state.width, state.height);
  if (scene === "none") return;
  ctx.fillStyle = colour; ctx.strokeStyle = colour;
  if (scene === "galaxy" || scene === "rain" || scene === "snow") {
    points.forEach((point, index) => {
      const p = sceneryPosition(point, state);
      ctx.globalAlpha = 0.3 + point.layer * 0.16; ctx.lineWidth = 0.6 + point.layer * 0.4;
      ctx.beginPath();
      if (scene === "rain") {
        ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - 4, p.y + 12 + point.layer * 8 + p.trail); ctx.stroke();
      } else {
        ctx.arc(p.x, p.y, scene === "snow" ? 1.5 + point.layer : point.radius, 0, Math.PI * 2); ctx.fill();
        if (scene === "galaxy" && p.trail > 0) {
          const dx = p.x - state.width / 2; const dy = p.y - state.height / 2; const length = Math.hypot(dx, dy) || 1;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + dx / length * p.trail, p.y + dy / length * p.trail); ctx.stroke();
        }
        const next = points[index + 1];
        if (scene === "galaxy" && next !== undefined && index % 4 < 2 && Math.hypot(point.x - next.x, point.y - next.y) < 0.23) {
          const q = sceneryPosition(next, state); ctx.globalAlpha = 0.15; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
        }
      }
    });
  } else if (scene === "forest") {
    for (const layer of [0, 1, 2] as const) {
      ctx.fillStyle = layer === 1 ? accent : colour; ctx.globalAlpha = 0.12 + layer * 0.07;
      points.slice(layer * 8, layer * 8 + 8).forEach(point => {
        const p = sceneryPosition({ ...point, layer }, state);
        const height = state.height * (0.24 + point.y * 0.4 + layer * 0.06);
        const base = state.height + (state.reducedMotion ? 0 : Math.sin(state.scrollY * 0.001 + point.x) * 16);
        const x = p.x; const top = base - height;
        ctx.fillRect(x - 2 - layer, top, 4 + layer * 2, height);
        for (let branch = 0; branch < 4; branch += 1) {
          const y = top + branch * height * 0.14; const spread = height * (0.12 + branch * 0.055);
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - spread, y + height * 0.32); ctx.lineTo(x + spread, y + height * 0.32); ctx.fill();
        }
      });
    }
  } else {
    for (let layer = 0; layer < 5; layer += 1) {
      const phase = state.reducedMotion ? 0 : state.scrollY * (0.001 + layer * 0.0005);
      ctx.fillStyle = layer % 2 === 0 ? accent : colour; ctx.globalAlpha = 0.09 + layer * 0.035;
      ctx.beginPath(); ctx.moveTo(0, state.height);
      for (let x = 0; x <= state.width + 32; x += 32) ctx.lineTo(x, state.height * (0.55 + layer * 0.09) + Math.sin(x * (0.003 + layer * 0.001) + phase) * (25 + layer * 6));
      ctx.lineTo(state.width, state.height); ctx.closePath(); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}
