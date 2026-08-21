import { describe, expect, it } from 'vitest';
import type { VNode } from './model';
import { NODE_H, NODE_W } from './model';
import { pointOnRoute, routeCurved, routeEdge, routeOrthogonal, routeStraight } from './routing';

const node = (id: string, x: number, y: number): VNode => ({
  id,
  label: id,
  shape: 'rect',
  x,
  y
});

describe('routeOrthogonal', () => {
  it('routes horizontally dominant pairs with a shared mid axis', () => {
    const a = node('A', 0, 0);
    const b = node('B', 600, 200); // dx=670 dominates dy=222
    const route = routeOrthogonal(a, b);
    expect(route.points.length).toBe(4);
    const p1 = route.points[0];
    const p2 = route.points.at(-1);
    if (!p1 || !p2) {
      throw new Error('route points missing');
    }
    expect(p1.x).toBe(NODE_W); // exits right
    expect(p1.y).toBe(NODE_H / 2);
    expect(p2.x).toBe(600); // enters left
    expect(p2.y).toBe(200 + NODE_H / 2);
    // path has rounded bends
    expect(route.d).toContain('Q');
  });

  it('is a straight segment when the ports align', () => {
    const a = node('A', 0, 100);
    const b = node('B', 600, 100);
    const route = routeOrthogonal(a, b);
    expect(route.points.length).toBe(2);
    expect(route.d).not.toContain('Q');
  });

  it('pushes the mid axis around an obstacle', () => {
    const a = node('A', 0, 0);
    const b = node('B', 600, 300);
    const obstacle = node('O', 330, 100); // sits right on the default mid axis (~370)
    const route = routeOrthogonal(a, b, [obstacle]);
    const midPoint = route.points[1];
    if (!midPoint) {
      throw new Error('mid point missing');
    }
    const midX = midPoint.x;
    const size = NODE_W;
    // The mid axis must clear the obstacle box (with padding).
    expect(midX < obstacle.x - 25 || midX > obstacle.x + size + 25).toBe(true);
  });
});

describe('routeStraight / routeCurved', () => {
  it('straight stays a two-point border-to-border line', () => {
    const a = node('A', 0, 0);
    const b = node('B', 400, 300);
    const route = routeStraight(a, b);
    expect(route.points.length).toBe(2);
    expect(route.d.startsWith('M')).toBe(true);
  });

  it('curved emits a quadratic path', () => {
    const a = node('A', 0, 0);
    const b = node('B', 400, 300);
    const route = routeCurved(a, b);
    expect(route.d).toMatch(/^M[\d.,-]+ Q[\d.,-]+ /);
  });

  it('routeEdge dispatches by style', () => {
    const a = node('A', 0, 0);
    const b = node('B', 500, 250);
    expect(routeEdge('straight', a, b).points.length).toBe(2);
    expect(routeEdge('orthogonal', a, b).points.length).toBeGreaterThan(2);
    expect(routeEdge('curved', a, b).d).toContain('Q');
  });
});

describe('pointOnRoute', () => {
  it('returns the endpoints at 0 and 1 and the middle at 0.5', () => {
    const route = {
      d: '',
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 }
      ]
    };
    expect(pointOnRoute(route, 0)).toEqual({ x: 0, y: 0 });
    expect(pointOnRoute(route, 1)).toEqual({ x: 100, y: 100 });
    // total length 200, halfway is at (100, 0)
    expect(pointOnRoute(route, 0.5)).toEqual({ x: 100, y: 0 });
    expect(pointOnRoute(route, 0.75)).toEqual({ x: 100, y: 50 });
  });
});
