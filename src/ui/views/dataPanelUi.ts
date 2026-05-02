import { query } from "./domQueryUi.js";

export interface DataPanelUiElements {
  layout: HTMLElement;
  dataModeModelButton: HTMLButtonElement;
  dataModeDeclarationButton: HTMLButtonElement;
  dataModelPanel: HTMLDivElement;
  declarationPanel: HTMLDivElement;
  dataText: HTMLTextAreaElement;
  dataLines: HTMLPreElement;
  declarationText: HTMLTextAreaElement;
  declarationLines: HTMLPreElement;
  dataToggleButton: HTMLButtonElement;
  metrics: HTMLParagraphElement;
}

export const getDataPanelUiElements = (): DataPanelUiElements => ({
  layout: query<HTMLElement>(".layout"),
  dataModeModelButton: query<HTMLButtonElement>("#data-mode-model"),
  dataModeDeclarationButton: query<HTMLButtonElement>("#data-mode-declaration"),
  dataModelPanel: query<HTMLDivElement>("#data-model-panel"),
  declarationPanel: query<HTMLDivElement>("#data-declaration-panel"),
  dataText: query<HTMLTextAreaElement>("#data-text"),
  dataLines: query<HTMLPreElement>("#data-lines"),
  declarationText: query<HTMLTextAreaElement>("#declaration-text"),
  declarationLines: query<HTMLPreElement>("#declaration-lines"),
  dataToggleButton: query<HTMLButtonElement>("#data-toggle"),
  metrics: query<HTMLParagraphElement>("#metrics"),
});
