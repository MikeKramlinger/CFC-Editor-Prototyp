import type { DeclarationError, Declarations } from "../../declarations/index.js";
import { parseDeclarations } from "../../declarations/index.js";
import type { FormatError } from "../../formats/errors.js";
import { formatErrorMessage } from "../../formats/errors.js";
import { t, type UiLanguage } from "../../i18n.js";
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
  dataSyntax?: HTMLPreElement;
  metrics: HTMLParagraphElement;
  getCurrentLanguage?: () => UiLanguage;
  onDeclarationsChanged?: (declarations: Declarations) => void;
  onDataFormatErrorsChanged?: (errors: FormatError[]) => void;
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

const renderDataSyntax = (
  text: string,
  layer: HTMLPreElement,
  scrollTop: number,
  scrollLeft: number,
): void => {
  const lines = text.split("\n");
  layer.innerHTML = lines
    .map(
      (line, index) =>
        `<span class="data-line" data-line-number="${index + 1}">${escapeHtml(line)}</span>`,
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
  setDataFormatErrors: (errors: FormatError[]) => void;
}

export const createDataPanelController = (options: DataPanelControllerOptions): DataPanelController => {
  let isExpanded = false;
  let mode: DataPanelMode = "data-model";
  let currentDeclarations: Declarations = parseDeclarations(DEFAULT_DECLARATION_TEXT);
  let currentDataFormatErrors: FormatError[] = [];
  let lastDataText = "";

  const getLanguage = (): UiLanguage => options.getCurrentLanguage?.() ?? "en";

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

  const handleDataSyntaxPointerDown = (event: PointerEvent): void => {
    // Error display moved to metrics panel, no longer need pointer handling
  };

  const updateDeclarations = (): void => {
    const raw = declarationEditor.getText();
    currentDeclarations = parseDeclarations(raw);
    renderDeclarationSyntax(raw, currentDeclarations.errors, options.declarationSyntax, options.declarationText.scrollTop, options.declarationText.scrollLeft);
    options.onDeclarationsChanged?.(currentDeclarations);
  };

  const updateDataSyntax = (): void => {
    if (!options.dataSyntax) {
      return;
    }
    const raw = dataModelEditor.getText();
    const lines = raw.split("\n");
    const lastLines = lastDataText.split("\n");

    // Detect which lines have changed by comparing old and new lines
    const changedLineNumbers = new Set<number>();
    for (let i = 0; i < Math.max(lines.length, lastLines.length); i++) {
      if (lines[i] !== lastLines[i]) {
        changedLineNumbers.add(i + 1); // 1-indexed
      }
    }

    // Remove errors from changed lines (user fixed them by editing)
    const cleanedErrors = currentDataFormatErrors.filter((error) => {
      const affectedLines = error.lines ?? [error.line];
      
      // Remove if all affected lines no longer exist
      if (affectedLines.every((line) => line < 1 || line > lines.length)) {
        return false;
      }
      
      // Remove if any affected line was changed by the user (they might have fixed the error)
      if (affectedLines.some((line) => changedLineNumbers.has(line))) {
        return false;
      }

      return true;
    });

    currentDataFormatErrors = cleanedErrors;
    lastDataText = raw;
    
    renderDataSyntax(raw, options.dataSyntax, options.dataText.scrollTop, options.dataText.scrollLeft);
    updateDataMetrics();
  };

  const updateDataMetrics = (): void => {
    if (currentDataFormatErrors.length === 0) {
      options.metrics.textContent = "";
      return;
    }

    const localize = (key: string): string => t(getLanguage(), key as any);
    const errorMessages = currentDataFormatErrors
      .map((error) => {
        const message = formatErrorMessage(error, localize);
        const rows = error.lines ?? [error.line];
        const rowLabel = rows.length === 1 ? `Row ${rows[0]}` : `Rows ${rows.join(", ")}`;
        return `<span style="color: red;">${escapeHtml(rowLabel)}: ${escapeHtml(message)}</span>`;
      })
      .join(" | ");

    options.metrics.innerHTML = errorMessages;
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

  // Event-Listener für Daten-Syntax-Rendering
  options.dataText.addEventListener("input", () => {
    updateDataSyntax();
  });

  options.declarationSyntax.addEventListener("pointerdown", handleDeclarationSyntaxPointerDown);

  if (options.dataSyntax) {
    options.dataSyntax.addEventListener("pointerdown", handleDataSyntaxPointerDown);
  }

  if (options.declarationText.value.trim().length === 0) {
    declarationEditor.setText(DEFAULT_DECLARATION_TEXT);
  }

  updateDeclarations();
  updateDataSyntax();
  lastDataText = dataModelEditor.getText();
  updateVisibility();
  applyMode();

  return {
    setMetrics: (text) => {
      options.metrics.textContent = text;
    },
    setDataText: (value) => {
      dataModelEditor.setText(value);
      lastDataText = value;
      updateDataSyntax();
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
    setDataFormatErrors: (errors) => {
      currentDataFormatErrors = errors;
      lastDataText = dataModelEditor.getText();
      updateDataSyntax();
      options.onDataFormatErrorsChanged?.(errors);
    },
  };
};
