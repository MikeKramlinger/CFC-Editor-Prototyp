import type { DeclarationError, Declarations } from "../../declarations/index.js";
import { parseDeclarations } from "../../declarations/index.js";
import { createTextAreaCodeEditorController } from "./textAreaCodeEditorController.js";

interface DataPanelControllerOptions {
  layout: HTMLElement;
  dataToggleButton: HTMLButtonElement;
  dataModeModelButton: HTMLButtonElement;
  dataModeDeclarationButton: HTMLButtonElement;
  dataModelPanel: HTMLDivElement;
  declarationPanel: HTMLDivElement;
  dataText: HTMLTextAreaElement;
  dataLines: HTMLPreElement;
  declarationText: HTMLTextAreaElement;
  declarationLines: HTMLPreElement;
  declarationSyntax: HTMLPreElement;
  metrics: HTMLParagraphElement;
  onDeclarationsChanged?: (declarations: Declarations) => void;
}

export type DataPanelMode = "data-model" | "declaration";

const DEFAULT_DECLARATION_TEXT = [
  "PROGRAM CFC",
  "VAR",
  "END_VAR",
].join("\n");

const KEYWORDS = ["PROGRAM", "VAR", "END_VAR"];

const escapeHtml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const highlightKeywords = (value: string): string => {
  if (value.length === 0) {
    return "";
  }

  const keywordPattern = KEYWORDS.map((keyword) => keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const keywordRegex = new RegExp(`\\b(${keywordPattern})\\b`, "g");

  let lastIndex = 0;
  let html = "";
  let match: RegExpExecArray | null;
  while ((match = keywordRegex.exec(value)) !== null) {
    const [keyword] = match;
    if (match.index > lastIndex) {
      html += escapeHtml(value.slice(lastIndex, match.index));
    }
    html += `<span class="syntax-keyword">${escapeHtml(keyword)}</span>`;
    lastIndex = match.index + keyword.length;
  }

  if (lastIndex < value.length) {
    html += escapeHtml(value.slice(lastIndex));
  }

  return html;
};

const renderLineWithErrors = (line: string, lineErrors: DeclarationError[]): string => {
  if (lineErrors.length === 0) {
    return highlightKeywords(line);
  }

  const sortedErrors = [...lineErrors].sort((left, right) => {
    const leftStart = left.startColumn ?? 1;
    const rightStart = right.startColumn ?? 1;
    return leftStart - rightStart;
  });

  let cursor = 0;
  let html = "";

  for (const error of sortedErrors) {
    const startIndex = Math.max(0, (error.startColumn ?? 1) - 1);
    const endIndex = Math.max(startIndex, (error.endColumn ?? line.length + 1) - 1);

    if (startIndex > cursor) {
      html += highlightKeywords(line.slice(cursor, startIndex));
    }

    const errorText = line.slice(startIndex, Math.min(line.length, endIndex));
    if (errorText.length > 0) {
      html += `<span class="declaration-error" data-start-column="${error.startColumn ?? 1}" data-end-column="${error.endColumn ?? 1}" title="${escapeHtml(error.message)}">${escapeHtml(errorText)}</span>`;
    }
    cursor = Math.max(cursor, endIndex);
  }

  if (cursor < line.length) {
    html += highlightKeywords(line.slice(cursor));
  }

  return html;
};

const renderDeclarationSyntax = (
  text: string,
  errors: DeclarationError[],
  layer: HTMLPreElement,
  scrollTop: number,
  scrollLeft: number,
): void => {
  const lines = text.split("\n");
  const errorsByLine = new Map<number, DeclarationError[]>();

  for (const error of errors) {
    const bucket = errorsByLine.get(error.line) ?? [];
    bucket.push(error);
    errorsByLine.set(error.line, bucket);
  }

  layer.innerHTML = lines
    .map(
      (line, index) =>
        `<span class="declaration-line" data-line-number="${index + 1}">${renderLineWithErrors(line, errorsByLine.get(index + 1) ?? [])}</span>`,
    )
    .join("\n");
  layer.scrollTop = scrollTop;
  layer.scrollLeft = scrollLeft;
};

export interface DataPanelController {
  setMetrics: (text: string) => void;
  setDataText: (value: string) => void;
  getDataText: () => string;
  setDeclarationText: (value: string) => void;
  getDeclarationText: () => string;
  setMode: (mode: DataPanelMode) => void;
  getMode: () => DataPanelMode;
  getDeclarations: () => Declarations;
}

export const createDataPanelController = (options: DataPanelControllerOptions): DataPanelController => {
  let isExpanded = false;
  let mode: DataPanelMode = "data-model";
  let currentDeclarations: Declarations = parseDeclarations(DEFAULT_DECLARATION_TEXT);

  const dataModelEditor = createTextAreaCodeEditorController({
    textArea: options.dataText,
    lineNumbers: options.dataLines,
  });

  const declarationEditor = createTextAreaCodeEditorController({
    textArea: options.declarationText,
    lineNumbers: options.declarationLines,
    highlightLayer: options.declarationSyntax ?? undefined,
    highlightKeywords: ["PROGRAM", "VAR", "END_VAR"],
  });

  const handleDeclarationSyntaxPointerDown = (event: PointerEvent): void => {
    const target = event.target as HTMLElement | null;
    if (!target || !target.classList.contains("declaration-error")) {
      return;
    }

    const startColumn = Number.parseInt(target.dataset.startColumn ?? "1", 10);
    const safeStartColumn = Number.isFinite(startColumn) && startColumn > 0 ? startColumn : 1;
    const lineElement = target.closest<HTMLElement>(".declaration-line");
    const lineNumber = Number.parseInt(lineElement?.dataset.lineNumber ?? "1", 10);
    const lineText = lineElement?.textContent ?? "";
    const lineRect = lineElement?.getBoundingClientRect();
    const sourceLines = options.declarationText.value.split("\n");
    const lineOffset = sourceLines
      .slice(0, Math.max(0, Number.isFinite(lineNumber) ? lineNumber - 1 : 0))
      .reduce((sum, current) => sum + current.length + 1, 0);

    let nextColumn = safeStartColumn;
    if (lineRect && lineRect.width > 0 && lineText.length > 0) {
      const relativeX = Math.max(0, Math.min(event.clientX - lineRect.left, lineRect.width));
      const ratio = relativeX / lineRect.width;
      nextColumn = Math.max(1, Math.min(lineText.length + 1, Math.round(ratio * lineText.length) + 1));
    }

    const selectionIndex = Math.min(options.declarationText.value.length, lineOffset + nextColumn - 1);

    event.preventDefault();
    options.declarationText.focus();
    options.declarationText.setSelectionRange(selectionIndex, selectionIndex, "forward");
  };

  const updateDeclarations = (): void => {
    const raw = declarationEditor.getText();
    currentDeclarations = parseDeclarations(raw);
    renderDeclarationSyntax(raw, currentDeclarations.errors, options.declarationSyntax, options.declarationText.scrollTop, options.declarationText.scrollLeft);
    options.onDeclarationsChanged?.(currentDeclarations);
  };

  const updateVisibility = (): void => {
    options.layout.classList.toggle("data-expanded", isExpanded);
    options.dataToggleButton.textContent = isExpanded ? "⤡" : "⤢";
    options.dataToggleButton.setAttribute("aria-expanded", isExpanded ? "true" : "false");
    options.dataToggleButton.setAttribute(
      "aria-label",
      isExpanded ? "Datenbereich einziehen" : "Datenbereich vergrößern",
    );
  };

  const applyMode = (): void => {
    const modelSelected = mode === "data-model";
    options.dataModelPanel.hidden = !modelSelected;
    options.declarationPanel.hidden = modelSelected;
    options.dataModeModelButton.setAttribute("aria-selected", modelSelected ? "true" : "false");
    options.dataModeDeclarationButton.setAttribute("aria-selected", modelSelected ? "false" : "true");

    if (modelSelected) {
      options.dataText.focus();
      dataModelEditor.updateLineNumbers();
    } else {
      options.declarationText.focus();
      declarationEditor.updateLineNumbers();
    }
  };

  options.dataToggleButton.addEventListener("click", () => {
    isExpanded = !isExpanded;
    updateVisibility();
  });

  options.dataModeModelButton.addEventListener("click", () => {
    if (mode === "data-model") {
      return;
    }
    mode = "data-model";
    applyMode();
  });

  options.dataModeDeclarationButton.addEventListener("click", () => {
    if (mode === "declaration") {
      return;
    }
    mode = "declaration";
    applyMode();
  });

  // Event-Listener für Deklarations-Änderungen
  options.declarationText.addEventListener("input", () => {
    updateDeclarations();
  });

  options.declarationSyntax.addEventListener("pointerdown", handleDeclarationSyntaxPointerDown);

  if (options.declarationText.value.trim().length === 0) {
    declarationEditor.setText(DEFAULT_DECLARATION_TEXT);
  }

  updateDeclarations();
  updateVisibility();
  applyMode();

  return {
    setMetrics: (text) => {
      options.metrics.textContent = text;
    },
    setDataText: (value) => {
      dataModelEditor.setText(value);
    },
    getDataText: () => dataModelEditor.getText(),
    setDeclarationText: (value) => {
      declarationEditor.setText(value);
      updateDeclarations();
    },
    getDeclarationText: () => declarationEditor.getText(),
    setMode: (nextMode) => {
      if (mode === nextMode) {
        return;
      }
      mode = nextMode;
      applyMode();
    },
    getMode: () => mode,
    getDeclarations: () => currentDeclarations,
  };
};
