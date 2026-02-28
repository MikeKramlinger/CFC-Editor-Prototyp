import { query } from "./domQueryUi.js";

export interface ToolboxUiElements {
  workspace: HTMLDivElement;
  toolboxList: HTMLDivElement;
  toolboxToggleButton: HTMLButtonElement;
}

export const getToolboxUiElements = (): ToolboxUiElements => ({
  workspace: query<HTMLDivElement>(".workspace"),
  toolboxList: query<HTMLDivElement>("#toolbox-list"),
  toolboxToggleButton: query<HTMLButtonElement>("#toolbox-toggle"),
});
