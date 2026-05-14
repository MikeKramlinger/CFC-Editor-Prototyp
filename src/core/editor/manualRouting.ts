import { compactRouteToAnchors, type GridPoint } from "./routing.js";

/**
 * Extract waypoints from route points, excluding start/end ports.
 */
export const persistWaypointsFromRoutePoints = (routePoints: GridPoint[]): GridPoint[] => {
  return routePoints.slice(1, -1);
};

/**
 * Compose a manual route from prefix (start → first waypoint), fixed waypoints, and suffix (last waypoint → end).
 * Anchors prefix/suffix endpoints to waypoints to prevent unwanted shifts when connected nodes move.
 */
export const composeManualRoutePoints = (
  waypoints: GridPoint[],
  prefixRoute: GridPoint[],
  suffixRoute: GridPoint[],
): GridPoint[] => {
  if (waypoints.length === 0) {
    return compactRouteToAnchors([...prefixRoute, ...suffixRoute]);
  }

  const firstWaypoint = waypoints[0]!;
  const route = [...prefixRoute];

  // Anchor prefix end to first waypoint
  if (route.length > 0) {
    route[route.length - 1] = firstWaypoint;
  }

  // Add middle waypoints (excluding first, already anchored)
  if (waypoints.length > 1) {
    route.push(...waypoints.slice(1));
  }

  // Add suffix waypoints (excluding first, which matches lastWaypoint)
  if (suffixRoute.length > 1) {
    route.push(...suffixRoute.slice(1));
  }

  return compactRouteToAnchors(route);
};
