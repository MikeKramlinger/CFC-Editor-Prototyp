import { CfcEditor } from "./editor.js";
import { getNextSerialForPrefix } from "./core/editor/id.js";
import { getAdapterById, listAdapters } from "./formats/registry.js";
import { createDataPanelController } from "./ui/controllers/dataPanelController.js";
import { installKeyboardShortcutsController } from "./ui/controllers/keyboardShortcutsController.js";
import { createToolbarController } from "./ui/controllers/toolbarController.js";
import { createToolboxController } from "./ui/controllers/toolboxController.js";
import { getDataPanelUiElements } from "./ui/views/dataPanelUi.js";
import { query } from "./ui/views/domQueryUi.js";
import { getToolbarUiElements } from "./ui/views/toolbarUi.js";
import { getToolboxUiElements } from "./ui/views/toolboxUi.js";
import {
  CFC_NODE_TEMPLATES,
  createEmptyGraph,
  getNodeTemplateByType,
  isCfcNodeType,
  type CfcConnection,
  type CfcGraph,
  type CfcNode,
  type CfcNodeType,
} from "./model.js";

const canvas = query<HTMLDivElement>("#canvas");
const toolbarUi = getToolbarUiElements();
const toolboxUi = getToolboxUiElements();
const dataPanelUi = getDataPanelUiElements();

const THEME_STORAGE_KEY = "cfc-editor-theme";
type UiTheme = "light" | "dark";
type ShortcutContext = "graph" | "data";

let currentGraph: CfcGraph = createEmptyGraph();
const initialSelectedToolboxType: CfcNodeType = "box";
let lastShortcutContext: ShortcutContext = "graph";

const TOOLBOX_ICONS: Record<CfcNodeType, string> = {
  input: "⮕",
  output: "⮜",
  box: "▦",
  "box-en-eno": "▤",
  jump: "↪",
  label: "🏷",
  return: "↩",
  composer: "⨁",
  selector: "⫴",
  comment: "💬",
  "connection-mark-source": "◎",
  "connection-mark-sink": "◉",
  "input-pin": "◌",
  "output-pin": "●",
};

const adapters = listAdapters();
if (adapters.length === 0) {
  throw new Error("Keine Datenformat-Adapter registriert.");
}

adapters.forEach((adapter) => {
  const option = document.createElement("option");
  option.value = adapter.id;
  option.textContent = adapter.label;
  toolbarUi.formatSelect.append(option);
});

const defaultAdapter = adapters[0]!;
const getCurrentAdapter = () => getAdapterById(toolbarUi.formatSelect.value || defaultAdapter.id);

const editor = new CfcEditor(canvas, currentGraph, {
  onGraphChanged: (graph) => {
    currentGraph = graph;
  },
  onStatus: () => undefined,
});

const getStoredTheme = (): UiTheme | null => {
  const value = localStorage.getItem(THEME_STORAGE_KEY);
  if (value === "dark" || value === "light") {
    return value;
  }
  return null;
};

const getInitialTheme = (): UiTheme => {
  const stored = getStoredTheme();
  if (stored) {
    return stored;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

const dataPanel = createDataPanelController({
  layout: dataPanelUi.layout,
  dataToggleButton: dataPanelUi.dataToggleButton,
  dataText: dataPanelUi.dataText,
  dataLines: dataPanelUi.dataLines,
  metrics: dataPanelUi.metrics,
});

const toolbox = createToolboxController({
  workspace: toolboxUi.workspace,
  toolboxList: toolboxUi.toolboxList,
  toolboxToggleButton: toolboxUi.toolboxToggleButton,
  templates: CFC_NODE_TEMPLATES,
  icons: TOOLBOX_ICONS,
  initialSelectedType: initialSelectedToolboxType,
});

const resolveDraggedNodeType = (event: DragEvent): CfcNodeType | null => {
  const fromTransfer =
    event.dataTransfer?.getData("text/cfc-node-type") ?? event.dataTransfer?.getData("text/plain") ?? "";
  if (fromTransfer && isCfcNodeType(fromTransfer)) {
    return fromTransfer;
  }
  return toolbox.getDraggedType();
};

const createBoxesAndConnections = (boxCount: number, connectionCount: number): void => {
  const nextGraph = editor.getGraph();
  const template = getNodeTemplateByType("box");
  const baseY =
    nextGraph.nodes.length === 0
      ? 2
      : Math.max(...nextGraph.nodes.map((node) => node.y + node.height)) + 3;
  const columnCount = Math.max(1, Math.ceil(Math.sqrt(boxCount)));
  const newNodeIds: string[] = [];

  for (let index = 0; index < boxCount; index += 1) {
    const serial = getNextSerialForPrefix(
      "N",
      nextGraph.nodes.map((node) => node.id),
    );
    const row = Math.floor(index / columnCount);
    const col = index % columnCount;
    const node: CfcNode = {
      id: `N${serial}`,
      type: "box",
      label: `Box ${serial}`,
      x: 2 + col * (template.width + 3),
      y: baseY + row * (template.height + 3),
      width: template.width,
      height: template.height,
    };
    nextGraph.nodes.push(node);
    newNodeIds.push(node.id);
  }

  if (newNodeIds.length >= 2 && connectionCount > 0) {
    const connectionTargets: Array<{ fromNodeId: string; toNodeId: string; toPort: string }> = [];
    for (const fromNodeId of newNodeIds) {
      for (const toNodeId of newNodeIds) {
        if (fromNodeId === toNodeId) {
          continue;
        }
        connectionTargets.push({ fromNodeId, toNodeId, toPort: "input:0" });
        connectionTargets.push({ fromNodeId, toNodeId, toPort: "input:1" });
      }
    }

    for (let index = 0; index < connectionCount; index += 1) {
      const target = connectionTargets[index % connectionTargets.length];
      if (!target) {
        continue;
      }
      const connection: CfcConnection = {
        id: `C${getNextSerialForPrefix(
          "C",
          nextGraph.connections.map((connection) => connection.id),
        )}`,
        fromNodeId: target.fromNodeId,
        fromPort: "output:0",
        toNodeId: target.toNodeId,
        toPort: target.toPort,
      };
      nextGraph.connections.push(connection);
    }
  }

  editor.loadGraph(nextGraph);
  currentGraph = editor.getGraph();
  dataPanel.setMetrics(`Erstellt: ${boxCount} Boxen | ${connectionCount} Verbindungen`);
};

let currentTheme: UiTheme = getInitialTheme();

const toolbar = createToolbarController({
  exportButton: toolbarUi.exportButton,
  importButton: toolbarUi.importButton,
  roundtripButton: toolbarUi.roundtripButton,
  routingModeButton: toolbarUi.routingModeButton,
  bulkMenuToggleButton: toolbarUi.bulkMenuToggleButton,
  bulkMenu: toolbarUi.bulkMenu,
  themeToggleButton: toolbarUi.themeToggleButton,
  zoomOutButton: toolbarUi.zoomOutButton,
  zoomInButton: toolbarUi.zoomInButton,
  zoomValue: toolbarUi.zoomValue,
  bulkBoxCountInput: toolbarUi.bulkBoxCountInput,
  bulkConnectionCountInput: toolbarUi.bulkConnectionCountInput,
  bulkCreateButton: toolbarUi.bulkCreateButton,
  onRoutingToggle: () => editor.toggleRoutingMode(),
  getRoutingMode: () => editor.getRoutingMode(),
  onZoomDelta: (delta) => editor.adjustZoom(delta),
  onZoomReset: () => editor.setZoom(1),
  getZoomPercent: () => editor.getZoom() * 100,
  onBulkCreate: (boxCount, connectionCount) => createBoxesAndConnections(boxCount, connectionCount),
  onBulkCreateInvalid: () => dataPanel.setMetrics("Erstellt: 0 Boxen | 0 Verbindungen"),
  getCurrentTheme: () => currentTheme,
  onThemeToggle: () => {
    currentTheme = currentTheme === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_STORAGE_KEY, currentTheme);
    return currentTheme;
  },
  getCurrentAdapter,
  getCurrentGraph: () => currentGraph,
  setCurrentGraph: (graph) => {
    currentGraph = graph;
  },
  loadGraph: (graph) => editor.loadGraph(graph),
  getDataText: () => dataPanel.getDataText(),
  setDataText: (value) => dataPanel.setDataText(value),
  setMetrics: (value) => dataPanel.setMetrics(value),
});

canvas.addEventListener(
  "wheel",
  (event: WheelEvent) => {
    event.preventDefault();
    const delta = event.deltaY < 0 ? 0.1 : -0.1;
    editor.zoomAtClient(delta, event.clientX, event.clientY);
    toolbar.updateZoomLabel();
  },
  { passive: false },
);

canvas.addEventListener("dragover", (event: DragEvent) => {
  const nodeType = resolveDraggedNodeType(event);
  if (!nodeType || !isCfcNodeType(nodeType)) {
    return;
  }
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "copy";
  }
});

canvas.addEventListener("drop", (event: DragEvent) => {
  const nodeType = resolveDraggedNodeType(event);
  if (!nodeType || !isCfcNodeType(nodeType)) {
    toolbox.clearDraggedType();
    return;
  }

  event.preventDefault();
  toolbox.clearDraggedType();
  editor.addNodeFromToolbox(nodeType, event.clientX, event.clientY);
});

dataPanelUi.dataText.addEventListener("pointerdown", () => {
  lastShortcutContext = "data";
});

canvas.addEventListener("pointerdown", () => {
  lastShortcutContext = "graph";
});

installKeyboardShortcutsController({
  getLastShortcutContext: () => lastShortcutContext,
  isCursorInsideGraph: () => editor.isCursorInsideGraph(),
  isTypingTarget: (target) => {
    const element = target as HTMLElement | null;
    return Boolean(
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement ||
      element?.isContentEditable
    );
  },
  onCopy: () => editor.copySelection(),
  onPaste: () => editor.pasteSelection(),
  onUndo: () => editor.undo(),
  onRedo: () => editor.redo(),
  onSaveGraphContext: () => toolbar.triggerExport(),
  onSaveDataContext: () => toolbar.triggerImport(),
  onSelectAll: () => editor.selectAll(),
  onDeleteSelection: () => editor.deleteSelected(),
  onClearSelection: () => editor.clearSelection(),
  onAddNodeAtCursor: () => editor.addNodeAtCursorByType(toolbox.getSelectedType()),
  onZoomIn: () => {
    editor.adjustZoom(0.1);
    toolbar.updateZoomLabel();
  },
  onZoomOut: () => {
    editor.adjustZoom(-0.1);
    toolbar.updateZoomLabel();
  },
  onZoomReset: () => {
    editor.setZoom(1);
    toolbar.updateZoomLabel();
  },
  onEscape: () => toolbar.handleEscape(),
});

toolbarUi.formatSelect.addEventListener("change", () => {
  void getCurrentAdapter();
});

dataPanel.setMetrics("");
