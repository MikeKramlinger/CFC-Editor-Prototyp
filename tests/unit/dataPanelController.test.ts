// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { createDataPanelController } from "../../src/ui/controllers/dataPanelController.js";

const createFixture = () => {
  document.body.innerHTML = `
    <div id="layout">
      <button id="toggle" type="button"></button>
      <pre id="lines"></pre>
      <textarea id="data"></textarea>
      <p id="metrics"></p>
    </div>
  `;

  const layout = document.querySelector<HTMLElement>("#layout")!;
  const dataToggleButton = document.querySelector<HTMLButtonElement>("#toggle")!;
  const dataText = document.querySelector<HTMLTextAreaElement>("#data")!;
  const dataLines = document.querySelector<HTMLPreElement>("#lines")!;
  const metrics = document.querySelector<HTMLParagraphElement>("#metrics")!;

  createDataPanelController({
    layout,
    dataToggleButton,
    dataText,
    dataLines,
    metrics,
  });

  return { dataText };
};

describe("data panel controller", () => {
  it("expands selection by words with Ctrl+Shift+ArrowRight", () => {
    const { dataText } = createFixture();
    dataText.value = "eins zwei_drei! vier";
    dataText.focus();
    dataText.setSelectionRange(0, 0, "forward");

    dataText.dispatchEvent(new KeyboardEvent("keydown", {
      key: "ArrowRight",
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    }));

    expect(dataText.selectionStart).toBe(0);
    expect(dataText.selectionEnd).toBe(4);

    dataText.dispatchEvent(new KeyboardEvent("keydown", {
      key: "ArrowRight",
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    }));

    expect(dataText.selectionStart).toBe(0);
    expect(dataText.selectionEnd).toBe(14);
  });

  it("shrinks word selection with Ctrl+Shift+ArrowLeft", () => {
    const { dataText } = createFixture();
    dataText.value = "eins zwei_drei vier";
    dataText.focus();
    dataText.setSelectionRange(0, dataText.value.length, "forward");

    dataText.dispatchEvent(new KeyboardEvent("keydown", {
      key: "ArrowLeft",
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    }));

    expect(dataText.selectionStart).toBe(0);
    expect(dataText.selectionEnd).toBe(15);
  });
});
