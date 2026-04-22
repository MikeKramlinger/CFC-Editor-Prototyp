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

  it("inserts spaces to next tab stop on Tab at caret", () => {
    const { dataText } = createFixture();
    dataText.value = "abc";
    dataText.focus();
    dataText.setSelectionRange(1, 1, "forward");

    dataText.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    }));

    expect(dataText.value).toBe("a bc");
    expect(dataText.selectionStart).toBe(2);
    expect(dataText.selectionEnd).toBe(2);
  });

  it("inserts full indent width when already on a tab stop", () => {
    const { dataText } = createFixture();
    dataText.value = "abcd";
    dataText.focus();
    dataText.setSelectionRange(2, 2, "forward");

    dataText.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    }));

    expect(dataText.value).toBe("ab  cd");
    expect(dataText.selectionStart).toBe(4);
    expect(dataText.selectionEnd).toBe(4);
  });

  it("indents selected lines on Tab", () => {
    const { dataText } = createFixture();
    dataText.value = "line1\nline2";
    dataText.focus();
    dataText.setSelectionRange(0, dataText.value.length, "forward");

    dataText.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    }));

    expect(dataText.value).toBe("  line1\n  line2");
  });

  it("outdents selected lines on Shift+Tab", () => {
    const { dataText } = createFixture();
    dataText.value = "  line1\n  line2";
    dataText.focus();
    dataText.setSelectionRange(0, dataText.value.length, "forward");

    dataText.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    }));

    expect(dataText.value).toBe("line1\nline2");
  });

  it("keeps indentation on Enter", () => {
    const { dataText } = createFixture();
    dataText.value = "  nodeA --> nodeB";
    dataText.focus();
    dataText.setSelectionRange(dataText.value.length, dataText.value.length, "forward");

    dataText.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    }));

    expect(dataText.value).toBe("  nodeA --> nodeB\n  ");
  });
});
