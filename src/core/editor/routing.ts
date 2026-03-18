export interface GridPoint {
  x: number;
  y: number;
}

export interface RoutingObstacleNode {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const doesHorizontalSegmentTouchObstacle = (
  node: RoutingObstacleNode,
  x1: number,
  x2: number,
  y: number,
): boolean => {
  const nodeMinX = Math.floor(node.x);
  const nodeMaxX = Math.ceil(node.x + node.width);
  const nodeMinY = Math.floor(node.y);
  const nodeMaxY = Math.ceil(node.y + node.height);
  if (y < nodeMinY || y > nodeMaxY) {
    return false;
  }

  const segMinX = Math.min(x1, x2);
  const segMaxX = Math.max(x1, x2);
  return segMaxX >= nodeMinX && segMinX <= nodeMaxX;
};

interface RouteState {
  x: number;
  y: number;
  dir: number;
}

interface OpenEntry {
  state: RouteState;
  f: number;
  g: number;
}

const DIRECTIONS: Array<{ x: number; y: number; dir: number }> = [
  { x: 1, y: 0, dir: 0 },
  { x: -1, y: 0, dir: 1 },
  { x: 0, y: 1, dir: 2 },
  { x: 0, y: -1, dir: 3 },
];

const isImmediateReverse = (currentDir: number, nextDir: number): boolean => {
  return (
    (currentDir === 0 && nextDir === 1) ||
    (currentDir === 1 && nextDir === 0) ||
    (currentDir === 2 && nextDir === 3) ||
    (currentDir === 3 && nextDir === 2)
  );
};

const pointKey = (point: GridPoint): string => `${point.x},${point.y}`;
const stateKey = (state: RouteState): string => `${state.x},${state.y},${state.dir}`;

class MinOpenHeap {
  private readonly values: OpenEntry[] = [];

  get size(): number {
    return this.values.length;
  }

  push(value: OpenEntry): void {
    this.values.push(value);
    this.heapifyUp(this.values.length - 1);
  }

  pop(): OpenEntry | undefined {
    if (this.values.length === 0) {
      return undefined;
    }

    const top = this.values[0];
    const tail = this.values.pop();
    if (this.values.length > 0 && tail) {
      this.values[0] = tail;
      this.heapifyDown(0);
    }

    return top;
  }

  private heapifyUp(index: number): void {
    let nextIndex = index;
    while (nextIndex > 0) {
      const parentIndex = Math.floor((nextIndex - 1) / 2);
      if (this.values[parentIndex]!.f <= this.values[nextIndex]!.f) {
        break;
      }
      [this.values[parentIndex], this.values[nextIndex]] = [this.values[nextIndex]!, this.values[parentIndex]!];
      nextIndex = parentIndex;
    }
  }

  private heapifyDown(index: number): void {
    let nextIndex = index;
    while (true) {
      const left = nextIndex * 2 + 1;
      const right = left + 1;
      let smallest = nextIndex;

      if (left < this.values.length && this.values[left]!.f < this.values[smallest]!.f) {
        smallest = left;
      }
      if (right < this.values.length && this.values[right]!.f < this.values[smallest]!.f) {
        smallest = right;
      }

      if (smallest === nextIndex) {
        break;
      }

      [this.values[nextIndex], this.values[smallest]] = [this.values[smallest]!, this.values[nextIndex]!];
      nextIndex = smallest;
    }
  }
}

const buildBlockedCells = (nodes: RoutingObstacleNode[], allowKeys: Set<string>): Set<string> => {
  const blocked = new Set<string>();
  nodes.forEach((node) => {
      const startX = Math.floor(node.x);
      const endX = Math.ceil(node.x + node.width);
      const startY = Math.floor(node.y);
      const endY = Math.ceil(node.y + node.height);
    for (let x = startX; x <= endX; x += 1) {
      for (let y = startY; y <= endY; y += 1) {
        const key = `${x},${y}`;
        if (!allowKeys.has(key)) {
          blocked.add(key);
        }
      }
    }
  });
  return blocked;
};

const dedupeConsecutivePoints = (points: GridPoint[]): GridPoint[] => {
  const compacted: GridPoint[] = [];
  for (const point of points) {
    const last = compacted[compacted.length - 1];
    if (!last || last.x !== point.x || last.y !== point.y) {
      compacted.push(point);
    }
  }
  return compacted;
};

export const compactRouteToAnchors = (points: GridPoint[]): GridPoint[] => {
  const deduped = dedupeConsecutivePoints(points);
  if (deduped.length <= 2) {
    return deduped;
  }

  const anchors: GridPoint[] = [deduped[0]!];
  for (let index = 1; index < deduped.length - 1; index += 1) {
    const previous = deduped[index - 1]!;
    const current = deduped[index]!;
    const next = deduped[index + 1]!;

    const continuesVertical = previous.x === current.x && current.x === next.x;
    const continuesHorizontal = previous.y === current.y && current.y === next.y;
    if (!continuesVertical && !continuesHorizontal) {
      anchors.push(current);
    }
  }
  anchors.push(deduped[deduped.length - 1]!);

  return dedupeConsecutivePoints(anchors);
};

const buildSearchBounds = (
  nodes: RoutingObstacleNode[],
  start: GridPoint,
  end: GridPoint,
  searchMargin: number,
  useGlobalBounds: boolean,
): { minX: number; maxX: number; minY: number; maxY: number } => {
  if (!useGlobalBounds) {
    const minX = Math.min(start.x, end.x) - searchMargin;
    const maxX = Math.max(start.x, end.x) + searchMargin;
    const minY = Math.min(start.y, end.y) - searchMargin;
    const maxY = Math.max(start.y, end.y) + searchMargin;
    return { minX, maxX, minY, maxY };
  }

  const nodeMinX = Math.floor(Math.min(...nodes.map((node) => node.x), start.x, end.x));
  const nodeMaxX = Math.ceil(Math.max(...nodes.map((node) => node.x + node.width), start.x, end.x));
  const nodeMinY = Math.floor(Math.min(...nodes.map((node) => node.y), start.y, end.y));
  const nodeMaxY = Math.ceil(Math.max(...nodes.map((node) => node.y + node.height), start.y, end.y));
  return {
    minX: nodeMinX - searchMargin,
    maxX: nodeMaxX + searchMargin,
    minY: nodeMinY - searchMargin,
    maxY: nodeMaxY + searchMargin,
  };
};

const orderDirectionsByGoal = (
  from: GridPoint,
  to: GridPoint,
  forceVertical: boolean,
): Array<{ x: number; y: number; dir: number }> => {
  const preferredHorizontal = to.x >= from.x ? 0 : 1;
  const preferredVertical = to.y >= from.y ? 2 : 3;
  const remaining = DIRECTIONS.filter((direction) => direction.dir !== preferredHorizontal && direction.dir !== preferredVertical);

  if (forceVertical && from.y !== to.y) {
    return [DIRECTIONS[preferredVertical]!, DIRECTIONS[preferredHorizontal]!, ...remaining];
  }

  return [DIRECTIONS[preferredHorizontal]!, DIRECTIONS[preferredVertical]!, ...remaining];
};

const runAStarWithBounds = (params: {
  start: GridPoint;
  startExit: GridPoint;
  end: GridPoint;
  blocked: Set<string>;
  allowKeys: Set<string>;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  bendPenalty: number;
}): GridPoint[] | null => {
  const { start, startExit, end, blocked, allowKeys, bounds, bendPenalty } = params;

  const inBounds = (point: GridPoint): boolean =>
    point.x >= bounds.minX && point.x <= bounds.maxX && point.y >= bounds.minY && point.y <= bounds.maxY;

  const heuristic = (point: GridPoint): number => Math.abs(point.x - end.x) + Math.abs(point.y - end.y);
  const totalDeltaX = Math.abs(end.x - startExit.x);
  const midpointDeltaX = Math.ceil(totalDeltaX / 2);

  const startDirection = 0;
  const startState: RouteState = { x: startExit.x, y: startExit.y, dir: startDirection };
  const open = new MinOpenHeap();
  open.push({ state: startState, g: 0, f: heuristic(startExit) });

  const bestG = new Map<string, number>([[stateKey(startState), 0]]);
  const closed = new Set<string>();
  const cameFrom = new Map<string, string>();
  let endStateKey: string | null = null;

  while (open.size > 0) {
    const current = open.pop();
    if (!current) {
      break;
    }

    const currentKey = stateKey(current.state);
    if (closed.has(currentKey)) {
      continue;
    }
    closed.add(currentKey);

    if (current.state.x === end.x && current.state.y === end.y) {
      endStateKey = currentKey;
      break;
    }

    const traversedDeltaX = Math.abs(current.state.x - startExit.x);
    const forceVertical = midpointDeltaX > 0 && traversedDeltaX >= midpointDeltaX;
    const orderedDirections = orderDirectionsByGoal({ x: current.state.x, y: current.state.y }, end, forceVertical);
    for (const direction of orderedDirections) {
      if (isImmediateReverse(current.state.dir, direction.dir)) {
        continue;
      }

      const nextPoint: GridPoint = { x: current.state.x + direction.x, y: current.state.y + direction.y };
      if (!inBounds(nextPoint)) {
        continue;
      }

      const nextPointKey = pointKey(nextPoint);
      if (blocked.has(nextPointKey) && !allowKeys.has(nextPointKey)) {
        continue;
      }

      const bendCost = current.state.dir === direction.dir ? 0 : bendPenalty;
      const horizontalCost =
        forceVertical && current.state.y !== end.y && (direction.dir === 0 || direction.dir === 1)
          ? Math.max(1, Math.floor(bendPenalty / 2))
          : 0;
      const tentativeG = current.g + 1 + bendCost + horizontalCost;
      const nextState: RouteState = { x: nextPoint.x, y: nextPoint.y, dir: direction.dir };
      const nextStateKey = stateKey(nextState);

      const knownCost = bestG.get(nextStateKey);
      if (knownCost !== undefined && tentativeG >= knownCost) {
        continue;
      }

      bestG.set(nextStateKey, tentativeG);
      cameFrom.set(nextStateKey, currentKey);
      open.push({ state: nextState, g: tentativeG, f: tentativeG + heuristic(nextPoint) });
    }
  }

  if (!endStateKey) {
    return null;
  }

  const reconstructed: GridPoint[] = [];
  let currentKey: string | undefined = endStateKey;
  while (currentKey) {
    const parts = currentKey.split(",");
    reconstructed.push({ x: Number(parts[0] ?? 0), y: Number(parts[1] ?? 0) });
    currentKey = cameFrom.get(currentKey);
  }
  reconstructed.reverse();

  return dedupeConsecutivePoints([start, startExit, ...reconstructed.slice(1)]);
};

export const computeOrthogonalRoute = (params: {
  nodes: RoutingObstacleNode[];
  start: GridPoint;
  startExit: GridPoint;
  end: GridPoint;
  allowPoints: GridPoint[];
  searchMargin: number;
  bendPenalty: number;
}): GridPoint[] | null => {
  const { nodes, start, startExit, end, allowPoints, searchMargin, bendPenalty } = params;
  const allowKeys = new Set(allowPoints.map(pointKey));
  const blocked = buildBlockedCells(nodes, allowKeys);

  const localBounds = buildSearchBounds(nodes, start, end, searchMargin, false);
  const localRoute = runAStarWithBounds({
    start,
    startExit,
    end,
    blocked,
    allowKeys,
    bounds: localBounds,
    bendPenalty,
  });
  if (localRoute) {
    return localRoute;
  }

  const globalBounds = buildSearchBounds(nodes, start, end, searchMargin, true);
  return runAStarWithBounds({
    start,
    startExit,
    end,
    blocked,
    allowKeys,
    bounds: globalBounds,
    bendPenalty,
  });
};

export const appendAndCompactRoute = (baseRoute: GridPoint[], suffix: GridPoint[]): GridPoint[] => {
  return dedupeConsecutivePoints([...baseRoute, ...suffix]);
};
