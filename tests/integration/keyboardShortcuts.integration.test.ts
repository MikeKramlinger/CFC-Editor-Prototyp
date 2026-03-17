// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  installKeyboardShortcutsController,
  type ShortcutContext,
} from "../../src/ui/controllers/keyboardShortcutsController.js";

const createKeyboardOptions = (overrides: Partial<Parameters<typeof installKeyboardShortcutsController>[0]> = {}) => {
  let context: ShortcutContext = "graph";

  const callbacks = {
    onCopy: vi.fn(),
    onPaste: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onSaveGraphContext: vi.fn(),
    onSaveDataContext: vi.fn(),
    onSelectAll: vi.fn(),
    onDeleteSelection: vi.fn(),
    onClearSelection: vi.fn(),
    onAddNodeAtCursor: vi.fn(),
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onZoomReset: vi.fn(),
    onEscape: vi.fn(() => false),
  };

  const options: Parameters<typeof installKeyboardShortcutsController>[0] = {
    getLastShortcutContext: () => context,
    isCursorInsideGraph: () => false,
    isTypingTarget: () => false,
    ...callbacks,
    ...overrides,
  };

  return {
    options,
    callbacks,
    setContext: (next: ShortcutContext) => {
      context = next;
    },
  };
};

describe("keyboard shortcuts integration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("routes Ctrl+S to data import in data context", () => {
    const { options, callbacks, setContext } = createKeyboardOptions();
    setContext("data");
    const dispose = installKeyboardShortcutsController(options);

    const event = new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true, cancelable: true });
    window.dispatchEvent(event);

    expect(callbacks.onSaveDataContext).toHaveBeenCalledTimes(1);
    expect(callbacks.onSaveGraphContext).not.toHaveBeenCalled();
    dispose();
  });

  it("routes Ctrl+S to graph export in graph context", () => {
    const { options, callbacks } = createKeyboardOptions({ isCursorInsideGraph: () => true });
    const dispose = installKeyboardShortcutsController(options);

    const event = new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true, cancelable: true });
    window.dispatchEvent(event);

    expect(callbacks.onSaveGraphContext).toHaveBeenCalledTimes(1);
    expect(callbacks.onSaveDataContext).not.toHaveBeenCalled();
    dispose();
  });

  it("does not run destructive shortcuts while typing", () => {
    const input = document.createElement("input");
    document.body.append(input);

    const { options, callbacks } = createKeyboardOptions({
      isTypingTarget: (target) => target === input,
      isCursorInsideGraph: () => true,
    });
    const dispose = installKeyboardShortcutsController(options);

    const event = new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true });
    input.dispatchEvent(event);

    expect(callbacks.onDeleteSelection).not.toHaveBeenCalled();
    dispose();
  });

  it("prevents duplicate escape handling when toolbar consumes escape", () => {
    const onEscape = vi.fn(() => true);
    const { options, callbacks } = createKeyboardOptions({ onEscape });
    const dispose = installKeyboardShortcutsController(options);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(callbacks.onClearSelection).not.toHaveBeenCalled();
    dispose();
  });

  it("ignores Ctrl+C when graph context is inactive", () => {
    const { options, callbacks, setContext } = createKeyboardOptions({ isCursorInsideGraph: () => false });
    setContext("data");
    const dispose = installKeyboardShortcutsController(options);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "c", ctrlKey: true, bubbles: true }));

    expect(callbacks.onCopy).not.toHaveBeenCalled();
    dispose();
  });

  it("resets zoom for Numpad0 shortcut", () => {
    const { options, callbacks } = createKeyboardOptions();
    const dispose = installKeyboardShortcutsController(options);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "0", code: "Numpad0", bubbles: true }));

    expect(callbacks.onZoomReset).toHaveBeenCalledTimes(1);
    dispose();
  });
});
