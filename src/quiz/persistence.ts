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
  participant?: {
    name: string;
  };
  tasks: QuizTask[];
  session: QuizSessionSnapshot;
  attempts: QuizAttemptRecord[];
}

export interface QuizPersistence {
  queueAttempt: (options: PersistQuizAttemptOptions) => void;
  replaceQueuedAttempts: (records: QuizAttemptRecord[]) => void;
  flushSessionExport: (options: {
    tasks: QuizTask[];
    session: QuizSessionSnapshot;
    participantName?: string;
  }) => Promise<{ ok: true; fileName: string; count: number } | { ok: false; reason: string }>;
  clearQueuedAttempts: () => void;
}

const toFileSlug = (value: string): string =>
  value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const createResultsFileName = (participantName?: string): string => {
  const participantSlug = participantName ? toFileSlug(participantName) : "";
  if (participantSlug.length > 0) {
    return `${participantSlug}-quiz-results.json`;
  }
  return "quiz-results.json";
};

export const createQuizPersistence = (): QuizPersistence => {
  const queuedAttempts: QuizAttemptRecord[] = [];

  const flushSessionExport = async (options: {
    tasks: QuizTask[];
    session: QuizSessionSnapshot;
    participantName?: string;
  }): Promise<{ ok: true; fileName: string; count: number } | { ok: false; reason: string }> => {
    try {
      const normalizedParticipantName = options.participantName?.trim() ?? "";
      const fileName = createResultsFileName(normalizedParticipantName);
      const payloadObject: QuizSessionExport = {
        format: "cfc-quiz-session-v1",
        exportedAt: new Date().toISOString(),
        participant: normalizedParticipantName.length > 0 ? { name: normalizedParticipantName } : undefined,
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
    replaceQueuedAttempts: (records) => {
      queuedAttempts.length = 0;
      queuedAttempts.push(...records.map((record) => ({ ...record, result: { ...record.result } })));
    },
    flushSessionExport,
    clearQueuedAttempts: () => {
      queuedAttempts.length = 0;
    },
  };
};
