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
  metrics: HTMLParagraphElement;
}

export type DataPanelMode = "data-model" | "declaration";

const DEFAULT_DECLARATION_TEXT = [
  "PROGRAM CFC",
  "VAR",
  "END_VAR",
].join("\n");

export interface DataPanelController {
  setMetrics: (text: string) => void;
  setDataText: (value: string) => void;
  getDataText: () => string;
  setDeclarationText: (value: string) => void;
  getDeclarationText: () => string;
  setMode: (mode: DataPanelMode) => void;
  getMode: () => DataPanelMode;
}

export const createDataPanelController = (options: DataPanelControllerOptions): DataPanelController => {
  let isExpanded = false;
  let mode: DataPanelMode = "data-model";

  const dataModelEditor = createTextAreaCodeEditorController({
    textArea: options.dataText,
    lineNumbers: options.dataLines,
  });

  const declarationEditor = createTextAreaCodeEditorController({
    textArea: options.declarationText,
    lineNumbers: options.declarationLines,
  });

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

  if (options.declarationText.value.trim().length === 0) {
    declarationEditor.setText(DEFAULT_DECLARATION_TEXT);
  }

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
  };
};
