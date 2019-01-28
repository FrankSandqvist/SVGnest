import { Parser, Builder } from "xml2js";
import { writeFileSync } from "fs";
import * as _ from "lodash";
import * as svgPath from "svg-path";
//import * as ClipperLib from "./util/clipper";
import { start } from "repl";

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
    exploreConcave: false
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

    this.start();
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
