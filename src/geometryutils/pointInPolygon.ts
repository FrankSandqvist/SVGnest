import almostEqual from "./almostEqual";

const pointInPolygon = (point, polygon) => {
  if (!polygon || polygon.length < 3) {
    return null;
  }

  var inside = false;
  var offsetx = polygon.offsetx || 0;
  var offsety = polygon.offsety || 0;

  for (var i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    var xi = polygon[i].x + offsetx;
    var yi = polygon[i].y + offsety;
    var xj = polygon[j].x + offsetx;
    var yj = polygon[j].y + offsety;

    if (almostEqual(xi, point.x) && almostEqual(yi, point.y)) {
      return null; // no result
    }

    if (
      _onSegment(
        {
          x: xi,
          y: yi
        },
        {
          x: xj,
          y: yj
        },
        point
      )
    ) {
      return null; // exactly on the segment
    }

    if (almostEqual(xi, xj) && almostEqual(yi, yj)) {
      // ignore very small lines
      continue;
    }

    var intersect =
      yi > point.y != yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }

  return inside;
};

const _onSegment = (A, B, p) => {
  // vertical line
  if (almostEqual(A.x, B.x) && almostEqual(p.x, A.x)) {
    if (
      !almostEqual(p.y, B.y) &&
      !almostEqual(p.y, A.y) &&
      p.y < Math.max(B.y, A.y) &&
      p.y > Math.min(B.y, A.y)
    ) {
      return true;
    } else {
      return false;
    }
  }

  // horizontal line
  if (almostEqual(A.y, B.y) && almostEqual(p.y, A.y)) {
    if (
      !almostEqual(p.x, B.x) &&
      !almostEqual(p.x, A.x) &&
      p.x < Math.max(B.x, A.x) &&
      p.x > Math.min(B.x, A.x)
    ) {
      return true;
    } else {
      return false;
    }
  }

  //range check
  if (
    (p.x < A.x && p.x < B.x) ||
    (p.x > A.x && p.x > B.x) ||
    (p.y < A.y && p.y < B.y) ||
    (p.y > A.y && p.y > B.y)
  ) {
    return false;
  }

  // exclude end points
  if (
    (almostEqual(p.x, A.x) && almostEqual(p.y, A.y)) ||
    (almostEqual(p.x, B.x) && almostEqual(p.y, B.y))
  ) {
    return false;
  }

  var cross = (p.y - A.y) * (B.x - A.x) - (p.x - A.x) * (B.y - A.y);

  if (Math.abs(cross) > this.TOL) {
    return false;
  }

  var dot = (p.x - A.x) * (B.x - A.x) + (p.y - A.y) * (B.y - A.y);

  if (dot < 0 || almostEqual(dot, 0)) {
    return false;
  }

  var len2 = (B.x - A.x) * (B.x - A.x) + (B.y - A.y) * (B.y - A.y);

  if (dot > len2 || almostEqual(dot, len2)) {
    return false;
  }

  return true;
};

export default pointInPolygon;
