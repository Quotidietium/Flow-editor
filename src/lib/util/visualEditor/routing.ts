/**
 * Edge routing for the visual canvas: orthogonal (manhattan with rounded
 * bends and simple node avoidance), straight and curved variants — the three
 * routing styles draw.io offers. Pure point/path math, unit-tested; the
 * component only picks a style and renders `d`.
 */

import type { VNode } from './model';
import { nodeSize } from './model';

export type EdgeStyle = 'curved' | 'orthogonal' | 'straight';

export interface Point {
  x: number;
  y: number;
}

export interface Route {
  /** Polyline anchor points (for label/cardinality placement + hit tests). */
  points: Point[];
  /** Ready-to-render SVG path with rounded bends. */
  d: string;
}

const CORNER = 8;
/** Padding kept between a routed segment and any node box it avoids. */
const AVOID_PAD = 26;

const centerOf = (node: VNode): Point => {
  const size = nodeSize(node);
  return { x: node.x + size.w / 2, y: node.y + size.h / 2 };
};

const portOn = (node: VNode, side: 'bottom' | 'left' | 'right' | 'top'): Point => {
  const size = nodeSize(node);
  switch (side) {
    case 'bottom': {
      return { x: node.x + size.w / 2, y: node.y + size.h };
    }
    case 'left': {
      return { x: node.x, y: node.y + size.h / 2 };
    }
    case 'right': {
      return { x: node.x + size.w, y: node.y + size.h / 2 };
    }
    default: {
      return { x: node.x + size.w / 2, y: node.y };
    }
  }
};

/** Does the vertical segment at `x` between y1..y2 hit the node box? */
const hitsVertical = (nodes: VNode[], x: number, y1: number, y2: number, skipIds: Set<string>) =>
  nodes.some((node) => {
    if (skipIds.has(node.id)) {
      return false;
    }
    const size = nodeSize(node);
    return (
      x > node.x - AVOID_PAD &&
      x < node.x + size.w + AVOID_PAD &&
      y1 < node.y + size.h &&
      y2 > node.y
    );
  });

const hitsHorizontal = (nodes: VNode[], y: number, x1: number, x2: number, skipIds: Set<string>) =>
  nodes.some((node) => {
    if (skipIds.has(node.id)) {
      return false;
    }
    const size = nodeSize(node);
    return (
      y > node.y - AVOID_PAD &&
      y < node.y + size.h + AVOID_PAD &&
      x1 < node.x + size.w &&
      x2 > node.x
    );
  });

/** Path through the points with rounded bends (radius clamped per segment). */
const roundedPath = (points: Point[]): string => {
  if (points.length < 2) {
    return '';
  }
  const first = points[0];
  if (!first) {
    return '';
  }
  let d = `M${first.x},${first.y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1] as Point;
    const corner = points[i] as Point;
    const next = points[i + 1] as Point;
    const len1 = Math.hypot(corner.x - prev.x, corner.y - prev.y);
    const len2 = Math.hypot(next.x - corner.x, next.y - corner.y);
    const r = Math.min(CORNER, len1 / 2, len2 / 2);
    const dir1 = { x: Math.sign(corner.x - prev.x), y: Math.sign(corner.y - prev.y) };
    const dir2 = { x: Math.sign(next.x - corner.x), y: Math.sign(next.y - corner.y) };
    const a = { x: corner.x - dir1.x * r, y: corner.y - dir1.y * r };
    const b = { x: corner.x + dir2.x * r, y: corner.y + dir2.y * r };
    d += ` L${a.x},${a.y} Q${corner.x},${corner.y} ${b.x},${b.y}`;
  }
  const last = points.at(-1) as Point;
  d += ` L${last.x},${last.y}`;
  return d;
};

/**
 * Orthogonal route: pick exit/enter ports by the dominant axis, walk a
 * 3-segment manhattan (with a shared mid axis), and push the mid axis out of
 * any node it would cross. Falls back to straight when the ports align.
 */
export const routeOrthogonal = (source: VNode, target: VNode, obstacles: VNode[] = []): Route => {
  const skipIds = new Set([source.id, target.id]);
  const sc = centerOf(source);
  const tc = centerOf(target);
  const dx = tc.x - sc.x;
  const dy = tc.y - sc.y;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const points: Point[] = horizontal
    ? [portOn(source, dx >= 0 ? 'right' : 'left'), portOn(target, dx >= 0 ? 'left' : 'right')]
    : [portOn(source, dy >= 0 ? 'bottom' : 'top'), portOn(target, dy >= 0 ? 'top' : 'bottom')];
  const p1 = points[0] as Point;
  const p2 = points[1] as Point;
  if (horizontal) {
    if (Math.abs(p1.y - p2.y) < 1) {
      return { points: [p1, p2], d: roundedPath([p1, p2]) };
    }
    let midX = Math.round((p1.x + p2.x) / 2);
    const spanY = [Math.min(p1.y, p2.y), Math.max(p1.y, p2.y)] as const;
    if (hitsVertical(obstacles, midX, spanY[0], spanY[1], skipIds)) {
      // Try the just-outside edges of every obstacle, nearest to the ideal
      // mid axis first, until one actually clears the span.
      const options = obstacles
        .filter((node) => !skipIds.has(node.id))
        .flatMap((node) => {
          const size = nodeSize(node);
          return [node.x + size.w + AVOID_PAD, node.x - AVOID_PAD];
        })
        .sort((a, b) => Math.abs(a - midX) - Math.abs(b - midX));
      for (const option of options) {
        if (!hitsVertical(obstacles, option, spanY[0], spanY[1], skipIds)) {
          midX = Math.round(option);
          break;
        }
      }
    }
    const mid: Point[] = [
      { x: midX, y: p1.y },
      { x: midX, y: p2.y }
    ];
    const all = [p1, ...mid, p2];
    return { points: all, d: roundedPath(all) };
  } else {
    if (Math.abs(p1.x - p2.x) < 1) {
      return { points: [p1, p2], d: roundedPath([p1, p2]) };
    }
    let midY = Math.round((p1.y + p2.y) / 2);
    const spanX = [Math.min(p1.x, p2.x), Math.max(p1.x, p2.x)] as const;
    if (hitsHorizontal(obstacles, midY, spanX[0], spanX[1], skipIds)) {
      const options = obstacles
        .filter((node) => !skipIds.has(node.id))
        .flatMap((node) => {
          const size = nodeSize(node);
          return [node.y + size.h + AVOID_PAD, node.y - AVOID_PAD];
        })
        .sort((a, b) => Math.abs(a - midY) - Math.abs(b - midY));
      for (const option of options) {
        if (!hitsHorizontal(obstacles, option, spanX[0], spanX[1], skipIds)) {
          midY = Math.round(option);
          break;
        }
      }
    }
    const mid: Point[] = [
      { x: p1.x, y: midY },
      { x: p2.x, y: midY }
    ];
    const all = [p1, ...mid, p2];
    return { points: all, d: roundedPath(all) };
  }
};

export const routeStraight = (source: VNode, target: VNode): Route => {
  const sc = centerOf(source);
  const tc = centerOf(target);
  const dx = tc.x - sc.x;
  const dy = tc.y - sc.y;
  // Border-to-border like the classic edgeAnchor, but expressed as points.
  const halfA = { x: nodeSize(source).w / 2, y: nodeSize(source).h / 2 };
  const s = Math.min(halfA.x / Math.max(Math.abs(dx), 1), halfA.y / Math.max(Math.abs(dy), 1), 0.5);
  const p1 = { x: sc.x + dx * s, y: sc.y + dy * s };
  const p2 = { x: tc.x - dx * s, y: tc.y - dy * s };
  return { points: [p1, p2], d: roundedPath([p1, p2]) };
};

export const routeCurved = (source: VNode, target: VNode): Route => {
  const straight = routeStraight(source, target);
  const p1 = straight.points[0] as Point;
  const p2 = straight.points[1] as Point;
  const mx = (p1.x + p2.x) / 2;
  const my = (p1.y + p2.y) / 2;
  const nx = -(p2.y - p1.y);
  const ny = p2.x - p1.x;
  const len = Math.max(Math.hypot(nx, ny), 1);
  const bow = Math.min(60, len * 0.15);
  const c = { x: mx + (nx / len) * bow, y: my + (ny / len) * bow };
  return { points: [p1, c, p2], d: `M${p1.x},${p1.y} Q${c.x},${c.y} ${p2.x},${p2.y}` };
};

export const routeEdge = (
  style: EdgeStyle,
  source: VNode,
  target: VNode,
  obstacles: VNode[] = []
): Route =>
  style === 'straight'
    ? routeStraight(source, target)
    : style === 'curved'
      ? routeCurved(source, target)
      : routeOrthogonal(source, target, obstacles);

/** Point at fraction `t` (0..1) of the route's total polyline length. */
export const pointOnRoute = (route: Route, t: number): Point => {
  const pts = route.points;
  if (pts.length < 2) {
    return pts[0] ?? { x: 0, y: 0 };
  }
  const segments = pts.slice(1).map((p, i) => ({
    len: Math.hypot(p.x - (pts[i] as Point).x, p.y - (pts[i] as Point).y),
    p1: pts[i] as Point,
    p2: p
  }));
  const total = segments.reduce((sum, s) => sum + s.len, 0) || 1;
  let want = total * Math.min(1, Math.max(0, t));
  for (const seg of segments) {
    if (want <= seg.len) {
      const k = seg.len === 0 ? 0 : want / seg.len;
      return {
        x: seg.p1.x + (seg.p2.x - seg.p1.x) * k,
        y: seg.p1.y + (seg.p2.y - seg.p1.y) * k
      };
    }
    want -= seg.len;
  }
  return pts.at(-1) as Point;
};
