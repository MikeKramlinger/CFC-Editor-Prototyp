import type { CfcConnection, CfcGraph, CfcNode, CfcNodeType } from "../model.js";

export interface QuizNodeSelector {
  id?: string;
  type?: CfcNodeType;
  label?: string;
}

export interface QuizNodeExpectation extends QuizNodeSelector {
  x?: number;
  y?: number;
  tolerance?: number;
}

export interface QuizConnectionExpectation {
  from: QuizNodeSelector;
  to: QuizNodeSelector;
  fromPort?: string;
  toPort?: string;
}

export interface QuizTaskCriteria {
  exactNodeCount?: number;
  minNodeCount?: number;
  exactConnectionCount?: number;
  minConnectionCount?: number;
  requiredNodeCounts?: Partial<Record<CfcNodeType, number>>;
  requiredNodes?: QuizNodeExpectation[];
  forbiddenNodes?: QuizNodeExpectation[];
  requiredConnections?: QuizConnectionExpectation[];
}

interface QuizTaskBase {
  id: string;
  title: string;
  description: string;
  initialGraph: CfcGraph;
}

export interface QuizGraphTask extends QuizTaskBase {
  kind: "graph";
  criteria: QuizTaskCriteria;
}

export interface QuizOpenTask extends QuizTaskBase {
  kind: "open";
  placeholder?: string;
  saveMessage?: string;
}

export type QuizTask = QuizGraphTask | QuizOpenTask;

export const isGraphQuizTask = (task: QuizTask): task is QuizGraphTask => task.kind === "graph";

export interface QuizEvaluationResult {
  success: boolean;
  passedChecks: string[];
  failedChecks: string[];
}

export interface QuizEvaluationContext {
  graph: CfcGraph;
  task: QuizGraphTask;
}

export interface QuizTaskSessionState {
  graph: CfcGraph;
  dataText: string;
  feedback: string;
  elapsedMs: number;
  isCompleted: boolean;
}

export interface QuizTaskViewState extends QuizTaskSessionState {
  index: number;
  task: QuizTask;
}

export interface QuizSessionSnapshot {
  activeIndex: number;
  taskStates: Record<string, QuizTaskSessionState>;
}

export type NodePredicate = (node: CfcNode) => boolean;
export type ConnectionPredicate = (connection: CfcConnection) => boolean;
