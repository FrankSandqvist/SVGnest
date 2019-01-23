import { Parser, Builder } from "xml2js";
import { writeFileSync } from "fs";
import * as _ from "lodash";
import * as svgPath from 'svg-path';

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

    /*writeFileSync(
      "result.json",
      JSON.stringify(this.flatten(this.elements[0].svg), null, 2),
      "utf8"
    );*/

    const builder = new Builder();
    const flattened = this.flatten(this.elements[0]);
    const xml = builder.buildObject(flattened);
    //writeFileSync("result.json", JSON.stringify(flattened), "utf8");

    const parsedSVG = svgPath(flattened.svg.path[0].$.d);

    // [path, path, path, path, path]

    writeFileSync("result.json", JSON.stringify(parsedSVG), "utf8");
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
