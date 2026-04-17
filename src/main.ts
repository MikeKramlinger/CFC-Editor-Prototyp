import { CfcEditor } from "./editor.js";
import { getNextSerialForPrefix } from "./core/editor/id.js";
import { getAdapterById, listAdapters } from "./formats/registry.js";
import { createQuizPersistence, type QuizAttemptRecord, type QuizSessionExport } from "./quiz/persistence.js";
import { SAMPLE_QUIZ_TASKS } from "./quiz/sampleQuiz.js";
import { createQuizSession } from "./quiz/session.js";
import {
  isGraphQuizTask,
  type QuizSessionSnapshot,
  type QuizTask,
  type QuizTaskAnswerRevision,
  type QuizTaskSessionState,
  type QuizTaskViewState,
} from "./quiz/types.js";
import { installDataAreaResize } from "./ui/behaviors/dataAreaResize.js";
import { createDataPanelController } from "./ui/controllers/dataPanelController.js";
import { installKeyboardShortcutsController } from "./ui/controllers/keyboardShortcutsController.js";
import { createParticipantNameDialogController } from "./ui/controllers/participantNameDialogController.js";
import { createToolbarController } from "./ui/controllers/toolbarController.js";
import { createToolboxController } from "./ui/controllers/toolboxController.js";
import { getDataPanelUiElements } from "./ui/views/dataPanelUi.js";
import { query } from "./ui/views/domQueryUi.js";
import { getParticipantNameDialogUiElements } from "./ui/views/participantNameDialogUi.js";
import { getToolbarUiElements } from "./ui/views/toolbarUi.js";
import { getToolboxUiElements } from "./ui/views/toolboxUi.js";
import {
  CFC_NODE_TEMPLATES,
  cloneGraph,
  createEmptyGraph,
  getNodeTemplateByType,
  isCfcNodeType,
  type CfcConnection,
  type CfcGraph,
  type CfcNode,
  type CfcNodeType,
} from "./model.js";

const canvas = query<HTMLDivElement>("#canvas");
const graphStage = query<HTMLDivElement>("#graph-stage");
const toolbarSection = query<HTMLElement>(".toolbar");
const toolbarUi = getToolbarUiElements();
const toolboxUi = getToolboxUiElements();
const dataPanelUi = getDataPanelUiElements();
const participantNameDialogUi = getParticipantNameDialogUiElements();
const dataArea = query<HTMLElement>(".data-area");
const dataEditor = query<HTMLDivElement>(".data-editor");
const dataResizer = query<HTMLDivElement>("#data-resizer");
const quizToggleButton = query<HTMLButtonElement>("#quiz-toggle");
const quizEntryOverlay = query<HTMLDivElement>("#quiz-entry-overlay");
const quizEntryStartButton = query<HTMLButtonElement>("#quiz-entry-start");
const quizEntryResumeButton = query<HTMLButtonElement>("#quiz-entry-resume");
const quizEntryCloseButton = query<HTMLButtonElement>("#quiz-entry-close");
const quizResumeFileInput = query<HTMLInputElement>("#quiz-resume-file");
const quizMenu = query<HTMLDivElement>("#quiz-menu");
const quizTaskSelect = query<HTMLSelectElement>("#quiz-task-select");
const quizBackButton = query<HTMLButtonElement>("#quiz-back");
const quizPrevButton = query<HTMLButtonElement>("#quiz-prev");
const quizReworkButton = query<HTMLButtonElement>("#quiz-rework");
const quizNextButton = query<HTMLButtonElement>("#quiz-next");
const quizEndButton = query<HTMLButtonElement>("#quiz-end");
const quizPanel = query<HTMLDivElement>("#quiz-panel");
const quizDescription = query<HTMLParagraphElement>("#quiz-description");
const quizExpectedToggleButton = query<HTMLButtonElement>("#quiz-expected-toggle");
const quizPreviewResizer = query<HTMLDivElement>("#quiz-preview-resizer");
const quizExpectedPreview = query<HTMLDivElement>("#quiz-expected-preview");
const quizExpectedCanvas = query<HTMLDivElement>("#quiz-expected-canvas");
const quizExpectedPreviewLabel = query<HTMLParagraphElement>("#quiz-expected-preview-label");
const quizExpectedZoomOutButton = query<HTMLButtonElement>("#quiz-expected-zoom-out");
const quizExpectedZoomInButton = query<HTMLButtonElement>("#quiz-expected-zoom-in");
const quizExpectedZoomValue = query<HTMLSpanElement>("#quiz-expected-zoom-value");
const quizFeedback = query<HTMLParagraphElement>("#quiz-feedback");
const quizCheckFloatingButton = query<HTMLButtonElement>("#quiz-check-floating");
const quizTaskNavInline = query<HTMLDivElement>("#quiz-task-nav-inline");
const quizTimerInline = query<HTMLDivElement>("#quiz-timer-inline");
const quizTaskTimer = query<HTMLElement>("#quiz-task-timer");
const quizTimerToggleButton = query<HTMLButtonElement>("#quiz-timer-toggle");
const quizTaskLocked = query<HTMLElement>("#quiz-task-locked");

const THEME_STORAGE_KEY = "cfc-editor-theme";
const QUIZ_PARTICIPANT_NAME_STORAGE_KEY = "cfc-quiz-participant-name";
type UiTheme = "light" | "dark";
type ShortcutContext = "graph" | "data";
type BulkConnectionMode = "count" | "single-target" | "all-to-all";

let currentGraph: CfcGraph = createEmptyGraph();
const initialSelectedToolboxType: CfcNodeType = "box";
let lastShortcutContext: ShortcutContext = "graph";
let isQuizModeActive = false;
let toolboxCollapsedBeforeQuiz = false;
let graphBeforeQuiz: CfcGraph | null = null;
let dataTextBeforeQuiz = "";
let activeTaskElapsedMs = 0;
let activeTaskCompleted = false;
let quizTimerPaused = false;
let taskTimerRunning = false;
let taskTimerStartedAtMs: number | null = null;
let timerIntervalId: number | null = null;
let activeOpenAnswerHistory: QuizTaskAnswerRevision[] = [];
let quizExpectedPreviewVisible = false;
let quizExpectedPreviewWidthPx = 0;
let quizPreviewResizePointerId: number | null = null;
let quizPreviewResizeStartX = 0;
let quizPreviewResizeStartWidth = 0;
let quizTasks: QuizTask[] = [...SAMPLE_QUIZ_TASKS];
let quizTaskFormatByTaskId = new Map<string, string>();
let quizSession = createQuizSession({ tasks: quizTasks });
const quizPersistence = createQuizPersistence();
const participantNameDialog = createParticipantNameDialogController({
  ui: participantNameDialogUi,
});

const readTextFromFile = (file: File): Promise<string> => {
  return file.text();
};

const isQuizTaskSessionState = (value: unknown): value is QuizTaskSessionState => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const state = value as Partial<QuizTaskSessionState>;
  return (
    state.graph !== undefined
    && typeof state.dataText === "string"
    && typeof state.feedback === "string"
    && typeof state.elapsedMs === "number"
    && typeof state.isCompleted === "boolean"
  );
};

const parseQuizSessionExport = (raw: string): QuizSessionExport => {
  const parsed = JSON.parse(raw) as Partial<QuizSessionExport>;
  if (parsed.format !== "cfc-quiz-session-v1") {
    throw new Error("Unbekanntes Dateiformat (erwartet: cfc-quiz-session-v1).");
  }

  const tasks = Array.isArray(parsed.tasks) ? parsed.tasks.filter(Boolean) as QuizTask[] : [];
  const taskStatesRaw = parsed.session?.taskStates;
  const taskStates: Record<string, QuizTaskSessionState> = {};
  if (taskStatesRaw && typeof taskStatesRaw === "object") {
    for (const [taskId, state] of Object.entries(taskStatesRaw)) {
      if (isQuizTaskSessionState(state)) {
        taskStates[taskId] = state;
      }
    }
  }

  const activeIndexCandidate = parsed.session?.activeIndex;
  const activeIndex = typeof activeIndexCandidate === "number" ? activeIndexCandidate : 0;
  const attempts = Array.isArray(parsed.attempts)
    ? parsed.attempts.filter((attempt): attempt is QuizAttemptRecord => {
      return Boolean(
        attempt
        && typeof attempt === "object"
        && typeof (attempt as Partial<QuizAttemptRecord>).timestamp === "string"
        && typeof (attempt as Partial<QuizAttemptRecord>).taskId === "string"
        && typeof (attempt as Partial<QuizAttemptRecord>).taskTitle === "string"
        && typeof (attempt as Partial<QuizAttemptRecord>).taskKind === "string"
        && typeof (attempt as Partial<QuizAttemptRecord>).question === "string"
        && typeof (attempt as Partial<QuizAttemptRecord>).dataModelOrAnswer === "string"
        && typeof (attempt as Partial<QuizAttemptRecord>).taskElapsedMs === "number"
        && typeof (attempt as Partial<QuizAttemptRecord>).taskCompleted === "boolean"
        && typeof (attempt as Partial<QuizAttemptRecord>).result === "object"
      );
    })
    : [];

  const participantName = parsed.participant?.name;

  return {
    format: "cfc-quiz-session-v1",
    exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : new Date().toISOString(),
    participant: typeof participantName === "string" ? { name: participantName } : undefined,
    tasks,
    session: {
      activeIndex,
      taskStates,
    } as QuizSessionSnapshot,
    attempts,
  };
};

const canRestoreQuizFromExport = (sessionExport: QuizSessionExport): boolean => {
  const importedTaskIds = new Set(sessionExport.tasks.map((task) => task.id));
  if (importedTaskIds.size === 0) {
    return false;
  }
  return quizTasks.every((task) => importedTaskIds.has(task.id));
};

const createQuizTaskPlanForAdapters = (tasks: QuizTask[], adaptersForPlan: Array<{ id: string; label: string }>): {
  plannedTasks: QuizTask[];
  formatByTaskId: Map<string, string>;
} => {
  const plannedTasks: QuizTask[] = [];
  const formatByTaskId = new Map<string, string>();
  const formatIndependentOpenTasks = tasks.filter(
    (task): task is Extract<QuizTask, { kind: "open" }> => task.kind === "open" && task.independentOfFormat === true,
  );
  const formatBoundTasks = tasks.filter((task) => {
    return !(task.kind === "open" && task.independentOfFormat === true);
  });

  adaptersForPlan.forEach((adapter) => {
    formatBoundTasks.forEach((task) => {
      const plannedTaskId = `${adapter.id}::${task.id}`;
      const plannedTitle = `${task.title} [${adapter.label}]`;

      if (task.kind === "graph") {
        const plannedTask: QuizTask = {
          ...task,
          id: plannedTaskId,
          title: plannedTitle,
          initialGraph: cloneGraph(task.initialGraph),
          expectedGraph: task.expectedGraph ? cloneGraph(task.expectedGraph) : undefined,
          criteria: { ...task.criteria },
        };
        plannedTasks.push(plannedTask);
      } else {
        const plannedTask: QuizTask = {
          ...task,
          id: plannedTaskId,
          title: plannedTitle,
          initialGraph: cloneGraph(task.initialGraph),
        };
        plannedTasks.push(plannedTask);
      }

      formatByTaskId.set(plannedTaskId, adapter.id);
    });
  });

  formatIndependentOpenTasks.forEach((task) => {
    const plannedTask: QuizTask = {
      ...task,
      id: task.id,
      title: task.title,
      initialGraph: cloneGraph(task.initialGraph),
    };
    plannedTasks.push(plannedTask);
  });

  return {
    plannedTasks,
    formatByTaskId,
  };
};

const rebuildQuizTaskSelectOptions = (): void => {
  quizTaskSelect.replaceChildren();
  quizSession.getTasks().forEach((task, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = `${index + 1}. ${task.title}`;
    quizTaskSelect.append(option);
  });
};

const setQuizFormatForTaskIndex = (index: number): void => {
  const task = quizSession.getTasks()[index];
  if (!task) {
    return;
  }
  const formatId = quizTaskFormatByTaskId.get(task.id);
  if (!formatId || toolbarUi.formatSelect.value === formatId) {
    return;
  }
  toolbarUi.formatSelect.value = formatId;
};

const setQuizEntryOverlayOpen = (open: boolean): void => {
  quizEntryOverlay.hidden = !open;
  document.body.classList.toggle("quiz-entry-open", open);
  quizToggleButton.setAttribute("aria-expanded", open ? "true" : "false");
};

const startNewQuiz = (): void => {
  setQuizEntryOverlayOpen(false);
  if (isQuizModeActive) {
    return;
  }
  setQuizModeActive(true);
  stopAndResetTaskTimer();
  quizPersistence.clearQueuedAttempts();
  setQuizFormatForTaskIndex(0);
  applyQuizTaskViewState(quizSession.start(serializeQuizGraph));
};

const resumeQuizFromExport = (sessionExport: QuizSessionExport): void => {
  if (!canRestoreQuizFromExport(sessionExport)) {
    quizFeedback.textContent = "❌ Der Report passt nicht zu den aktuellen Quiz-Aufgaben.";
    return;
  }

  if (!isQuizModeActive) {
    setQuizModeActive(true);
  }
  setQuizEntryOverlayOpen(false);
  pauseTaskTimer();

  const restoreIndex = Math.max(0, Math.min(quizSession.getTasks().length - 1, sessionExport.session.activeIndex ?? 0));
  setQuizFormatForTaskIndex(restoreIndex);
  const restoredViewState = quizSession.restore(sessionExport.session, serializeQuizGraph);
  quizPersistence.replaceQueuedAttempts(sessionExport.attempts);
  applyQuizTaskViewState(restoredViewState);

  const participantName = sessionExport.participant?.name?.trim();
  if (participantName) {
    localStorage.setItem(QUIZ_PARTICIPANT_NAME_STORAGE_KEY, participantName);
  }

  quizFeedback.textContent = "📂 Quiz-Stand aus Report geladen. Du kannst direkt weiterarbeiten.";
};

const requestQuizResumeFile = (): void => {
  quizResumeFileInput.value = "";
  quizResumeFileInput.click();
};

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

const pauseTaskTimer = (markQuizTimerPaused = false): void => {
  if (taskTimerRunning && taskTimerStartedAtMs !== null) {
    activeTaskElapsedMs += Date.now() - taskTimerStartedAtMs;
  }
  if (markQuizTimerPaused) {
    quizTimerPaused = true;
  }
  taskTimerStartedAtMs = null;
  taskTimerRunning = false;
  stopTimerInterval();
  updateTimerLabel();
};

const startTaskTimer = (resumeQuizTimer = false): void => {
  if (activeTaskCompleted || taskTimerRunning || (quizTimerPaused && !resumeQuizTimer)) {
    return;
  }
  if (resumeQuizTimer) {
    quizTimerPaused = false;
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
  quizTimerPaused = false;
  updateTimerLabel();
};

const isActiveOpenTask = (): boolean => {
  if (!isQuizModeActive || !quizSession.isActive()) {
    return false;
  }
  return !isGraphQuizTask(quizSession.getActiveTask());
};

const applyTaskEditability = (): void => {
  const isOpenTask = isActiveOpenTask();
  if (isOpenTask) {
    quizExpectedPreviewVisible = false;
    quizExpectedToggleButton.hidden = true;
    quizExpectedToggleButton.classList.remove("is-active");
    quizExpectedToggleButton.setAttribute("aria-pressed", "false");
    applyExpectedPreviewLayout(false);
  }
  const locked = isQuizModeActive && activeTaskCompleted;
  const canRework = locked && isOpenTask;
  dataPanelUi.dataText.readOnly = locked;
  dataPanelUi.dataText.disabled = locked;
  dataPanelUi.dataText.setAttribute("aria-readonly", locked ? "true" : "false");
  dataPanelUi.dataText.setAttribute("aria-disabled", locked ? "true" : "false");
  dataArea.classList.toggle("task-locked", locked);
  dataEditor.classList.toggle("is-readonly", locked);
  quizTimerInline.classList.toggle("is-completed", locked);
  quizTaskLocked.hidden = !locked || isOpenTask;
  quizCheckFloatingButton.disabled = locked;
  quizTimerToggleButton.hidden = locked;
  quizTimerToggleButton.disabled = !isQuizModeActive || activeTaskCompleted;
  quizTimerToggleButton.textContent = quizTimerPaused ? "Fortsetzen" : "Pause";
  quizReworkButton.hidden = !canRework;
  quizReworkButton.disabled = !canRework;
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

const quizTaskPlan = createQuizTaskPlanForAdapters(SAMPLE_QUIZ_TASKS, adapters.map((adapter) => ({
  id: adapter.id,
  label: adapter.label,
})));
quizTasks = quizTaskPlan.plannedTasks;
quizTaskFormatByTaskId = quizTaskPlan.formatByTaskId;
quizSession = createQuizSession({ tasks: quizTasks });
rebuildQuizTaskSelectOptions();

const defaultAdapter = adapters[0]!;
const getCurrentAdapter = () => getAdapterById(toolbarUi.formatSelect.value || defaultAdapter.id);

const editor = new CfcEditor(canvas, currentGraph, {
  onGraphChanged: (graph) => {
    currentGraph = graph;
  },
  onStatus: () => undefined,
});

const quizExpectedPreviewEditor = new CfcEditor(quizExpectedCanvas, createEmptyGraph(), {
  onGraphChanged: () => undefined,
  onStatus: () => undefined,
});
quizExpectedPreviewEditor.setInteractionLocked(true);

const updateExpectedPreviewToggleButton = (task: QuizTask): void => {
  const isGraphTask = isGraphQuizTask(task);
  quizExpectedToggleButton.hidden = !isGraphTask;
  quizExpectedToggleButton.classList.toggle("is-active", quizExpectedPreviewVisible);
  if (!isGraphTask) {    return;
  }

  const actionLabel = quizExpectedPreviewVisible ? "Soll-Vorschau ausblenden" : "Soll-Vorschau anzeigen";
  quizExpectedToggleButton.title = actionLabel;
  quizExpectedToggleButton.setAttribute("aria-label", actionLabel);
  quizExpectedToggleButton.setAttribute("aria-pressed", quizExpectedPreviewVisible ? "true" : "false");
};

const clampExpectedPreviewWidth = (width: number): number => {
  const stageWidth = graphStage.getBoundingClientRect().width;
  const maxWidth = Number.isFinite(stageWidth) && stageWidth > 0 ? Math.floor((stageWidth * 2) / 3) : Number.POSITIVE_INFINITY;
  return Math.max(140, Math.min(maxWidth, Math.round(width)));
};

const getDefaultExpectedPreviewWidth = (): number => {
  const stageWidth = graphStage.getBoundingClientRect().width;
  if (!Number.isFinite(stageWidth) || stageWidth <= 0) {
    return 320;
  }
  return clampExpectedPreviewWidth(stageWidth / 3);
};

const updateExpectedPreviewZoomLabel = (): void => {
  quizExpectedZoomValue.textContent = `${Math.round(quizExpectedPreviewEditor.getZoom() * 100)}%`;
};

const applyExpectedPreviewZoomDelta = (delta: number, clientX?: number, clientY?: number): void => {
  if (!isQuizModeActive || !quizExpectedPreviewVisible || quizExpectedPreview.hidden) {
    return;
  }

  if (typeof clientX === "number" && typeof clientY === "number") {
    quizExpectedPreviewEditor.zoomAtClient(delta, clientX, clientY);
  } else {
    quizExpectedPreviewEditor.adjustZoom(delta);
  }

  updateExpectedPreviewZoomLabel();
};

const applyExpectedPreviewLayout = (visible: boolean): void => {
  graphStage.classList.toggle("quiz-preview-visible", visible);
  quizPreviewResizer.hidden = !visible;
  quizExpectedPreview.hidden = !visible;
  if (visible) {
    quizExpectedPreviewWidthPx = clampExpectedPreviewWidth(quizExpectedPreviewWidthPx);
    const stageWidth = graphStage.getBoundingClientRect().width;
    const maxWidth = Number.isFinite(stageWidth) && stageWidth > 0 ? Math.floor((stageWidth * 2) / 3) : null;
    graphStage.style.setProperty("--quiz-preview-width", `${quizExpectedPreviewWidthPx}px`);
    quizPreviewResizer.setAttribute("aria-valuemin", "140");
    if (maxWidth !== null) {
      quizPreviewResizer.setAttribute("aria-valuemax", String(maxWidth));
    } else {
      quizPreviewResizer.removeAttribute("aria-valuemax");
    }
    quizPreviewResizer.setAttribute("aria-valuenow", String(quizExpectedPreviewWidthPx));
    return;
  }

  graphStage.style.removeProperty("--quiz-preview-width");
};

const renderExpectedQuizGraphPreview = (task: QuizTask): void => {
  if (!isGraphQuizTask(task) || !quizExpectedPreviewVisible) {
    applyExpectedPreviewLayout(false);
    return;
  }

  if (quizExpectedPreviewWidthPx <= 0) {
    quizExpectedPreviewWidthPx = getDefaultExpectedPreviewWidth();
  }

  const previewGraph = task.expectedGraph ?? task.initialGraph;
  quizExpectedPreviewLabel.textContent = `Vorschau: ${task.title}`;
  quizExpectedPreviewEditor.loadGraph(previewGraph);
  quizExpectedPreviewEditor.resetViewportToOrigin();
  quizExpectedPreviewEditor.setZoom(1);
  updateExpectedPreviewZoomLabel();
  applyExpectedPreviewLayout(true);
};

const createActiveQuizTaskSessionState = (): QuizTaskSessionState => ({
  graph: editor.getGraph(),
  dataText: dataPanel.getDataText(),
  feedback: quizFeedback.textContent ?? "",
  elapsedMs: getElapsedMs(),
  isCompleted: activeTaskCompleted,
  answerHistory: [...activeOpenAnswerHistory],
});

const serializeQuizGraph = (graph: CfcGraph): string => getCurrentAdapter().serialize(graph);

const applyQuizTaskViewState = (viewState: QuizTaskViewState): void => {
  pauseTaskTimer();
  setQuizFormatForTaskIndex(viewState.index);
  const isOpenTask = viewState.task.kind === "open";
  const taskGraph = isOpenTask ? createEmptyGraph() : viewState.graph;
  editor.loadGraph(taskGraph);
  currentGraph = editor.getGraph();
  dataPanel.setDataText(viewState.dataText);
  activeTaskElapsedMs = viewState.elapsedMs;
  activeTaskCompleted = viewState.isCompleted;
  activeOpenAnswerHistory = viewState.answerHistory?.map((entry) => ({ ...entry })) ?? [];
  dataPanelUi.dataText.placeholder = viewState.task.kind === "open"
    ? viewState.task.placeholder ?? "Antwort hier eingeben..."
    : "";
  if (isOpenTask) {
    quizExpectedPreviewVisible = false;
    applyExpectedPreviewLayout(false);
    quizExpectedToggleButton.hidden = true;
    quizExpectedToggleButton.classList.remove("is-active");
    quizExpectedToggleButton.setAttribute("aria-pressed", "false");
  }
  quizCheckFloatingButton.setAttribute("title", isOpenTask ? "Antwort speichern" : "Antwort prüfen");
  quizCheckFloatingButton.setAttribute("aria-label", isOpenTask ? "Antwort speichern" : "Antwort prüfen");
  quizDescription.textContent = `${viewState.task.title}: ${viewState.task.description}`;
  updateExpectedPreviewToggleButton(viewState.task);
  renderExpectedQuizGraphPreview(viewState.task);
  if (quizExpectedPreviewVisible && isGraphQuizTask(viewState.task)) {
    window.requestAnimationFrame(() => {
      if (!isQuizModeActive || !quizSession.isActive()) {
        return;
      }
      const stillActiveTask = quizSession.getActiveTask();
      if (stillActiveTask.id !== viewState.task.id) {
        return;
      }
      renderExpectedQuizGraphPreview(stillActiveTask);
    });
  }
  quizFeedback.textContent = viewState.feedback;
  quizTaskSelect.value = String(viewState.index);
  quizPrevButton.disabled = viewState.index <= 0;
  quizNextButton.disabled = viewState.index >= quizSession.getTasks().length - 1;
  updateTimerLabel();
  if (isQuizModeActive && !activeTaskCompleted && !quizTimerPaused) {
    startTaskTimer();
  }
  applyTaskEditability();
};

const setQuizPanelOpen = (open: boolean): void => {
  quizMenu.hidden = !open;
  quizPanel.hidden = !open;
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
    quizExpectedPreviewVisible = false;
    quizExpectedPreviewWidthPx = 0;
    quizExpectedToggleButton.hidden = true;
    applyExpectedPreviewLayout(false);
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
  const rawDataText = dataPanel.getDataText();
  try {
    importedGraph = getCurrentAdapter().deserialize(rawDataText);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    quizFeedback.textContent = `❌ ${message}`;
    quizSession.saveActiveState(createActiveQuizTaskSessionState());
    return false;
  }

  editor.loadGraph(importedGraph);
  currentGraph = editor.getGraph();
  const normalizedDataText = getCurrentAdapter().serialize(currentGraph);
  if (normalizedDataText !== rawDataText) {
    dataPanel.setDataText(normalizedDataText);
  }
  return true;
};

const formatQuizFailedChecks = (failedChecks: string[]): string => {
  if (failedChecks.length === 0) {
    return "❌ Noch nicht erfüllt.";
  }

  const [primaryIssue, ...remainingIssues] = failedChecks;
  if (!primaryIssue) {
    return "❌ Noch nicht erfüllt.";
  }

  if (remainingIssues.length === 0) {
    return `❌ ${primaryIssue}`;
  }

  return `❌ ${primaryIssue}\nWeitere: ${remainingIssues.join(" | ")}`;
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
    const elapsedMs = getElapsedMs();
    activeOpenAnswerHistory = [
      ...activeOpenAnswerHistory,
      {
        timestamp: new Date().toISOString(),
        elapsedMs,
        answer: dataPanel.getDataText(),
      },
    ];
    const saveMessage = activeTask.saveMessage
      ?? "💾 Antwort gespeichert. Mit \"Überarbeiten\" kannst du die Aufgabe erneut öffnen.";
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
    quizCheckFloatingButton.disabled = true;
    quizFeedback.textContent = successMessage;
    quizSession.saveActiveState(createActiveQuizTaskSessionState());
    queueAttempt(true, successMessage, result.failedChecks, result.passedChecks);
    return;
  }

  const failedMessage = formatQuizFailedChecks(result.failedChecks);
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

const createBoxesAndConnections = (
  boxCount: number,
  connectionCount: number,
  typeCounts: Partial<Record<CfcNodeType, number>>,
  connectionMode: BulkConnectionMode,
): void => {
  const nextGraph = editor.getGraph();
  const baseY =
    nextGraph.nodes.length === 0
      ? 2
      : Math.max(...nextGraph.nodes.map((node) => node.y + node.height)) + 3;
  const columnCount = Math.max(1, Math.ceil(Math.sqrt(boxCount)));
  const maxTemplateWidth = Math.max(...CFC_NODE_TEMPLATES.map((template) => template.width));
  const maxTemplateHeight = Math.max(...CFC_NODE_TEMPLATES.map((template) => template.height));
  const newNodeIds: string[] = [];
  const newNodes: CfcNode[] = [];
  const orderedRequestedTypes: CfcNodeType[] = [];

  for (const template of CFC_NODE_TEMPLATES) {
    const requestedCount = Math.max(0, typeCounts[template.type] ?? 0);
    for (let index = 0; index < requestedCount; index += 1) {
      orderedRequestedTypes.push(template.type);
    }
  }

  const plannedNodeTypes: CfcNodeType[] = orderedRequestedTypes.slice(0, boxCount);
  while (plannedNodeTypes.length < boxCount) {
    plannedNodeTypes.push("box");
  }

  for (let index = 0; index < plannedNodeTypes.length; index += 1) {
    const nodeType = plannedNodeTypes[index] ?? "box";
    const template = getNodeTemplateByType(nodeType);
    const serial = getNextSerialForPrefix(
      "N",
      nextGraph.nodes.map((node) => node.id),
    );
    const row = Math.floor(index / columnCount);
    const col = index % columnCount;
    const node: CfcNode = {
      id: `N${serial}`,
      type: nodeType,
      label: `${template.label} ${serial}`,
      x: 2 + col * (maxTemplateWidth + 3),
      y: baseY + row * (maxTemplateHeight + 3),
      width: template.width,
      height: template.height,
    };
    nextGraph.nodes.push(node);
    newNodes.push(node);
    newNodeIds.push(node.id);
  }

  if (newNodes.length >= 2) {
    const outputPorts = newNodes.flatMap((node) => {
      const template = getNodeTemplateByType(node.type);
      return Array.from({ length: template.outputCount }, (_value, index) => ({
        nodeId: node.id,
        port: `output:${index}`,
      }));
    });
    const inputPorts = newNodes.flatMap((node) => {
      const template = getNodeTemplateByType(node.type);
      return Array.from({ length: template.inputCount }, (_value, index) => ({
        nodeId: node.id,
        port: `input:${index}`,
      }));
    });

    const connect = (fromNodeId: string, fromPort: string, toNodeId: string, toPort: string): void => {
      const connection: CfcConnection = {
        id: `C${getNextSerialForPrefix(
          "C",
          nextGraph.connections.map((existingConnection) => existingConnection.id),
        )}`,
        fromNodeId,
        fromPort,
        toNodeId,
        toPort,
      };
      nextGraph.connections.push(connection);
    };

    if (connectionMode === "all-to-all") {
      for (const outputPort of outputPorts) {
        for (const inputPort of inputPorts) {
          if (outputPort.nodeId === inputPort.nodeId) {
            continue;
          }
          connect(outputPort.nodeId, outputPort.port, inputPort.nodeId, inputPort.port);
        }
      }
    } else if (connectionMode === "single-target") {
      let inputIndex = 0;
      for (const outputPort of outputPorts) {
        if (inputPorts.length === 0) {
          break;
        }
        let selectedInput: { nodeId: string; port: string } | null = null;
        for (let attempt = 0; attempt < inputPorts.length; attempt += 1) {
          const candidate = inputPorts[(inputIndex + attempt) % inputPorts.length];
          if (!candidate || candidate.nodeId === outputPort.nodeId) {
            continue;
          }
          selectedInput = candidate;
          inputIndex = (inputIndex + attempt + 1) % inputPorts.length;
          break;
        }
        if (!selectedInput) {
          continue;
        }
        connect(outputPort.nodeId, outputPort.port, selectedInput.nodeId, selectedInput.port);
      }
    } else if (connectionCount > 0) {
      const connectionTargets: Array<{ fromNodeId: string; fromPort: string; toNodeId: string; toPort: string }> = [];
      for (const outputPort of outputPorts) {
        for (const inputPort of inputPorts) {
          if (outputPort.nodeId === inputPort.nodeId) {
            continue;
          }
          connectionTargets.push({
            fromNodeId: outputPort.nodeId,
            fromPort: outputPort.port,
            toNodeId: inputPort.nodeId,
            toPort: inputPort.port,
          });
        }
      }

      for (let index = 0; index < connectionCount; index += 1) {
        const target = connectionTargets[index % connectionTargets.length];
        if (!target) {
          continue;
        }
        connect(target.fromNodeId, target.fromPort, target.toNodeId, target.toPort);
      }
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
  bulkConnectionModeGroup: toolbarUi.bulkConnectionModeGroup,
  bulkConnectionCountInput: toolbarUi.bulkConnectionCountInput,
  bulkTypeDetails: toolbarUi.bulkTypeDetails,
  bulkTypeCounts: toolbarUi.bulkTypeCounts,
  bulkTypeResetButton: toolbarUi.bulkTypeResetButton,
  bulkCreateButton: toolbarUi.bulkCreateButton,
  bulkTypeOptions: CFC_NODE_TEMPLATES.filter(
    (template) => template.type !== "input-pin" && template.type !== "output-pin",
  ).map((template) => ({
    type: template.type,
    label: template.label,
  })),
  onRoutingToggle: () => editor.toggleRoutingMode(),
  getRoutingMode: () => editor.getRoutingMode(),
  onZoomDelta: (delta) => editor.adjustZoom(delta),
  onZoomReset: () => editor.resetViewportToOrigin(),
  getZoomPercent: () => editor.getZoom() * 100,
  onBulkCreate: (boxCount, connectionCount, typeCounts, connectionMode) =>
    createBoxesAndConnections(boxCount, connectionCount, typeCounts, connectionMode),
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
  setQuizEntryOverlayOpen(true);
});

quizEntryStartButton.addEventListener("click", () => {
  startNewQuiz();
});

quizEntryResumeButton.addEventListener("click", () => {
  requestQuizResumeFile();
});

quizEntryCloseButton.addEventListener("click", () => {
  setQuizEntryOverlayOpen(false);
});

quizEntryOverlay.addEventListener("click", (event) => {
  if (event.target === quizEntryOverlay) {
    setQuizEntryOverlayOpen(false);
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !quizEntryOverlay.hidden) {
    setQuizEntryOverlayOpen(false);
  }
});

quizResumeFileInput.addEventListener("change", () => {
  void (async () => {
    const file = quizResumeFileInput.files?.[0];
    if (!file) {
      return;
    }
    try {
      const fileText = await readTextFromFile(file);
      const sessionExport = parseQuizSessionExport(fileText);
      resumeQuizFromExport(sessionExport);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isQuizModeActive) {
        quizFeedback.textContent = `❌ Report konnte nicht geladen werden: ${message}`;
      } else {
        window.alert(`Report konnte nicht geladen werden: ${message}`);
      }
    }
  })();
});

quizTaskSelect.addEventListener("change", () => {
  if (!quizSession.isActive()) {
    return;
  }
  const index = Number.parseInt(quizTaskSelect.value, 10);
  if (Number.isNaN(index)) {
    return;
  }
  setQuizFormatForTaskIndex(index);
  applyQuizTaskViewState(
    quizSession.selectTask(index, createActiveQuizTaskSessionState(), serializeQuizGraph),
  );
});

quizPrevButton.addEventListener("click", () => {
  if (!quizSession.isActive()) {
    return;
  }
  const previousIndex = Math.max(0, quizSession.getActiveIndex() - 1);
  setQuizFormatForTaskIndex(previousIndex);
  applyQuizTaskViewState(
    quizSession.selectTask(previousIndex, createActiveQuizTaskSessionState(), serializeQuizGraph),
  );
});

quizBackButton.addEventListener("click", () => {
  if (!isQuizModeActive) {
    return;
  }
  const shouldAbortQuiz = window.confirm(
    "Quiz wirklich abbrechen? Dein aktueller Quiz-Fortschritt wird verworfen.",
  );
  if (!shouldAbortQuiz) {
    return;
  }
  setQuizModeActive(false);
});

quizTimerToggleButton.addEventListener("click", () => {
  if (!isQuizModeActive || activeTaskCompleted) {
    return;
  }
  if (taskTimerRunning) {
    pauseTaskTimer(true);
  } else {
    startTaskTimer(true);
  }
  applyTaskEditability();
});

quizCheckFloatingButton.addEventListener("click", () => {
  runQuizCheck();
});

quizExpectedToggleButton.addEventListener("click", () => {
  if (!quizSession.isActive()) {
    return;
  }

  quizExpectedPreviewVisible = !quizExpectedPreviewVisible;
  const activeTask = quizSession.getActiveTask();
  updateExpectedPreviewToggleButton(activeTask);
  renderExpectedQuizGraphPreview(activeTask);
});

quizPreviewResizer.addEventListener("pointerdown", (event) => {
  if (quizPreviewResizer.hidden) {
    return;
  }

  event.preventDefault();
  quizPreviewResizePointerId = event.pointerId;
  quizPreviewResizeStartX = event.clientX;
  quizPreviewResizeStartWidth = quizExpectedPreviewWidthPx;
  quizPreviewResizer.setPointerCapture(event.pointerId);
});

quizPreviewResizer.addEventListener("pointermove", (event) => {
  if (quizPreviewResizePointerId !== event.pointerId) {
    return;
  }

  const deltaX = quizPreviewResizeStartX - event.clientX;
  quizExpectedPreviewWidthPx = clampExpectedPreviewWidth(quizPreviewResizeStartWidth + deltaX);
  graphStage.style.setProperty("--quiz-preview-width", `${quizExpectedPreviewWidthPx}px`);
  quizPreviewResizer.setAttribute("aria-valuenow", String(quizExpectedPreviewWidthPx));
});

const endQuizPreviewResize = (event: PointerEvent): void => {
  if (quizPreviewResizePointerId !== event.pointerId) {
    return;
  }

  quizPreviewResizePointerId = null;
  if (quizPreviewResizer.hasPointerCapture(event.pointerId)) {
    quizPreviewResizer.releasePointerCapture(event.pointerId);
  }
};

quizPreviewResizer.addEventListener("pointerup", endQuizPreviewResize);
quizPreviewResizer.addEventListener("pointercancel", endQuizPreviewResize);

quizExpectedCanvas.addEventListener(
  "wheel",
  (event: WheelEvent) => {
    event.preventDefault();
    const delta = event.deltaY < 0 ? 0.1 : -0.1;
    applyExpectedPreviewZoomDelta(delta, event.clientX, event.clientY);
  },
  { passive: false },
);

quizExpectedZoomOutButton.addEventListener("click", () => {
  applyExpectedPreviewZoomDelta(-0.1);
});

quizExpectedZoomInButton.addEventListener("click", () => {
  applyExpectedPreviewZoomDelta(0.1);
});

quizExpectedZoomValue.addEventListener("click", () => {
  if (!isQuizModeActive || !quizExpectedPreviewVisible || quizExpectedPreview.hidden) {
    return;
  }
  quizExpectedPreviewEditor.resetViewportToOrigin();
  updateExpectedPreviewZoomLabel();
});

quizReworkButton.addEventListener("click", () => {
  if (!isQuizModeActive || !quizSession.isActive() || !activeTaskCompleted) {
    return;
  }
  const activeTask = quizSession.getActiveTask();
  if (isGraphQuizTask(activeTask)) {
    return;
  }

  activeTaskCompleted = false;
  startTaskTimer(true);
  quizFeedback.textContent = "✏️ Überarbeitungsmodus aktiv. Die Zeit läuft wieder.";
  applyTaskEditability();
  quizSession.saveActiveState(createActiveQuizTaskSessionState());
});

quizNextButton.addEventListener("click", () => {
  if (!quizSession.isActive()) {
    return;
  }
  const nextIndex = Math.min(quizSession.getTasks().length - 1, quizSession.getActiveIndex() + 1);
  setQuizFormatForTaskIndex(nextIndex);
  applyQuizTaskViewState(
    quizSession.selectTask(nextIndex, createActiveQuizTaskSessionState(), serializeQuizGraph),
  );
});

quizEndButton.addEventListener("click", () => {
  void (async () => {
  pauseTaskTimer();
  if (quizSession.isActive()) {
    quizSession.saveActiveState(createActiveQuizTaskSessionState());
  }

  const snapshot = quizSession.getSnapshot();
  const previousParticipantName = localStorage.getItem(QUIZ_PARTICIPANT_NAME_STORAGE_KEY) ?? "";
  const enteredParticipantName = await participantNameDialog.requestName(previousParticipantName);
  if (enteredParticipantName === null) {
    return;
  }
  const participantName = enteredParticipantName.trim();
  if (participantName.length > 0) {
    localStorage.setItem(QUIZ_PARTICIPANT_NAME_STORAGE_KEY, participantName);
  }

  void quizPersistence.flushSessionExport({
    tasks: quizSession.getTasks(),
    session: snapshot,
    participantName,
  }).then(() => {
    setQuizModeActive(false);
  });
  })();
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
    editor.resetViewportToOrigin();
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
