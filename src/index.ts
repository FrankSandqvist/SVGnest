import { Parser, Builder } from "xml2js";
import { writeFileSync } from "fs";
import * as _ from "lodash";
import * as svgPath from "svg-path";

export class SVGNester {
  bin: any;
  elements: any[];

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
    const flattened = this.flatten(this.elements[0]);
    const splited = this.splitPath(flattened);
    const xml = builder.buildObject(splited);

    const parsedSVG = svgPath(flattened.svg.path[0].$.d);

    // [path, path, path, path, path]

    writeFileSync("result.json", JSON.stringify(parsedSVG, null, 2), "utf8");
    writeFileSync("result.svg", xml, "utf8");

    writeFileSync("resultSVG.json", JSON.stringify(splited, null, 2), "utf8");
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
      console.log("Found path");
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
    const element = deepCopy(input);
    let newPath = [];
    element.svg.path.forEach(path => {
      const data = svgPath(path.$.d);

      let pathSplited = [];
      let workingOn;
      data.content.forEach(pathContent => {
        if (pathContent.type == "M") {
        } else if (pathContent.type == "L") {
        }
        switch (pathContent.type) {
          case "M":
            if (workingOn != null) {
              pathSplited.push(deepCopy(workingOn));
            }
            workingOn = { $: path.$ };
            workingOn.$.d = `M${pathContent.x} ${pathContent.y}`;
            break;

          case "L":
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

          default:
            console.log(pathContent.type + " is not supported");
            break;
        }
      });
      newPath.push(pathSplited);
    });
    const newElement = element;
    newElement.svg.path = _.flatten(newPath);
    //console.log(JSON.stringify(newElement, null, 1));
    return newElement;
  }

  /*
  splitPath(path: string) {
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
*/
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
