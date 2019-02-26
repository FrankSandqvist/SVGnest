import { TreeNode } from './svg-nester';
import { GeneticAlgorithm } from './geneticalgorithm';
import { polygonArea, Point, Polygon } from './geometry-utils';

interface NFPPair {
  a: TreeNode;
  b: TreeNode;
  key: Key;
}

interface Key {
  a: number;
  b: number;
  inside: boolean;
  aRotation: number;
  bRotation: number;
}

this.launchWorkers = function({
  tree,
  binPolygon,
  progressCallback
}: {
  tree: TreeNode[];
  binPolygon: TreeNode;
  progressCallback: any;
}) {
  const shuffle = (array: any[]) => {
    let currentIndex = array.length,
      temporaryValue,
      randomIndex;

    // While there remain elements to shuffle...
    while (0 !== currentIndex) {
      // Pick a remaining element...
      randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex -= 1;

      // And swap it with the current element.
      temporaryValue = array[currentIndex];
      array[currentIndex] = array[randomIndex];
      array[randomIndex] = temporaryValue;
    }
    return array;
  };

  let i, j;

  var adam = tree.slice(0);

  // seed with decreasing area
  adam.sort((a, b) => {
    return Math.abs(polygonArea(b.poly)) - Math.abs(polygonArea(a.poly));
  });

  const GA = new GeneticAlgorithm({ adam, binPolygon: binPolygon.poly });

  let individual = GA.population.find(ga => !ga.fitness);

  if (!individual) {
    // all individuals have been evaluated, start next generation
    GA.generation();
    individual = GA.population[1];
  }

  let rotations = individual.rotation;

  let ids = individual.placement.map(pl => pl.id);
  let placelist = individual.placement.map((pl, i) => ({ ...pl, rotation: rotations[i] }));

  let nfpPairs: NFPPair[];
  let nfpCache = {};
  let newCache = {};
  let key: Key;

  placelist.forEach(part => {
    key = { a: binPolygon.id, b: part.id, inside: true, aRotation: 0, bRotation: rotations[i] };
    if (!nfpCache[JSON.stringify(key)]) {
      nfpPairs.push({ a: binPolygon, b: part, key: key });
    } else {
      newCache[JSON.stringify(key)] = nfpCache[JSON.stringify(key)];
    }
    for (j = 0; j < i; j++) {
      var placed = placelist[j];
      key = {
        a: placed.id,
        b: part.id,
        inside: false,
        aRotation: rotations[j],
        bRotation: rotations[i]
      };
      if (!nfpCache[JSON.stringify(key)]) {
        nfpPairs.push({ a: placed, b: part, key });
      } else {
        newCache[JSON.stringify(key)] = nfpCache[JSON.stringify(key)];
      }
    }
  });

  // only keep cache for one cycle
  nfpCache = newCache;

  var worker = new PlacementWorker(
    binPolygon,
    placelist.slice(0),
    ids,
    rotations,
    config,
    nfpCache
  );

  var p = new Parallel(nfpPairs, {
    env: {
      binPolygon: binPolygon,
      searchEdges: config.exploreConcave,
      useHoles: config.useHoles
    },
    evalPath: 'util/eval.js'
  });

  p.require('matrix.js');
  p.require('geometryutil.js');
  p.require('placementworker.js');
  p.require('clipper.js');

  var self = this;
  var spawncount = 0;
  p._spawnMapWorker = function(i, cb, done, env, wrk) {
    // hijack the worker call to check progress
    progress = spawncount++ / nfpPairs.length;
    return Parallel.prototype._spawnMapWorker.call(p, i, cb, done, env, wrk);
  };

  p.map(function(pair) {
    if (!pair || pair.length == 0) {
      return null;
    }
    var searchEdges = global.env.searchEdges;
    var useHoles = global.env.useHoles;

    var A = rotatePolygon(pair.A, pair.key.Arotation);
    var B = rotatePolygon(pair.B, pair.key.Brotation);

    var nfp;

    if (pair.key.inside) {
      if (GeometryUtil.isRectangle(A, 0.001)) {
        nfp = GeometryUtil.noFitPolygonRectangle(A, B);
      } else {
        nfp = GeometryUtil.noFitPolygon(A, B, true, searchEdges);
      }

      // ensure all interior NFPs have the same winding direction
      if (nfp && nfp.length > 0) {
        for (var i = 0; i < nfp.length; i++) {
          if (GeometryUtil.polygonArea(nfp[i]) > 0) {
            nfp[i].reverse();
          }
        }
      } else {
        // warning on null inner NFP
        // this is not an error, as the part may simply be larger than the bin or otherwise unplaceable due to geometry
        log('NFP Warning: ', pair.key);
      }
    } else {
      if (searchEdges) {
        nfp = GeometryUtil.noFitPolygon(A, B, false, searchEdges);
      } else {
        nfp = minkowskiDifference(A, B);
      }
      // sanity check
      if (!nfp || nfp.length == 0) {
        log('NFP Error: ', pair.key);
        log('A: ', JSON.stringify(A));
        log('B: ', JSON.stringify(B));
        return null;
      }

      for (var i = 0; i < nfp.length; i++) {
        if (!searchEdges || i == 0) {
          // if searchedges is active, only the first NFP is guaranteed to pass sanity check
          if (Math.abs(GeometryUtil.polygonArea(nfp[i])) < Math.abs(GeometryUtil.polygonArea(A))) {
            log('NFP Area Error: ', Math.abs(GeometryUtil.polygonArea(nfp[i])), pair.key);
            log('NFP:', JSON.stringify(nfp[i]));
            log('A: ', JSON.stringify(A));
            log('B: ', JSON.stringify(B));
            nfp.splice(i, 1);
            return null;
          }
        }
      }

      if (nfp.length == 0) {
        return null;
      }

      // for outer NFPs, the first is guaranteed to be the largest. Any subsequent NFPs that lie inside the first are holes
      for (var i = 0; i < nfp.length; i++) {
        if (GeometryUtil.polygonArea(nfp[i]) > 0) {
          nfp[i].reverse();
        }

        if (i > 0) {
          if (GeometryUtil.pointInPolygon(nfp[i][0], nfp[0])) {
            if (GeometryUtil.polygonArea(nfp[i]) < 0) {
              nfp[i].reverse();
            }
          }
        }
      }

      // generate nfps for children (holes of parts) if any exist
      if (useHoles && A.children && A.children.length > 0) {
        var Bbounds = GeometryUtil.getPolygonBounds(B);

        for (var i = 0; i < A.children.length; i++) {
          var Abounds = GeometryUtil.getPolygonBounds(A.children[i]);

          // no need to find nfp if B's bounding box is too big
          if (Abounds.width > Bbounds.width && Abounds.height > Bbounds.height) {
            var cnfp = GeometryUtil.noFitPolygon(A.children[i], B, true, searchEdges);
            // ensure all interior NFPs have the same winding direction
            if (cnfp && cnfp.length > 0) {
              for (var j = 0; j < cnfp.length; j++) {
                if (GeometryUtil.polygonArea(cnfp[j]) < 0) {
                  cnfp[j].reverse();
                }
                nfp.push(cnfp[j]);
              }
            }
          }
        }
      }
    }

    function log() {
      if (typeof console !== 'undefined') {
        console.log.apply(console, arguments);
      }
    }

    function toClipperCoordinates(polygon) {
      var clone = [];
      for (var i = 0; i < polygon.length; i++) {
        clone.push({
          X: polygon[i].x,
          Y: polygon[i].y
        });
      }

      return clone;
    }

    function toNestCoordinates(polygon, scale) {
      var clone = [];
      for (var i = 0; i < polygon.length; i++) {
        clone.push({
          x: polygon[i].X / scale,
          y: polygon[i].Y / scale
        });
      }

      return clone;
    }

    function minkowskiDifference(A, B) {
      var Ac = toClipperCoordinates(A);
      ClipperLib.JS.ScaleUpPath(Ac, 10000000);
      var Bc = toClipperCoordinates(B);
      ClipperLib.JS.ScaleUpPath(Bc, 10000000);
      for (var i = 0; i < Bc.length; i++) {
        Bc[i].X *= -1;
        Bc[i].Y *= -1;
      }
      var solution = ClipperLib.Clipper.MinkowskiSum(Ac, Bc, true);
      var clipperNfp;

      var largestArea = null;
      for (i = 0; i < solution.length; i++) {
        var n = toNestCoordinates(solution[i], 10000000);
        var sarea = GeometryUtil.polygonArea(n);
        if (largestArea === null || largestArea > sarea) {
          clipperNfp = n;
          largestArea = sarea;
        }
      }

      for (var i = 0; i < clipperNfp.length; i++) {
        clipperNfp[i].x += B[0].x;
        clipperNfp[i].y += B[0].y;
      }

      return [clipperNfp];
    }

    return { key: pair.key, value: nfp };
  }).then(
    function(generatedNfp) {
      if (generatedNfp) {
        for (var i = 0; i < generatedNfp.length; i++) {
          var Nfp = generatedNfp[i];

          if (Nfp) {
            // a null nfp means the nfp could not be generated, either because the parts simply don't fit or an error in the nfp algo
            var key = JSON.stringify(Nfp.key);
            nfpCache[key] = Nfp.value;
          }
        }
      }
      worker.nfpCache = nfpCache;

      // can't use .spawn because our data is an array
      var p2 = new Parallel([placelist.slice(0)], {
        env: {
          self: worker
        },
        evalPath: 'util/eval.js'
      });

      p2.require('json.js');
      p2.require('clipper.js');
      p2.require('matrix.js');
      p2.require('geometryutil.js');
      p2.require('placementworker.js');

      p2.map(worker.placePaths).then(
        function(placements) {
          if (!placements || placements.length == 0) {
            return;
          }

          individual.fitness = placements[0].fitness;
          var bestresult = placements[0];

          for (var i = 1; i < placements.length; i++) {
            if (placements[i].fitness < bestresult.fitness) {
              bestresult = placements[i];
            }
          }

          if (!best || bestresult.fitness < best.fitness) {
            best = bestresult;

            var placedArea = 0;
            var totalArea = 0;
            var numParts = placelist.length;
            var numPlacedParts = 0;

            for (i = 0; i < best.placements.length; i++) {
              totalArea += Math.abs(GeometryUtil.polygonArea(binPolygon));
              for (var j = 0; j < best.placements[i].length; j++) {
                placedArea += Math.abs(GeometryUtil.polygonArea(tree[best.placements[i][j].id]));
                numPlacedParts++;
              }
            }
            displayCallback(
              self.applyPlacement(best.placements),
              placedArea / totalArea,
              numPlacedParts + '/' + numParts
            );
          } else {
            displayCallback();
          }
          self.working = false;
        },
        function(err) {
          console.log(err);
        }
      );
    },
    function(err) {
      console.log(err);
    }
  );
};
