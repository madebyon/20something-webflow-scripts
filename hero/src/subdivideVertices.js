export const subdivideVertices = (subdivisions) => {
  const triangles = [];

  const step = 2 / subdivisions;
  for (let i = 0; i < subdivisions; i++) {
    for (let j = 0; j < subdivisions; j++) {
      const x = -1 + j * step;
      const y = -1 + i * step;
      const triangle1 = [x, y, x + step, y, x, y + step];
      const triangle2 = [x + step, y, x, y + step, x + step, y + step];
      triangles.push(triangle1, triangle2);
    }
  }

  return triangles.flat();
};
