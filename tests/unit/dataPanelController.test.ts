// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
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

  it("shows inline declaration errors with tooltip metadata", () => {
    const { declarationText, controller } = createFixture();

    declarationText.value = [
      "PROGRAM CFC",
      "VAR",
      "    bad name : FB_OK;",
      "    okName : FB Type;",
      "END_VAR",
    ].join("\n");

    declarationText.dispatchEvent(new Event("input", { bubbles: true }));

    expect(controller.getDeclarations().isValid).toBe(false);
    const syntax = document.querySelector<HTMLPreElement>("#declaration-syntax")!;
    expect(syntax.innerHTML).toContain("declaration-error");
    expect(syntax.innerHTML).toContain("Invalid variable name: bad name");
    expect(syntax.innerHTML).toContain("Invalid derived type name: FB Type");
  });

  it("shows multiple inline errors on the same declaration line", () => {
    const { declarationText, controller } = createFixture();

    declarationText.value = [
      "PROGRAM CFC",
      "VAR",
      "    Box 1_0 : Box 1;",
      "END_VAR",
    ].join("\n");

    declarationText.dispatchEvent(new Event("input", { bubbles: true }));

    expect(controller.getDeclarations().isValid).toBe(false);
    const syntax = document.querySelector<HTMLPreElement>("#declaration-syntax")!;
    expect(syntax.innerHTML.match(/declaration-error/g)?.length).toBe(2);
    expect(syntax.innerHTML).toContain("Invalid variable name: Box 1_0");
    expect(syntax.innerHTML).toContain("Invalid derived type name: Box 1");
  });

  it("moves the caret to an error when clicking the highlighted text", () => {
    const { declarationText } = createFixture();

    declarationText.value = [
      "PROGRAM CFC",
      "VAR",
      "    Box 1_0 : Box 1;",
      "END_VAR",
    ].join("\n");

    declarationText.dispatchEvent(new Event("input", { bubbles: true }));

    const line = document.querySelectorAll<HTMLElement>("#declaration-syntax .declaration-line")[2]!;
    vi.spyOn(line, "getBoundingClientRect").mockReturnValue({
      x: 100,
      y: 20,
      left: 100,
      top: 20,
      right: 300,
      bottom: 40,
      width: 200,
      height: 20,
      toJSON: () => ({}),
    });

    const syntaxError = document.querySelector<HTMLSpanElement>("#declaration-syntax .declaration-error")!;
    syntaxError.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, clientX: 185 }),
    );

    expect(document.activeElement).toBe(declarationText);
    expect(declarationText.selectionStart).toBeGreaterThan(declarationText.value.indexOf("Box 1_0"));
    expect(declarationText.selectionStart).toBe(declarationText.selectionEnd);
  });
});
