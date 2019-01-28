import getPolygonBounds from "../geometryutils/getPolygonBounds";
import rotatePolygon from "../geometryutils/rotatePolygon";

export default class GeneticAlgorithm {
  private config;
  private binBounds;
  public population;

  constructor(adam, bin, config) {
    this.config = config || {
      populationSize: 10,
      mutationRate: 10,
      rotations: 4
    };
    this.binBounds = getPolygonBounds(bin);

    let angles = [];
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
  randomAngle(part) {
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
      var rotatedPart = rotatePolygon(part, angleList[i]);

      // don't use obviously bad angles where the part doesn't fit in the bin
      if (
        rotatedPart.width < this.binBounds.width &&
        rotatedPart.height < this.binBounds.height
      ) {
        return angleList[i];
      }
    }

    return 0;
  }

  // returns a mutated individual with the given mutation rate
  mutate(individual) {
    let clone = {
      placement: individual.placement.slice(0),
      rotation: individual.rotation.slice(0)
    };
    for (let i = 0; i < clone.placement.length; i++) {
      let rand = Math.random();
      if (rand < 0.01 * this.config.mutationRate) {
        // swap current part with next part
        let j = i + 1;

        if (j < clone.placement.length) {
          let temp = clone.placement[i];
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
  }

  // single point crossover
  mate(male, female) {
    let cutpoint = Math.round(
      Math.min(Math.max(Math.random(), 0.1), 0.9) * (male.placement.length - 1)
    );

    let gene1 = male.placement.slice(0, cutpoint);
    let rot1 = male.rotation.slice(0, cutpoint);

    let gene2 = female.placement.slice(0, cutpoint);
    let rot2 = female.rotation.slice(0, cutpoint);

    let i;

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
      for (let i = 0; i < gene.length; i++) {
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
  }

  generation() {
    // Individuals with higher fitness are more likely to be selected for mating
    this.population.sort(function(a, b) {
      return a.fitness - b.fitness;
    });

    // fittest individual is preserved in the new generation (elitism)
    let newpopulation = [this.population[0]];

    while (newpopulation.length < this.population.length) {
      let male = this.randomWeightedIndividual();
      let female = this.randomWeightedIndividual(male);

      // each mating produces two children
      let children = this.mate(male, female);

      // slightly mutate children
      newpopulation.push(this.mutate(children[0]));

      if (newpopulation.length < this.population.length) {
        newpopulation.push(this.mutate(children[1]));
      }
    }

    this.population = newpopulation;
  }

  // returns a random individual from the population, weighted to the front of the list (lower fitness value is more likely to be selected)
  randomWeightedIndividual(exclude?) {
    let pop = this.population.slice(0);

    if (exclude && pop.indexOf(exclude) >= 0) {
      pop.splice(pop.indexOf(exclude), 1);
    }

    let rand = Math.random();

    let lower = 0;
    let weight = 1 / pop.length;
    let upper = weight;

    for (var i = 0; i < pop.length; i++) {
      // if the random number falls between lower and upper bounds, select this individual
      if (rand > lower && rand < upper) {
        return pop[i];
      }
      lower = upper;
      upper += 2 * weight * ((pop.length - i) / pop.length);
    }

    return pop[0];
  }
}
