import type { CfcFormatAdapter } from "../../formats/types.js";
import { getNodeTemplateByType, isCfcNodeType, type CfcGraph, type CfcNodeType } from "../../model.js";

type UiTheme = "light" | "dark";
type RoutingMode = "astar" | "bezier";

interface ThemeLabel {
  text: string;
  ariaLabel: string;
}

interface BulkTypeOption {
  type: CfcNodeType;
  label: string;
}

type BulkConnectionMode = "count" | "single-target" | "all-to-all";

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
  bulkConnectionModeGroup: HTMLFieldSetElement;
  bulkConnectionCountInput: HTMLInputElement;
  bulkTypeDetails: HTMLDetailsElement;
  bulkTypeCounts: HTMLDivElement;
  bulkTypeResetButton?: HTMLButtonElement;
  bulkCreateButton: HTMLButtonElement;
  bulkTypeOptions: BulkTypeOption[];
  onRoutingToggle: () => RoutingMode;
  getRoutingMode: () => RoutingMode;
  onZoomDelta: (delta: number) => void;
  onZoomReset: () => void;
  getZoomPercent: () => number;
  onBulkCreate: (
    boxCount: number,
    connectionCount: number,
    typeCounts: Partial<Record<CfcNodeType, number>>,
    connectionMode: BulkConnectionMode,
  ) => void;
  onBulkCreateInvalid: () => void;
  getCurrentTheme: () => UiTheme;
  onThemeToggle: () => UiTheme;
  getThemeLabel?: (theme: UiTheme) => ThemeLabel;
  getRoutingLabel?: (mode: RoutingMode) => string;
  formatExportMetric?: (sizeKb: number) => string;
  formatRoundtripMetric?: (sizeKb: number, elapsedMs: number) => string;
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

const hasNodeBelowMinimumSize = (graph: CfcGraph): boolean =>
  graph.nodes.some((node) => {
    const template = getNodeTemplateByType(node.type);
    return node.width < template.width || node.height < template.height;
  });

const buildBulkTypeCountInputs = (
  container: HTMLDivElement,
  options: BulkTypeOption[],
): void => {
  const fragment = document.createDocumentFragment();
  options.forEach((option) => {
    const id = `bulk-type-${option.type.replace(/[^a-z0-9]+/gi, "-")}`;
    const label = document.createElement("label");
    label.setAttribute("for", id);
    label.textContent = option.label;

    const input = document.createElement("input");
    input.id = id;
    input.type = "number";
    input.min = "0";
    input.step = "1";
    input.value = "0";
    input.dataset.nodeType = option.type;

    fragment.append(label, input);
  });
  container.replaceChildren(fragment);
};

const readBulkTypeCounts = (container: HTMLDivElement): Partial<Record<CfcNodeType, number>> => {
  const counts: Partial<Record<CfcNodeType, number>> = {};
  const inputs = container.querySelectorAll<HTMLInputElement>("input[data-node-type]");
  inputs.forEach((input) => {
    const nodeType = input.dataset.nodeType;
    if (!nodeType || !isCfcNodeType(nodeType)) {
      return;
    }
    const count = parseNonNegativeInt(input.value, 0);
    if (count > 0) {
      counts[nodeType] = count;
    }
  });
  return counts;
};

const isBulkConnectionMode = (value: string): value is BulkConnectionMode =>
  value === "count" || value === "single-target" || value === "all-to-all";

const getSelectedBulkConnectionMode = (container: HTMLFieldSetElement): BulkConnectionMode => {
  const checked = container.querySelector<HTMLInputElement>('input[name="bulk-connection-mode"]:checked');
  const value = checked?.value ?? "count";
  return isBulkConnectionMode(value) ? value : "count";
};

export const createToolbarController = (options: ToolbarControllerOptions): ToolbarController => {
  let isBulkMenuOpen = false;
  const bulkConnectionCountLabel = options.bulkMenu.querySelector<HTMLLabelElement>('label[for="bulk-connection-count"]');

  buildBulkTypeCountInputs(options.bulkTypeCounts, options.bulkTypeOptions);

  const updateConnectionCountAvailability = (): void => {
    const mode = getSelectedBulkConnectionMode(options.bulkConnectionModeGroup);
    const isManualCount = mode === "count";
    if (bulkConnectionCountLabel) {
      bulkConnectionCountLabel.hidden = !isManualCount;
    }
    options.bulkConnectionCountInput.hidden = !isManualCount;
    options.bulkConnectionCountInput.disabled = !isManualCount;
    options.bulkConnectionCountInput.setAttribute("aria-disabled", isManualCount ? "false" : "true");
  };

  const triggerExport = (): void => {
    const adapter = options.getCurrentAdapter();
    const payload = adapter.serialize(options.getCurrentGraph());
    options.setDataText(payload);
    const sizeKb = getPayloadSizeKb(payload);
    options.setMetrics(options.formatExportMetric?.(sizeKb) ?? `Exportgröße: ${sizeKb.toFixed(2)} KB`);
  };

  const triggerImport = (): void => {
    try {
      const adapter = options.getCurrentAdapter();
      const graph = adapter.deserialize(options.getDataText());
      const shouldSyncDataText = hasNodeBelowMinimumSize(graph);
      options.loadGraph(graph);
      const normalizedGraph = options.getCurrentGraph();
      options.setCurrentGraph(normalizedGraph);
      if (shouldSyncDataText) {
        options.setDataText(adapter.serialize(normalizedGraph));
      }
    } catch (error) {
      return;
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
    options.routingModeButton.textContent = options.getRoutingLabel?.(mode) ?? (mode === "bezier" ? "Routing: Bezier" : "Routing: CFC");
  };

  const applyTheme = (theme: UiTheme): void => {
    document.body.setAttribute("data-theme", theme);
    const isDark = theme === "dark";
    const label = options.getThemeLabel?.(theme)
      ?? {
        text: isDark ? "☀️ Light" : "🌙 Dark",
        ariaLabel: isDark ? "Light Theme aktivieren" : "Dark Theme aktivieren",
      };
    options.themeToggleButton.textContent = label.text;
    options.themeToggleButton.setAttribute("aria-pressed", isDark ? "true" : "false");
    options.themeToggleButton.setAttribute("aria-label", label.ariaLabel);
  };

  options.bulkMenuToggleButton.addEventListener("click", () => {
    isBulkMenuOpen = !isBulkMenuOpen;
    updateBulkMenuVisibility();
  });

  options.bulkCreateButton.addEventListener("click", () => {
    const boxCount = parseNonNegativeInt(options.bulkBoxCountInput.value, 0);
    const connectionCount = parseNonNegativeInt(options.bulkConnectionCountInput.value, 0);
    const typeCounts = options.bulkTypeDetails.open
      ? readBulkTypeCounts(options.bulkTypeCounts)
      : {};
    const connectionMode = getSelectedBulkConnectionMode(options.bulkConnectionModeGroup);
    if (boxCount <= 0) {
      options.onBulkCreateInvalid();
      return;
    }
    options.onBulkCreate(boxCount, connectionCount, typeCounts, connectionMode);
    isBulkMenuOpen = false;
    updateBulkMenuVisibility();
  });

  options.bulkTypeResetButton?.addEventListener("click", () => {
    const inputs = options.bulkTypeCounts.querySelectorAll<HTMLInputElement>('input[data-node-type]');
    inputs.forEach((input) => {
      input.value = "0";
    });
  });

  options.bulkConnectionModeGroup.addEventListener("change", () => {
    updateConnectionCountAvailability();
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
      options.setMetrics(
        options.formatRoundtripMetric?.(sizeKb, elapsedMs)
          ?? `Exportgröße: ${sizeKb.toFixed(2)} KB | Roundtrip-Zeit: ${elapsedMs.toFixed(2)} ms`,
      );
    } catch (error) {
      return;
    }
  });

  applyTheme(options.getCurrentTheme());
  updateRoutingLabel();
  updateZoomLabel();
  updateConnectionCountAvailability();
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
