const TOL = Math.pow(10, -9);

const almostEqual = (a, b, tolerance) => {
  if (!tolerance) {
    tolerance = TOL;
  }
  return Math.abs(a - b) < tolerance;
};

export default almostEqual;
