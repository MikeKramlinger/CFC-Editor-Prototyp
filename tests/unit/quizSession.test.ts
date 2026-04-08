import { describe, expect, it } from "vitest";
import { cloneGraph } from "../../src/model.js";
import { createQuizSession } from "../../src/quiz/session.js";
import { SAMPLE_QUIZ_TASKS } from "../../src/quiz/sampleQuiz.js";
import type { QuizTask } from "../../src/quiz/types.js";

const serializeGraph = (graph: Parameters<typeof cloneGraph>[0]): string => JSON.stringify(graph);

describe("quiz session", () => {
  it("restores per-task progress while quiz is active", () => {
    const session = createQuizSession({ tasks: SAMPLE_QUIZ_TASKS });
    const first = session.start(serializeGraph);

    const modifiedFirstGraph = cloneGraph(first.graph);
    modifiedFirstGraph.version = "first-modified";
    session.saveActiveState({
      graph: modifiedFirstGraph,
      dataText: "FIRST",
      feedback: "first done",
      elapsedMs: 1200,
      isCompleted: false,
    });

    const second = session.selectTask(
      1,
      {
        graph: modifiedFirstGraph,
        dataText: "FIRST",
        feedback: "first done",
        elapsedMs: 1200,
        isCompleted: false,
      },
      serializeGraph,
    );

    const modifiedSecondGraph = cloneGraph(second.graph);
    modifiedSecondGraph.version = "second-modified";

    const restoredFirst = session.selectTask(
      0,
      {
        graph: modifiedSecondGraph,
        dataText: "SECOND",
        feedback: "second done",
        elapsedMs: 2400,
        isCompleted: false,
      },
      serializeGraph,
    );

    expect(restoredFirst.graph.version).toBe("first-modified");
    expect(restoredFirst.dataText).toBe("FIRST");
    expect(restoredFirst.feedback).toBe("first done");
    expect(restoredFirst.elapsedMs).toBe(1200);
    expect(restoredFirst.isCompleted).toBe(false);
  });

  it("resets all progress when quiz is restarted", () => {
    const session = createQuizSession({ tasks: SAMPLE_QUIZ_TASKS });
    const firstStart = session.start(serializeGraph);

    const modifiedGraph = cloneGraph(firstStart.graph);
    modifiedGraph.version = "modified";
    session.saveActiveState({
      graph: modifiedGraph,
      dataText: "CHANGED",
      feedback: "changed",
      elapsedMs: 1500,
      isCompleted: true,
    });

    session.stop();

    const secondStart = session.start(serializeGraph);

    expect(secondStart.graph.version).toBe(firstStart.task.initialGraph.version);
    expect(secondStart.dataText).toBe(serializeGraph(firstStart.task.initialGraph));
    expect(secondStart.feedback).toContain("Aufgabe geladen");
    expect(secondStart.elapsedMs).toBe(0);
    expect(secondStart.isCompleted).toBe(false);
  });

  it("starts open tasks with empty answer text", () => {
    const openTask: QuizTask = {
      id: "open-1",
      kind: "open",
      title: "Open",
      description: "Beschreibe kurz den Aufbau.",
      initialGraph: cloneGraph(SAMPLE_QUIZ_TASKS[0]!.initialGraph),
      saveMessage: "Gespeichert",
    };
    const session = createQuizSession({ tasks: [openTask] });

    const first = session.start(serializeGraph);

    expect(first.dataText).toBe("");
    expect(first.feedback).toContain("Frage geladen");
    expect(first.elapsedMs).toBe(0);
    expect(first.isCompleted).toBe(false);
  });

  it("restores a saved snapshot for continuing later", () => {
    const session = createQuizSession({ tasks: SAMPLE_QUIZ_TASKS });
    const started = session.start(serializeGraph);

    const resumedGraph = cloneGraph(started.graph);
    resumedGraph.version = "resume-graph";

    const openAnswer = "Meine gespeicherte Antwort";
    const changedTask = session.selectTask(
      3,
      {
        graph: resumedGraph,
        dataText: "Zwischenstand",
        feedback: "Zwischengespeichert",
        elapsedMs: 400,
        isCompleted: false,
      },
      serializeGraph,
    );

    session.saveActiveState({
      graph: cloneGraph(changedTask.graph),
      dataText: openAnswer,
      feedback: "Gespeichert",
      elapsedMs: 3200,
      isCompleted: true,
      answerHistory: [
        {
          timestamp: "2026-04-08T10:00:00.000Z",
          elapsedMs: 3200,
          answer: openAnswer,
        },
      ],
    });

    const snapshot = session.getSnapshot();

    const restoredSession = createQuizSession({ tasks: SAMPLE_QUIZ_TASKS });
    const restored = restoredSession.restore(snapshot, serializeGraph);

    expect(restored.index).toBe(3);
    expect(restored.dataText).toBe(openAnswer);
    expect(restored.feedback).toBe("Gespeichert");
    expect(restored.elapsedMs).toBe(3200);
    expect(restored.isCompleted).toBe(true);
    expect(restored.answerHistory?.[0]?.answer).toBe(openAnswer);
  });

});
