import type { CfcFormatAdapter } from "../../formats/types.js";
import type { CfcGraph } from "../../model.js";

type UiTheme = "light" | "dark";
type RoutingMode = "astar" | "bezier";

interface ToolbarControllerOptions {
  exportButton: HTMLButtonElement;
  importButton: HTMLButtonElement;
  roundtripButton: HTMLButtonElement;
  routingModeButton: HTMLButtonElement;
  bulkMenuToggleButton: HTMLButtonElement;
  bulkMenu: HTMLDivElement;
  themeToggleButton: HTMLButtonElement;
  zoomOutButton: HTMLButtonElement;
  zoomInButton: HTMLButtonElement;
  zoomValue: HTMLSpanElement;
  bulkBoxCountInput: HTMLInputElement;
  bulkConnectionCountInput: HTMLInputElement;
  bulkCreateButton: HTMLButtonElement;
  onRoutingToggle: () => RoutingMode;
  getRoutingMode: () => RoutingMode;
  onZoomDelta: (delta: number) => void;
  onZoomReset: () => void;
  getZoomPercent: () => number;
  onBulkCreate: (boxCount: number, connectionCount: number) => void;
  onBulkCreateInvalid: () => void;
  getCurrentTheme: () => UiTheme;
  onThemeToggle: () => UiTheme;
  getCurrentAdapter: () => CfcFormatAdapter;
  getCurrentGraph: () => CfcGraph;
  setCurrentGraph: (graph: CfcGraph) => void;
  loadGraph: (graph: CfcGraph) => void;
  getDataText: () => string;
  setDataText: (value: string) => void;
  setMetrics: (value: string) => void;
}

export interface ToolbarController {
  applyTheme: (theme: UiTheme) => void;
  updateZoomLabel: () => void;
  updateRoutingLabel: () => void;
  handleEscape: () => boolean;
  triggerExport: () => void;
  triggerImport: () => void;
}

const parseNonNegativeInt = (value: string, fallback: number): number => {
  const numeric = Number.parseInt(value, 10);
  if (Number.isNaN(numeric)) {
    return fallback;
  }
  return Math.max(0, numeric);
};

const getPayloadSizeKb = (payload: string): number => {
  const bytes = new TextEncoder().encode(payload).length;
  return bytes / 1024;
};

const formatKb = (value: number): string => `${value.toFixed(2)} KB`;

const formatMs = (value: number): string => `${value.toFixed(2)} ms`;

export const createToolbarController = (options: ToolbarControllerOptions): ToolbarController => {
  let isBulkMenuOpen = false;

  const triggerExport = (): void => {
    const adapter = options.getCurrentAdapter();
    const payload = adapter.serialize(options.getCurrentGraph());
    options.setDataText(payload);
    const sizeKb = getPayloadSizeKb(payload);
    options.setMetrics(`Exportgröße: ${formatKb(sizeKb)}`);
  };

  const triggerImport = (): void => {
    try {
      const adapter = options.getCurrentAdapter();
      const graph = adapter.deserialize(options.getDataText());
      options.setCurrentGraph(graph);
      options.loadGraph(graph);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      options.setMetrics(`Import fehlgeschlagen: ${message}`);
    }
  };

  const updateBulkMenuVisibility = (): void => {
    options.bulkMenu.hidden = !isBulkMenuOpen;
    options.bulkMenuToggleButton.setAttribute("aria-expanded", isBulkMenuOpen ? "true" : "false");
  };

  const updateZoomLabel = (): void => {
    options.zoomValue.textContent = `${Math.round(options.getZoomPercent())}%`;
  };

  const updateRoutingLabel = (): void => {
    const mode = options.getRoutingMode();
    options.routingModeButton.textContent = mode === "bezier" ? "Routing: Bezier" : "Routing: CFC";
  };

  const applyTheme = (theme: UiTheme): void => {
    document.body.setAttribute("data-theme", theme);
    const isDark = theme === "dark";
    options.themeToggleButton.textContent = isDark ? "☀️ Light" : "🌙 Dark";
    options.themeToggleButton.setAttribute("aria-pressed", isDark ? "true" : "false");
    options.themeToggleButton.setAttribute("aria-label", isDark ? "Light Theme aktivieren" : "Dark Theme aktivieren");
  };

  options.bulkMenuToggleButton.addEventListener("click", () => {
    isBulkMenuOpen = !isBulkMenuOpen;
    updateBulkMenuVisibility();
  });

  options.bulkCreateButton.addEventListener("click", () => {
    const boxCount = parseNonNegativeInt(options.bulkBoxCountInput.value, 0);
    const connectionCount = parseNonNegativeInt(options.bulkConnectionCountInput.value, 0);
    if (boxCount <= 0) {
      options.onBulkCreateInvalid();
      return;
    }
    options.onBulkCreate(boxCount, connectionCount);
    isBulkMenuOpen = false;
    updateBulkMenuVisibility();
  });

  document.addEventListener("click", (event) => {
    if (!isBulkMenuOpen) {
      return;
    }

    const target = event.target as Node | null;
    if (!target) {
      return;
    }

    if (options.bulkMenu.contains(target) || options.bulkMenuToggleButton.contains(target)) {
      return;
    }

    isBulkMenuOpen = false;
    updateBulkMenuVisibility();
  });

  options.routingModeButton.addEventListener("click", () => {
    options.onRoutingToggle();
    updateRoutingLabel();
  });

  options.zoomOutButton.addEventListener("click", () => {
    options.onZoomDelta(-0.1);
    updateZoomLabel();
  });

  options.zoomInButton.addEventListener("click", () => {
    options.onZoomDelta(0.1);
    updateZoomLabel();
  });

  options.zoomValue.addEventListener("click", () => {
    options.onZoomReset();
    updateZoomLabel();
  });

  options.themeToggleButton.addEventListener("click", () => {
    const nextTheme = options.onThemeToggle();
    applyTheme(nextTheme);
  });

  options.exportButton.addEventListener("click", triggerExport);

  options.importButton.addEventListener("click", triggerImport);

  options.roundtripButton.addEventListener("click", () => {
    try {
      const adapter = options.getCurrentAdapter();
      const start = performance.now();
      const exported = adapter.serialize(options.getCurrentGraph());
      const imported = adapter.deserialize(exported);
      options.loadGraph(imported);
      options.setCurrentGraph(imported);
      options.setDataText(exported);
      const elapsedMs = performance.now() - start;
      const sizeKb = getPayloadSizeKb(exported);
      options.setMetrics(`Exportgröße: ${formatKb(sizeKb)} | Roundtrip-Zeit: ${formatMs(elapsedMs)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      options.setMetrics(`Roundtrip fehlgeschlagen: ${message}`);
    }
  });

  applyTheme(options.getCurrentTheme());
  updateRoutingLabel();
  updateZoomLabel();
  updateBulkMenuVisibility();

  return {
    applyTheme,
    updateZoomLabel,
    updateRoutingLabel,
    triggerExport,
    triggerImport,
    handleEscape: () => {
      if (!isBulkMenuOpen) {
        return false;
      }
      isBulkMenuOpen = false;
      updateBulkMenuVisibility();
      return true;
    },
  };
};
