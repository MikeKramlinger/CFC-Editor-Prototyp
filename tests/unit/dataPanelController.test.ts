// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { createDataPanelController } from "../../src/ui/controllers/dataPanelController.js";

const createFixture = () => {
  document.body.innerHTML = `
    <div id="layout">
      <button id="toggle" type="button"></button>
      <button id="mode-model" type="button"></button>
      <button id="mode-declaration" type="button"></button>
      <div id="panel-model">
        <pre id="lines"></pre>
        <textarea id="data"></textarea>
      </div>
      <div id="panel-declaration" hidden>
        <pre id="declaration-lines"></pre>
        <pre id="declaration-syntax"></pre>
        <textarea id="declaration"></textarea>
      </div>
      <p id="metrics"></p>
    </div>
  `;

  const layout = document.querySelector<HTMLElement>("#layout")!;
  const dataToggleButton = document.querySelector<HTMLButtonElement>("#toggle")!;
  const dataModeModelButton = document.querySelector<HTMLButtonElement>("#mode-model")!;
  const dataModeDeclarationButton = document.querySelector<HTMLButtonElement>("#mode-declaration")!;
  const dataModelPanel = document.querySelector<HTMLDivElement>("#panel-model")!;
  const declarationPanel = document.querySelector<HTMLDivElement>("#panel-declaration")!;
  const dataText = document.querySelector<HTMLTextAreaElement>("#data")!;
  const dataLines = document.querySelector<HTMLPreElement>("#lines")!;
  const declarationText = document.querySelector<HTMLTextAreaElement>("#declaration")!;
  const declarationLines = document.querySelector<HTMLPreElement>("#declaration-lines")!;
  const declarationSyntax = document.querySelector<HTMLPreElement>("#declaration-syntax")!;
  const metrics = document.querySelector<HTMLParagraphElement>("#metrics")!;

  const controller = createDataPanelController({
    layout,
    dataToggleButton,
    dataModeModelButton,
    dataModeDeclarationButton,
    dataModelPanel,
    declarationPanel,
    dataText,
    dataLines,
    declarationText,
    declarationLines,
    declarationSyntax,
    metrics,
  });

  return {
    dataText,
    declarationText,
    dataModeModelButton,
    dataModeDeclarationButton,
    dataModelPanel,
    declarationPanel,
    controller,
  };
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

  it("switches between data model and declaration mode", () => {
    const { dataModeDeclarationButton, dataModeModelButton, dataModelPanel, declarationPanel, controller } = createFixture();

    expect(controller.getMode()).toBe("data-model");
    expect(dataModelPanel.hidden).toBe(false);
    expect(declarationPanel.hidden).toBe(true);

    dataModeDeclarationButton.click();

    expect(controller.getMode()).toBe("declaration");
    expect(dataModelPanel.hidden).toBe(true);
    expect(declarationPanel.hidden).toBe(false);

    dataModeModelButton.click();

    expect(controller.getMode()).toBe("data-model");
    expect(dataModelPanel.hidden).toBe(false);
    expect(declarationPanel.hidden).toBe(true);
  });

  it("prefills declaration editor with default PROGRAM block", () => {
    const { declarationText } = createFixture();

    expect(declarationText.value).toBe("PROGRAM CFC\nVAR\nEND_VAR");
  });
});
