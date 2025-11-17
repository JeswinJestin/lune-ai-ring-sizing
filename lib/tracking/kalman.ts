export class Kalman2D {
  private q: number;
  private r: number;
  private x: [number, number];
  private p: [[number, number], [number, number]];
  private k: [[number, number], [number, number]];

  constructor(processNoise = 1e-3, measurementNoise = 1e-2) {
    this.q = processNoise;
    this.r = measurementNoise;
    this.x = [0, 0];
    this.p = [[1, 0], [0, 1]];
    this.k = [[0, 0], [0, 0]];
  }

  predict() {
    this.p[0][0] += this.q;
    this.p[1][1] += this.q;
    return this.x;
  }

  update(zx: number, zy: number) {
    const s00 = this.p[0][0] + this.r;
    const s11 = this.p[1][1] + this.r;
    this.k[0][0] = this.p[0][0] / s00;
    this.k[1][1] = this.p[1][1] / s11;

    this.x[0] = this.x[0] + this.k[0][0] * (zx - this.x[0]);
    this.x[1] = this.x[1] + this.k[1][1] * (zy - this.x[1]);

    this.p[0][0] = (1 - this.k[0][0]) * this.p[0][0];
    this.p[1][1] = (1 - this.k[1][1]) * this.p[1][1];
    return this.x;
  }
}

export class LandmarkSmoother {
  private alpha: number;
  private sx: number | null = null;
  private sy: number | null = null;
  constructor(alpha = 0.4) { this.alpha = alpha; }
  smooth(x: number, y: number) {
    if (this.sx === null || this.sy === null) { this.sx = x; this.sy = y; return [x, y]; }
    this.sx = this.alpha * x + (1 - this.alpha) * this.sx;
    this.sy = this.alpha * y + (1 - this.alpha) * this.sy;
    return [this.sx, this.sy];
  }
  reset() { this.sx = null; this.sy = null; }
}

export function createFilters(count = 21) {
  return {
    kalman: Array.from({ length: count }, () => new Kalman2D()),
    smooth: Array.from({ length: count }, () => new LandmarkSmoother()),
  };
}