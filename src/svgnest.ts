/*!
 * SvgNest
 * Licensed under the MIT license
 */

import SvgParser from "./svgparser";
import GeometryUtil = require("./util/geometryutil");
import Parallel = require("./util/parallel");

export class SvgNest {
  private svgParser: SvgParser;
  constructor() {
    this.svgParser = new SvgParser();
  }

  private self = this;

  private svg = null;

  // keep a reference to any style nodes, to maintain color/fill info
  private style = null;

  private parts = null;

  private tree = null;

  private bin = null;
  private binPolygon = null;
  private binBounds = null;
  private nfpCache = {};
  private config = {
    clipperScale: 10000000,
    curveTolerance: 0.3,
    spacing: 0,
    rotations: 4,
    populationSize: 10,
    mutationRate: 10,
    useHoles: false,
    exploreConcave: false
  };
  private working = false;

  private GA = null;
  private best = null;
  private workerTimer = null;
  private progress = 0;

  private parsesvg = function(svgstring) {
    // reset if in progress
    this.stop();

    this.bin = null;
    this.binPolygon = null;
    this.tree = null;

    // parse svg
    this.svg = this.svgParser.load(svgstring);

    this.style = this.svgParser.getStyle();

    this.svg = this.svgParser.clean();

    this.tree = this.getParts(this.svg.children);

    //re-order elements such that deeper elements are on top, so they can be moused over
    function zorder(paths) {
      // depth-first
      var length = paths.length;
      for (var i = 0; i < length; i++) {
        if (paths[i].children && paths[i].children.length > 0) {
          zorder(paths[i].children);
        }
      }
    }

    return this.svg;
  };

  setbin(element) {
    let { svg, bin } = this;
    if (!svg) {
      return;
    }
    bin = element;
  }

  setConfig(c) {
    // clean up inputs
    const { config } = this;

    if (!c) {
      return config;
    }

    if (
      c.curveTolerance &&
      !GeometryUtil.almostEqual(parseFloat(c.curveTolerance), 0)
    ) {
      config.curveTolerance = parseFloat(c.curveTolerance);
    }

    if ("spacing" in c) {
      config.spacing = parseFloat(c.spacing);
    }

    if (c.rotations && parseInt(c.rotations) > 0) {
      config.rotations = parseInt(c.rotations);
    }

    if (c.populationSize && parseInt(c.populationSize) > 2) {
      config.populationSize = parseInt(c.populationSize);
    }

    if (c.mutationRate && parseInt(c.mutationRate) > 0) {
      config.mutationRate = parseInt(c.mutationRate);
    }

    if ("useHoles" in c) {
      config.useHoles = !!c.useHoles;
    }

    if ("exploreConcave" in c) {
      config.exploreConcave = !!c.exploreConcave;
    }

    this.svgParser.config({ tolerance: config.curveTolerance });

    this.best = null;
    this.nfpCache = {};
    this.binPolygon = null;
    this.GA = null;

    return config;
  }

  start(progressCallback, displayCallback) {
    let { svg, bin, parts, tree, config } = this;
    if (!svg || !bin) {
      return false;
    }

    parts = Array.prototype.slice.call(svg.children);
    var binindex = parts.indexOf(bin);

    if (binindex >= 0) {
      // don't process bin as a part of the tree
      parts.splice(binindex, 1);
    }

    // build tree without bin
    tree = this.getParts(parts.slice(0));

    offsetTree(tree, 0.5 * config.spacing, this.polygonOffset.bind(this));

    // offset tree recursively
    function offsetTree(t, offset, offsetFunction) {
      for (var i = 0; i < t.length; i++) {
        var offsetpaths = offsetFunction(t[i], offset);
        if (offsetpaths.length == 1) {
          // replace array items in place
          Array.prototype.splice.apply(
            t[i],
            [0, t[i].length].concat(offsetpaths[0])
          );
        }

        if (t[i].children && t[i].children.length > 0) {
          offsetTree(t[i].children, -offset, offsetFunction);
        }
      }
    }
  }
}

function GeneticAlgorithm(adam, bin, config) {
  this.config = config || {
    populationSize: 10,
    mutationRate: 10,
    rotations: 4
  };
  this.binBounds = GeometryUtil.getPolygonBounds(bin);

  // population is an array of individuals. Each individual is a object representing the order of insertion and the angle each part is rotated
  var angles = [];
  for (var i = 0; i < adam.length; i++) {
    angles.push(this.randomAngle(adam[i]));
  }

  this.population = [{ placement: adam, rotation: angles }];

  while (this.population.length < config.populationSize) {
    var mutant = this.mutate(this.population[0]);
    this.population.push(mutant);
  }
}

// returns a random angle of insertion
GeneticAlgorithm.prototype.randomAngle = function(part) {
  var angleList = [];
  for (var i = 0; i < Math.max(this.config.rotations, 1); i++) {
    angleList.push(i * (360 / this.config.rotations));
  }

  function shuffleArray(array) {
    for (var i = array.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var temp = array[i];
      array[i] = array[j];
      array[j] = temp;
    }
    return array;
  }

  angleList = shuffleArray(angleList);

  for (i = 0; i < angleList.length; i++) {
    var rotatedPart = GeometryUtil.rotatePolygon(part, angleList[i]);

    // don't use obviously bad angles where the part doesn't fit in the bin
    if (
      rotatedPart.width < this.binBounds.width &&
      rotatedPart.height < this.binBounds.height
    ) {
      return angleList[i];
    }
  }

  return 0;
};

// returns a mutated individual with the given mutation rate
GeneticAlgorithm.prototype.mutate = function(individual) {
  var clone = {
    placement: individual.placement.slice(0),
    rotation: individual.rotation.slice(0)
  };
  for (var i = 0; i < clone.placement.length; i++) {
    var rand = Math.random();
    if (rand < 0.01 * this.config.mutationRate) {
      // swap current part with next part
      var j = i + 1;

      if (j < clone.placement.length) {
        var temp = clone.placement[i];
        clone.placement[i] = clone.placement[j];
        clone.placement[j] = temp;
      }
    }

    rand = Math.random();
    if (rand < 0.01 * this.config.mutationRate) {
      clone.rotation[i] = this.randomAngle(clone.placement[i]);
    }
  }

  return clone;
};

// single point crossover
GeneticAlgorithm.prototype.mate = function(male, female) {
  var cutpoint = Math.round(
    Math.min(Math.max(Math.random(), 0.1), 0.9) * (male.placement.length - 1)
  );

  var gene1 = male.placement.slice(0, cutpoint);
  var rot1 = male.rotation.slice(0, cutpoint);

  var gene2 = female.placement.slice(0, cutpoint);
  var rot2 = female.rotation.slice(0, cutpoint);

  var i;

  for (i = 0; i < female.placement.length; i++) {
    if (!contains(gene1, female.placement[i].id)) {
      gene1.push(female.placement[i]);
      rot1.push(female.rotation[i]);
    }
  }

  for (i = 0; i < male.placement.length; i++) {
    if (!contains(gene2, male.placement[i].id)) {
      gene2.push(male.placement[i]);
      rot2.push(male.rotation[i]);
    }
  }

  function contains(gene, id) {
    for (var i = 0; i < gene.length; i++) {
      if (gene[i].id == id) {
        return true;
      }
    }
    return false;
  }

  return [
    { placement: gene1, rotation: rot1 },
    { placement: gene2, rotation: rot2 }
  ];
};

GeneticAlgorithm.prototype.generation = function() {
  // Individuals with higher fitness are more likely to be selected for mating
  this.population.sort(function(a, b) {
    return a.fitness - b.fitness;
  });

  // fittest individual is preserved in the new generation (elitism)
  var newpopulation = [this.population[0]];

  while (newpopulation.length < this.population.length) {
    var male = this.randomWeightedIndividual();
    var female = this.randomWeightedIndividual(male);

    // each mating produces two children
    var children = this.mate(male, female);

    // slightly mutate children
    newpopulation.push(this.mutate(children[0]));

    if (newpopulation.length < this.population.length) {
      newpopulation.push(this.mutate(children[1]));
    }
  }

  this.population = newpopulation;
};

// returns a random individual from the population, weighted to the front of the list (lower fitness value is more likely to be selected)
GeneticAlgorithm.prototype.randomWeightedIndividual = function(exclude) {
  var pop = this.population.slice(0);

  if (exclude && pop.indexOf(exclude) >= 0) {
    pop.splice(pop.indexOf(exclude), 1);
  }

  var rand = Math.random();

  var lower = 0;
  var weight = 1 / pop.length;
  var upper = weight;

  for (var i = 0; i < pop.length; i++) {
    // if the random number falls between lower and upper bounds, select this individual
    if (rand > lower && rand < upper) {
      return pop[i];
    }
    lower = upper;
    upper += 2 * weight * ((pop.length - i) / pop.length);
  }

  return pop[0];
};
