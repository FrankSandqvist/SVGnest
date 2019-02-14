const TOL = Math.pow(10, -9);

export interface Point {
  x: number;
  y: number;
}

export const quadraticBezierIsFlat = (p1: Point, p2: Point, c1: Point, tol: number) => {
  tol = 4 * tol * tol;

  let ux = 2 * c1.x - p1.x - p2.x;
  ux *= ux;

  let uy = 2 * c1.y - p1.y - p2.y;
  uy *= uy;

  return ux + uy <= tol;
};

export const quadraticBezierLinearize = (p1: Point, p2: Point, c1: Point, tol: number) => {
  const finished = [p1]; // list of points to return
  const todo = [{ p1, p2, c1 }]; // list of Beziers to divide

  // recursion could stack overflow, loop instead
  while (todo.length > 0) {
    var segment = todo[0];

    if (quadraticBezierIsFlat(segment.p1, segment.p2, segment.c1, tol)) {
      // reached subdivision limit
      finished.push({ x: segment.p2.x, y: segment.p2.y });
      todo.shift();
    } else {
      const divided = quadraticBezierSubdivide(segment.p1, segment.p2, segment.c1, 0.5);
      todo.splice(0, 1, divided[0], divided[1]);
    }
  }
  return finished;
};

export const quadraticBezierSubdivide = (p1: Point, p2: Point, c1: Point, t: number) => {
  const mid1 = {
    x: p1.x + (c1.x - p1.x) * t,
    y: p1.y + (c1.y - p1.y) * t
  };

  const mid2 = {
    x: c1.x + (p2.x - c1.x) * t,
    y: c1.y + (p2.y - c1.y) * t
  };

  const mid3 = {
    x: mid1.x + (mid2.x - mid1.x) * t,
    y: mid1.y + (mid2.y - mid1.y) * t
  };

  const seg1 = { p1: p1, p2: mid3, c1: mid1 };
  const seg2 = { p1: mid3, p2: p2, c1: mid2 };

  return [seg1, seg2];
};

export const cubicBezierIsFlat = (p1: Point, p2: Point, c1: Point, c2: Point, tol: number) => {
  tol = 16 * tol * tol;

  let ux = 3 * c1.x - 2 * p1.x - p2.x;
  ux *= ux;

  let uy = 3 * c1.y - 2 * p1.y - p2.y;
  uy *= uy;

  let vx = 3 * c2.x - 2 * p2.x - p1.x;
  vx *= vx;

  let vy = 3 * c2.y - 2 * p2.y - p1.y;
  vy *= vy;

  if (ux < vx) {
    ux = vx;
  }
  if (uy < vy) {
    uy = vy;
  }

  return ux + uy <= tol;
};

export const cubicBezierLinearize = (
  p1: Point,
  p2: Point,
  c1: Point,
  c2: Point,
  tol: number = TOL
) => {
  const finished = [p1]; // list of points to return
  const todo = [{ p1, p2, c1, c2 }]; // list of Beziers to divide

  // recursion could stack overflow, loop instead

  while (todo.length > 0) {
    const segment = todo[0];

    if (cubicBezierIsFlat(segment.p1, segment.p2, segment.c1, segment.c2, tol)) {
      // reached subdivision limit
      finished.push({ x: segment.p2.x, y: segment.p2.y });
      todo.shift();
    } else {
      const divided = cubicBezierSubdivide(segment.p1, segment.p2, segment.c1, segment.c2, 0.5);
      todo.splice(0, 1, divided[0], divided[1]);
    }
  }
  return finished;
};

export const cubicBezierSubdivide = (p1: Point, p2: Point, c1: Point, c2: Point, t: number) => {
  const mid1 = {
    x: p1.x + (c1.x - p1.x) * t,
    y: p1.y + (c1.y - p1.y) * t
  };

  const mid2 = {
    x: c2.x + (p2.x - c2.x) * t,
    y: c2.y + (p2.y - c2.y) * t
  };

  const mid3 = {
    x: c1.x + (c2.x - c1.x) * t,
    y: c1.y + (c2.y - c1.y) * t
  };

  const mida = {
    x: mid1.x + (mid3.x - mid1.x) * t,
    y: mid1.y + (mid3.y - mid1.y) * t
  };

  const midb = {
    x: mid3.x + (mid2.x - mid3.x) * t,
    y: mid3.y + (mid2.y - mid3.y) * t
  };

  const midx = {
    x: mida.x + (midb.x - mida.x) * t,
    y: mida.y + (midb.y - mida.y) * t
  };

  const seg1 = { p1, p2: midx, c1: mid1, c2: mida };
  const seg2 = { p1: midx, p2, c1: midb, c2: mid2 };

  return [seg1, seg2];
};

export const arcLinearize = (
  p1: Point,
  p2: Point,
  rx: number,
  ry: number,
  angle: number,
  largearc: 0 | 1,
  sweep: 0 | 1,
  tol: number = TOL
) => {
  const finished = [p2]; // list of points to return

  let arc = arcSvgToCenter(p1, p2, rx, ry, angle, largearc, sweep);
  const todo = [arc]; // list of arcs to divide

  // recursion could stack overflow, loop instead
  while (todo.length > 0) {
    arc = todo[0];

    var fullarc = arcCenterToSvg(arc.center, arc.rx, arc.ry, arc.theta, arc.extent, arc.angle);
    var subarc = arcCenterToSvg(arc.center, arc.rx, arc.ry, arc.theta, 0.5 * arc.extent, arc.angle);
    var arcmid = subarc.p2;

    var mid = {
      x: 0.5 * (fullarc.p1.x + fullarc.p2.x),
      y: 0.5 * (fullarc.p1.y + fullarc.p2.y)
    };

    // compare midpoint of line with midpoint of arc
    // this is not 100% accurate, but should be a good heuristic for flatness in most cases
    if (withinDistance(mid, arcmid, tol)) {
      finished.unshift(fullarc.p2);
      todo.shift();
    } else {
      const arc1 = {
        center: arc.center,
        rx: arc.rx,
        ry: arc.ry,
        theta: arc.theta,
        extent: 0.5 * arc.extent,
        angle: arc.angle
      };
      const arc2 = {
        center: arc.center,
        rx: arc.rx,
        ry: arc.ry,
        theta: arc.theta + 0.5 * arc.extent,
        extent: 0.5 * arc.extent,
        angle: arc.angle
      };
      todo.splice(0, 1, arc1, arc2);
    }
  }
  return finished;
};

export const arcCenterToSvg = (
  center: Point,
  rx: number,
  ry: number,
  theta1: number,
  extent: number,
  angleDegrees: number
) => {
  let theta2 = theta1 + extent;

  theta1 = degreesToRadians(theta1);
  theta2 = degreesToRadians(theta2);
  const angle = degreesToRadians(angleDegrees);

  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  const t1cos = Math.cos(theta1);
  const t1sin = Math.sin(theta1);

  const t2cos = Math.cos(theta2);
  const t2sin = Math.sin(theta2);

  const x0 = center.x + cos * rx * t1cos + -sin * ry * t1sin;
  const y0 = center.y + sin * rx * t1cos + cos * ry * t1sin;

  const x1 = center.x + cos * rx * t2cos + -sin * ry * t2sin;
  const y1 = center.y + sin * rx * t2cos + cos * ry * t2sin;

  const largearc = extent > 180 ? 1 : 0;
  const sweep = extent > 0 ? 1 : 0;

  return {
    p1: { x: x0, y: y0 },
    p2: { x: x1, y: y1 },
    rx: rx,
    ry: ry,
    angle: angle,
    largearc: largearc,
    sweep: sweep
  };
};

// convert from SVG format arc to center point arc
export const arcSvgToCenter = (
  p1: Point,
  p2: Point,
  rx: number,
  ry: number,
  angleDegrees: number,
  largearc: 0 | 1,
  sweep: 0 | 1
) => {
  const mid = {
    x: 0.5 * (p1.x + p2.x),
    y: 0.5 * (p1.y + p2.y)
  };

  const diff = {
    x: 0.5 * (p2.x - p1.x),
    y: 0.5 * (p2.y - p1.y)
  };

  const angle = degreesToRadians(angleDegrees % 360);

  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  const x1 = cos * diff.x + sin * diff.y;
  const y1 = -sin * diff.x + cos * diff.y;

  rx = Math.abs(rx);
  ry = Math.abs(ry);
  let Prx = rx * rx;
  let Pry = ry * ry;
  const Px1 = x1 * x1;
  const Py1 = y1 * y1;

  const radiiCheck = Px1 / Prx + Py1 / Pry;
  const radiiSqrt = Math.sqrt(radiiCheck);
  if (radiiCheck > 1) {
    rx = radiiSqrt * rx;
    ry = radiiSqrt * ry;
    Prx = rx * rx;
    Pry = ry * ry;
  }

  let sign = largearc != sweep ? -1 : 1;
  let sq = (Prx * Pry - Prx * Py1 - Pry * Px1) / (Prx * Py1 + Pry * Px1);

  sq = sq < 0 ? 0 : sq;

  const coef = sign * Math.sqrt(sq);
  const cx1 = coef * ((rx * y1) / ry);
  const cy1 = coef * -((ry * x1) / rx);

  const cx = mid.x + (cos * cx1 - sin * cy1);
  const cy = mid.y + (sin * cx1 + cos * cy1);

  const ux = (x1 - cx1) / rx;
  const uy = (y1 - cy1) / ry;
  const vx = (-x1 - cx1) / rx;
  const vy = (-y1 - cy1) / ry;
  let n = Math.sqrt(ux * ux + uy * uy);
  let p = ux;
  sign = uy < 0 ? -1 : 1;

  let theta = sign * Math.acos(p / n);
  theta = radiansToDegrees(theta);

  n = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy));
  p = ux * vx + uy * vy;
  sign = ux * vy - uy * vx < 0 ? -1 : 1;
  let delta = sign * Math.acos(p / n);
  delta = radiansToDegrees(delta);

  if (sweep == 1 && delta > 0) {
    delta -= 360;
  } else if (sweep == 0 && delta < 0) {
    delta += 360;
  }

  delta %= 360;
  theta %= 360;

  return {
    center: { x: cx, y: cy },
    rx: rx,
    ry: ry,
    theta: theta,
    extent: delta,
    angle: angleDegrees
  };
};

export const getPolygonBounds = (polygon: Point[]) => {
  if (!polygon || polygon.length < 3) {
    return null;
  }

  let xmin = polygon[0].x;
  let xmax = polygon[0].x;
  let ymin = polygon[0].y;
  let ymax = polygon[0].y;

  for (let i = 1; i < polygon.length; i++) {
    if (polygon[i].x > xmax) {
      xmax = polygon[i].x;
    } else if (polygon[i].x < xmin) {
      xmin = polygon[i].x;
    }

    if (polygon[i].y > ymax) {
      ymax = polygon[i].y;
    } else if (polygon[i].y < ymin) {
      ymin = polygon[i].y;
    }
  }

  return {
    x: xmin,
    y: ymin,
    width: xmax - xmin,
    height: ymax - ymin
  };
};

// return true if point is in the polygon, false if outside, and null if exactly on a point or edge
export const pointInPolygon = (
  point: Point,
  polygon: Point[],
  offsetX: number = 0,
  offsetY: number = 0
) => {
  if (!polygon || polygon.length < 3) {
    return null;
  }

  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x + offsetX;
    const yi = polygon[i].y + offsetY;
    const xj = polygon[j].x + offsetX;
    const yj = polygon[j].y + offsetY;

    if (almostEqual(xi, point.x) && almostEqual(yi, point.y)) {
      return null; // no result
    }

    if (onSegment({ x: xi, y: yi }, { x: xj, y: yj }, point)) {
      return null; // exactly on the segment
    }

    if (almostEqual(xi, xj) && almostEqual(yi, yj)) {
      // ignore very small lines
      continue;
    }

    const intersect =
      yi > point.y != yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
};

export const onSegment = (a: Point, b: Point, p: Point) => {
  // vertical line
  if (almostEqual(a.x, b.x) && almostEqual(p.x, a.x)) {
    if (
      !almostEqual(p.y, b.y) &&
      !almostEqual(p.y, a.y) &&
      p.y < Math.max(b.y, a.y) &&
      p.y > Math.min(b.y, a.y)
    ) {
      return true;
    } else {
      return false;
    }
  }

  // horizontal line
  if (almostEqual(a.y, b.y) && almostEqual(p.y, a.y)) {
    if (
      !almostEqual(p.x, b.x) &&
      !almostEqual(p.x, a.x) &&
      p.x < Math.max(b.x, a.x) &&
      p.x > Math.min(b.x, a.x)
    ) {
      return true;
    } else {
      return false;
    }
  }

  //range check
  if (
    (p.x < a.x && p.x < b.x) ||
    (p.x > a.x && p.x > b.x) ||
    (p.y < a.y && p.y < b.y) ||
    (p.y > a.y && p.y > b.y)
  ) {
    return false;
  }

  // exclude end points
  if (
    (almostEqual(p.x, a.x) && almostEqual(p.y, a.y)) ||
    (almostEqual(p.x, b.x) && almostEqual(p.y, b.y))
  ) {
    return false;
  }

  var cross = (p.y - a.y) * (b.x - a.x) - (p.x - a.x) * (b.y - a.y);

  if (Math.abs(cross) > TOL) {
    return false;
  }

  var dot = (p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y);

  if (dot < 0 || almostEqual(dot, 0)) {
    return false;
  }

  var len2 = (b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y);

  if (dot > len2 || almostEqual(dot, len2)) {
    return false;
  }

  return true;
};

// returns the area of the polygon, assuming no self-intersections
// a negative area indicates counter-clockwise winding direction
export const polygonArea = (polygon: Point[]) => {
  let area = 0;
  let i, j;
  for (i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    area += (polygon[j].x + polygon[i].x) * (polygon[j].y - polygon[i].y);
  }
  return 0.5 * area;
};

// todo: swap this for a more efficient sweep-line implementation
// returnEdges: if set, return all edges on A that have intersections

export const degreesToRadians = (angle: number) => angle * (Math.PI / 180);

export const radiansToDegrees = (angle: number) => angle * (180 / Math.PI);

export const almostEqual = (a: number, b: number, tolerance: number = TOL) =>
  Math.abs(a - b) < tolerance;

// returns true if points are within the given distance
export const withinDistance = (p1: Point, p2: Point, distance: number) => {
  var dx = p1.x - p2.x;
  var dy = p1.y - p2.y;
  return dx * dx + dy * dy < distance * distance;
};

export const normalizeVector = (v: Point) => {
  if (almostEqual(v.x * v.x + v.y * v.y, 1)) {
    return v; // given vector was already a unit vector
  }
  const len = Math.sqrt(v.x * v.x + v.y * v.y);
  const inverse = 1 / len;

  return {
    x: v.x * inverse,
    y: v.y * inverse
  };
};
