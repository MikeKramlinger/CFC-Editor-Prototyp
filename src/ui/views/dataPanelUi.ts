import { query } from "./domQueryUi.js";

export interface DataPanelUiElements {
  layout: HTMLElement;
  dataText: HTMLTextAreaElement;
  dataLines: HTMLPreElement;
  dataToggleButton: HTMLButtonElement;
  metrics: HTMLParagraphElement;
}

export const getDataPanelUiElements = (): DataPanelUiElements => ({
  layout: query<HTMLElement>(".layout"),
  dataText: query<HTMLTextAreaElement>("#data-text"),
  dataLines: query<HTMLPreElement>("#data-lines"),
  dataToggleButton: query<HTMLButtonElement>("#data-toggle"),
  metrics: query<HTMLParagraphElement>("#metrics"),
});
