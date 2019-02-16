import { writeFileSync, writeFile } from 'fs';
//import { Element, xml2js, js2xml } from '../node_modules/xml-js/types/index';
import { Element, xml2js, js2xml } from 'xml-js';
import { polygonify, cleanInput } from './parsing';
//import * as clipper from '../node_modules/clipper-lib/clipper';
import * as clipper from 'clipper-lib';
import {
  Point,
  polygonArea,
  pointInPolygon,
  almostEqual,
  getPolygonBounds
} from './geometry-utils';
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

export interface TreeNode {
  source?: number;
  poly: Point[];
  id?: number;
  children?: TreeNode[];
  parent?: TreeNode;
  width?: number;
  height?: number;
}

export class SVGNester {
  constructor(
    private binSVG: string,
    private partsSVG: string[],
    config: { [P in keyof typeof standardConfig]?: typeof standardConfig[P] }
  ) {
    this.config = {
      ...standardConfig,
      ...config
    };
  }

  private binJSVG: Element;
  private partsJSVG: Element[];

  private config: typeof standardConfig;

  private tree: TreeNode[] = [];
  private binPolygon: TreeNode;

  async parseSVG() {
    const binJSVG = xml2js(this.binSVG, parserSettings).elements[0] as Element;

    const partsJSVG = (await Promise.all(
      this.partsSVG.map(svg => xml2js(svg, parserSettings).elements[0])
    )) as Element[];

    this.binJSVG = cleanInput(binJSVG)[0];
    this.partsJSVG = partsJSVG.flatMap(jsvg => cleanInput(jsvg));
  }

  start() {
    this.tree = getParts(this.partsJSVG, this.config.curveTolerance, this.config.clipperScale);

    const offsetTree = (tree: TreeNode[], offset: number) => {
      for (let i = 0; i < tree.length; i++) {
        const offsetPolygon = polygonOffset(
          tree[i].poly,
          offset,
          this.config.curveTolerance,
          this.config.clipperScale
        );
        if (offsetPolygon.length == 1) {
          // replace array items in place
          Array.prototype.splice.apply(
            tree[i].poly,
            [0, tree[i].poly.length].concat(offsetPolygon[0])
          );
        }

        if (tree[i].children && tree[i].children.length > 0) {
          offsetTree(tree[i].children, -offset);
        }
      }
    };

    offsetTree(this.tree, 0.5 * this.config.spacing);
    this.binPolygon = {
      poly: cleanPolygon(
        polygonify(this.binJSVG, this.config.curveTolerance),
        this.config.curveTolerance,
        this.config.clipperScale
      )
    };

    if (!this.binPolygon || this.binPolygon.poly.length < 3) {
      throw new Error('Invalid bin');
    }

    const binBounds = getPolygonBounds(this.binPolygon.poly);

    if (this.config.spacing > 0) {
      const offsetBin = polygonOffset(
        this.binPolygon.poly,
        -0.5 * this.config.spacing,
        this.config.curveTolerance,
        this.config.clipperScale
      );
      if (offsetBin.length == 1) {
        // if the offset contains 0 or more than 1 path, something went wrong.
        this.binPolygon = offsetBin.pop();
      }
    }

    this.binPolygon.id = -1;

    // put bin on origin
    var xbinmax = this.binPolygon.poly[0].x;
    var xbinmin = this.binPolygon.poly[0].x;
    var ybinmax = this.binPolygon.poly[0].y;
    var ybinmin = this.binPolygon.poly[0].y;

    for (var i = 1; i < this.binPolygon.poly.length; i++) {
      if (this.binPolygon.poly[i].x > xbinmax) {
        xbinmax = this.binPolygon.poly[i].x;
      } else if (this.binPolygon.poly[i].x < xbinmin) {
        xbinmin = this.binPolygon.poly[i].x;
      }
      if (this.binPolygon.poly[i].y > ybinmax) {
        ybinmax = this.binPolygon.poly[i].y;
      } else if (this.binPolygon.poly[i].y < ybinmin) {
        ybinmin = this.binPolygon.poly[i].y;
      }
    }

    for (i = 0; i < this.binPolygon.poly.length; i++) {
      this.binPolygon.poly[i].x -= xbinmin;
      this.binPolygon.poly[i].y -= ybinmin;
    }

    this.binPolygon.width = xbinmax - xbinmin;
    this.binPolygon.height = ybinmax - ybinmin;

    // all paths need to have the same winding direction
    if (polygonArea(this.binPolygon.poly) > 0) {
      this.binPolygon.poly.reverse();
    }

    // remove duplicate endpoints, ensure counterclockwise winding direction
    for (i = 0; i < this.tree.length; i++) {
      const start = this.tree[i].poly[0];
      const end = this.tree[i].poly[this.tree[i].poly.length - 1];
      if (start === end || (almostEqual(start.x, end.x) && almostEqual(start.y, end.y))) {
        this.tree[i].poly.pop();
      }

      if (polygonArea(this.tree[i].poly) > 0) {
        this.tree[i].poly.reverse();
      }
    }
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

const clipperToSVG = (polygon: ClipperPoint[], clipperScale: number) => {
  return polygon.map(polygon => ({
    x: polygon.X / clipperScale,
    y: polygon.Y / clipperScale
  }));
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
  const polygons = elements
    .map((element, i) => {
      const p = polygonify(element, 2);
      const poly = cleanPolygon(p, curveTolerance, clipperScale);

      // todo: warn user if poly could not be processed and is excluded from the nest
      if (
        poly &&
        poly.length > 2 &&
        Math.abs(polygonArea(poly)) > curveTolerance * curveTolerance
      ) {
        return {
          source: i,
          poly
        };
      }
    })
    .filter(p => p !== undefined);

  writeFileSync(__dirname + '/test.jsvg', JSON.stringify(polygons));

  const toTree = (list: TreeNode[], idstart?: number) => {
    const parents = [] as TreeNode[];

    // assign a unique id to each leaf
    let id = idstart || 0;

    let i: number, j: number;
    for (let i = 0; i < list.length; i++) {
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

const polygonOffset = (polygon: Point[], offset: number, curveTolerance, clipperScale) => {
  if (!offset || offset === 0 || almostEqual(offset, 0)) {
    return polygon;
  }

  const clipPolygon = svgToClipper(polygon, clipperScale);

  const miterLimit = 2;
  const co = new clipper.ClipperOffset(miterLimit, curveTolerance * clipperScale);
  co.AddPath(clipPolygon, clipper.JoinType.jtRound, clipper.EndType.etClosedPolygon);

  const newPaths = new clipper.Paths();
  co.Execute(newPaths, offset * clipperScale);

  return newPaths.map(p => clipperToSVG(p, clipperScale));
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
