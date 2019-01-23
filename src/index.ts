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
