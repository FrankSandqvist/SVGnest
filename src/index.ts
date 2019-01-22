import { Parser } from 'xml2js';
import { writeFileSync } from 'fs';

export class SVGNester {
  bin: any;
  elements: any[];

  constructor(private binXML: string, private partsXML: string[]) {}

  async parseToJS() {
    console.log('Parsing bin XML');
    const parser = new Parser();
    this.bin = await new Promise<object>(resolve => {
      parser.parseString(this.binXML, (err, obj) => {
        resolve(obj);
      });
    });

    console.log('Parsing parts XML');
    const partsParsePromises = this.partsXML.map(xml => {
      return new Promise<object>(resolve => {
        parser.parseString(xml, (err, obj) => {
          resolve(obj);
        });
      });
    });
    this.elements = await Promise.all(partsParsePromises);

    console.log(this.bin);

    writeFileSync('result.json', JSON.stringify(this.elements[0]), 'utf8');
  }
}
