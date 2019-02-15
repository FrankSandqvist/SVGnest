import { Matrix, MatrixData } from './matrix';
//import { Element } from '../node_modules/xml-js/types/index';
//import { encodeSVGPath, SVGPathData } from '../node_modules/svg-pathdata/index';
import { Element } from 'xml-js';
import { encodeSVGPath, SVGPathData } from 'svg-pathdata';
import {
  quadraticBezierLinearize,
  Point,
  cubicBezierLinearize,
  arcLinearize,
  almostEqual
} from './geometry-utils';
import { flatMap } from 'lodash';
//import { encodeSVGPath, SVGPathData } from 'svg-pathdata';

export const cleanInput = (element: Element) => {
  element.elements.forEach((e, i) => {
    applyTransform({
      element: e,
      parentArrayPos: i
    });
  });

  flatten(element);

  element.elements = element.elements.filter(el =>
    ['svg', 'circle', 'ellipse', 'path', 'polygon', 'polyline', 'rect'].some(ae => ae === el.name)
  );

  do {
    element.elements = flatMap(element.elements, el => splitPaths(el));
  } while (element.elements.find(el => Array.isArray(el)));
};

const applyTransform = ({
  element,
  parentArrayPos,
  globalTransform
}: {
  element: Element;
  parentArrayPos: number;
  globalTransform?: any;
}) => {
  let transformString = (element.attributes && (element.attributes.transform as string)) || '';
  transformString = globalTransform + transformString;

  const transform =
    transformString && transformString.length > 0 ? transformParse(transformString) : new Matrix();

  const transformArr = transform.toArray();

  // decompose affine matrix to rotate, scale components (translate is just the 3rd column)
  const rotate = (Math.atan2(transformArr[1], transformArr[3]) * 180) / Math.PI;
  const scale = Math.sqrt(transformArr[0] * transformArr[0] + transformArr[2] * transformArr[2]);

  if (element.name == 'g' || element.name == 'svg') {
    // const children = JSON.parse(JSON.stringify(element.elements)) as typeof element.elements;
    element.elements.forEach((ce, i) => {
      applyTransform({
        element: ce,
        parentArrayPos: i,
        globalTransform: transformString
      });
    });
  } else if (!transform.isIdentity()) {
    switch (element.name) {
      case 'ellipse': {
        const attrs = element.attributes as Record<string, string>;
        // the goal is to remove the transform property, but an ellipse without a transform will have no rotation
        // for the sake of simplicity, we will replace the ellipse with a path, and apply the transform to that path
        const move = encodeSVGPath([
          {
            type: SVGPathData.MOVE_TO,
            relative: false,
            x: parseFloat(attrs.cx) - parseFloat(attrs.rx),
            y: parseFloat(attrs.cy)
          },
          {
            type: SVGPathData.ARC,
            relative: false,
            x: parseFloat(attrs.cx) - parseFloat(attrs.rx),
            y: parseFloat(attrs.cy),
            rX: parseFloat(attrs.rx),
            rY: parseFloat(attrs.ry),
            xRot: 0,
            lArcFlag: 1,
            sweepFlag: 0
          },
          {
            type: SVGPathData.ARC,
            relative: false,
            x: parseFloat(attrs.cx) - parseFloat(attrs.rx),
            y: parseFloat(attrs.cy),
            rX: parseFloat(attrs.rx),
            rY: parseFloat(attrs.ry),
            xRot: 0,
            lArcFlag: 1,
            sweepFlag: 0
          }
        ]);

        element = {
          name: 'path',
          attributes: { d: move }
        };
      }
      case 'path': {
        element = pathToAbsolute(element);
        element = transformPath(element, scale, rotate, transform);
        break;
      }
      case 'circle': {
        var transformed = transform.calc(
          parseFloat(element.attributes.cx as string),
          parseFloat(element.attributes.cy as string)
        );
        element.attributes = {
          ...element.attributes,
          cx: transformed[0],
          cy: transformed[1],
          r: parseFloat(element.attributes.r as string) * scale
        };

        // skew not supported
        break;
      }
      case 'rect': {
        // similar to the ellipse, we'll replace rect with polygon
        const attrs = element.attributes;

        const p1 = attrs.x + ',' + attrs.y;
        const p2 =
          parseFloat(attrs.x as string) + parseFloat(attrs.width as string) + ',' + attrs.y;
        const p3 =
          parseFloat(attrs.x as string) +
          parseFloat(attrs.width as string) +
          ',' +
          (parseFloat(attrs.y as string) + parseFloat(attrs.height as string));
        const p4 =
          attrs.x + ',' + (parseFloat(attrs.y as string) + parseFloat(attrs.height as string));

        element = {
          ...element,
          name: 'polygon',
          attributes: { points: p1 + ' ' + p2 + ' ' + p3 + ' ' + p4 }
        };
      }
      case 'polygon':
      case 'polyline': {
        element = {
          ...element,
          attributes: {
            points: (element.attributes.points as string)
              .split(' ')
              .map(point => {
                const [x, y] = point.split(',');
                const [transformedX, transformedY] = transform.calc(parseFloat(x), parseFloat(y));
                return transformedX + ',' + transformedY;
              })
              .join(' ')
          }
        };
        break;
      }
    }
  }
  delete element.attributes.transform;
  element['parent'].elements[parentArrayPos] = element;
};

const flatten = (element: Element) => {
  if ('elements' in element) {
    element.elements.forEach(flatten);
    if (element.name !== 'svg' && element['parent']) {
      element['parent'].elements = element['parent'].elements.concat(element.elements);
      element.elements = undefined;
    }
  }
};

const splitPaths = (path: Element): Element | Element[] => {
  if (!path || path.name !== 'path') {
    return path;
  }

  const seglist = new SVGPathData(path.attributes.d as string);

  if (seglist.commands.findIndex(com => com.type === SVGPathData.MOVE_TO) === 0) {
    return path;
  }

  // paths are made absolute, no need to think about relative paths.

  const subPaths = [] as Element[];
  let lastIndex = 0;
  seglist.commands.forEach((com, index) => {
    if (index !== 0 && com.type === SVGPathData.MOVE_TO) {
      subPaths.push({
        ...path,
        attributes: {
          ...path.attributes,
          d: encodeSVGPath(seglist.commands.slice(lastIndex, index))
        }
      });
    }
  });
  return subPaths;
};

const transformParse = (transformString: string): Matrix => {
  const operations = {
    matrix: true,
    scale: true,
    rotate: true,
    translate: true,
    skewX: true,
    skewY: true
  };

  const CMD_SPLIT_RE = /\s*(matrix|translate|scale|rotate|skewX|skewY)\s*\(\s*(.+?)\s*\)[\s,]*/;
  const PARAMS_SPLIT_RE = /[\s,]+/;

  const matrix = new Matrix();
  let command;

  // Split value into ['', 'translate', '10 50', '', 'scale', '2', '', 'rotate',  '-45', '']
  transformString.split(CMD_SPLIT_RE).forEach(
    item => {
      if (!item.length) {
        return;
      }

      // remember operation
      if (operations[item]) {
        command = item;
        return;
      }

      // extract params & att operation to matrix
      const params = item.split(PARAMS_SPLIT_RE).map(i => +i || 0) as number[];

      // If params count is not correct - ignore command
      switch (command) {
        case 'matrix':
          if (params.length === 6) {
            matrix.matrix(params as MatrixData);
          }
          return;

        case 'scale':
          if (params.length === 1) {
            matrix.scale(params[0], params[0]);
          } else if (params.length === 2) {
            matrix.scale(params[0], params[1]);
          }
          return;

        case 'rotate':
          if (params.length === 1) {
            matrix.rotate(params[0], 0, 0);
          } else if (params.length === 3) {
            matrix.rotate(params[0], params[1], params[2]);
          }
          return;

        case 'translate':
          if (params.length === 1) {
            matrix.translate(params[0], 0);
          } else if (params.length === 2) {
            matrix.translate(params[0], params[1]);
          }
          return;

        case 'skewX':
          if (params.length === 1) {
            matrix.skewX(params[0]);
          }
          return;

        case 'skewY':
          if (params.length === 1) {
            matrix.skewY(params[0]);
          }
          return;
      }
    },
    {
      command: undefined
    }
  );

  return matrix;
};

const pathToAbsolute = (path: Element): Element => {
  if (!path || path.name != 'path') {
    throw Error('invalid path');
  }

  const seglist = new SVGPathData(path.attributes.d as string);
  let x = 0,
    y = 0,
    x0 = 0,
    y0 = 0,
    x1 = 0,
    y1 = 0,
    x2 = 0,
    y2 = 0;

  path.attributes.d = encodeSVGPath(
    seglist.commands.map(com => {
      if (com['relative'] === false) {
        if ('x' in com) x = com.x;
        if ('y' in com) y = com.y;
      } else {
        if ('x1' in com) x1 = x + com.x1;
        if ('x2' in com) x2 = x + com.x2;
        if ('y1' in com) y1 = y + com.y1;
        if ('y2' in com) y2 = y + com.y2;
        if ('x' in com) x += com.x;
        if ('y' in com) y += com.y;
        switch (com.type) {
          case SVGPathData.MOVE_TO:
            return {
              ...com,
              type: SVGPathData.MOVE_TO,
              relative: false,
              x,
              y
            };
          case SVGPathData.LINE_TO:
            return {
              ...com,
              type: SVGPathData.LINE_TO,
              relative: false,
              x,
              y
            };
          case SVGPathData.HORIZ_LINE_TO:
            return {
              ...com,
              type: SVGPathData.HORIZ_LINE_TO,
              relative: false,
              x
            };
          case SVGPathData.VERT_LINE_TO:
            return {
              ...com,
              type: SVGPathData.VERT_LINE_TO,
              relative: false,
              y
            };
          case SVGPathData.CURVE_TO:
            return {
              ...com,
              type: SVGPathData.CURVE_TO,
              relative: false,
              x,
              y,
              x1,
              y1,
              x2,
              y2
            };
          case SVGPathData.SMOOTH_CURVE_TO:
            return {
              ...com,
              type: SVGPathData.SMOOTH_CURVE_TO,
              relative: false,
              x,
              y,
              x2,
              y2
            };
          case SVGPathData.QUAD_TO:
            return {
              ...com,
              type: SVGPathData.QUAD_TO,
              relative: false,
              x,
              y,
              x1,
              y1
            };
          case SVGPathData.SMOOTH_QUAD_TO:
            return {
              ...com,
              type: SVGPathData.SMOOTH_QUAD_TO,
              relative: false,
              x,
              y
            };
          case SVGPathData.ARC:
            return {
              ...com,
              type: SVGPathData.ARC,
              relative: false,
              x,
              y
            };
          case SVGPathData.CLOSE_PATH:
            x = x0;
            y = y0;
            break;
        }
      }
      // Record the start of a subpath
      if (com.type === SVGPathData.MOVE_TO) {
        x0 = x;
        y0 = y;
      }

      return com;
    })
  );

  return path;
};

const transformPath = (path: Element, scale: number, rotate: number, transform: Matrix) => {
  const seglist = new SVGPathData(path.attributes.d as string);

  let prevX = 0;
  let prevY = 0;

  path.attributes.d = encodeSVGPath(
    seglist.commands.map<any>(com => {
      if (com.type === SVGPathData.HORIZ_LINE_TO) {
        com = {
          ...com,
          type: SVGPathData.LINE_TO,
          y: prevY
        };
      } else if (com.type === SVGPathData.VERT_LINE_TO) {
        com = {
          ...com,
          type: SVGPathData.LINE_TO,
          x: prevX
        };
      }
      // currently only works for uniform scale, no skew
      // todo: fully support arbitrary affine transforms...
      else if (com.type === SVGPathData.ARC) {
        com = {
          ...com,
          type: SVGPathData.ARC,
          rX: com.rX * scale,
          rY: com.rY * scale,
          xRot: com.xRot + rotate
        };
      }

      if ('x' in com && 'y' in com) {
        const transformed = transform.calc(com.x, com.y);
        prevX = com.x;
        prevY = com.y;

        com.x = transformed[0];
        com.y = transformed[1];
      }
      if ('x1' in com && 'y1' in com) {
        const transformed = transform.calc(com.x1, com.y1);
        com.x1 = transformed[0];
        com.y1 = transformed[1];
      }
      if ('x2' in com && 'y2' in com) {
        const transformed = transform.calc(com.x2, com.y2);
        com.x2 = transformed[0];
        com.y2 = transformed[1];
      }
      return com;
    })
  );

  return path;
};

export const polygonify = (element: Element, tolerance: number) => {
  let poly: Point[] = [];
  console.log(element);

  switch (element.name) {
    case 'polygon':
    case 'polyline': {
      poly = (element.attributes.points as string).split(' ').map(p => {
        const [x, y] = p.split(',').map(parseFloat);
        return {
          x,
          y
        };
      });
      break;
    }
    case 'rect': {
      const x = parseFloat(element.attributes.x as string);
      const y = parseFloat(element.attributes.y as string);
      const width = parseFloat(element.attributes.width as string);
      const height = parseFloat(element.attributes.height as string);
      poly = [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }];
      break;
    }
    case 'circle': {
      const radius = parseFloat(element.attributes.radius as string);
      const cx = parseFloat(element.attributes.cx as string);
      const cy = parseFloat(element.attributes.cy as string);

      // num is the smallest number of segments required to approximate the circle to the given tolerance
      const num = Math.max(Math.ceil((2 * Math.PI) / Math.acos(1 - tolerance / radius)), 3);

      poly = new Array(num).fill(null).map((_, i) => {
        const theta = i * ((2 * Math.PI) / num);
        return {
          x: radius * Math.cos(theta) + cx,
          y: radius * Math.sin(theta) + cy
        };
      });
      break;
    }
    case 'ellipse': {
      // same as circle case. There is probably a way to reduce points but for convenience we will just flatten the equivalent circular polygon

      const rx = parseFloat(element.attributes.rx as string);
      const ry = parseFloat(element.attributes.ry as string);
      const maxradius = Math.max(rx, ry);

      const cx = parseFloat(element.attributes.cx as string);
      const cy = parseFloat(element.attributes.cy as string);

      const num = Math.max(
        Math.ceil((2 * Math.PI) / Math.acos(1 - this.conf.tolerance / maxradius)),
        3
      );

      poly = new Array(num).fill(null).map((_, i) => {
        const theta = i * ((2 * Math.PI) / num);
        return {
          x: rx * Math.cos(theta) + cx,
          y: ry * Math.sin(theta) + cy
        };
      });
      break;
    }
    case 'path': {
      // we'll assume that splitpath has already been run on this path, and it only has one M/m command
      const seglist = new SVGPathData(element.attributes.d as string);

      const firstCommand = seglist.commands[0];
      const lastCommand = seglist.commands[seglist.commands.length - 1];

      console.log(seglist);
      let x = 0,
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

      poly = flatMap(seglist.commands, (com, index: number) => {
        prevx = x;
        prevy = y;
        prevx1 = x1;
        prevy1 = y1;
        prevx2 = x2;
        prevy2 = y2;

        if (com['relative'] === false) {
          if ('x1' in com) x1 = com.x1;
          if ('x2' in com) x2 = com.x2;
          if ('y1' in com) y1 = com.y1;
          if ('y2' in com) y2 = com.y2;
          if ('x' in com) x = com.x;
          if ('y' in com) y = com.y;
        } else {
          if ('x1' in com) x1 = x + com.x1;
          if ('x2' in com) x2 = x + com.x2;
          if ('y1' in com) y1 = y + com.y1;
          if ('y2' in com) y2 = y + com.y2;
          if ('x' in com) x += com.x;
          if ('y' in com) y += com.y;
        }
        switch (com.type) {
          // linear line types
          case SVGPathData.MOVE_TO:
          case SVGPathData.LINE_TO:
          case SVGPathData.HORIZ_LINE_TO:
          case SVGPathData.VERT_LINE_TO: {
            // Record the start of a subpath
            if (com.type === SVGPathData.MOVE_TO) {
              x0 = x;
              y0 = y;
            }

            return { x, y };
          }
          // Quadratic Beziers
          case SVGPathData.SMOOTH_QUAD_TO: {
            // implicit control point
            if (
              index > 0 &&
              (seglist.commands[index - 1].type === SVGPathData.QUAD_TO ||
                seglist.commands[index - 1].type === SVGPathData.SMOOTH_QUAD_TO)
            ) {
              x1 = prevx + (prevx - prevx1);
              y1 = prevy + (prevy - prevy1);
            } else {
              x1 = prevx;
              y1 = prevy;
            }
          }
          case SVGPathData.QUAD_TO: {
            const pointlist = quadraticBezierLinearize(
              { x: prevx, y: prevy },
              { x: x, y: y },
              { x: x1, y: y1 },
              tolerance
            );
            pointlist.shift(); // firstpoint would already be in the poly

            return pointlist;
          }
          case SVGPathData.SMOOTH_CURVE_TO: {
            // implicit control point
            if (
              index > 0 &&
              (seglist.commands[index - 1].type === SVGPathData.CURVE_TO ||
                seglist.commands[index - 1].type === SVGPathData.SMOOTH_CURVE_TO)
            ) {
              x1 = prevx + (prevx - prevx1);
              y1 = prevy + (prevy - prevy1);
            } else {
              x1 = prevx;
              y1 = prevy;
            }
          }
          case SVGPathData.CURVE_TO: {
            const pointlist = cubicBezierLinearize(
              { x: prevx, y: prevy },
              { x: x, y: y },
              { x: x1, y: y1 },
              { x: x2, y: y2 }
            );
            pointlist.shift(); // firstpoint would already be in the poly
            return pointlist;
          }
          case SVGPathData.ARC: {
            const pointlist = arcLinearize(
              { x: prevx, y: prevy },
              { x: x, y: y },
              com.rX,
              com.rY,
              com.xRot,
              com.lArcFlag,
              com.sweepFlag
            );
            pointlist.shift();

            return pointlist;
          }
          case SVGPathData.CLOSE_PATH: {
            x = x0;
            y = y0;
            break;
          }
        }
      });
    }
  }

  // do not include last point if coincident with starting point
  while (
    poly.length > 0 &&
    almostEqual(poly[0].x, poly[poly.length - 1].x, this.conf.toleranceSvg) &&
    almostEqual(poly[0].y, poly[poly.length - 1].y, this.conf.toleranceSvg)
  ) {
    poly.pop();
  }

  return poly;
};
