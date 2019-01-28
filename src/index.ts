import { Parser, Builder } from "xml2js";
import { writeFileSync } from "fs";
import * as _ from "lodash";
// @ts-ignore
import * as svgPath from "svg-path";

import * as QuadraticBezier from "./geometryutils/quadraticBezier";
import * as CubicBezier from "./geometryutils/cubicBexier";
import * as Arc from "./geometryutils/arc";
import almostEqual from "./geometryutils/almostEqual";
import polygonArea from "./geometryutils/polygonArea";
import pointInPolygon from "./geometryutils/pointInPolygon";
import * as ClipperLib from "./geometryutils/clipper";

export class SVGNester {
  bin: any;
  elements: any[];
  parts: any;
  svg: any;
  config: any = {
    clipperScale: 10000000,
    curveTolerance: 0.3,
    spacing: 0,
    rotations: 4,
    populationSize: 10,
    mutationRate: 10,
    useHoles: false,
    exploreConcave: false,
    tolerance: 10
  };

  constructor(private binXML: string, private partsXML: string[]) {}

  async parseToJS() {
    console.log("Parsing bin XML");
    const parser = new Parser();
    this.bin = await new Promise<object>(resolve => {
      parser.parseString(this.binXML, (err, obj) => {
        resolve(obj);
      });
    });

    console.log("Parsing parts XML");
    const partsParsePromises = this.partsXML.map(xml => {
      return new Promise<object>(resolve => {
        parser.parseString(xml, (err, obj) => {
          resolve(obj);
        });
      });
    });
    this.elements = await Promise.all(partsParsePromises);

    //console.log(this.bin);

    const builder = new Builder();
    console.time("fatten-split");
    const flattened = this.flatten(this.elements[0]);
    const splited = this.splitPath(flattened);
    this.svg = splited;
    console.timeEnd("fatten-split");
    const xml = builder.buildObject(splited);

    const parsedSVG = svgPath(flattened.svg.path[0].$.d);

    // [path, path, path, path, path]

    writeFileSync("result.json", JSON.stringify(parsedSVG, null, 2), "utf8");
    writeFileSync("result.svg", xml, "utf8");

    writeFileSync("resultSVG.json", JSON.stringify(splited, null, 2), "utf8");

    console.log("Result:", this.getParts(splited));
  }

  flatten(element, paths?) {
    if (paths == null) {
      let arr = [];
      if (element.svg != null) {
        this.flatten(element.svg, arr);
        delete element.svg.g;
        element.svg.path = _.flatten(arr);
      } else {
        this.flatten(element, arr);
        delete element.g;
        element.path = _.flatten(arr);
      }
      return element;
    }
    //If path
    if (element.path != null) {
      //console.log("Found path");
      paths.push(element.path);
    }

    //If element == Array
    if (element.length != null) {
      for (let part of element) {
        this.flatten(part, paths);
      }
    } else {
      if (element.g != null) {
        //If elemnt.g == Array
        if (element.g.length != null) {
          this.flatten(element.g, paths);
        }
      }
    }
  }

  splitPath(input) {
    if (input.svg == null) {
      console.error("No SVG!");
      return;
    }
    if (input.svg.path == null) {
      console.error("No SVG.path!");
      return;
    }
    const element = deepCopy(input);
    let newPath = [];
    element.svg.path.forEach(path => {
      const data = svgPath(path.$.d);

      let pathSplited = [];
      let workingOn;
      data.content.forEach(pathContent => {
        switch (pathContent.type) {
          case "M":
            if (workingOn != null) {
              pathSplited.push(deepCopy(workingOn));
              workingOn = null;
            }
            workingOn = { $: path.$ };
            workingOn.$.d = `M${pathContent.x} ${pathContent.y}`;
            break;

          case "L":
          case "T":
            workingOn.$.d += ` ${pathContent.type + pathContent.x} ${
              pathContent.y
            }`;
            break;

          case "C":
            workingOn.$.d += ` ${pathContent.type + pathContent.x1} ${
              pathContent.y1
            }, ${pathContent.x2} ${pathContent.y2}, ${pathContent.x} ${
              pathContent.y
            }`;
            break;

          case "Z":
            workingOn.$.d += ` Z`;
            break;

          case "A":
            workingOn.$.d += ` A${pathContent.rx} ${pathContent.ry} ${
              pathContent.x_axis_rotation
            } ${pathContent.large_arc_flag} ${pathContent.sweep_flag} ${
              pathContent.x
            } ${pathContent.y}`;
            break;

          case "Q":
            workingOn.$.d += ` ${pathContent.type + pathContent.x1} ${
              pathContent.y1
            }, ${pathContent.x} ${pathContent.y}`;
            break;

          case "S":
            workingOn.$.d += ` ${pathContent.type + pathContent.x2} ${
              pathContent.y2
            }, ${pathContent.x} ${pathContent.y}`;
            break;

          case "H":
            workingOn.$.d += ` ${pathContent.type + pathContent.x}`;
            break;

          case "V":
            workingOn.$.d += ` ${pathContent.type + pathContent.y}`;
            break;

          default:
            console.log(pathContent.type + " is not supported", pathContent);
            break;
        }
      });
      if (workingOn != null) {
        pathSplited.push(deepCopy(workingOn));
      }
      newPath.push(pathSplited);
    });
    const newElement = element;
    newElement.svg.path = _.flatten(newPath);
    return newElement;
  }

  start() {
    if (!this.bin || !this.elements) return false;
  }

  getParts(path) {
    const paths = path.svg.path;

    let { config } = this;

    var i, j;
    var polygons = [];

    var numChildren = paths.length;
    for (i = 0; i < numChildren; i++) {
      var poly = this.polygonify(paths[i]);

      poly = this.cleanPolygon(poly);

      // todo: warn user if poly could not be processed and is excluded from the nest
      if (
        poly &&
        poly.length > 2 &&
        Math.abs(polygonArea(poly)) >
          config.curveTolerance * config.curveTolerance
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
          if (pointInPolygon(p[0], list[j]) === true) {
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

    return polygons;
  }

  polygonify(element) {
    let poly = [];
    let i = -1;

    //console.log(element);
    let seglist = svgPath(element.$.d).content;

    let firstCommand = seglist[0].type;
    let lastCommand = seglist[seglist.length - 1].type;

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

    seglist.forEach(s => {
      i++;
      let command = s.type;

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
          var pointlist = QuadraticBezier.linearize(
            { x: prevx, y: prevy },
            { x: x, y: y },
            { x: x1, y: y1 },
            this.config.tolerance
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
          var pointlist = CubicBezier.linearize(
            { x: prevx, y: prevy },
            { x: x, y: y },
            { x: x1, y: y1 },
            { x: x2, y: y2 },
            this.config.tolerance
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
          var pointlist = Arc.linearize(
            { x: prevx, y: prevy },
            { x: x, y: y },
            s.r1,
            s.r2,
            s.angle,
            s.largeArcFlag,
            s.sweepFlag,
            this.config.tolerance
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
    });

    // do not include last point if coincident with starting point
    while (
      poly.length > 0 &&
      almostEqual(
        poly[0].x,
        poly[poly.length - 1].x,
        this.config.toleranceSvg
      ) &&
      almostEqual(poly[0].y, poly[poly.length - 1].y, this.config.toleranceSvg)
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
      this.config.curveTolerance * this.config.clipperScale
    );

    if (!clean || clean.length == 0) {
      return null;
    }

    return this.clipperToSvg(clean);
  }

  svgToClipper(polygon) {
    let clip = [];
    for (let i = 0; i < polygon.length; i++) {
      clip.push({ X: polygon[i].x, Y: polygon[i].y });
    }

    ClipperLib.JS.ScaleUpPath(clip, this.config.clipperScale);

    return clip;
  }

  clipperToSvg(polygon) {
    let normal = [];

    for (let i = 0; i < polygon.length; i++) {
      normal.push({
        x: polygon[i].X / this.config.clipperScale,
        y: polygon[i].Y / this.config.clipperScale
      });
    }

    return normal;
  }
}

const deepCopy = obj => {
  //https://stackoverflow.com/a/28152032/9125965
  let copy;

  // Handle the 3 simple types, and null or undefined
  if (null == obj || "object" != typeof obj) return obj;

  // Handle Date
  if (obj instanceof Date) {
    copy = new Date();
    copy.setTime(obj.getTime());
    return copy;
  }

  // Handle Array
  if (obj instanceof Array) {
    copy = [];
    for (var i = 0, len = obj.length; i < len; i++) {
      copy[i] = deepCopy(obj[i]);
    }
    return copy;
  }

  // Handle Object
  if (obj instanceof Object) {
    copy = {};
    for (var attr in obj) {
      if (obj.hasOwnProperty(attr)) copy[attr] = deepCopy(obj[attr]);
    }
    return copy;
  }

  throw new Error("Unable to copy obj! Its type isn't supported.");
};
