import type { QuizSessionSnapshot, QuizTask } from "./types.js";

export interface QuizAttemptRecord {
  timestamp: string;
  taskId: string;
  taskTitle: string;
  taskKind: QuizTask["kind"];
  question: string;
  dataModelOrAnswer: string;
  taskElapsedMs: number;
  taskCompleted: boolean;
  result: {
    success: boolean;
    message: string;
    failedChecks?: string[];
    passedChecks?: string[];
  };
}

interface PersistQuizAttemptOptions {
  record: QuizAttemptRecord;
}

export interface QuizSessionExport {
  format: "cfc-quiz-session-v1";
  exportedAt: string;
  tasks: QuizTask[];
  session: QuizSessionSnapshot;
  attempts: QuizAttemptRecord[];
}

export interface QuizPersistence {
  queueAttempt: (options: PersistQuizAttemptOptions) => void;
  flushSessionExport: (options: {
    tasks: QuizTask[];
    session: QuizSessionSnapshot;
  }) => Promise<{ ok: true; fileName: string; count: number } | { ok: false; reason: string }>;
  clearQueuedAttempts: () => void;
}

const createResultsFileName = (): string => {
  const now = new Date();
  const pad = (value: number): string => String(value).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  return `quiz-results-${stamp}.json`;
};

export const createQuizPersistence = (): QuizPersistence => {
  const queuedAttempts: QuizAttemptRecord[] = [];

  const flushSessionExport = async (options: {
    tasks: QuizTask[];
    session: QuizSessionSnapshot;
  }): Promise<{ ok: true; fileName: string; count: number } | { ok: false; reason: string }> => {
    try {
      const fileName = createResultsFileName();
      const payloadObject: QuizSessionExport = {
        format: "cfc-quiz-session-v1",
        exportedAt: new Date().toISOString(),
        tasks: options.tasks,
        session: options.session,
        attempts: [...queuedAttempts],
      };
      const payload = JSON.stringify(payloadObject, null, 2);
      const blob = new Blob([payload], { type: "application/json;charset=utf-8" });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = fileName;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
      }, 1000);
      return { ok: true, fileName, count: queuedAttempts.length };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, reason: message };
    }
  };

  return {
    queueAttempt: ({ record }) => {
      queuedAttempts.push(record);
    },
    flushSessionExport,
    clearQueuedAttempts: () => {
      queuedAttempts.length = 0;
    },
  };
};
