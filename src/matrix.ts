export type MatrixData = [number, number, number, number, number, number];

export class Matrix {
  private queue: MatrixData[];
  private cache: MatrixData;
  constructor() {
    this.queue = [];
    this.cache = null;
  }

  public combine(m1: MatrixData, m2: MatrixData): MatrixData {
    return [
      m1[0] * m2[0] + m1[2] * m2[1],
      m1[1] * m2[0] + m1[3] * m2[1],
      m1[0] * m2[2] + m1[2] * m2[3],
      m1[1] * m2[2] + m1[3] * m2[3],
      m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
      m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
    ];
  }

  public isIdentity() {
    if (!this.cache) {
      this.cache = this.toArray();
    }

    const m = this.cache;

    if (m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0) {
      return true;
    }
    return false;
  }

  public matrix(m: MatrixData) {
    if (m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0) {
      return this;
    }
    this.cache = null;
    this.queue.push(m);
    return this;
  }

  public translate(tx: number, ty: number) {
    if (tx !== 0 || ty !== 0) {
      this.cache = null;
      this.queue.push([1, 0, 0, 1, tx, ty]);
    }
    return this;
  }

  public scale(sx: number, sy: number) {
    if (sx !== 1 || sy !== 1) {
      this.cache = null;
      this.queue.push([sx, 0, 0, sy, 0, 0]);
    }
    return this;
  }

  public rotate(angle: number, rx: number, ry: number) {
    if (angle !== 0) {
      this.translate(rx, ry);

      const rad = (angle * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);

      this.queue.push([cos, sin, -sin, cos, 0, 0]);
      this.cache = null;

      this.translate(-rx, -ry);
    }
    return this;
  }

  public skewX(angle: number) {
    if (angle !== 0) {
      this.cache = null;
      this.queue.push([1, 0, Math.tan((angle * Math.PI) / 180), 1, 0, 0]);
    }
    return this;
  }

  public skewY(angle: number) {
    if (angle !== 0) {
      this.cache = null;
      this.queue.push([1, Math.tan((angle * Math.PI) / 180), 0, 1, 0, 0]);
    }
    return this;
  }

  public toArray() {
    if (this.cache) {
      return this.cache;
    }

    if (!this.queue.length) {
      this.cache = [1, 0, 0, 1, 0, 0];
      return this.cache;
    }

    this.cache = this.queue[0];

    if (this.queue.length === 1) {
      return this.cache;
    }

    for (let i = 1; i < this.queue.length; i++) {
      this.cache = this.combine(this.cache, this.queue[i]);
    }

    return this.cache;
  }

  public calc(x: number, y: number, isRelative?: boolean) {
    // Don't change point on empty transforms queue
    if (!this.queue.length) {
      return [x, y];
    }

    // Calculate final matrix, if not exists
    //
    // NB. if you deside to apply transforms to point one-by-one,
    // they should be taken in reverse order

    if (!this.cache) {
      this.cache = this.toArray();
    }

    const m = this.cache;

    // Apply matrix to point
    return [
      x * m[0] + y * m[2] + (isRelative ? 0 : m[4]),
      x * m[1] + y * m[3] + (isRelative ? 0 : m[5])
    ];
  }
}
