import { query } from "./domQueryUi.js";

export interface ToolbarUiElements {
  routingModeButton: HTMLButtonElement;
  bulkMenuToggleButton: HTMLButtonElement;
  bulkMenu: HTMLDivElement;
  themeToggleButton: HTMLButtonElement;
  zoomOutButton: HTMLButtonElement;
  zoomInButton: HTMLButtonElement;
  zoomValue: HTMLSpanElement;
  exportButton: HTMLButtonElement;
  importButton: HTMLButtonElement;
  roundtripButton: HTMLButtonElement;
  bulkBoxCountInput: HTMLInputElement;
  bulkConnectionModeGroup: HTMLFieldSetElement;
  bulkConnectionCountInput: HTMLInputElement;
  bulkTypeDetails: HTMLDetailsElement;
  bulkTypeCounts: HTMLDivElement;
  bulkTypeResetButton: HTMLButtonElement;
  bulkCreateButton: HTMLButtonElement;
  formatSelect: HTMLSelectElement;
}

export const getToolbarUiElements = (): ToolbarUiElements => ({
  routingModeButton: query<HTMLButtonElement>("#routing-mode"),
  bulkMenuToggleButton: query<HTMLButtonElement>("#bulk-menu-toggle"),
  bulkMenu: query<HTMLDivElement>("#bulk-menu"),
  themeToggleButton: query<HTMLButtonElement>("#theme-toggle"),
  zoomOutButton: query<HTMLButtonElement>("#zoom-out"),
  zoomInButton: query<HTMLButtonElement>("#zoom-in"),
  zoomValue: query<HTMLSpanElement>("#zoom-value"),
  exportButton: query<HTMLButtonElement>("#export-data"),
  importButton: query<HTMLButtonElement>("#import-data"),
  roundtripButton: query<HTMLButtonElement>("#roundtrip"),
  bulkBoxCountInput: query<HTMLInputElement>("#bulk-box-count"),
  bulkConnectionModeGroup: query<HTMLFieldSetElement>("#bulk-connection-mode-group"),
  bulkConnectionCountInput: query<HTMLInputElement>("#bulk-connection-count"),
  bulkTypeDetails: query<HTMLDetailsElement>("#bulk-type-details"),
  bulkTypeCounts: query<HTMLDivElement>("#bulk-type-counts"),
  bulkTypeResetButton: query<HTMLButtonElement>("#bulk-type-reset"),
  bulkCreateButton: query<HTMLButtonElement>("#bulk-create"),
  formatSelect: query<HTMLSelectElement>("#format-select"),
});
