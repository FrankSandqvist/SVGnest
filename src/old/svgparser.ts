/*!
 * SvgParser
 * A library to convert an SVG string to parse-able segments for CAD/CAM use
 * Licensed under the MIT license
 */

import { JSDOM } from 'jsdom';

import * as transformParse from './util/transform_parse';
import * as Matrix from './util/matrix';
import * as GeometryUtil from './util/geometryutil';
import { readFileSync } from 'fs';

export default class SvgParser {
  private window: Window;
  private conf = {} as any;
  private svg;
  private svgRoot;
  private allowedElements = ['svg', 'circle', 'ellipse', 'path', 'polygon', 'polyline', 'rect'];
  private geometryUtil: GeometryUtil;

  constructor() {
    const jsdom = new JSDOM(undefined, { runScripts: 'dangerously' });
    this.window = jsdom.window;
    this.geometryUtil = new GeometryUtil();

    this.window['SVGPathElement'] = this.window['SVGElement'];

    const mutationObserverPolyfill = this.window.document.createElement('script');
    const mutationObserverPolyfillScript = readFileSync(
      __dirname + '/util/mutationobserver.js',
      'utf8'
    );
    mutationObserverPolyfill.innerHTML = mutationObserverPolyfillScript;
    this.window.document.body.appendChild(mutationObserverPolyfill);

    const pathSegPolyfill = this.window.document.createElement('script');
    const pathSegPolyfillScript = readFileSync(__dirname + '/util/pathsegpolyfill.js', 'utf8');
    pathSegPolyfill.innerHTML = pathSegPolyfillScript;
    this.window.document.body.appendChild(pathSegPolyfill);
  }

  config(config) {
    this.conf.tolerance = config.tolerance;
  }

  load(svgString: string) {
    const div = this.window.document.createElement('div');
    div.innerHTML = svgString;
    let svg = this.window.document.body.appendChild(div);

    if (svg) {
      this.svg = svg;
      this.svgRoot = svg.firstElementChild;
      console.log('SVG', this.svgRoot);
    }

    console.log('Loading SVG...');

    return this.svgRoot;
  }

  // use the utility functions in this class to prepare the svg for CAD-CAM/nest related operations
  cleanInput() {
    console.log('ROOT', this.svgRoot);
    // apply any transformations, so that all path positions etc will be in the same coordinate space
    this.applyTransform(this.svgRoot);

    // remove any g elements and bring all elements to the top level
    this.flatten(this.svgRoot);

    // remove any non-contour elements like text
    this.filter(this.allowedElements);

    // split any compound paths into individual path elements
    this.recurse(this.svgRoot, this.splitPath);

    return this.svgRoot;
  }

  // return style node, if any
  getStyle() {
    if (!this.svgRoot) {
      return false;
    }
    for (var i = 0; i < this.svgRoot.children.length; i++) {
      var el = this.svgRoot.children[i];
      if (el.tagName == 'style') {
        return el;
      }
    }

    return false;
  }

  // set the given path as absolute coords (capital commands)
  // from http://stackoverflow.com/a/9677915/433888
  pathToAbsolute(path) {
    if (!path || path.tagName != 'path') {
      throw Error('invalid path');
    }

    let seglist = path.pathSegList;
    let x = 0,
      y = 0,
      x0 = 0,
      y0 = 0,
      x1 = 0,
      y1 = 0,
      x2 = 0,
      y2 = 0;

    for (let i = 0; i < seglist.numberOfItems; i++) {
      const command = seglist.getItem(i).pathSegTypeAsLetter;
      const s = seglist.getItem(i);

      if (/[MLHVCSQTA]/.test(command)) {
        if ('x' in s) x = s.x;
        if ('y' in s) y = s.y;
      } else {
        if ('x1' in s) x1 = x + s.x1;
        if ('x2' in s) x2 = x + s.x2;
        if ('y1' in s) y1 = y + s.y1;
        if ('y2' in s) y2 = y + s.y2;
        if ('x' in s) x += s.x;
        if ('y' in s) y += s.y;
        switch (command) {
          case 'm':
            seglist.replaceItem(path.createSVGPathSegMovetoAbs(x, y), i);
            break;
          case 'l':
            seglist.replaceItem(path.createSVGPathSegLinetoAbs(x, y), i);
            break;
          case 'h':
            seglist.replaceItem(path.createSVGPathSegLinetoHorizontalAbs(x), i);
            break;
          case 'v':
            seglist.replaceItem(path.createSVGPathSegLinetoVerticalAbs(y), i);
            break;
          case 'c':
            seglist.replaceItem(path.createSVGPathSegCurvetoCubicAbs(x, y, x1, y1, x2, y2), i);
            break;
          case 's':
            seglist.replaceItem(path.createSVGPathSegCurvetoCubicSmoothAbs(x, y, x2, y2), i);
            break;
          case 'q':
            seglist.replaceItem(path.createSVGPathSegCurvetoQuadraticAbs(x, y, x1, y1), i);
            break;
          case 't':
            seglist.replaceItem(path.createSVGPathSegCurvetoQuadraticSmoothAbs(x, y), i);
            break;
          case 'a':
            seglist.replaceItem(
              path.createSVGPathSegArcAbs(x, y, s.r1, s.r2, s.angle, s.largeArcFlag, s.sweepFlag),
              i
            );
            break;
          case 'z':
          case 'Z':
            x = x0;
            y = y0;
            break;
        }
      }
      // Record the start of a subpath
      if (command == 'M' || command == 'm') (x0 = x), (y0 = y);
    }
  }

  // takes an SVG transform string and returns corresponding SVGMatrix
  // from https://github.com/fontello/svgpath
  transformParse(transformString) {
    return transformParse(transformString);
  }

  // recursively apply the transform property to the given element
  applyTransform(element, globalTransform?) {
    console.log('Element:', element);

    globalTransform = globalTransform || '';
    var transformString = element.getAttribute('transform') || '';
    transformString = globalTransform + transformString;

    var transform, scale, rotate;

    if (transformString && transformString.length > 0) {
      var transform: any = this.transformParse(transformString);
    }

    if (!transform) {
      transform = new Matrix();
    }

    console.log('transformIdentity: ', transform);

    var tarray = transform.toArray();

    // decompose affine matrix to rotate, scale components (translate is just the 3rd column)
    var rotate: any = (Math.atan2(tarray[1], tarray[3]) * 180) / Math.PI;
    var scale: any = Math.sqrt(tarray[0] * tarray[0] + tarray[2] * tarray[2]);

    if (element.tagName == 'g' || element.tagName == 'svg') {
      element.removeAttribute('transform');
      var children = Array.prototype.slice.call(element.children);
      for (var i = 0; i < children.length; i++) {
        this.applyTransform(children[i], transformString);
      }
    } else if (transform && !transform.isIdentity()) {
      this.pathToAbsolute(element);
      var seglist = element.pathSegList;
      var prevx = 0;
      var prevy = 0;

      for (var i = 0; i < seglist.numberOfItems; i++) {
        var s = seglist.getItem(i);
        var command = s.pathSegTypeAsLetter;

        if (command == 'H') {
          seglist.replaceItem(element.createSVGPathSegLinetoAbs(s.x, prevy), i);
          s = seglist.getItem(i);
        } else if (command == 'V') {
          seglist.replaceItem(element.createSVGPathSegLinetoAbs(prevx, s.y), i);
          s = seglist.getItem(i);
        }
        // currently only works for uniform scale, no skew
        // todo: fully support arbitrary affine transforms...
        else if (command == 'A') {
          seglist.replaceItem(
            element.createSVGPathSegArcAbs(
              s.x,
              s.y,
              s.r1 * scale,
              s.r2 * scale,
              s.angle + rotate,
              s.largeArcFlag,
              s.sweepFlag
            ),
            i
          );
          s = seglist.getItem(i);
        }

        if ('x' in s && 'y' in s) {
          var transformed = transform.calc(s.x, s.y);
          prevx = s.x;
          prevy = s.y;

          s.x = transformed[0];
          s.y = transformed[1];
        }
        if ('x1' in s && 'y1' in s) {
          var transformed = transform.calc(s.x1, s.y1);
          s.x1 = transformed[0];
          s.y1 = transformed[1];
        }
        if ('x2' in s && 'y2' in s) {
          var transformed = transform.calc(s.x2, s.y2);
          s.x2 = transformed[0];
          s.y2 = transformed[1];
        }
      }

      element.removeAttribute('transform');
    }
  }

  // bring all child elements to the top level
  flatten(element) {
    for (var i = 0; i < element.children.length; i++) {
      this.flatten(element.children[i]);
    }

    if (element.tagName != 'svg') {
      while (element.children.length > 0) {
        element.parentElement.appendChild(element.children[0]);
      }
    }
  }

  // remove all elements with tag name not in the whitelist
  // use this to remove <text>, <g> etc that don't represent shapes
  filter(whitelist, element?) {
    if (!whitelist || whitelist.length == 0) {
      throw Error('invalid whitelist');
    }

    element = element || this.svgRoot;

    for (var i = 0; i < element.children.length; i++) {
      this.filter(whitelist, element.children[i]);
    }

    if (element.children.length == 0 && whitelist.indexOf(element.tagName) < 0) {
      element.parentElement.removeChild(element);
    }
  }

  // split a compound path (paths with M, m commands) into an array of paths
  splitPath(path) {
    if (!path || path.tagName != 'path' || !path.parentElement) {
      return false;
    }
    var seglist = path.pathSegList;
    var x = 0,
      y = 0,
      x0 = 0,
      y0 = 0;
    var paths = [];

    var p;

    if (seglist == null) {
      console.log('seglist = null!');
      return;
    }

    var lastM = 0;
    for (var i = seglist.numberOfItems - 1; i >= 0; i--) {
      if (
        (i > 0 && seglist.getItem(i).pathSegTypeAsLetter == 'M') ||
        seglist.getItem(i).pathSegTypeAsLetter == 'm'
      ) {
        lastM = i;
        break;
      }
    }

    if (lastM == 0) {
      return false; // only 1 M command, no need to split
    }

    for (i = 0; i < seglist.numberOfItems; i++) {
      var s = seglist.getItem(i);
      var command = s.pathSegTypeAsLetter;

      if (command == 'M' || command == 'm') {
        p = path.cloneNode();
        p.setAttribute('d', '');
        paths.push(p);
      }

      if (/[MLHVCSQTA]/.test(command)) {
        if ('x' in s) x = s.x;
        if ('y' in s) y = s.y;

        p.pathSegList.appendItem(s);
      } else {
        if ('x' in s) x += s.x;
        if ('y' in s) y += s.y;
        if (command == 'm') {
          p.pathSegList.appendItem(path.createSVGPathSegMovetoAbs(x, y));
        } else {
          if (command == 'Z' || command == 'z') {
            x = x0;
            y = y0;
          }
          p.pathSegList.appendItem(s);
        }
      }
      // Record the start of a subpath
      if (command == 'M' || command == 'm') {
        (x0 = x), (y0 = y);
      }
    }

    var addedPaths = [];
    for (i = 0; i < paths.length; i++) {
      // don't add trivial paths from sequential M commands
      if (paths[i].pathSegList.numberOfItems > 1) {
        path.parentElement.insertBefore(paths[i], path);
        addedPaths.push(paths[i]);
      }
    }

    path.remove();

    return addedPaths;
  }

  // recursively run the given function on the given element
  recurse(element, func) {
    // only operate on original DOM tree, ignore any children that are added. Avoid infinite loops
    var children = Array.prototype.slice.call(element.children);
    for (var i = 0; i < children.length; i++) {
      this.recurse(children[i], func);
    }

    func(element);
  }

  // return a polygon from the given SVG element in the form of an array of points
  polygonify(element) {
    var poly = [];
    var i;

    console.log('element:', element.tagName);

    var seglist = element.pathSegList;

    var firstCommand = seglist.getItem(0);
    var lastCommand = seglist.getItem(seglist.numberOfItems - 1);

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
        if ('x1' in s) x1 = s.x1;
        if ('x2' in s) x2 = s.x2;
        if ('y1' in s) y1 = s.y1;
        if ('y2' in s) y2 = s.y2;
        if ('x' in s) x = s.x;
        if ('y' in s) y = s.y;
      } else {
        if ('x1' in s) x1 = x + s.x1;
        if ('x2' in s) x2 = x + s.x2;
        if ('y1' in s) y1 = y + s.y1;
        if ('y2' in s) y2 = y + s.y2;
        if ('x' in s) x += s.x;
        if ('y' in s) y += s.y;
      }
      switch (command) {
        // linear line types
        case 'm':
        case 'M':
        case 'l':
        case 'L':
        case 'h':
        case 'H':
        case 'v':
        case 'V':
          let point = { x, y };
          point.x = x;
          point.y = y;
          poly.push(point);
          break;
        // Quadratic Beziers
        case 't':
        case 'T':
          // implicit control point
          if (i > 0 && /[QqTt]/.test(seglist.getItem(i - 1).pathSegTypeAsLetter)) {
            x1 = prevx + (prevx - prevx1);
            y1 = prevy + (prevy - prevy1);
          } else {
            x1 = prevx;
            y1 = prevy;
          }
        case 'q':
        case 'Q':
          var pointlist = this.geometryUtil.QuadraticBezier.linearize(
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
        case 's':
        case 'S':
          if (i > 0 && /[CcSs]/.test(seglist.getItem(i - 1).pathSegTypeAsLetter)) {
            x1 = prevx + (prevx - prevx2);
            y1 = prevy + (prevy - prevy2);
          } else {
            x1 = prevx;
            y1 = prevy;
          }
        case 'c':
        case 'C':
          var pointlist = this.geometryUtil.CubicBezier.linearize(
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
        case 'a':
        case 'A':
          var pointlist = this.geometryUtil.Arc.linearize(
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
        case 'z':
        case 'Z':
          x = x0;
          y = y0;
          break;
      }
      // Record the start of a subpath
      if (command == 'M' || command == 'm') (x0 = x), (y0 = y);
    }

    // do not include last point if coincident with starting point
    while (
      poly.length > 0 &&
      this.geometryUtil.almostEqual(poly[0].x, poly[poly.length - 1].x, this.conf.toleranceSvg) &&
      this.geometryUtil.almostEqual(poly[0].y, poly[poly.length - 1].y, this.conf.toleranceSvg)
    ) {
      poly.pop();
    }

    return poly;
  }
}
