import { SVGNester } from './svg-nester';
import { readFileSync } from 'fs';
import * as flatmap from 'array.prototype.flatmap'

flatmap.shim();

const binSVG = readFileSync(__dirname + '/../testfiles/compoundtest.svg', 'UTF8');
const partsSVG = ['circ1', 'circ2', 'rectangle', 'star'].map(f =>
  readFileSync(__dirname + `/../testfiles/${f}.svg`, 'UTF8')
);

const nester = new SVGNester(binSVG, partsSVG, {});

nester.parseSVG().then(() => nester.start());
