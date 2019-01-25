import * as ClipperLib from "./clipper";

export default class GeometryUtil {
  conf: any = {};
  TOL = Math.pow(10, -9);

  QuadraticBezier = {
    // Roger Willcocks bezier flatness criterion
    isFlat: function(p1, p2, c1, tol) {
      tol = 4 * tol * tol;

      var ux = 2 * c1.x - p1.x - p2.x;
      ux *= ux;

      var uy = 2 * c1.y - p1.y - p2.y;
      uy *= uy;

      return ux + uy <= tol;
    },

    // turn Bezier into line segments via de Casteljau, returns an array of points
    linearize: function(p1, p2, c1, tol) {
      var finished = [p1]; // list of points to return
      var todo = [
        {
          p1: p1,
          p2: p2,
          c1: c1
        }
      ]; // list of Beziers to divide

      // recursion could stack overflow, loop instead
      while (todo.length > 0) {
        var segment = todo[0];

        if (this.isFlat(segment.p1, segment.p2, segment.c1, tol)) {
          // reached subdivision limit
          finished.push({
            x: segment.p2.x,
            y: segment.p2.y
          });
          todo.shift();
        } else {
          var divided = this.subdivide(segment.p1, segment.p2, segment.c1, 0.5);
          todo.splice(0, 1, divided[0], divided[1]);
        }
      }
      return finished;
    },

    // subdivide a single Bezier
    // t is the percent along the Bezier to divide at. eg. 0.5
    subdivide: function(p1, p2, c1, t) {
      var mid1 = {
        x: p1.x + (c1.x - p1.x) * t,
        y: p1.y + (c1.y - p1.y) * t
      };

      var mid2 = {
        x: c1.x + (p2.x - c1.x) * t,
        y: c1.y + (p2.y - c1.y) * t
      };

      var mid3 = {
        x: mid1.x + (mid2.x - mid1.x) * t,
        y: mid1.y + (mid2.y - mid1.y) * t
      };

      var seg1 = {
        p1: p1,
        p2: mid3,
        c1: mid1
      };
      var seg2 = {
        p1: mid3,
        p2: p2,
        c1: mid2
      };

      return [seg1, seg2];
    }
  };

  CubicBezier = {
    isFlat: function(p1, p2, c1, c2, tol) {
      tol = 16 * tol * tol;

      var ux = 3 * c1.x - 2 * p1.x - p2.x;
      ux *= ux;

      var uy = 3 * c1.y - 2 * p1.y - p2.y;
      uy *= uy;

      var vx = 3 * c2.x - 2 * p2.x - p1.x;
      vx *= vx;

      var vy = 3 * c2.y - 2 * p2.y - p1.y;
      vy *= vy;

      if (ux < vx) {
        ux = vx;
      }
      if (uy < vy) {
        uy = vy;
      }

      return ux + uy <= tol;
    },

    linearize: function(p1, p2, c1, c2, tol) {
      var finished = [p1]; // list of points to return
      var todo = [
        {
          p1: p1,
          p2: p2,
          c1: c1,
          c2: c2
        }
      ]; // list of Beziers to divide

      // recursion could stack overflow, loop instead

      while (todo.length > 0) {
        var segment = todo[0];

        if (this.isFlat(segment.p1, segment.p2, segment.c1, segment.c2, tol)) {
          // reached subdivision limit
          finished.push({
            x: segment.p2.x,
            y: segment.p2.y
          });
          todo.shift();
        } else {
          var divided = this.subdivide(
            segment.p1,
            segment.p2,
            segment.c1,
            segment.c2,
            0.5
          );
          todo.splice(0, 1, divided[0], divided[1]);
        }
      }
      return finished;
    },

    subdivide: function(p1, p2, c1, c2, t) {
      var mid1 = {
        x: p1.x + (c1.x - p1.x) * t,
        y: p1.y + (c1.y - p1.y) * t
      };

      var mid2 = {
        x: c2.x + (p2.x - c2.x) * t,
        y: c2.y + (p2.y - c2.y) * t
      };

      var mid3 = {
        x: c1.x + (c2.x - c1.x) * t,
        y: c1.y + (c2.y - c1.y) * t
      };

      var mida = {
        x: mid1.x + (mid3.x - mid1.x) * t,
        y: mid1.y + (mid3.y - mid1.y) * t
      };

      var midb = {
        x: mid3.x + (mid2.x - mid3.x) * t,
        y: mid3.y + (mid2.y - mid3.y) * t
      };

      var midx = {
        x: mida.x + (midb.x - mida.x) * t,
        y: mida.y + (midb.y - mida.y) * t
      };

      var seg1 = {
        p1: p1,
        p2: midx,
        c1: mid1,
        c2: mida
      };
      var seg2 = {
        p1: midx,
        p2: p2,
        c1: midb,
        c2: mid2
      };

      return [seg1, seg2];
    }
  };

  Arc = {
    linearize: function(p1, p2, rx, ry, angle, largearc, sweep, tol) {
      var finished = [p2]; // list of points to return

      var arc = this.svgToCenter(p1, p2, rx, ry, angle, largearc, sweep);
      var todo = [arc]; // list of arcs to divide

      // recursion could stack overflow, loop instead
      while (todo.length > 0) {
        arc = todo[0];

        var fullarc = this.centerToSvg(
          arc.center,
          arc.rx,
          arc.ry,
          arc.theta,
          arc.extent,
          arc.angle
        );
        var subarc = this.centerToSvg(
          arc.center,
          arc.rx,
          arc.ry,
          arc.theta,
          0.5 * arc.extent,
          arc.angle
        );
        var arcmid = subarc.p2;

        var mid = {
          x: 0.5 * (fullarc.p1.x + fullarc.p2.x),
          y: 0.5 * (fullarc.p1.y + fullarc.p2.y)
        };

        // compare midpoint of line with midpoint of arc
        // this is not 100% accurate, but should be a good heuristic for flatness in most cases
        if (this._withinDistance(mid, arcmid, tol)) {
          finished.unshift(fullarc.p2);
          todo.shift();
        } else {
          var arc1 = {
            center: arc.center,
            rx: arc.rx,
            ry: arc.ry,
            theta: arc.theta,
            extent: 0.5 * arc.extent,
            angle: arc.angle
          };
          var arc2 = {
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
    },

    // convert from center point/angle sweep definition to SVG point and flag definition of arcs
    // ported from http://commons.oreilly.com/wiki/index.php/SVG_Essentials/Paths
    centerToSvg: function(center, rx, ry, theta1, extent, angleDegrees) {
      var theta2 = theta1 + extent;

      theta1 = this._degreesToRadians(theta1);
      theta2 = this._degreesToRadians(theta2);
      var angle = this._degreesToRadians(angleDegrees);

      var cos = Math.cos(angle);
      var sin = Math.sin(angle);

      var t1cos = Math.cos(theta1);
      var t1sin = Math.sin(theta1);

      var t2cos = Math.cos(theta2);
      var t2sin = Math.sin(theta2);

      var x0 = center.x + cos * rx * t1cos + -sin * ry * t1sin;
      var y0 = center.y + sin * rx * t1cos + cos * ry * t1sin;

      var x1 = center.x + cos * rx * t2cos + -sin * ry * t2sin;
      var y1 = center.y + sin * rx * t2cos + cos * ry * t2sin;

      var largearc = extent > 180 ? 1 : 0;
      var sweep = extent > 0 ? 1 : 0;

      return {
        p1: {
          x: x0,
          y: y0
        },
        p2: {
          x: x1,
          y: y1
        },
        rx: rx,
        ry: ry,
        angle: angle,
        largearc: largearc,
        sweep: sweep
      };
    },

    // convert from SVG format arc to center point arc
    svgToCenter: function(p1, p2, rx, ry, angleDegrees, largearc, sweep) {
      var mid = {
        x: 0.5 * (p1.x + p2.x),
        y: 0.5 * (p1.y + p2.y)
      };

      var diff = {
        x: 0.5 * (p2.x - p1.x),
        y: 0.5 * (p2.y - p1.y)
      };

      var angle = this._degreesToRadians(angleDegrees % 360);

      var cos = Math.cos(angle);
      var sin = Math.sin(angle);

      var x1 = cos * diff.x + sin * diff.y;
      var y1 = -sin * diff.x + cos * diff.y;

      rx = Math.abs(rx);
      ry = Math.abs(ry);
      var Prx = rx * rx;
      var Pry = ry * ry;
      var Px1 = x1 * x1;
      var Py1 = y1 * y1;

      var radiiCheck = Px1 / Prx + Py1 / Pry;
      var radiiSqrt = Math.sqrt(radiiCheck);
      if (radiiCheck > 1) {
        rx = radiiSqrt * rx;
        ry = radiiSqrt * ry;
        Prx = rx * rx;
        Pry = ry * ry;
      }

      var sign = largearc != sweep ? -1 : 1;
      var sq = (Prx * Pry - Prx * Py1 - Pry * Px1) / (Prx * Py1 + Pry * Px1);

      sq = sq < 0 ? 0 : sq;

      var coef = sign * Math.sqrt(sq);
      var cx1 = coef * ((rx * y1) / ry);
      var cy1 = coef * -((ry * x1) / rx);

      var cx = mid.x + (cos * cx1 - sin * cy1);
      var cy = mid.y + (sin * cx1 + cos * cy1);

      var ux = (x1 - cx1) / rx;
      var uy = (y1 - cy1) / ry;
      var vx = (-x1 - cx1) / rx;
      var vy = (-y1 - cy1) / ry;
      var n = Math.sqrt(ux * ux + uy * uy);
      var p = ux;
      sign = uy < 0 ? -1 : 1;

      var theta = sign * Math.acos(p / n);
      theta = this._radiansToDegrees(theta);

      n = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy));
      p = ux * vx + uy * vy;
      sign = ux * vy - uy * vx < 0 ? -1 : 1;
      var delta = sign * Math.acos(p / n);
      delta = this._radiansToDegrees(delta);

      if (sweep == 1 && delta > 0) {
        delta -= 360;
      } else if (sweep == 0 && delta < 0) {
        delta += 360;
      }

      delta %= 360;
      theta %= 360;

      return {
        center: {
          x: cx,
          y: cy
        },
        rx: rx,
        ry: ry,
        theta: theta,
        extent: delta,
        angle: angleDegrees
      };
    }
  };

  constructor(config) {
    this.conf = config;
  }
  getPolygonBounds(polygon) {
    if (!polygon || polygon.length < 3) {
      return null;
    }

    var xmin = polygon[0].x;
    var xmax = polygon[0].x;
    var ymin = polygon[0].y;
    var ymax = polygon[0].y;

    for (var i = 1; i < polygon.length; i++) {
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
  }

  polygonArea(polygon) {
    var area = 0;
    var i, j;
    for (i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      area += (polygon[j].x + polygon[i].x) * (polygon[j].y - polygon[i].y);
    }
    return 0.5 * area;
  }

  getParts(paths) {
    console.log("GETPARTS");

    var i, j;
    var polygons = [];

    var numChildren = paths.length;
    for (i = 0; i < numChildren; i++) {
      var poly = this.polygonify(paths[i]);

      console.log("POLY", poly);

      poly = this.cleanPolygon(poly);

      // todo: warn user if poly could not be processed and is excluded from the nest
      if (
        poly &&
        poly.length > 2 &&
        Math.abs(this.polygonArea(poly)) >
          this.conf.curveTolerance * this.conf.curveTolerance
      ) {
        poly["source"] = i;
        polygons.push(poly);
      }
    }

    const toTree = (list, idstart?) => {
      var parents = [];
      var i, j;

      // assign a unique id to each leaf
      var id = idstart || 0;

      for (i = 0; i < list.length; i++) {
        var p = list[i];

        var ischild = false;
        for (j = 0; j < list.length; j++) {
          if (j == i) {
            continue;
          }
          if (this.pointInPolygon(p[0], list[j]) === true) {
            if (!list[j].children) {
              list[j].children = [];
            }
            list[j].children.push(p);
            p.parent = list[j];
            ischild = true;
            break;
          }
        }

        if (!ischild) {
          parents.push(p);
        }
      }

      for (i = 0; i < list.length; i++) {
        if (parents.indexOf(list[i]) < 0) {
          list.splice(i, 1);
          i--;
        }
      }

      for (i = 0; i < parents.length; i++) {
        parents[i].id = id;
        id++;
      }

      for (i = 0; i < parents.length; i++) {
        if (parents[i].children) {
          id = toTree(parents[i].children, id);
        }
      }

      return id;
    };

    // turn the list into a tree
    toTree(polygons);

    console.log("POLYGONS", polygons);

    return polygons;
  }

  polygonify(element) {
    return element;
    var poly = [];
    var i;

    console.log("element:", element.tagName);

    var seglist = element.pathSegList;

    //var firstCommand = seglist.getItem(0);
    //var lastCommand = seglist.getItem(seglist.numberOfItems - 1);

    var x = 0,
      y = 0,
      x0 = 0,
      y0 = 0,
      x1 = 0,
      y1 = 0,
      x2 = 0,
      y2 = 0,
      prevx = 0,
      prevy = 0,
      prevx1 = 0,
      prevy1 = 0,
      prevx2 = 0,
      prevy2 = 0;

    for (let i = 0; i < seglist.numberOfItems; i++) {
      var s = seglist.getItem(i);
      var command = s.pathSegTypeAsLetter;

      prevx = x;
      prevy = y;

      prevx1 = x1;
      prevy1 = y1;

      prevx2 = x2;
      prevy2 = y2;

      if (/[MLHVCSQTA]/.test(command)) {
        if ("x1" in s) x1 = s.x1;
        if ("x2" in s) x2 = s.x2;
        if ("y1" in s) y1 = s.y1;
        if ("y2" in s) y2 = s.y2;
        if ("x" in s) x = s.x;
        if ("y" in s) y = s.y;
      } else {
        if ("x1" in s) x1 = x + s.x1;
        if ("x2" in s) x2 = x + s.x2;
        if ("y1" in s) y1 = y + s.y1;
        if ("y2" in s) y2 = y + s.y2;
        if ("x" in s) x += s.x;
        if ("y" in s) y += s.y;
      }
      switch (command) {
        // linear line types
        case "m":
        case "M":
        case "l":
        case "L":
        case "h":
        case "H":
        case "v":
        case "V":
          let point = { x, y };
          point.x = x;
          point.y = y;
          poly.push(point);
          break;
        // Quadratic Beziers
        case "t":
        case "T":
          // implicit control point
          if (
            i > 0 &&
            /[QqTt]/.test(seglist.getItem(i - 1).pathSegTypeAsLetter)
          ) {
            x1 = prevx + (prevx - prevx1);
            y1 = prevy + (prevy - prevy1);
          } else {
            x1 = prevx;
            y1 = prevy;
          }
        case "q":
        case "Q":
          var pointlist = this.QuadraticBezier.linearize(
            { x: prevx, y: prevy },
            { x: x, y: y },
            { x: x1, y: y1 },
            this.conf.tolerance
          );
          pointlist.shift(); // firstpoint would already be in the poly
          for (var j = 0; j < pointlist.length; j++) {
            let point = { x, y };
            point.x = pointlist[j].x;
            point.y = pointlist[j].y;
            poly.push(point);
          }
          break;
        case "s":
        case "S":
          if (
            i > 0 &&
            /[CcSs]/.test(seglist.getItem(i - 1).pathSegTypeAsLetter)
          ) {
            x1 = prevx + (prevx - prevx2);
            y1 = prevy + (prevy - prevy2);
          } else {
            x1 = prevx;
            y1 = prevy;
          }
        case "c":
        case "C":
          var pointlist = this.CubicBezier.linearize(
            { x: prevx, y: prevy },
            { x: x, y: y },
            { x: x1, y: y1 },
            { x: x2, y: y2 },
            this.conf.tolerance
          );
          pointlist.shift(); // firstpoint would already be in the poly
          for (var j = 0; j < pointlist.length; j++) {
            let point = { x, y };
            point.x = pointlist[j].x;
            point.y = pointlist[j].y;
            poly.push(point);
          }
          break;
        case "a":
        case "A":
          var pointlist = this.Arc.linearize(
            { x: prevx, y: prevy },
            { x: x, y: y },
            s.r1,
            s.r2,
            s.angle,
            s.largeArcFlag,
            s.sweepFlag,
            this.conf.tolerance
          );
          pointlist.shift();

          for (var j = 0; j < pointlist.length; j++) {
            let point = { x, y };
            point.x = pointlist[j].x;
            point.y = pointlist[j].y;
            poly.push(point);
          }
          break;
        case "z":
        case "Z":
          x = x0;
          y = y0;
          break;
      }
      // Record the start of a subpath
      if (command == "M" || command == "m") (x0 = x), (y0 = y);
    }

    // do not include last point if coincident with starting point
    while (
      poly.length > 0 &&
      this.almostEqual(
        poly[0].x,
        poly[poly.length - 1].x,
        this.conf.toleranceSvg
      ) &&
      this.almostEqual(
        poly[0].y,
        poly[poly.length - 1].y,
        this.conf.toleranceSvg
      )
    ) {
      poly.pop();
    }

    return poly;
  }

  cleanPolygon(polygon) {
    var p = this.svgToClipper(polygon);
    // remove self-intersections and find the biggest polygon that's left
    var simple = ClipperLib.Clipper.SimplifyPolygon(
      p,
      ClipperLib.PolyFillType.pftNonZero
    );

    if (!simple || simple.length == 0) {
      return null;
    }

    var biggest = simple[0];
    var biggestarea = Math.abs(ClipperLib.Clipper.Area(biggest));
    for (var i = 1; i < simple.length; i++) {
      var area = Math.abs(ClipperLib.Clipper.Area(simple[i]));
      if (area > biggestarea) {
        biggest = simple[i];
        biggestarea = area;
      }
    }

    // clean up singularities, coincident points and edges
    var clean = ClipperLib.Clipper.CleanPolygon(
      biggest,
      this.conf.curveTolerance * this.conf.clipperScale
    );

    if (!clean || clean.length == 0) {
      return null;
    }

    return this.clipperToSvg(clean);
  }

  svgToClipper(polygon) {
    var clip = [];
    for (var i = 0; i < polygon.length; i++) {
      clip.push({ X: polygon[i].x, Y: polygon[i].y });
    }

    ClipperLib.JS.ScaleUpPath(clip, this.conf.clipperScale);

    return clip;
  }

  pointInPolygon(point, polygon) {
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

      if (this.almostEqual(xi, point.x) && this.almostEqual(yi, point.y)) {
        return null; // no result
      }

      if (
        this._onSegment(
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

      if (this.almostEqual(xi, xj) && this.almostEqual(yi, yj)) {
        // ignore very small lines
        continue;
      }

      var intersect =
        yi > point.y != yj > point.y &&
        point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }

    return inside;
  }

  almostEqual(a, b, tolerance?) {
    if (!tolerance) {
      tolerance = this.TOL;
    }
    return Math.abs(a - b) < tolerance;
  }

  _onSegment(A, B, p) {
    // vertical line
    if (this.almostEqual(A.x, B.x) && this.almostEqual(p.x, A.x)) {
      if (
        !this.almostEqual(p.y, B.y) &&
        !this.almostEqual(p.y, A.y) &&
        p.y < Math.max(B.y, A.y) &&
        p.y > Math.min(B.y, A.y)
      ) {
        return true;
      } else {
        return false;
      }
    }

    // horizontal line
    if (this.almostEqual(A.y, B.y) && this.almostEqual(p.y, A.y)) {
      if (
        !this.almostEqual(p.x, B.x) &&
        !this.almostEqual(p.x, A.x) &&
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
      (this.almostEqual(p.x, A.x) && this.almostEqual(p.y, A.y)) ||
      (this.almostEqual(p.x, B.x) && this.almostEqual(p.y, B.y))
    ) {
      return false;
    }

    var cross = (p.y - A.y) * (B.x - A.x) - (p.x - A.x) * (B.y - A.y);

    if (Math.abs(cross) > this.TOL) {
      return false;
    }

    var dot = (p.x - A.x) * (B.x - A.x) + (p.y - A.y) * (B.y - A.y);

    if (dot < 0 || this.almostEqual(dot, 0)) {
      return false;
    }

    var len2 = (B.x - A.x) * (B.x - A.x) + (B.y - A.y) * (B.y - A.y);

    if (dot > len2 || this.almostEqual(dot, len2)) {
      return false;
    }

    return true;
  }

  clipperToSvg(polygon) {
    var normal = [];

    for (var i = 0; i < polygon.length; i++) {
      normal.push({
        x: polygon[i].X / this.conf.clipperScale,
        y: polygon[i].Y / this.conf.clipperScale
      });
    }

    return normal;
  }

  _radiansToDegrees(angle) {
    return angle * (180 / Math.PI);
  }

  _degreesToRadians(angle: number) {
    return angle * (Math.PI / 180);
  }

  _withinDistance(p1, p2, distance) {
    var dx = p1.x - p2.x;
    var dy = p1.y - p2.y;
    return dx * dx + dy * dy < distance * distance;
  }

  polygonOffset(polygon, offset) {
    let config = this.conf;
    if (!offset || offset == 0 || this.almostEqual(offset, 0)) {
      return polygon;
    }

    var p = this.svgToClipper(polygon);

    var miterLimit = 2;
    var co = new ClipperLib.ClipperOffset(
      miterLimit,
      config.curveTolerance * config.clipperScale
    );
    co.AddPath(
      p,
      ClipperLib.JoinType.jtRound,
      ClipperLib.EndType.etClosedPolygon
    );

    var newpaths: any = new ClipperLib.Paths();
    co.Execute(newpaths, offset * config.clipperScale);

    var result = [];
    for (var i = 0; i < newpaths.length; i++) {
      result.push(this.clipperToSvg(newpaths[i]));
    }

    return result;
  }
}
