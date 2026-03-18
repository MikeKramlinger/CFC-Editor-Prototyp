import {
  DEFAULT_NODE_TYPE,
  cloneGraph,
  getNodeTemplateByType,
  type CfcGraph,
  type CfcNode,
  type CfcNodeType,
} from "./model.js";
import {
  getExecutionOrderByNodeId,
  getExecutionOrderedNodeCount,
  swapNodeExecutionOrder,
} from "./core/graph/executionOrder.js";
import { getConnectionCreationBlockReason } from "./core/graph/connectionRules.js";
import {
  createNodeEditDialogController,
  type NodeEditDialogController,
} from "./ui/controllers/nodeEditDialogController.js";
import {
  beginConnectionDrag,
  finishConnectionDrag as finishConnectionLifecycleDrag,
  moveConnectionDrag,
} from "./ui/controllers/connectionLifecycleController.js";
import {
  installGraphInteractionController,
  type MarqueeSelectionState,
  type PanState,
} from "./ui/controllers/graphInteractionController.js";
import { renderConnectionLayer } from "./ui/controllers/connectionLayerController.js";
import { renderNodeLayer } from "./ui/controllers/nodeLayerController.js";
import { createBezierConnectionPath, createPolylineConnectionPath } from "./ui/views/connectionRendererUi.js";
import { createGroupDragState, type DragState } from "./core/editor/drag.js";
import {
  createSelectionRect,
  intersectsSelectionRect,
  toSelectionBoxSize,
} from "./core/editor/selection.js";
import { getNextSerialForPrefix } from "./core/editor/id.js";
import { type ConnectionDragState } from "./core/editor/connection.js";
import { type ConnectionPortKind } from "./core/editor/connection.js";
import {
  appendAndCompactRoute,
  compactRouteToAnchors,
  computeOrthogonalRoute,
  doesHorizontalSegmentTouchObstacle,
} from "./core/editor/routing.js";
import { createGraphHistory, type GraphHistory } from "./core/editor/history.js";
import {
  createGraphClipboard,
  getClipboardPasteContext,
  resolveClipboardPasteTranslation,
  type GraphClipboard,
} from "./core/editor/clipboard.js";
import { fitNodeWidthToLabel } from "./core/editor/nodeSizing.js";
import type { GridPoint } from "./core/editor/routing.js";
import {
  clampPanToPositiveArea,
  clampZoom,
  clientToGraphPx,
  computeZoomAtClient,
} from "./core/editor/viewport.js";

interface EditorOptions {
  onGraphChanged: (graph: CfcGraph) => void;
  onStatus: (message: string) => void;
}

interface GraphMutationFinalizeOptions {
  bumpRoutingCache?: boolean;
}

type RoutingMode = "bezier" | "astar";

const GRID_UNIT_SIZE = 1;
const GRID_CELL_PX = 24;
const GRID_SIZE = 1;
const BEND_PENALTY = 25;
const SEARCH_MARGIN = 12;

export class CfcEditor {
  private readonly canvas: HTMLDivElement;
  private readonly graphLayer: HTMLDivElement;
  private readonly contentLayer: HTMLDivElement;
  private readonly svg: SVGSVGElement;
  private readonly fallbackOverlaySvg: SVGSVGElement;
  private readonly nodeLayer: HTMLDivElement;
  private readonly selectionBox: HTMLDivElement;
  private readonly nodeEditDialogController: NodeEditDialogController;
  private readonly options: EditorOptions;
  private readonly history: GraphHistory;

  private graph: CfcGraph;
  private readonly selectedNodeIds = new Set<string>();
  private readonly selectedConnectionIds = new Set<string>();
  private routingMode: RoutingMode = "astar";
  private zoom = 1;
  private panX = 0;
  private panY = 0;
  private isPointerInsideGraph = false;
  private lastCursorUnits: { x: number; y: number } | null = null;
  private dragState: DragState | null = null;
  private connectionDrag: ConnectionDragState | null = null;
  private nodeEditHistoryBefore: CfcGraph | null = null;
  private dragHistoryBefore: CfcGraph | null = null;
  private marqueeSelection: MarqueeSelectionState | null = null;
  private panState: PanState | null = null;
  private skipNextCanvasClick = false;
  private routingCacheVersion = 0;
  private readonly astarRouteCache = new Map<string, { version: number; route: GridPoint[] | null }>();
  private clipboard: GraphClipboard | null = null;
  private isInteractionLocked = false;

  private ensureUniqueGraphIds(): void {
    const seenNodeIds = new Set<string>();
    let nextNodeSerial = getNextSerialForPrefix(
      "N",
      this.graph.nodes.map((node) => node.id),
    );

    this.graph.nodes.forEach((node) => {
      if (!seenNodeIds.has(node.id)) {
        seenNodeIds.add(node.id);
        return;
      }
      node.id = `N${nextNodeSerial}`;
      nextNodeSerial += 1;
      seenNodeIds.add(node.id);
    });

    const seenConnectionIds = new Set<string>();
    let nextConnectionSerial = getNextSerialForPrefix(
      "C",
      this.graph.connections.map((connection) => connection.id),
    );

    this.graph.connections.forEach((connection) => {
      if (!seenConnectionIds.has(connection.id)) {
        seenConnectionIds.add(connection.id);
        return;
      }
      connection.id = `C${nextConnectionSerial}`;
      nextConnectionSerial += 1;
      seenConnectionIds.add(connection.id);
    });
  }

  constructor(canvas: HTMLDivElement, initialGraph: CfcGraph, options: EditorOptions) {
    this.canvas = canvas;
    this.options = options;
    this.history = createGraphHistory(100);
    this.graph = cloneGraph(initialGraph);
    this.ensureUniqueGraphIds();

    this.graphLayer = document.createElement("div");
    this.graphLayer.className = "cfc-graph-layer";
    this.contentLayer = document.createElement("div");
    this.contentLayer.style.position = "absolute";
    this.contentLayer.style.inset = "0";
    this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.fallbackOverlaySvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.fallbackOverlaySvg.style.pointerEvents = "none";
    this.fallbackOverlaySvg.style.zIndex = "24";
    this.nodeLayer = document.createElement("div");
    this.nodeLayer.style.position = "absolute";
    this.nodeLayer.style.inset = "0";
    this.nodeLayer.style.pointerEvents = "none";
    this.selectionBox = document.createElement("div");
    this.selectionBox.className = "cfc-selection-box";
    this.selectionBox.style.display = "none";

    this.contentLayer.append(this.svg, this.nodeLayer, this.fallbackOverlaySvg, this.selectionBox);
    this.graphLayer.append(this.contentLayer);
    this.canvas.append(this.graphLayer);
    this.nodeEditDialogController = createNodeEditDialogController({
      canvas: this.canvas,
      nodeLayer: this.nodeLayer,
      unitToPx: this.unitToPx.bind(this),
      getZoom: () => this.zoom,
      getExecutionOrderByNodeId: (nodeId) => this.getExecutionOrderByNodeId(nodeId),
      getExecutionOrderedNodeCount: () => getExecutionOrderedNodeCount(this.graph.nodes),
      setExecutionOrderForNodeId: (nodeId, nextOrder) => this.setExecutionOrderForNodeId(nodeId, nextOrder),
      onBeforeNodeUpdate: () => {
        this.nodeEditHistoryBefore = this.getGraph();
      },
      onNodeUpdated: (node) => {
        const before = this.nodeEditHistoryBefore ?? this.getGraph();
        this.nodeEditHistoryBefore = null;
        const previousWidth = node.width;
        fitNodeWidthToLabel(node);
        this.finalizeGraphMutation(before, {
          bumpRoutingCache: node.width !== previousWidth,
        });
      },
    });
    this.applyZoom();
    installGraphInteractionController({
      canvas: this.canvas,
      graphLayer: this.graphLayer,
      contentLayer: this.contentLayer,
      svg: this.svg,
      nodeLayer: this.nodeLayer,
      selectionBox: this.selectionBox,
      getIsPointerInsideGraph: () => this.isPointerInsideGraph,
      setIsPointerInsideGraph: (value) => {
        this.isPointerInsideGraph = value;
      },
      setLastCursorUnits: (value) => {
        this.lastCursorUnits = value;
      },
      getDragState: () => this.dragState,
      setDragState: (state) => {
        this.dragState = state;
      },
      getConnectionDrag: () => this.connectionDrag,
      setConnectionDrag: (state) => {
        this.connectionDrag = state;
      },
      getMarqueeSelection: () => this.marqueeSelection,
      setMarqueeSelection: (state) => {
        this.marqueeSelection = state;
      },
      getPanState: () => this.panState,
      setPanState: (state) => {
        this.panState = state;
      },
      getSkipNextCanvasClick: () => this.skipNextCanvasClick,
      setSkipNextCanvasClick: (value) => {
        this.skipNextCanvasClick = value;
      },
      getIsInteractionLocked: () => this.isInteractionLocked,
      isAdditiveSelection: this.isAdditiveSelection.bind(this),
      closeNodeEditDialog: () => this.nodeEditDialogController.close(),
      clientToGraphPxX: this.clientToGraphPxX.bind(this),
      clientToGraphPxY: this.clientToGraphPxY.bind(this),
      clientToGraphUnitX: this.clientToGraphUnitX.bind(this),
      clientToGraphUnitY: this.clientToGraphUnitY.bind(this),
      getPan: () => ({ panX: this.panX, panY: this.panY }),
      setPan: (panX, panY) => {
        this.panX = panX;
        this.panY = panY;
      },
      clampPanToPositiveArea,
      applyZoom: this.applyZoom.bind(this),
      updateSelectionBox: this.updateSelectionBox.bind(this),
      applyMarqueeSelection: this.applyMarqueeSelection.bind(this),
      moveConnectionDrag: (event) => {
        if (!this.connectionDrag) {
          return;
        }
        this.connectionDrag = moveConnectionDrag(
          this.connectionDrag,
          this.clientToGraphPxX(event.clientX),
          this.clientToGraphPxY(event.clientY),
          event.clientX,
          event.clientY,
        );
        this.renderConnections();
      },
      finishConnectionDrag: this.finishConnectionDrag.bind(this),
      findNodeForDrag: (nodeId) => {
        const targetNode = this.findNode(nodeId);
        if (!targetNode) {
          return null;
        }
        return {
          x: targetNode.x,
          y: targetNode.y,
          setPosition: (x, y) => {
            if (targetNode.x !== x || targetNode.y !== y) {
              this.bumpRoutingCacheVersion();
            }
            targetNode.x = x;
            targetNode.y = y;
          },
        };
      },
      snapToGrid: this.snapToGrid.bind(this),
      clampUnitToNonNegative: this.clampUnitToNonNegative.bind(this),
      onNodeDragFinished: this.finalizeNodeDragHistory.bind(this),
      render: this.render.bind(this),
      emitGraphChanged: this.emitGraphChanged.bind(this),
      clearSelection: this.clearSelection.bind(this),
    });
    this.render();
  }

  getGraph(): CfcGraph {
    return cloneGraph(this.graph);
  }

  loadGraph(nextGraph: CfcGraph): void {
    this.graph = cloneGraph(nextGraph);
    this.ensureUniqueGraphIds();
    this.normalizeAllNodesToGrid();
    this.bumpRoutingCacheVersion();
    this.selectedNodeIds.clear();
    this.selectedConnectionIds.clear();
    this.connectionDrag = null;
    this.nodeEditHistoryBefore = null;
    this.dragHistoryBefore = null;
    this.history.clear();
    this.nodeEditDialogController.close();
    this.render();
    this.emitGraphChanged();
  }

  undo(): boolean {
    const previous = this.history.undo(this.graph);
    if (!previous) {
      this.options.onStatus("Nichts zum Rückgängig machen.");
      return false;
    }

    this.graph = previous;
    this.bumpRoutingCacheVersion();
    this.connectionDrag = null;
    this.dragHistoryBefore = null;
    this.nodeEditHistoryBefore = null;
    this.selectedNodeIds.clear();
    this.selectedConnectionIds.clear();
    this.nodeEditDialogController.close();
    this.render();
    this.emitGraphChanged();
    return true;
  }

  redo(): boolean {
    const next = this.history.redo(this.graph);
    if (!next) {
      this.options.onStatus("Nichts zum Wiederholen.");
      return false;
    }

    this.graph = next;
    this.bumpRoutingCacheVersion();
    this.connectionDrag = null;
    this.dragHistoryBefore = null;
    this.nodeEditHistoryBefore = null;
    this.selectedNodeIds.clear();
    this.selectedConnectionIds.clear();
    this.nodeEditDialogController.close();
    this.render();
    this.emitGraphChanged();
    return true;
  }

  getZoom(): number {
    return this.zoom;
  }

  getRoutingMode(): RoutingMode {
    return this.routingMode;
  }

  setInteractionLocked(locked: boolean): void {
    this.isInteractionLocked = locked;
    if (!locked) {
      return;
    }

    this.dragState = null;
    this.connectionDrag = null;
    this.marqueeSelection = null;
    this.panState = null;
    this.nodeEditDialogController.close();
    this.render();
  }

  toggleRoutingMode(): RoutingMode {
    this.routingMode = this.routingMode === "bezier" ? "astar" : "bezier";
    this.render();
    return this.routingMode;
  }

  setZoom(nextZoom: number): number {
    const clamped = clampZoom(nextZoom);
    this.zoom = Math.round(clamped * 100) / 100;
    const clampedPan = clampPanToPositiveArea(this.panX, this.panY);
    this.panX = clampedPan.panX;
    this.panY = clampedPan.panY;
    this.applyZoom();
    this.renderConnections();
    this.options.onStatus(`Zoom: ${Math.round(this.zoom * 100)}%`);
    return this.zoom;
  }

  resetViewportToOrigin(): number {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.applyZoom();
    this.renderConnections();
    this.options.onStatus("Zoom: 100%");
    return this.zoom;
  }

  adjustZoom(delta: number): number {
    return this.setZoom(this.zoom + delta);
  }

  zoomAtClient(delta: number, clientX: number, clientY: number): number {
    const rect = this.canvas.getBoundingClientRect();
    const nextViewport = computeZoomAtClient(delta, clientX, clientY, rect, {
      zoom: this.zoom,
      panX: this.panX,
      panY: this.panY,
    });

    if (nextViewport.zoom === this.zoom) {
      return this.zoom;
    }

    this.zoom = nextViewport.zoom;
    this.panX = nextViewport.panX;
    this.panY = nextViewport.panY;
    this.applyZoom();
    this.renderConnections();
    return this.zoom;
  }

  addNode(): void {
    this.addNodeByType(DEFAULT_NODE_TYPE);
  }

  private createNodeForType(nodeType: CfcNodeType, nextIndex: number, x: number, y: number): CfcNode {
    const template = getNodeTemplateByType(nodeType);
    const node: CfcNode = {
      id: `N${nextIndex}`,
      type: nodeType,
      label: `${template.label} ${nextIndex}`,
      x,
      y,
      width: template.width,
      height: template.height,
    };
    fitNodeWidthToLabel(node);
    return node;
  }

  private commitAddedNode(before: CfcGraph, node: CfcNode): void {
    this.graph.nodes.push(node);
    this.selectedNodeIds.clear();
    this.selectedConnectionIds.clear();
    this.selectedNodeIds.add(node.id);
    this.finalizeGraphMutation(before, { bumpRoutingCache: true });
  }

  addNodeByType(nodeType: CfcNodeType): void {
    if (this.isInteractionLocked) {
      return;
    }
    const before = this.getGraph();
    const nextIndex = getNextSerialForPrefix(
      "N",
      this.graph.nodes.map((node) => node.id),
    );
    const node = this.createNodeForType(
      nodeType,
      nextIndex,
      this.snapToGrid(2 + (nextIndex % 6) * 2),
      this.snapToGrid(2 + (nextIndex % 5) * 2),
    );
    this.commitAddedNode(before, node);
  }

  addNodeAtCursor(): void {
    this.addNodeAtCursorByType(DEFAULT_NODE_TYPE);
  }

  addNodeAtCursorByType(nodeType: CfcNodeType): void {
    if (this.isInteractionLocked) {
      return;
    }
    if (!this.lastCursorUnits) {
      this.addNodeByType(nodeType);
      return;
    }

    const before = this.getGraph();
    const nextIndex = getNextSerialForPrefix(
      "N",
      this.graph.nodes.map((node) => node.id),
    );
    const template = getNodeTemplateByType(nodeType);
    const node = this.createNodeForType(
      nodeType,
      nextIndex,
      this.clampUnitToNonNegative(this.lastCursorUnits.x - template.width / 2),
      this.clampUnitToNonNegative(this.lastCursorUnits.y - template.height / 2),
    );
    this.commitAddedNode(before, node);
  }

  addNodeFromToolbox(nodeType: CfcNodeType, clientX: number, clientY: number): void {
    if (this.isInteractionLocked) {
      return;
    }
    const before = this.getGraph();
    const nextIndex = getNextSerialForPrefix(
      "N",
      this.graph.nodes.map((node) => node.id),
    );
    const template = getNodeTemplateByType(nodeType);
    const centerUnitsX = this.clientToGraphUnitX(clientX);
    const centerUnitsY = this.clientToGraphUnitY(clientY);
    const node = this.createNodeForType(
      nodeType,
      nextIndex,
      this.clampUnitToNonNegative(centerUnitsX - template.width / 2),
      this.clampUnitToNonNegative(centerUnitsY - template.height / 2),
    );
    this.commitAddedNode(before, node);
  }

  clear(): void {
    const before = this.getGraph();
    this.graph.nodes = [];
    this.graph.connections = [];
    this.selectedNodeIds.clear();
    this.selectedConnectionIds.clear();
    this.connectionDrag = null;
    this.nodeEditDialogController.close();
    this.finalizeGraphMutation(before, { bumpRoutingCache: true });
  }

  deleteSelected(): void {
    if (this.isInteractionLocked) {
      return;
    }
    const selectedNodeIds = new Set(this.selectedNodeIds);
    const selectedConnectionIds = new Set(this.selectedConnectionIds);

    if (selectedNodeIds.size === 0 && selectedConnectionIds.size === 0) {
      this.options.onStatus("Keine Box ausgewählt.");
      return;
    }

    const before = this.getGraph();
    this.graph.nodes = this.graph.nodes.filter((node) => !selectedNodeIds.has(node.id));
    this.graph.connections = this.graph.connections.filter(
      (connection) =>
        !selectedConnectionIds.has(connection.id) &&
        !selectedNodeIds.has(connection.fromNodeId) &&
        !selectedNodeIds.has(connection.toNodeId),
    );
    this.selectedNodeIds.clear();
    this.selectedConnectionIds.clear();
    this.connectionDrag = null;
    this.finalizeGraphMutation(before, { bumpRoutingCache: true });
    this.options.onStatus("Ausgewählte Elemente gelöscht.");
  }

  clearSelection(): void {
    if (this.isInteractionLocked) {
      return;
    }
    this.selectedNodeIds.clear();
    this.selectedConnectionIds.clear();
    this.nodeEditDialogController.close();
    this.render();
  }

  copySelection(): boolean {
    if (this.isInteractionLocked) {
      return false;
    }
    if (this.selectedNodeIds.size === 0) {
      this.options.onStatus("Keine Boxen ausgewählt zum Kopieren.");
      return false;
    }

    const nextClipboard = createGraphClipboard(this.graph, this.selectedNodeIds);
    if (!nextClipboard) {
      this.options.onStatus("Keine Boxen ausgewählt zum Kopieren.");
      return false;
    }

    this.clipboard = nextClipboard;
    this.options.onStatus(`${nextClipboard.nodes.length} Box(en) kopiert.`);
    return true;
  }

  pasteSelection(): boolean {
    if (this.isInteractionLocked) {
      return false;
    }
    if (!this.clipboard || this.clipboard.nodes.length === 0) {
      this.options.onStatus("Zwischenablage ist leer.");
      return false;
    }

    const before = this.getGraph();
    const pasteContext = getClipboardPasteContext(this.clipboard, this.lastCursorUnits);
    this.clipboard.pasteCount = pasteContext.pasteCount;
    const resolvedTranslation = resolveClipboardPasteTranslation(
      this.clipboard.nodes,
      this.graph.nodes,
      pasteContext.translationX,
      pasteContext.translationY,
    );

    const idMap = new Map<string, string>();
    const pastedNodeIds: string[] = [];

    for (const sourceNode of this.clipboard.nodes) {
      const nextNodeId = `N${getNextSerialForPrefix(
        "N",
        this.graph.nodes.map((node) => node.id),
      )}`;
      idMap.set(sourceNode.id, nextNodeId);

      const pastedNode: CfcNode = {
        ...sourceNode,
        id: nextNodeId,
        x: this.clampUnitToNonNegative(sourceNode.x + resolvedTranslation.translationX),
        y: this.clampUnitToNonNegative(sourceNode.y + resolvedTranslation.translationY),
      };

      fitNodeWidthToLabel(pastedNode);
      this.graph.nodes.push(pastedNode);
      pastedNodeIds.push(nextNodeId);
    }

    for (const sourceConnection of this.clipboard.connections) {
      const fromNodeId = idMap.get(sourceConnection.fromNodeId);
      const toNodeId = idMap.get(sourceConnection.toNodeId);
      if (!fromNodeId || !toNodeId) {
        continue;
      }

      const blockReason = getConnectionCreationBlockReason(this.graph.connections, {
        fromNodeId,
        fromPort: sourceConnection.fromPort,
        toNodeId,
        toPort: sourceConnection.toPort,
      });
      if (blockReason) {
        continue;
      }

      this.graph.connections.push({
        id: `C${getNextSerialForPrefix(
          "C",
          this.graph.connections.map((connection) => connection.id),
        )}`,
        fromNodeId,
        fromPort: sourceConnection.fromPort,
        toNodeId,
        toPort: sourceConnection.toPort,
      });
    }

    this.selectedNodeIds.clear();
    this.selectedConnectionIds.clear();
    pastedNodeIds.forEach((nodeId) => this.selectedNodeIds.add(nodeId));

    this.finalizeGraphMutation(before, { bumpRoutingCache: true });
    this.options.onStatus(`${pastedNodeIds.length} Box(en) eingefügt.`);
    return true;
  }

  selectAll(): void {
    if (this.isInteractionLocked) {
      return;
    }
    this.selectedNodeIds.clear();
    this.selectedConnectionIds.clear();
    this.nodeEditDialogController.close();
    this.graph.nodes.forEach((node) => this.selectedNodeIds.add(node.id));
    this.graph.connections.forEach((connection) => this.selectedConnectionIds.add(connection.id));
    this.render();
  }

  private getExecutionOrderByNodeId(nodeId: string): number | null {
    return getExecutionOrderByNodeId(this.graph.nodes, nodeId);
  }

  private setExecutionOrderForNodeId(nodeId: string, nextOrder: number): void {
    this.graph.nodes = swapNodeExecutionOrder(this.graph.nodes, nodeId, nextOrder);
  }

  isCursorInsideGraph(): boolean {
    return this.isPointerInsideGraph;
  }

  private finalizeGraphMutation(before: CfcGraph, options: GraphMutationFinalizeOptions = {}): void {
    this.history.commit(before, this.graph);
    if (options.bumpRoutingCache) {
      this.bumpRoutingCacheVersion();
    }
    this.render();
    this.emitGraphChanged();
  }

  private isAdditiveSelection(event: MouseEvent): boolean {
    return event.shiftKey || event.ctrlKey || event.metaKey;
  }

  private updateSelectionBox(): void {
    if (!this.marqueeSelection) {
      this.selectionBox.style.display = "none";
      return;
    }

    const selectionRect = createSelectionRect(
      this.marqueeSelection.startX,
      this.marqueeSelection.startY,
      this.marqueeSelection.currentX,
      this.marqueeSelection.currentY,
    );
    const selectionBoxSize = toSelectionBoxSize(selectionRect);

    this.selectionBox.style.display = "block";
    this.selectionBox.style.left = `${selectionRect.left}px`;
    this.selectionBox.style.top = `${selectionRect.top}px`;
    this.selectionBox.style.width = `${selectionBoxSize.width}px`;
    this.selectionBox.style.height = `${selectionBoxSize.height}px`;
  }

  private applyMarqueeSelection(): void {
    if (!this.marqueeSelection) {
      return;
    }

    const selectionRect = createSelectionRect(
      this.marqueeSelection.startX,
      this.marqueeSelection.startY,
      this.marqueeSelection.currentX,
      this.marqueeSelection.currentY,
    );

    const nextNodeIds = this.marqueeSelection.additive ? new Set(this.selectedNodeIds) : new Set<string>();
    const nextConnectionIds = this.marqueeSelection.additive ? new Set(this.selectedConnectionIds) : new Set<string>();

    this.graph.nodes.forEach((node, index) => {
      const intersects = intersectsSelectionRect(
        {
          left: this.unitToPx(node.x),
          right: this.unitToPx(node.x + node.width),
          top: this.unitToPx(node.y),
          bottom: this.unitToPx(node.y + node.height),
        },
        selectionRect,
      );
      if (intersects) {
        nextNodeIds.add(node.id);
      }
    });

    const connectionPaths = this.svg.querySelectorAll<SVGPathElement>(".cfc-connection[data-connection-id]");
    connectionPaths.forEach((path) => {
      const connectionId = path.dataset.connectionId;
      if (!connectionId) {
        return;
      }

      const bounds = path.getBBox();
      const intersects = intersectsSelectionRect(
        {
          left: bounds.x,
          right: bounds.x + bounds.width,
          top: bounds.y,
          bottom: bounds.y + bounds.height,
        },
        selectionRect,
      );
      if (intersects) {
        nextConnectionIds.add(connectionId);
      }
    });

    this.selectedNodeIds.clear();
    this.selectedConnectionIds.clear();
    nextNodeIds.forEach((nodeId) => this.selectedNodeIds.add(nodeId));
    nextConnectionIds.forEach((connectionId) => this.selectedConnectionIds.add(connectionId));
    this.render();
  }

  private emitGraphChanged(): void {
    this.options.onGraphChanged(this.getGraph());
  }

  private bumpRoutingCacheVersion(): void {
    this.routingCacheVersion += 1;
    this.astarRouteCache.clear();
  }

  private applyZoom(): void {
    const gridSizePx = GRID_CELL_PX * this.zoom;
    this.graphLayer.style.setProperty("--grid-size", `${gridSizePx}px`);
    this.graphLayer.style.backgroundPosition = `${this.panX}px ${this.panY}px`;

    this.contentLayer.style.transformOrigin = "0 0";
    this.contentLayer.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
  }

  private clampUnitToNonNegative(value: number): number {
    return Math.max(0, this.snapToGrid(value));
  }

  private unitToPx(value: number): number {
    return value * GRID_CELL_PX;
  }

  private clientToGraphPxX(clientX: number): number {
    const rect = this.canvas.getBoundingClientRect();
    return clientToGraphPx(clientX, rect.top, rect, {
      zoom: this.zoom,
      panX: this.panX,
      panY: this.panY,
    }).x;
  }

  private clientToGraphPxY(clientY: number): number {
    const rect = this.canvas.getBoundingClientRect();
    return clientToGraphPx(rect.left, clientY, rect, {
      zoom: this.zoom,
      panX: this.panX,
      panY: this.panY,
    }).y;
  }

  private clientToGraphUnitX(clientX: number): number {
    return this.clientToGraphPxX(clientX) / GRID_CELL_PX;
  }

  private clientToGraphUnitY(clientY: number): number {
    return this.clientToGraphPxY(clientY) / GRID_CELL_PX;
  }

  private snapToGrid(value: number): number {
    const safeGridSize = Math.max(0.000001, GRID_SIZE * GRID_UNIT_SIZE);
    return Math.round(value / safeGridSize) * safeGridSize;
  }

  private snapDimensionToGrid(value: number): number {
    return Math.max(GRID_UNIT_SIZE, this.snapToGrid(value));
  }

  private normalizeAllNodesToGrid(): void {
    this.graph.nodes.forEach((node) => {
      if (!node.type) {
        node.type = DEFAULT_NODE_TYPE;
      }
      const template = getNodeTemplateByType(node.type);
      node.x = this.clampUnitToNonNegative(node.x);
      node.y = this.clampUnitToNonNegative(node.y);
      if (node.width < template.width) {
        node.width = template.width;
      }
      if (node.height < template.height) {
        node.height = template.height;
      }
    });
  }

  private findNode(nodeId: string): CfcNode | undefined {
    return this.graph.nodes.find((node) => node.id === nodeId);
  }

  private getPortIndex(portId: string, prefix: "input" | "output"): number {
    if (!portId.startsWith(`${prefix}:`)) {
      return 0;
    }
    const raw = Number(portId.slice(prefix.length + 1));
    return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 0;
  }

  private getPortCenterY(node: CfcNode, portIndex: number, portCount: number): number {
    if (portCount <= 1) {
      return node.y + node.height / 2;
    }
    const clampedIndex = Math.max(0, Math.min(portIndex, portCount - 1));
    const gap = node.height / (portCount + 1);
    return node.y + gap * (clampedIndex + 1);
  }

  private getOutputPortPoint(node: CfcNode, portId: string): { x: number; y: number } {
    const template = getNodeTemplateByType(node.type);
    const portIndex = this.getPortIndex(portId, "output");
    return {
      x: node.x + node.width,
      y: this.getPortCenterY(node, portIndex, template.outputCount),
    };
  }

  private getInputPortPoint(node: CfcNode, portId: string): { x: number; y: number } {
    const template = getNodeTemplateByType(node.type);
    const portIndex = this.getPortIndex(portId, "input");
    const inputX = node.type === "return" ? node.x - node.height / 2 : node.x;
    return {
      x: inputX,
      y: this.getPortCenterY(node, portIndex, template.inputCount),
    };
  }

  private floorIfFractional(value: number): number {
    return Number.isInteger(value) ? value : Math.floor(value);
  }

  private getRegularSnappedPortCenters(node: CfcNode, portCount: number): number[] {
    if (portCount <= 1) {
      return [this.floorIfFractional(node.y + node.height / 2)];
    }

    const exactGap = node.height / (portCount + 1);
    const exactCenters = Array.from({ length: portCount }, (_, index) => node.y + exactGap * (index + 1));
    const firstExact = exactCenters[0] ?? node.y;

    const candidateSteps = Array.from(new Set([Math.floor(exactGap), Math.ceil(exactGap)].map((value) => Math.max(1, value))));
    const candidateStarts = Array.from(new Set([Math.floor(firstExact), Math.ceil(firstExact)]));

    let bestCenters: number[] = exactCenters.map((value) => this.floorIfFractional(value));
    let bestError = Number.POSITIVE_INFINITY;

    for (const step of candidateSteps) {
      for (const start of candidateStarts) {
        const centers = Array.from({ length: portCount }, (_, index) => start + index * step);
        const error = centers.reduce((sum, center, index) => {
          const exact = exactCenters[index] ?? center;
          return sum + Math.abs(center - exact);
        }, 0);
        if (error < bestError) {
          bestError = error;
          bestCenters = centers;
        }
      }
    }

    return bestCenters;
  }

  private getAStarPortY(node: CfcNode, portId: string, kind: "input" | "output"): number {
    const template = getNodeTemplateByType(node.type);
    const portCount = kind === "input" ? template.inputCount : template.outputCount;
    const portIndex = this.getPortIndex(portId, kind);
    const centers = this.getRegularSnappedPortCenters(node, portCount);
    return centers[Math.max(0, Math.min(portIndex, centers.length - 1))] ?? this.floorIfFractional(node.y);
  }

  private render(): void {
    this.renderNodes();
    this.renderConnections();
  }

  private renderNodes(): void {
    renderNodeLayer({
      nodeLayer: this.nodeLayer,
      nodes: this.graph.nodes,
      selectedNodeIds: this.selectedNodeIds,
      snapPortYToInteger: this.routingMode === "astar",
      getExecutionOrderByNodeId: this.getExecutionOrderByNodeId.bind(this),
      unitToPx: this.unitToPx.bind(this),
      onOutputPortPointerDown: (nodeId, portId, clientX, clientY) => {
        if (this.isInteractionLocked) {
          return;
        }
        this.startConnectionDrag(nodeId, portId, "output", clientX, clientY);
      },
      onInputPortPointerDown: (nodeId, portId, clientX, clientY) => {
        if (this.isInteractionLocked) {
          return;
        }
        this.startConnectionDrag(nodeId, portId, "input", clientX, clientY);
      },
      onNodeDoubleClick: (node) => {
        if (this.isInteractionLocked) {
          return;
        }
        this.nodeEditDialogController.open(node);
      },
      onNodePointerDown: (node, event) => {
        if (this.isInteractionLocked) {
          return;
        }
        this.handleNodePointerDown(node, event);
      },
    });
  }

  private renderConnections(): void {
    renderConnectionLayer({
      svg: this.svg,
      fallbackOverlaySvg: this.fallbackOverlaySvg,
      connections: this.graph.connections,
      selectedConnectionIds: this.selectedConnectionIds,
      routingMode: this.routingMode,
      connectionDrag: this.connectionDrag,
      findNode: this.findNode.bind(this),
      getOutputPortPoint: this.getOutputPortPoint.bind(this),
      getInputPortPoint: this.getInputPortPoint.bind(this),
      unitToPx: this.unitToPx.bind(this),
      createAStarConnectionPath: this.createAStarConnectionPath.bind(this),
      canDropConnection: (fromNodeId, fromPort, toNodeId, toPort) => {
        return (
          getConnectionCreationBlockReason(this.graph.connections, {
            fromNodeId,
            fromPort,
            toNodeId,
            toPort,
          }) === null
        );
      },
      onConnectionClick: (connectionId, event) => {
        if (this.isInteractionLocked) {
          return;
        }
        this.handleConnectionClick(connectionId, event);
      },
    });
  }

  private handleNodePointerDown(node: CfcNode, event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }
    if ((event.target as HTMLElement).closest(".cfc-port")) {
      return;
    }
    event.stopPropagation();

    const additive = this.isAdditiveSelection(event);
    let selectionChanged = false;
    if (!additive) {
      const isNodeAlreadySelected = this.selectedNodeIds.has(node.id);
      if (!isNodeAlreadySelected) {
        this.selectedNodeIds.clear();
        this.selectedConnectionIds.clear();
        this.selectedNodeIds.add(node.id);
        selectionChanged = true;
      }
    } else if (this.selectedNodeIds.has(node.id)) {
      this.selectedNodeIds.delete(node.id);
      selectionChanged = true;
    } else {
      this.selectedNodeIds.add(node.id);
      selectionChanged = true;
    }

    if (selectionChanged) {
      this.render();
    }

    const selectedNodeIdsToDrag =
      this.selectedNodeIds.has(node.id) && this.selectedNodeIds.size > 0 ? Array.from(this.selectedNodeIds) : [node.id];

    if (!this.selectedNodeIds.has(node.id)) {
      this.selectedNodeIds.clear();
      this.selectedConnectionIds.clear();
      this.selectedNodeIds.add(node.id);
      this.render();
    }

    const nodesToDrag = selectedNodeIdsToDrag
      .map((nodeId) => this.findNode(nodeId))
      .filter((entry): entry is CfcNode => entry !== undefined);

    if (nodesToDrag.length === 0) {
      return;
    }

    const startPointerXUnits = this.clientToGraphUnitX(event.clientX);
    const startPointerYUnits = this.clientToGraphUnitY(event.clientY);

    this.dragState = createGroupDragState(nodesToDrag, startPointerXUnits, startPointerYUnits);
    this.dragHistoryBefore = this.getGraph();
  }

  private finalizeNodeDragHistory(): void {
    if (!this.dragHistoryBefore) {
      return;
    }
    this.history.commit(this.dragHistoryBefore, this.graph);
    this.dragHistoryBefore = null;
  }

  private handleConnectionClick(connectionId: string, event: MouseEvent): void {
    const additive = this.isAdditiveSelection(event);
    if (!additive) {
      this.selectedNodeIds.clear();
      this.selectedConnectionIds.clear();
      this.selectedConnectionIds.add(connectionId);
    } else if (this.selectedConnectionIds.has(connectionId)) {
      this.selectedConnectionIds.delete(connectionId);
    } else {
      this.selectedConnectionIds.add(connectionId);
    }
    this.render();
  }

  private createAStarConnectionPath(
    fromNode: CfcNode,
    toNode: CfcNode,
    fromPortId = "output:0",
    toPortId = "input:0",
    connectionId = "",
  ): SVGPathElement {
    const toRoutingObstacleNode = (node: CfcNode): CfcNode & { x: number; y: number; width: number; height: number } => {
      if (node.type !== "return") {
        return node;
      }

      return {
        ...node,
        x: node.x - 1,
        width: node.width + 2,
      };
    };

    const startPort = this.getOutputPortPoint(fromNode, fromPortId);
    const endPort = this.getInputPortPoint(toNode, toPortId);
    const start = { x: Math.ceil(startPort.x), y: this.getAStarPortY(fromNode, fromPortId, "output") };
    const end = { x: Math.floor(endPort.x), y: this.getAStarPortY(toNode, toPortId, "input") };
    const startRight = { x: start.x + 1, y: start.y };
    const endLeft = { x: end.x - 1, y: end.y };

    const cacheKey = connectionId || `${fromNode.id}|${fromPortId}|${toNode.id}|${toPortId}`;
    const cached = this.astarRouteCache.get(cacheKey);
    const routingObstacles = this.graph.nodes.map(toRoutingObstacleNode);
    let routePoints: GridPoint[] | null;

    if (cached && cached.version === this.routingCacheVersion) {
      routePoints = cached.route;
    } else {
      const startSegmentTouchesNode = routingObstacles.some(
        (node) => node.id !== fromNode.id && doesHorizontalSegmentTouchObstacle(node, start.x, startRight.x, start.y),
      );
      const endSegmentTouchesNode = routingObstacles.some(
        (node) => node.id !== toNode.id && doesHorizontalSegmentTouchObstacle(node, endLeft.x, end.x, end.y),
      );

      if (startSegmentTouchesNode || endSegmentTouchesNode) {
        routePoints = null;
      } else {
        const route = computeOrthogonalRoute({
          nodes: routingObstacles,
          start: startRight,
          startExit: startRight,
          end: endLeft,
          allowPoints: [startRight, endLeft],
          searchMargin: SEARCH_MARGIN,
          bendPenalty: BEND_PENALTY,
        });
        routePoints = route ? compactRouteToAnchors(appendAndCompactRoute([start, ...route], [end])) : null;
      }
      this.astarRouteCache.set(cacheKey, { version: this.routingCacheVersion, route: routePoints });
    }

    if (!routePoints) {
      const fallbackPath = createPolylineConnectionPath([start, end], this.unitToPx.bind(this));
      fallbackPath.classList.add("cfc-connection--fallback");
      return fallbackPath;
    }

    return createPolylineConnectionPath(routePoints, this.unitToPx.bind(this));
  }

  private startConnectionDrag(
    fromNodeId: string,
    fromPort: string,
    fromPortKind: ConnectionPortKind,
    clientX: number,
    clientY: number,
  ): void {
    if (this.isInteractionLocked) {
      return;
    }
    this.connectionDrag = beginConnectionDrag({
      fromNodeId,
      fromPort,
      fromPortKind,
      clientX,
      clientY,
      findNode: this.findNode.bind(this),
      getOutputPortPoint: this.getOutputPortPoint.bind(this),
      getInputPortPoint: this.getInputPortPoint.bind(this),
      unitToPx: this.unitToPx.bind(this),
      clientToGraphPxX: this.clientToGraphPxX.bind(this),
      clientToGraphPxY: this.clientToGraphPxY.bind(this),
    });
    if (!this.connectionDrag) {
      return;
    }
    this.selectedNodeIds.clear();
    this.selectedConnectionIds.clear();
    this.selectedNodeIds.add(fromNodeId);
    this.renderConnections();
  }

  private finishConnectionDrag(): void {
    if (!this.connectionDrag) {
      return;
    }

    const before = this.getGraph();
    let connectionCreated = false;

    finishConnectionLifecycleDrag({
      state: this.connectionDrag,
      graphConnections: this.graph.connections,
      getNextConnectionId: () =>
        `C${getNextSerialForPrefix(
          "C",
          this.graph.connections.map((connection) => connection.id),
        )}`,
      onConnectionCreated: (connection) => {
        this.graph.connections.push(connection);
        connectionCreated = true;
        this.bumpRoutingCacheVersion();
      },
      onConnectionSelected: (connectionId) => {
        this.selectedNodeIds.clear();
        this.selectedConnectionIds.clear();
        this.selectedConnectionIds.add(connectionId);
      },
      onStatus: (message) => {
        this.options.onStatus(message);
      },
    });

    if (connectionCreated) {
      this.history.commit(before, this.graph);
      this.emitGraphChanged();
    }

    this.connectionDrag = null;
    this.renderConnections();
  }
}
