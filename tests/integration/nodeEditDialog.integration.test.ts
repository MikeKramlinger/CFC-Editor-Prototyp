// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { createNodeEditDialogController } from "../../src/ui/controllers/nodeEditDialogController.js";
import { createNode } from "../unit/helpers.js";

describe("node edit dialog integration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("updates label and execution order on submit", () => {
    const canvas = document.createElement("div") as HTMLDivElement;
    const nodeLayer = document.createElement("div") as HTMLDivElement;
    document.body.append(canvas, nodeLayer);

    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 800,
      bottom: 600,
      width: 800,
      height: 600,
      toJSON: () => ({}),
    });

    const setExecutionOrderForNodeId = vi.fn();
    const onBeforeNodeUpdate = vi.fn();
    const onNodeUpdated = vi.fn();

    const controller = createNodeEditDialogController({
      canvas,
      nodeLayer,
      unitToPx: (value) => value * 10,
      getZoom: () => 1,
      getExecutionOrderByNodeId: () => 2,
      getExecutionOrderedNodeCount: () => 5,
      setExecutionOrderForNodeId,
      onBeforeNodeUpdate,
      onNodeUpdated,
    });

    const node = createNode("N1", "box", 2, 2, { label: "Old Name" });
    controller.open(node);

    const dialog = nodeLayer.querySelector(".cfc-node-edit-dialog") as HTMLDivElement;
    expect(dialog).not.toBeNull();

    const inputs = dialog.querySelectorAll<HTMLInputElement>("input");
    inputs[0]!.value = "New Name";
    inputs[1]!.value = "4";

    const form = dialog.querySelector("form") as HTMLFormElement;
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    expect(onBeforeNodeUpdate).toHaveBeenCalledWith(node);
    expect(node.label).toBe("New Name");
    expect(setExecutionOrderForNodeId).toHaveBeenCalledWith("N1", 4);
    expect(onNodeUpdated).toHaveBeenCalledWith(node);
    expect(nodeLayer.querySelector(".cfc-node-edit-dialog")).toBeNull();
  });

  it("closes dialog on cancel", () => {
    const canvas = document.createElement("div") as HTMLDivElement;
    const nodeLayer = document.createElement("div") as HTMLDivElement;
    document.body.append(canvas, nodeLayer);

    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 800,
      bottom: 600,
      width: 800,
      height: 600,
      toJSON: () => ({}),
    });

    const controller = createNodeEditDialogController({
      canvas,
      nodeLayer,
      unitToPx: (value) => value * 10,
      getZoom: () => 1,
      getExecutionOrderByNodeId: () => null,
      getExecutionOrderedNodeCount: () => 0,
      setExecutionOrderForNodeId: () => undefined,
      onBeforeNodeUpdate: () => undefined,
      onNodeUpdated: () => undefined,
    });

    controller.open(createNode("N2", "comment", 2, 2));

    const cancelButton = nodeLayer.querySelector("button[type='button']") as HTMLButtonElement;
    cancelButton.click();

    expect(nodeLayer.querySelector(".cfc-node-edit-dialog")).toBeNull();
  });
});
