export const interpolatePoints = (points, numberOfPoints) => {
  if (numberOfPoints <= 0) {
    return [];
  }

  const totalPoints = points.length;
  const step = (totalPoints - 1) / (numberOfPoints - 1);
  const interpolatedPoints = [];

  for (let i = 0; i < numberOfPoints; i++) {
    const index = i * step;
    const floorIndex = Math.floor(index);
    const ceilIndex = Math.ceil(index);

    if (floorIndex === ceilIndex) {
      interpolatedPoints.push(points[floorIndex]);
    } else {
      const fraction = index - floorIndex;
      const floorPoint = points[floorIndex];
      const ceilPoint = points[ceilIndex];

      const x = floorPoint[0] + (ceilPoint[0] - floorPoint[0]) * fraction;
      const y = floorPoint[1] + (ceilPoint[1] - floorPoint[1]) * fraction;
      interpolatedPoints.push([x, y]);
    }
  }

  return interpolatedPoints;
};

export const getTotalLength = (points) => {
  let totalLength = 0;

  for (let i = 1; i < points.length; i++) {
    const p1 = points[i - 1];
    const p2 = points[i];

    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];

    const segmentLength = Math.sqrt(dx * dx + dy * dy);
    totalLength += segmentLength;
  }

  return totalLength;
};
