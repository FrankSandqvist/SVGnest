import { readFileSync } from "fs";
import { SVGNester } from "./src/index";

const binXML = readFileSync("./testfiles/bin.svg", "utf-8");
/*const partsXML = ['star', 'circ1', 'circ2', 'rectangle'].map(name =>
  readFileSync(`./testfiles/${name}.svg`, 'utf8')
);*/

const partsXML = ["grouptest", "star", "star", "star", "star", "circ1"].map(
  name => readFileSync(`./testfiles/${name}.svg`, "utf8")
);

const svgNester = new SVGNester(binXML, partsXML);

svgNester.parseToJS().then();
