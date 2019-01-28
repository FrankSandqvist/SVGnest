const polygonArea = function(polygon) {
  var area = 0;
  var i, j;
  for (i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    area += (polygon[j].x + polygon[i].x) * (polygon[j].y - polygon[i].y);
  }
  return 0.5 * area;
};

export default polygonArea;
