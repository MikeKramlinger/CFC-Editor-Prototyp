export const createBezierConnectionPath = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  preview = false,
): SVGPathElement => {
  const midX = (x1 + x2) / 2;
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`);
  path.setAttribute("stroke", preview ? "#1f6feb" : "#384254");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke-width", preview ? "2.5" : "2");
  if (preview) {
    path.setAttribute("stroke-dasharray", "5 4");
  }
  return path;
};

export const createPolylineConnectionPath = (
  points: Array<{ x: number; y: number }>,
  unitToPx: (value: number) => number,
  preview = false,
): SVGPathElement => {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  const segments = points.map((point, index) => {
    const pxX = unitToPx(point.x);
    const pxY = unitToPx(point.y);
    return `${index === 0 ? "M" : "L"} ${pxX} ${pxY}`;
  });

  path.setAttribute("d", segments.join(" "));
  path.setAttribute("stroke", preview ? "#1f6feb" : "#384254");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke-width", preview ? "2.5" : "2");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  if (preview) {
    path.setAttribute("stroke-dasharray", "5 4");
  }
  return path;
};
