import { writeFileSync } from 'fs';
//import { Element, xml2js, js2xml } from '../node_modules/xml-js/types/index';
import { Element, xml2js, js2xml } from 'xml-js';
import { polygonify, cleanInput } from './parsing';
//import * as clipper from '../node_modules/clipper-lib/clipper';
import * as clipper from 'clipper-lib';
import { Point, polygonArea, pointInPolygon, almostEqual } from './geometry-utils';
import { ClipperPoint } from './clipper-types';
//import { ClipperPoint } from './clipper-types';

const parserSettings = {
  compact: false,
  alwaysArray: true,
  alwaysChildren: true,
  addParent: true,
  ignoreDeclaration: true
};

const standardConfig = {
  clipperScale: 10000000,
  curveTolerance: 0.3,
  spacing: 0,
  rotations: 4,
  populationSize: 10,
  mutationRate: 10,
  useHoles: false,
  exploreConcave: false
};

interface TreeNode {
  source: number;
  poly: Point[];
  id?: number;
  children?: TreeNode[];
  parent?: TreeNode;
}

export class SVGNester {
  constructor(
    private binSVG: string,
    private partsSVG: string[],
    config: { [P in keyof typeof standardConfig]?: typeof standardConfig[P] }
  ) {
    this.config = {
      ...this.config,
      ...config
    };
  }

  private binJSVG: Element;
  private partsJSVG: Element[];

  private config: typeof standardConfig;

  private tree: TreeNode[] = [];

  async parseSVG() {
    this.binJSVG = xml2js(this.binSVG, parserSettings).elements[0] as Element;

    this.partsJSVG = (await Promise.all(
      this.partsSVG.map(svg => xml2js(svg, parserSettings).elements[0])
    )) as Element[];

    cleanInput(this.binJSVG);

    this.partsJSVG.forEach(jsvg => {
      cleanInput(jsvg);
    });
  }

  start() {
    this.tree = getParts(this.partsJSVG, this.config.curveTolerance, this.config.clipperScale);
  }

  test() {
    writeFileSync(__dirname + '/test.svg', js2xml(this.binJSVG));
  }
}

const polygonToClipperPolygon = (polygon: Point[]) => {
  return polygon.map(p => ({ X: p.x, Y: p.y }));
};

const clipperPolygonToPolygon = (polygon: ClipperPoint[]) => {
  return polygon.map(p => ({ x: p.Y, y: p.Y }));
};

const svgToClipper = (polygon: Point[], clipperScale: number) => {
  const clip = polygonToClipperPolygon(polygon);

  clipper.JS.ScaleUpPath(clip, clipperScale);

  return clip;
};

const cleanPolygon = (polygon: Point[], curveTolerance: number, clipperScale: number) => {
  const p = svgToClipper(polygon, clipperScale);
  // remove self-intersections and find the biggest polygon that's left
  const simple: ClipperPoint[] = clipper.Clipper.SimplifyPolygon(
    p,
    clipper.PolyFillType.pftNonZero
  );

  if (!simple || simple.length == 0) {
    return null;
  }

  let biggest = simple[0];
  let biggestarea = Math.abs(clipper.Clipper.Area(biggest));
  simple.forEach(p => {
    const area = Math.abs(clipper.Clipper.Area(p));
    if (area > biggestarea) {
      biggest = p;
      biggestarea = area;
    }
  });

  // clean up singularities, coincident points and edges
  const clean = clipper.Clipper.CleanPolygon(biggest, curveTolerance * clipperScale);
  if (!clean || clean.length == 0) {
    return null;
  }
  return clipperPolygonToPolygon(clean);
};

const getParts = (elements: Element[], curveTolerance: number, clipperScale: number) => {
  const polygons = elements.map((element, i) => {
    const p = polygonify(element, 2);
    const poly = cleanPolygon(p, curveTolerance, clipperScale);

    // todo: warn user if poly could not be processed and is excluded from the nest
    if (poly && poly.length > 2 && Math.abs(polygonArea(poly)) > curveTolerance * curveTolerance) {
      return {
        source: i,
        poly
      };
    }
  });

  const toTree = (list: TreeNode[], idstart?: number) => {
    const parents = [] as TreeNode[];
    let i, j;

    // assign a unique id to each leaf
    let id = idstart || 0;

    for (i = 0; i < list.length; i++) {
      let p = list[i];

      let isChild = false;
      for (j = 0; j < list.length; j++) {
        if (j == i) {
          continue;
        }
        if (pointInPolygon(p.poly[0], list[j].poly) === true) {
          if (!list[j].children) {
            list[j].children = [] as TreeNode[];
          }
          list[j].children.push(p);
          p.parent = list[j];
          isChild = true;
          break;
        }
      }

      if (!isChild) {
        parents.push(p);
      }
    }

    for (i = 0; i < list.length; i++) {
      if (parents.indexOf(list[i]) < 0) {
        list.splice(i, 1);
        i--;
      }
    }

    for (i = 0; i < parents.length; i++) {
      parents[i].id = id;
      id++;
    }

    for (i = 0; i < parents.length; i++) {
      if (parents[i].children) {
        id = toTree(parents[i].children, id);
      }
    }

    return id;
  };

  // turn the list into a tree
  toTree(polygons);

  return polygons;
};

export interface JSVGNode {
  attrs?: Record<string, string>;
  children?: Record<string, JSVGNode[]>;
  content?: string;
}

const bin: JSVGNode = {
  attrs: {
    'xmlns:dc': 'http://purl.org/dc/elements/1.1/',
    'xmlns:cc': 'http://creativecommons.org/ns#',
    'xmlns:rdf': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
    'xmlns:svg': 'http://www.w3.org/2000/svg',
    xmlns: 'http://www.w3.org/2000/svg',
    'xmlns:sodipodi': 'http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd',
    'xmlns:inkscape': 'http://www.inkscape.org/namespaces/inkscape',
    viewBox: '0.0 0.0 750.000034583 750.000034583',
    id: 'svg4',
    height: '750.000034583',
    width: '750.000034583',
    version: '1.1',
    'sodipodi:docname': '4c3b186b-d2c4-4d80-a3c0-d46cc76ca14a.svg',
    'inkscape:version': '0.92.2 (5c3e80d, 2017-08-06)'
  },
  children: {
    'sodipodi:namedview': [
      {
        attrs: {
          pagecolor: '#ffffff',
          bordercolor: '#666666',
          borderopacity: '1',
          objecttolerance: '10',
          gridtolerance: '10',
          guidetolerance: '10',
          'inkscape:pageopacity': '0',
          'inkscape:pageshadow': '2',
          'inkscape:window-width': '640',
          'inkscape:window-height': '480',
          id: 'namedview6',
          showgrid: 'false',
          'inkscape:zoom': '0.083255553',
          'inkscape:cx': '1417.3229',
          'inkscape:cy': '1417.3229',
          'inkscape:window-x': '0',
          'inkscape:window-y': '0',
          'inkscape:window-maximized': '0',
          'inkscape:current-layer': 'svg4',
          'inkscape:document-units': 'px'
        }
      }
    ],
    metadata: [
      {
        attrs: { id: 'metadata10' },
        children: {
          'rdf:rdf': [
            {
              children: {
                'cc:work': [
                  {
                    attrs: { 'rdf:about': '' },
                    children: {
                      'dc:format': [{ content: 'image/svg+xml' }],
                      'dc:type': [
                        { attrs: { 'rdf:resource': 'http://purl.org/dc/dcmitype/StillImage' } }
                      ]
                    }
                  }
                ]
              }
            }
          ]
        }
      }
    ],
    defs: [{ attrs: { id: 'defs8' } }],
    path: [
      {
        attrs: {
          id: 'path2',
          style:
            'stroke-linejoin:miter;stroke:#1b1918;stroke-linecap:butt;stroke-dasharray:none;stroke-width:0.212120869629;fill:none',
          d:
            'M0.0 0.0C0.0 0.0 749.999063243 0.0 749.999063243 0.0C749.999063243 0.0 749.999063243 749.999063243 749.999063243 749.999063243C749.999063243 749.999063243 0.0 749.999063243 0.0 749.999063243C0.0 749.999063243 0.0 0.0 0.0 0.0'
        }
      }
    ]
  }
};
