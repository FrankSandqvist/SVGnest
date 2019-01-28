// Roger Willcocks bezier flatness criterion
export const isFlat = (p1, p2, c1, tol) => {
  tol = 4 * tol * tol;

  var ux = 2 * c1.x - p1.x - p2.x;
  ux *= ux;

  var uy = 2 * c1.y - p1.y - p2.y;
  uy *= uy;

  return ux + uy <= tol;
};

// turn Bezier into line segments via de Casteljau, returns an array of points
export const linearize = (p1, p2, c1, tol) => {
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
};

// subdivide a single Bezier
// t is the percent along the Bezier to divide at. eg. 0.5
export const subdivide = (p1, p2, c1, t) => {
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
};
