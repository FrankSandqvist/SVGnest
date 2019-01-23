import { Parser, Builder } from "xml2js";
import { writeFileSync } from "fs";
import * as _ from "lodash";

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
    const xml = builder.buildObject(this.flatten(this.elements[0]));
    writeFileSync("result.svg", xml, "utf8");
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
}

/*
if (element.length == null) return element;

      for (let part of element) {
        if (parent.length == null) return element;
        console.log(parent.length);
        parent.push(this.flatten(part, element));
      }

      return element;
*/

/* 
if (element.length == null) {
      if (element.svg == null) return element;
      if (element.svg.g.length != null) {
        element.svg.g = this.flatten(element.svg.g);
      } else {
        console.warn("Can´t flatten", element);
      }
    } else {
      if (element.length == null) {
        console.log("not array", element);
      } else {
        for (let part of element) {
          console.log(
            "part:",
            part.path == null ? "Not Found" : part.path[0].$.d
          );

          this.flatten(part);
        }
      }
    }
    return element;
*/

/*
console.log("Flatting...");
    if (element.length == null) {
      if (element.g == null) {
        if (element.svg != null) {
          if (element.svg.g != null) {
            let partsList = [];
            this.flatten(element.svg.g, partsList);
            //console.log(partsList);
            return element;
          }
        }
      } else {
        console.log("gFound", element.g[0]);
        for (let part of element.g) {
          if (part.path != null) {
            parts.push(part.path);
          } else {
            this.flatten(part, parts);
          }
        }
      }
    } else {
      for (let part of element) {
        if (part.path != null) {
          console.log("Found a path");

          parts.push(part.path);
        } else {
          this.flatten(part, parts);
        }
      }
    }
*/

/*
console.log("Running Flatten...");
    if (paths == null) {
      console.log("firstRun");
      let pathList = ["hello world"];
      this.flatten(element, paths);
      console.log("Paths complete", ["Cat"]);
      return pathList;
    }
    //If path
    if (element.path != null) {
      console.log("Found path");
      console.log(paths);
      if (!paths) paths.push(element.path);
    }

    //If rect
    if (element.rect != null) {
      console.log("Found rect");
    }

    //If element == Array
    if (element.length != null) {
      console.log("Array");

      for (let part of element) {
        this.flatten(part, paths);
      }
    } else {
      if (element.g != null) {
        //If elemnt.g == Array
        if (element.g.length != null) {
          console.log("g Array");
          this.flatten(element.g, paths);
        } else {
          console.log("Not g array");
        }
      } else {
        console.log("Not g array");
      }
    }
*/
