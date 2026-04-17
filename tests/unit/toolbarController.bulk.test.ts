/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi } from "vitest";
import { createToolbarController } from "../../src/ui/controllers/toolbarController.js";

function createElement<T extends HTMLElement>(tag: string): T {
  return document.createElement(tag) as T;
}

function createConnectionModeGroup(): HTMLFieldSetElement {
  const group = createElement<HTMLFieldSetElement>("fieldset");
  group.id = "bulk-connection-mode-group";

  const createOption = (value: string, checked: boolean): HTMLInputElement => {
    const input = createElement<HTMLInputElement>("input");
    input.type = "radio";
    input.name = "bulk-connection-mode";
    input.value = value;
    input.checked = checked;
    group.append(input);
    return input;
  };

  createOption("count", true);
  createOption("single-target", false);
  createOption("all-to-all", false);

  return group;
}

const createBaseOptions = () => {
  const bulkMenuToggleButton = createElement<HTMLButtonElement>("button");
  const bulkMenu = createElement<HTMLDivElement>("div");
  const bulkBoxCountInput = createElement<HTMLInputElement>("input");
  bulkBoxCountInput.type = "number";
  const bulkConnectionModeGroup = createConnectionModeGroup();
  const bulkConnectionCountLabel = createElement<HTMLLabelElement>("label");
  bulkConnectionCountLabel.setAttribute("for", "bulk-connection-count");
  bulkMenu.append(bulkConnectionCountLabel);
  const bulkConnectionCountInput = createElement<HTMLInputElement>("input");
  bulkConnectionCountInput.id = "bulk-connection-count";
  bulkConnectionCountInput.type = "number";
  bulkMenu.append(bulkConnectionCountInput);
  const bulkTypeDetails = createElement<HTMLDetailsElement>("details");
  const bulkTypeCounts = createElement<HTMLDivElement>("div");
  const bulkCreateButton = createElement<HTMLButtonElement>("button");

  const exportButton = createElement<HTMLButtonElement>("button");
  const importButton = createElement<HTMLButtonElement>("button");
  const roundtripButton = createElement<HTMLButtonElement>("button");
  const routingModeButton = createElement<HTMLButtonElement>("button");
  const themeToggleButton = createElement<HTMLButtonElement>("button");
  const zoomOutButton = createElement<HTMLButtonElement>("button");
  const zoomInButton = createElement<HTMLButtonElement>("button");
  const zoomValue = createElement<HTMLSpanElement>("span");

  const onBulkCreate = vi.fn();
  const onBulkCreateInvalid = vi.fn();

  const options = {
    exportButton,
    importButton,
    roundtripButton,
    routingModeButton,
    bulkMenuToggleButton,
    bulkMenu,
    themeToggleButton,
    zoomOutButton,
    zoomInButton,
    zoomValue,
    bulkBoxCountInput,
    bulkConnectionModeGroup,
    bulkConnectionCountInput,
    bulkTypeDetails,
    bulkTypeCounts,
    bulkCreateButton,
    bulkTypeOptions: [
      { type: "box", label: "Box" },
      { type: "input", label: "Input" },
    ],
    onRoutingToggle: () => "astar",
    getRoutingMode: () => "astar",
    onZoomDelta: () => undefined,
    onZoomReset: () => undefined,
    getZoomPercent: () => 100,
    onBulkCreate,
    onBulkCreateInvalid,
    getCurrentTheme: () => "light",
    onThemeToggle: () => "light",
    getCurrentAdapter: () => ({ serialize: () => "", deserialize: () => ({ version: "1.0", nodes: [], connections: [] }) }),
    getCurrentGraph: () => ({ version: "1.0", nodes: [], connections: [] }),
    setCurrentGraph: () => undefined,
    loadGraph: () => undefined,
    getDataText: () => "",
    setDataText: () => undefined,
    setMetrics: () => undefined,
  } as unknown as Parameters<typeof createToolbarController>[0];

  return {
    options,
    onBulkCreate,
    onBulkCreateInvalid,
    bulkBoxCountInput,
    bulkConnectionCountInput,
    bulkConnectionModeGroup,
    bulkConnectionCountLabel,
    bulkTypeDetails,
    bulkTypeCounts,
    bulkCreateButton,
  };
};

describe("ToolbarController bulk create", () => {
  it("normalizes data text on import when serialized graph differs", () => {
    const {
      options,
    } = createBaseOptions();

    const inputText = "raw-import-text";
    const normalizedText = "normalized-export-text";
    const parsedGraph = { version: "1.0", nodes: [], connections: [] };
    const setDataText = vi.fn();

    options.getCurrentAdapter = () => ({
      serialize: () => normalizedText,
      deserialize: () => parsedGraph,
      id: "json",
      label: "JSON",
      fileExtension: "json",
    });
    options.getDataText = () => inputText;
    options.getCurrentGraph = () => parsedGraph;
    options.setDataText = setDataText;

    createToolbarController(options);
    options.importButton.click();

    expect(setDataText).toHaveBeenCalledWith(normalizedText);
  });

  it("shows and enables connection count controls in manual mode by default", () => {
    const {
      options,
      bulkConnectionCountLabel,
      bulkConnectionCountInput,
    } = createBaseOptions();

    createToolbarController(options);

    expect(bulkConnectionCountLabel.hidden).toBe(false);
    expect(bulkConnectionCountInput.hidden).toBe(false);
    expect(bulkConnectionCountInput.disabled).toBe(false);
  });

  it("calls onBulkCreateInvalid when box count is zero", () => {
    const {
      options,
      onBulkCreate,
      onBulkCreateInvalid,
      bulkBoxCountInput,
      bulkConnectionCountInput,
      bulkCreateButton,
    } = createBaseOptions();

    bulkBoxCountInput.value = "0"; // invalid
    bulkConnectionCountInput.value = "0";

    createToolbarController(options);

    // Simulate click
    bulkCreateButton.click();

    expect(onBulkCreateInvalid).toHaveBeenCalled();
    expect(onBulkCreate).not.toHaveBeenCalled();
  });

  it("calls onBulkCreate when box count is positive", () => {
    const {
      options,
      onBulkCreate,
      onBulkCreateInvalid,
      bulkBoxCountInput,
      bulkConnectionCountInput,
      bulkCreateButton,
    } = createBaseOptions();

    bulkBoxCountInput.value = "5"; // valid
    bulkConnectionCountInput.value = "2";

    createToolbarController(options);

    bulkCreateButton.click();

    expect(onBulkCreate).toHaveBeenCalledWith(5, 2, {}, "count");
    expect(onBulkCreateInvalid).not.toHaveBeenCalled();
  });

  it("passes configured type counts when advanced menu is open", () => {
    const {
      options,
      onBulkCreate,
      onBulkCreateInvalid,
      bulkBoxCountInput,
      bulkConnectionCountInput,
      bulkTypeDetails,
      bulkTypeCounts,
      bulkCreateButton,
    } = createBaseOptions();

    bulkBoxCountInput.value = "6";
    bulkConnectionCountInput.value = "1";
    bulkTypeDetails.open = true;

    createToolbarController(options);

    const inputs = bulkTypeCounts.querySelectorAll<HTMLInputElement>("input[data-node-type]");
    const boxInput = Array.from(inputs).find((input) => input.dataset.nodeType === "box");
    const inputInput = Array.from(inputs).find((input) => input.dataset.nodeType === "input");
    if (boxInput) {
      boxInput.value = "4";
    }
    if (inputInput) {
      inputInput.value = "2";
    }

    bulkCreateButton.click();

    expect(onBulkCreate).toHaveBeenCalledWith(6, 1, { box: 4, input: 2 }, "count");
    expect(onBulkCreateInvalid).not.toHaveBeenCalled();
  });

  it("passes selected non-manual connection mode and disables connection count input", () => {
    const {
      options,
      onBulkCreate,
      onBulkCreateInvalid,
      bulkBoxCountInput,
      bulkConnectionCountLabel,
      bulkConnectionCountInput,
      bulkConnectionModeGroup,
      bulkCreateButton,
    } = createBaseOptions();

    bulkBoxCountInput.value = "3";
    bulkConnectionCountInput.value = "99";

    createToolbarController(options);

    const allToAll = bulkConnectionModeGroup.querySelector<HTMLInputElement>('input[value="all-to-all"]');
    if (allToAll) {
      allToAll.checked = true;
    }
    bulkConnectionModeGroup.dispatchEvent(new Event("change"));
    expect(bulkConnectionCountLabel.hidden).toBe(true);
    expect(bulkConnectionCountInput.hidden).toBe(true);
    expect(bulkConnectionCountInput.disabled).toBe(true);

    bulkCreateButton.click();

    expect(onBulkCreate).toHaveBeenCalledWith(3, 99, {}, "all-to-all");
    expect(onBulkCreateInvalid).not.toHaveBeenCalled();
  });

  it("shows and enables connection count controls again after switching back to manual", () => {
    const {
      options,
      bulkConnectionCountLabel,
      bulkConnectionCountInput,
      bulkConnectionModeGroup,
    } = createBaseOptions();

    createToolbarController(options);

    const singleTarget = bulkConnectionModeGroup.querySelector<HTMLInputElement>('input[value="single-target"]');
    if (singleTarget) {
      singleTarget.checked = true;
      bulkConnectionModeGroup.dispatchEvent(new Event("change"));
    }

    const manual = bulkConnectionModeGroup.querySelector<HTMLInputElement>('input[value="count"]');
    if (manual) {
      manual.checked = true;
      bulkConnectionModeGroup.dispatchEvent(new Event("change"));
    }

    expect(bulkConnectionCountLabel.hidden).toBe(false);
    expect(bulkConnectionCountInput.hidden).toBe(false);
    expect(bulkConnectionCountInput.disabled).toBe(false);
  });
});
