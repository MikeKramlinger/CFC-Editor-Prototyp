import { CfcEditor } from "./editor.js";
import { getNextSerialForPrefix } from "./core/editor/id.js";
import { getAdapterById, listAdapters } from "./formats/registry.js";
import { createQuizPersistence } from "./quiz/persistence.js";
import { SAMPLE_QUIZ_TASKS } from "./quiz/sampleQuiz.js";
import { createQuizSession } from "./quiz/session.js";
import { isGraphQuizTask, type QuizTaskSessionState, type QuizTaskViewState } from "./quiz/types.js";
import { installDataAreaResize } from "./ui/behaviors/dataAreaResize.js";
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
const toolbarSection = query<HTMLElement>(".toolbar");
const toolbarUi = getToolbarUiElements();
const toolboxUi = getToolboxUiElements();
const dataPanelUi = getDataPanelUiElements();
const dataArea = query<HTMLElement>(".data-area");
const dataEditor = query<HTMLDivElement>(".data-editor");
const dataResizer = query<HTMLDivElement>("#data-resizer");
const quizToggleButton = query<HTMLButtonElement>("#quiz-toggle");
const quizMenu = query<HTMLDivElement>("#quiz-menu");
const quizTaskSelect = query<HTMLSelectElement>("#quiz-task-select");
const quizPrevButton = query<HTMLButtonElement>("#quiz-prev");
const quizCheckButton = query<HTMLButtonElement>("#quiz-check");
const quizNextButton = query<HTMLButtonElement>("#quiz-next");
const quizEndButton = query<HTMLButtonElement>("#quiz-end");
const quizPanel = query<HTMLDivElement>("#quiz-panel");
const quizDescription = query<HTMLParagraphElement>("#quiz-description");
const quizFeedback = query<HTMLParagraphElement>("#quiz-feedback");
const quizCheckFloatingButton = query<HTMLButtonElement>("#quiz-check-floating");
const quizTaskNavInline = query<HTMLDivElement>("#quiz-task-nav-inline");
const quizTimerInline = query<HTMLDivElement>("#quiz-timer-inline");
const quizTaskTimer = query<HTMLElement>("#quiz-task-timer");
const quizTimerToggleButton = query<HTMLButtonElement>("#quiz-timer-toggle");
const quizTaskLocked = query<HTMLElement>("#quiz-task-locked");

const THEME_STORAGE_KEY = "cfc-editor-theme";
type UiTheme = "light" | "dark";
type ShortcutContext = "graph" | "data";

let currentGraph: CfcGraph = createEmptyGraph();
const initialSelectedToolboxType: CfcNodeType = "box";
let lastShortcutContext: ShortcutContext = "graph";
let isQuizModeActive = false;
let toolboxCollapsedBeforeQuiz = false;
let graphBeforeQuiz: CfcGraph | null = null;
let dataTextBeforeQuiz = "";
let activeTaskElapsedMs = 0;
let activeTaskCompleted = false;
let taskTimerRunning = false;
let taskTimerStartedAtMs: number | null = null;
let timerIntervalId: number | null = null;
const quizSession = createQuizSession({ tasks: SAMPLE_QUIZ_TASKS });
const quizPersistence = createQuizPersistence();

const formatElapsed = (elapsedMs: number): string => {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const getElapsedMs = (): number => {
  if (!taskTimerRunning || taskTimerStartedAtMs === null) {
    return activeTaskElapsedMs;
  }
  return activeTaskElapsedMs + (Date.now() - taskTimerStartedAtMs);
};

const updateTimerLabel = (): void => {
  quizTaskTimer.textContent = formatElapsed(getElapsedMs());
};

const stopTimerInterval = (): void => {
  if (timerIntervalId !== null) {
    window.clearInterval(timerIntervalId);
    timerIntervalId = null;
  }
};

const syncElapsedFromRunning = (): void => {
  if (!taskTimerRunning || taskTimerStartedAtMs === null) {
    return;
  }
  activeTaskElapsedMs += Date.now() - taskTimerStartedAtMs;
  taskTimerStartedAtMs = Date.now();
};

const pauseTaskTimer = (): void => {
  if (!taskTimerRunning || taskTimerStartedAtMs === null) {
    return;
  }
  activeTaskElapsedMs += Date.now() - taskTimerStartedAtMs;
  taskTimerStartedAtMs = null;
  taskTimerRunning = false;
  stopTimerInterval();
  updateTimerLabel();
};

const startTaskTimer = (): void => {
  if (activeTaskCompleted || taskTimerRunning) {
    return;
  }
  taskTimerStartedAtMs = Date.now();
  taskTimerRunning = true;
  updateTimerLabel();
  stopTimerInterval();
  timerIntervalId = window.setInterval(() => {
    updateTimerLabel();
  }, 1000);
};

const stopAndResetTaskTimer = (): void => {
  pauseTaskTimer();
  activeTaskElapsedMs = 0;
  activeTaskCompleted = false;
  updateTimerLabel();
};

const applyTaskEditability = (): void => {
  const locked = isQuizModeActive && activeTaskCompleted;
  dataPanelUi.dataText.readOnly = locked;
  dataPanelUi.dataText.setAttribute("aria-readonly", locked ? "true" : "false");
  dataArea.classList.toggle("task-locked", locked);
  dataEditor.classList.toggle("is-readonly", locked);
  quizTimerInline.classList.toggle("is-completed", locked);
  quizTaskLocked.hidden = !locked;
  quizCheckButton.disabled = locked;
  quizCheckFloatingButton.disabled = locked;
  quizTimerToggleButton.hidden = locked;
  quizTimerToggleButton.disabled = !isQuizModeActive || activeTaskCompleted;
  quizTimerToggleButton.textContent = taskTimerRunning ? "Pause" : "Fortsetzen";
};

const markCurrentTaskCompleted = (): void => {
  syncElapsedFromRunning();
  activeTaskCompleted = true;
  pauseTaskTimer();
  applyTaskEditability();
};

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

quizSession.getTasks().forEach((task, index) => {
  const option = document.createElement("option");
  option.value = String(index);
  option.textContent = `${index + 1}. ${task.title}`;
  quizTaskSelect.append(option);
});

const defaultAdapter = adapters[0]!;
const getCurrentAdapter = () => getAdapterById(toolbarUi.formatSelect.value || defaultAdapter.id);

const editor = new CfcEditor(canvas, currentGraph, {
  onGraphChanged: (graph) => {
    currentGraph = graph;
  },
  onStatus: () => undefined,
});

const createActiveQuizTaskSessionState = (): QuizTaskSessionState => ({
  graph: editor.getGraph(),
  dataText: dataPanel.getDataText(),
  feedback: quizFeedback.textContent ?? "",
  elapsedMs: getElapsedMs(),
  isCompleted: activeTaskCompleted,
});

const serializeQuizGraph = (graph: CfcGraph): string => getCurrentAdapter().serialize(graph);

const applyQuizTaskViewState = (viewState: QuizTaskViewState): void => {
  pauseTaskTimer();
  editor.loadGraph(viewState.graph);
  currentGraph = editor.getGraph();
  dataPanel.setDataText(viewState.dataText);
  activeTaskElapsedMs = viewState.elapsedMs;
  activeTaskCompleted = viewState.isCompleted;
  dataPanelUi.dataText.placeholder = viewState.task.kind === "open"
    ? viewState.task.placeholder ?? "Antwort hier eingeben..."
    : "";
  const isOpenTask = viewState.task.kind === "open";
  quizCheckButton.textContent = isOpenTask ? "Antwort speichern" : "Antwort prüfen";
  quizCheckFloatingButton.setAttribute("title", isOpenTask ? "Antwort speichern" : "Antwort prüfen");
  quizCheckFloatingButton.setAttribute("aria-label", isOpenTask ? "Antwort speichern" : "Antwort prüfen");
  quizDescription.textContent = `${viewState.task.title}: ${viewState.task.description}`;
  quizFeedback.textContent = viewState.feedback;
  quizTaskSelect.value = String(viewState.index);
  quizPrevButton.disabled = viewState.index <= 0;
  quizNextButton.disabled = viewState.index >= quizSession.getTasks().length - 1;
  updateTimerLabel();
  if (isQuizModeActive && !activeTaskCompleted) {
    startTaskTimer();
  }
  applyTaskEditability();
};

const setQuizPanelOpen = (open: boolean): void => {
  quizMenu.hidden = !open;
  quizPanel.hidden = !open;
  quizToggleButton.setAttribute("aria-expanded", open ? "true" : "false");
};

const setToolbarLockedState = (locked: boolean): void => {
  const controls: Array<HTMLButtonElement | HTMLSelectElement> = [
    toolbarUi.routingModeButton,
    toolbarUi.bulkMenuToggleButton,
    toolbarUi.formatSelect,
    toolbarUi.exportButton,
    toolbarUi.importButton,
    toolbarUi.roundtripButton,
  ];

  controls.forEach((control) => {
    control.disabled = locked;
  });

  if (locked) {
    toolbarUi.bulkMenu.hidden = true;
    toolbarUi.bulkMenuToggleButton.setAttribute("aria-expanded", "false");
  }

  toolbarSection.classList.toggle("quiz-locked", locked);
};

const setQuizModeActive = (active: boolean): void => {
  if (active && !isQuizModeActive) {
    graphBeforeQuiz = editor.getGraph();
    dataTextBeforeQuiz = dataPanel.getDataText();
  }

  isQuizModeActive = active;
  setToolbarLockedState(active);
  editor.setInteractionLocked(active);

  if (active) {
    toolboxCollapsedBeforeQuiz = toolbox.getIsCollapsed();
    toolbox.setCollapsed(true);
    toolboxUi.toolboxToggleButton.disabled = true;
  } else {
    toolbox.setCollapsed(toolboxCollapsedBeforeQuiz);
    toolboxUi.toolboxToggleButton.disabled = false;
  }

  setQuizPanelOpen(active);
  quizCheckFloatingButton.hidden = !active;
  quizTaskNavInline.hidden = !active;
  quizTimerInline.hidden = !active;

  if (!active) {
    stopAndResetTaskTimer();
    applyTaskEditability();
    if (graphBeforeQuiz) {
      editor.loadGraph(graphBeforeQuiz);
      currentGraph = editor.getGraph();
      dataPanel.setDataText(dataTextBeforeQuiz);
    }
    graphBeforeQuiz = null;
    dataTextBeforeQuiz = "";
    quizPersistence.clearQueuedAttempts();
    quizSession.stop();
  }
};

const importQuizDataIntoGraph = (): boolean => {
  let importedGraph: CfcGraph;
  let shouldSyncDataText = false;
  try {
    importedGraph = getCurrentAdapter().deserialize(dataPanel.getDataText());
    shouldSyncDataText = importedGraph.nodes.some((node) => {
      const template = getNodeTemplateByType(node.type);
      return node.width < template.width || node.height < template.height;
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    quizFeedback.textContent = `❌ Ungültiges Datenformat: ${message}`;
    quizSession.saveActiveState(createActiveQuizTaskSessionState());
    return false;
  }

  editor.loadGraph(importedGraph);
  currentGraph = editor.getGraph();
  if (shouldSyncDataText) {
    dataPanel.setDataText(getCurrentAdapter().serialize(currentGraph));
  }
  return true;
};

const runQuizCheck = (): void => {
  const activeTask = quizSession.getActiveTask();
  if (activeTaskCompleted) {
    quizFeedback.textContent = "✅ Aufgabe ist bereits abgeschlossen und gesperrt.";
    return;
  }

  const queueAttempt = (success: boolean, message: string, failedChecks?: string[], passedChecks?: string[]): void => {
    quizPersistence.queueAttempt({
      record: {
        timestamp: new Date().toISOString(),
        taskId: activeTask.id,
        taskTitle: activeTask.title,
        taskKind: activeTask.kind,
        question: activeTask.description,
        dataModelOrAnswer: dataPanel.getDataText(),
        taskElapsedMs: getElapsedMs(),
        taskCompleted: activeTaskCompleted,
        result: {
          success,
          message,
          failedChecks,
          passedChecks,
        },
      },
    });
  };

  if (!isGraphQuizTask(activeTask)) {
    const saveMessage = activeTask.saveMessage ?? "💾 Antwort gespeichert.";
    markCurrentTaskCompleted();
    quizFeedback.textContent = saveMessage;
    quizSession.saveActiveState(createActiveQuizTaskSessionState());
    queueAttempt(true, saveMessage);
    return;
  }

  if (!importQuizDataIntoGraph()) {
    const invalidDataMessage = quizFeedback.textContent ?? "❌ Ungültiges Datenformat.";
    queueAttempt(false, invalidDataMessage);
    return;
  }

  const result = quizSession.evaluateActiveTask(currentGraph);

  if (result.success) {
    const successMessage = "✅ Aufgabe erfüllt.";
    markCurrentTaskCompleted();
    quizCheckButton.disabled = true;
    quizCheckFloatingButton.disabled = true;
    quizFeedback.textContent = successMessage;
    quizSession.saveActiveState(createActiveQuizTaskSessionState());
    queueAttempt(true, successMessage, result.failedChecks, result.passedChecks);
    return;
  }

  const failedMessage = `❌ Noch nicht erfüllt: ${result.failedChecks.join(" | ")}`;
  quizFeedback.textContent = failedMessage;
  quizSession.saveActiveState(createActiveQuizTaskSessionState());
  queueAttempt(false, failedMessage, result.failedChecks, result.passedChecks);
};

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
  onBulkCreateInvalid: () => undefined,
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

quizToggleButton.addEventListener("click", () => {
  if (isQuizModeActive) {
    return;
  }
  setQuizModeActive(true);
  stopAndResetTaskTimer();
  quizPersistence.clearQueuedAttempts();
  applyQuizTaskViewState(quizSession.start(serializeQuizGraph));
});

quizTaskSelect.addEventListener("change", () => {
  if (!quizSession.isActive()) {
    return;
  }
  const index = Number.parseInt(quizTaskSelect.value, 10);
  if (Number.isNaN(index)) {
    return;
  }
  applyQuizTaskViewState(
    quizSession.selectTask(index, createActiveQuizTaskSessionState(), serializeQuizGraph),
  );
});

quizPrevButton.addEventListener("click", () => {
  if (!quizSession.isActive()) {
    return;
  }
  const previousIndex = Math.max(0, quizSession.getActiveIndex() - 1);
  applyQuizTaskViewState(
    quizSession.selectTask(previousIndex, createActiveQuizTaskSessionState(), serializeQuizGraph),
  );
});

quizTimerToggleButton.addEventListener("click", () => {
  if (!isQuizModeActive || activeTaskCompleted) {
    return;
  }
  if (taskTimerRunning) {
    pauseTaskTimer();
  } else {
    startTaskTimer();
  }
  applyTaskEditability();
});

quizCheckButton.addEventListener("click", () => {
  runQuizCheck();
});

quizCheckFloatingButton.addEventListener("click", () => {
  runQuizCheck();
});

quizNextButton.addEventListener("click", () => {
  if (!quizSession.isActive()) {
    return;
  }
  const nextIndex = Math.min(quizSession.getTasks().length - 1, quizSession.getActiveIndex() + 1);
  applyQuizTaskViewState(
    quizSession.selectTask(nextIndex, createActiveQuizTaskSessionState(), serializeQuizGraph),
  );
});

quizEndButton.addEventListener("click", () => {
  pauseTaskTimer();
  if (quizSession.isActive()) {
    quizSession.saveActiveState(createActiveQuizTaskSessionState());
  }

  const snapshot = quizSession.getSnapshot();

  void quizPersistence.flushSessionExport({
    tasks: quizSession.getTasks(),
    session: snapshot,
  }).then(() => {
    setQuizModeActive(false);
  });
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
  onCopy: () => {
    if (isQuizModeActive) {
      return;
    }
    editor.copySelection();
  },
  onPaste: () => {
    if (isQuizModeActive) {
      return;
    }
    editor.pasteSelection();
  },
  onUndo: () => {
    if (isQuizModeActive) {
      return;
    }
    editor.undo();
  },
  onRedo: () => {
    if (isQuizModeActive) {
      return;
    }
    editor.redo();
  },
  onSaveGraphContext: () => toolbar.triggerExport(),
  onSaveDataContext: () => toolbar.triggerImport(),
  onSelectAll: () => {
    if (isQuizModeActive) {
      return;
    }
    editor.selectAll();
  },
  onDeleteSelection: () => {
    if (isQuizModeActive) {
      return;
    }
    editor.deleteSelected();
  },
  onClearSelection: () => {
    if (isQuizModeActive) {
      return;
    }
    editor.clearSelection();
  },
  onAddNodeAtCursor: () => {
    if (isQuizModeActive) {
      return;
    }
    editor.addNodeAtCursorByType(toolbox.getSelectedType());
  },
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
installDataAreaResize({
  resizer: dataResizer,
  dataEditor,
  storageKey: "cfc-editor-data-height",
});
updateTimerLabel();
applyTaskEditability();
setQuizModeActive(false);
