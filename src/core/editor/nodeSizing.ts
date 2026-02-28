import { getNodeTemplateByType, type CfcNode } from "../../model.js";

const GRID_CELL_PX = 24;
const GRID_UNIT_SIZE = 1;

let textMeasureCanvas: HTMLCanvasElement | null = null;

const getTextMeasureContext = (): CanvasRenderingContext2D | null => {
  if (typeof document === "undefined") {
    return null;
  }
  if (!textMeasureCanvas) {
    textMeasureCanvas = document.createElement("canvas");
  }
  return textMeasureCanvas.getContext("2d");
};

const measureTextWidthPx = (text: string, font: string): number => {
  const context = getTextMeasureContext();
  if (!context) {
    return text.length * 8;
  }
  context.font = font;
  return context.measureText(text).width;
};

const snapToGrid = (value: number): number => {
  const safeGridSize = Math.max(0.000001, GRID_UNIT_SIZE);
  return Math.round(value / safeGridSize) * safeGridSize;
};

const snapDimensionToGrid = (value: number): number => {
  return Math.max(GRID_UNIT_SIZE, snapToGrid(value));
};

const getContentWidthRatio = (node: CfcNode): number => {
  if (node.type === "composer" || node.type === "selector") {
    return 0.8;
  }
  return 1;
};

const getExecutionOrderReservePx = (node: CfcNode): number => {
  if (node.type === "return") {
    return 26;
  }
  return 0;
};

const computeFittedNodeWidth = (node: CfcNode): number => {
  const template = getNodeTemplateByType(node.type);
  const titleWidthPx = measureTextWidthPx(node.label, '600 14px "Segoe UI", Tahoma, Geneva, Verdana, sans-serif');
  const subtitleWidthPx = measureTextWidthPx(
    `${node.id} • ${template.label}`,
    '400 12px "Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
  );
  const maxLineWidthPx = Math.max(titleWidthPx, subtitleWidthPx);
  const horizontalPaddingPx = node.type === "connection-mark-source" || node.type === "connection-mark-sink" ? 48 : 24;
  const executionOrderReservePx = getExecutionOrderReservePx(node);
  const contentWidthRatio = getContentWidthRatio(node);
  const requiredWidthPx = Math.ceil((maxLineWidthPx + horizontalPaddingPx + executionOrderReservePx) / contentWidthRatio);
  const requiredWidthUnits = requiredWidthPx / GRID_CELL_PX;
  const minWidthUnits = Math.max(template.width, GRID_UNIT_SIZE);
  return snapDimensionToGrid(Math.max(minWidthUnits, requiredWidthUnits));
};

export const fitNodeWidthToLabel = (node: CfcNode): void => {
  node.width = computeFittedNodeWidth(node);
};
