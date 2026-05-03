export const getNextSerialForPrefix = (prefix: "N" | "C", ids: Iterable<string>): number => {
  let maxSerial = 0;
  const prefixLength = prefix.length;

  for (const id of ids) {
    if (!id.startsWith(prefix)) {
      continue;
    }

    const raw = Number(id.slice(prefixLength));
    if (Number.isFinite(raw) && raw > maxSerial) {
      maxSerial = Math.floor(raw);
    }
  }

  return maxSerial + 1;
};

/**
 * Get the next index number for a node label of a given type.
 * Counts only nodes of the same type in the graph.
 * Example: if graph has "Box 1", "Input 1", "Box 2", returns 3 for "box" type.
 */
export const getNextLabelIndexForNodeType = (graph: import("../../model.js").CfcGraph, nodeType: import("../../model.js").CfcNodeType): number => {
  const nodesOfType = Array.from(graph.nodes).filter((node) => node.type === nodeType);
  return nodesOfType.length + 1;
};
