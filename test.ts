import { readFileSync } from 'fs';
import { SVGNester } from './src/index';

const binXML = readFileSync('./test.svg', 'utf-8');
const partsXML = [readFileSync('./test.svg', 'utf-8'), readFileSync('./test.svg', 'utf-8')];

const svgNester = new SVGNester(binXML, partsXML);

svgNester.parseToJS().then();
