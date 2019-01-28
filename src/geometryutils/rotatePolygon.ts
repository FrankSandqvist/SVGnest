import getPolygonBounds from "../geometryutils/getPolygonBounds";

const rotatePolygon = (polygon, angle) => {
  var rotated: any = [];
  angle = (angle * Math.PI) / 180;
  for (var i = 0; i < polygon.length; i++) {
    var x = polygon[i].x;
    var y = polygon[i].y;
    var x1 = x * Math.cos(angle) - y * Math.sin(angle);
    var y1 = x * Math.sin(angle) + y * Math.cos(angle);

    rotated.push({
      x: x1,
      y: y1
    });
  }
  // reset bounding box
  var bounds = getPolygonBounds(rotated);
  rotated.x = bounds.x;
  rotated.y = bounds.y;
  rotated.width = bounds.width;
  rotated.height = bounds.height;

  return rotated;
};

export default rotatePolygon;
