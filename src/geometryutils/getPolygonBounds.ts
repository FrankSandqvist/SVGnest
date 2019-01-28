const getPolygonBounds = polygon => {
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
};

export default getPolygonBounds;
