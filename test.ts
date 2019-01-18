//import SvgParser from "./src/svgparser";
import SvgNest from "./src/svgnest";
import { readFileSync } from "fs";

const svgNest = new SvgNest();

svgNest.parsesvg(readFileSync("./test.svg", "utf-8"));
