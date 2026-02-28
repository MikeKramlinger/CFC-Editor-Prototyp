/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi } from "vitest";
import { createToolbarController } from "../../src/ui/controllers/toolbarController.js";

function createElement<T extends HTMLElement>(tag: string): T {
  return document.createElement(tag) as T;
}

describe("ToolbarController bulk create", () => {
  it("calls onBulkCreateInvalid when box count is zero", () => {
    // Prepare DOM elements
    const bulkMenuToggleButton = createElement<HTMLButtonElement>("button");
    const bulkMenu = createElement<HTMLDivElement>("div");
    const bulkBoxCountInput = createElement<HTMLInputElement>("input");
    bulkBoxCountInput.type = "number";
    bulkBoxCountInput.value = "0"; // invalid
    const bulkConnectionCountInput = createElement<HTMLInputElement>("input");
    bulkConnectionCountInput.type = "number";
    bulkConnectionCountInput.value = "0";
    const bulkCreateButton = createElement<HTMLButtonElement>("button");

    // Minimal other elements used by controller
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
      bulkConnectionCountInput,
      bulkCreateButton,
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

    // Create controller which wires events
    const controller = createToolbarController(options);

    // Simulate click
    bulkCreateButton.click();

    expect(onBulkCreateInvalid).toHaveBeenCalled();
    expect(onBulkCreate).not.toHaveBeenCalled();
  });

  it("calls onBulkCreate when box count is positive", () => {
    const bulkMenuToggleButton = createElement<HTMLButtonElement>("button");
    const bulkMenu = createElement<HTMLDivElement>("div");
    const bulkBoxCountInput = createElement<HTMLInputElement>("input");
    bulkBoxCountInput.type = "number";
    bulkBoxCountInput.value = "5"; // valid
    const bulkConnectionCountInput = createElement<HTMLInputElement>("input");
    bulkConnectionCountInput.type = "number";
    bulkConnectionCountInput.value = "2";
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
      bulkConnectionCountInput,
      bulkCreateButton,
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

    createToolbarController(options);

    bulkCreateButton.click();

    expect(onBulkCreate).toHaveBeenCalledWith(5, 2);
    expect(onBulkCreateInvalid).not.toHaveBeenCalled();
  });
});
