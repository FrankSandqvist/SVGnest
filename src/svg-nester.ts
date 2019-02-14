import { writeFileSync } from 'fs';
import { Element, xml2js, js2xml } from '../node_modules/xml-js/types/index';
//import { Element, xml2js, js2xml } from 'xml-js';
import { applyTransform, polygonify } from './parsing';


const parserSettings = {
  compact: false,
  alwaysArray: true,
  alwaysChildren: true,
  addParent: true
};

export class SVGNester {
  constructor(private binSVG: string, private partsSVG: string[], private tolerance = Math.pow(10,-9)) {}
  private binJSVG: Element;
  private partsJSVG: Element[];

  async parseSVG() {
    this.binJSVG = xml2js(this.binSVG, parserSettings) as Element;

    this.partsJSVG = (await Promise.all(
      this.partsSVG.map(svg => xml2js(svg, parserSettings))
    )) as Element[];

    this.binJSVG.elements.forEach((e, i) => {
      applyTransform({
        element: e,
        parentArrayPos: i
      });
    });

    this.partsJSVG.forEach(jsvg =>
      jsvg.elements.forEach((e, i) => {
        applyTransform({
          element: e,
          parentArrayPos: i
        });
      })
    );
  }

  test() {
    console.log(this.binJSVG);

    writeFileSync(__dirname + '/test.svg', js2xml(this.binJSVG));
  }
}

const getParts = (elements: Element[]) => {
  const polygons = [];

  elements.forEach(element => {
    var poly = polygonify(paths[i], this.tolerance);
    poly = this.cleanPolygon(poly);

    // todo: warn user if poly could not be processed and is excluded from the nest
    if (
      poly &&
      poly.length > 2 &&
      Math.abs(polygonArea(poly)) > config.curveTolerance * config.curveTolerance
    ) {
      poly.source = i;
      polygons.push(poly);
    }
  }

  // turn the list into a tree
  toTree(polygons);

  function toTree(list, idstart) {
    var parents = [];
    var i, j;

    // assign a unique id to each leaf
    var id = idstart || 0;

    for (i = 0; i < list.length; i++) {
      var p = list[i];

      var ischild = false;
      for (j = 0; j < list.length; j++) {
        if (j == i) {
          continue;
        }
        if (GeometryUtil.pointInPolygon(p[0], list[j]) === true) {
          if (!list[j].children) {
            list[j].children = [];
          }
          list[j].children.push(p);
          p.parent = list[j];
          ischild = true;
          break;
        }
      }

      if (!ischild) {
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
  }

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
