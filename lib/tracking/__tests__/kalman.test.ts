import { describe, it, expect } from 'vitest';
import { Kalman2D, LandmarkSmoother } from '../kalman';

describe('Kalman2D', () => {
  it('stabilizes noisy measurements', () => {
    const k = new Kalman2D(1e-3, 1e-2);
    let x = 50, y = 50;
    let last: [number, number] = [0, 0];
    for (let i = 0; i < 100; i++) {
      const noiseX = x + (Math.random() - 0.5) * 2;
      const noiseY = y + (Math.random() - 0.5) * 2;
      k.predict();
      last = k.update(noiseX, noiseY) as [number, number];
    }
    expect(Math.abs(last[0] - x)).toBeLessThan(1);
    expect(Math.abs(last[1] - y)).toBeLessThan(1);
  });
});

describe('LandmarkSmoother', () => {
  it('applies EMA smoothing', () => {
    const s = new LandmarkSmoother(0.4);
    const vals = [0, 10, 20, 30, 40];
    let last = [0,0];
    for (const v of vals) { last = s.smooth(v, v) as [number, number]; }
    expect(last[0]).toBeGreaterThan(20);
    expect(last[0]).toBeLessThan(40);
  });
});