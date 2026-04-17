import { cloneGraph, createEmptyGraph, type CfcGraph } from "../model.js";
import { evaluateQuizTask } from "./evaluator.js";
import {
  isGraphQuizTask,
  type QuizEvaluationResult,
  type QuizSessionSnapshot,
  type QuizTask,
  type QuizTaskSessionState,
  type QuizTaskViewState,
} from "./types.js";

interface CreateQuizSessionOptions {
  tasks: QuizTask[];
}

const cloneTaskSessionState = (state: QuizTaskSessionState): QuizTaskSessionState => ({
  graph: cloneGraph(state.graph),
  dataText: state.dataText,
  feedback: state.feedback,
  elapsedMs: state.elapsedMs,
  isCompleted: state.isCompleted,
  answerHistory: state.answerHistory?.map((entry) => ({ ...entry })) ?? [],
});

const createDefaultTaskSessionState = (task: QuizTask, serializeGraph: (graph: CfcGraph) => string): QuizTaskSessionState => {
  if (task.kind === "open") {
    return {
      graph: createEmptyGraph(),
      dataText: "",
      feedback: "Frage geladen. Trage deine Antwort im Datenfeld ein und klicke auf Speichern.",
      elapsedMs: 0,
      isCompleted: false,
      answerHistory: [],
    };
  }

  const graph = cloneGraph(task.initialGraph);

  return {
    graph,
    dataText: serializeGraph(graph),
    feedback: "Aufgabe geladen. Jetzt Daten/Graph bearbeiten und auf Prüfen klicken.",
    elapsedMs: 0,
    isCompleted: false,
  };
};

export interface QuizSession {
  getTasks: () => QuizTask[];
  isActive: () => boolean;
  getActiveTask: () => QuizTask;
  getActiveIndex: () => number;
  start: (serializeGraph: (graph: CfcGraph) => string) => QuizTaskViewState;
  restore: (snapshot: QuizSessionSnapshot, serializeGraph: (graph: CfcGraph) => string) => QuizTaskViewState;
  stop: () => void;
  saveActiveState: (state: QuizTaskSessionState) => void;
  getSnapshot: () => QuizSessionSnapshot;
  selectTask: (index: number, currentState: QuizTaskSessionState, serializeGraph: (graph: CfcGraph) => string) => QuizTaskViewState;
  evaluateActiveTask: (graph: CfcGraph) => QuizEvaluationResult;
}

export const createQuizSession = (options: CreateQuizSessionOptions): QuizSession => {
  const tasks = options.tasks;
  const firstTask = tasks[0];
  if (!firstTask) {
    throw new Error("Es ist mindestens eine Quiz-Aufgabe erforderlich.");
  }

  let active = false;
  let activeIndex = 0;
  const stateByTaskId = new Map<string, QuizTaskSessionState>();

  const getActiveTask = (): QuizTask => tasks[activeIndex] ?? firstTask;

  const getOrCreateTaskState = (task: QuizTask, serializeGraph: (graph: CfcGraph) => string): QuizTaskSessionState => {
    const existing = stateByTaskId.get(task.id);
    if (existing) {
      return cloneTaskSessionState(existing);
    }
    const created = createDefaultTaskSessionState(task, serializeGraph);
    stateByTaskId.set(task.id, cloneTaskSessionState(created));
    return created;
  };

  const createViewState = (serializeGraph: (graph: CfcGraph) => string): QuizTaskViewState => {
    const task = getActiveTask();
    const state = getOrCreateTaskState(task, serializeGraph);
    return {
      index: activeIndex,
      task,
      ...state,
    };
  };

  const saveActiveState = (state: QuizTaskSessionState): void => {
    if (!active) {
      return;
    }
    const task = getActiveTask();
    stateByTaskId.set(task.id, cloneTaskSessionState(state));
  };

  return {
    getTasks: () => tasks,
    isActive: () => active,
    getActiveTask,
    getActiveIndex: () => activeIndex,
    start: (serializeGraph) => {
      active = true;
      activeIndex = 0;
      stateByTaskId.clear();
      return createViewState(serializeGraph);
    },
    restore: (snapshot, serializeGraph) => {
      active = true;
      stateByTaskId.clear();

      if (snapshot && snapshot.taskStates && typeof snapshot.taskStates === "object") {
        for (const task of tasks) {
          const restoredTaskState = snapshot.taskStates[task.id];
          if (!restoredTaskState) {
            continue;
          }
          stateByTaskId.set(task.id, cloneTaskSessionState(restoredTaskState));
        }
      }

      activeIndex = Math.max(0, Math.min(tasks.length - 1, snapshot.activeIndex ?? 0));
      return createViewState(serializeGraph);
    },
    stop: () => {
      active = false;
      stateByTaskId.clear();
      activeIndex = 0;
    },
    saveActiveState,
    getSnapshot: () => {
      const taskStates: Record<string, QuizTaskSessionState> = {};
      stateByTaskId.forEach((state, taskId) => {
        taskStates[taskId] = cloneTaskSessionState(state);
      });
      return {
        activeIndex,
        taskStates,
      };
    },
    selectTask: (index, currentState, serializeGraph) => {
      saveActiveState(currentState);
      activeIndex = Math.max(0, Math.min(tasks.length - 1, index));
      return createViewState(serializeGraph);
    },
    evaluateActiveTask: (graph) => {
      const task = getActiveTask();
      if (!isGraphQuizTask(task)) {
        throw new Error("Die aktive Aufgabe ist keine Graph-Aufgabe.");
      }
      return evaluateQuizTask({
        graph,
        task,
      });
    },
  };
};
