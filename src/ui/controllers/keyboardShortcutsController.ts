export type ShortcutContext = "graph" | "data";

interface KeyboardShortcutsControllerOptions {
  getLastShortcutContext: () => ShortcutContext;
  isCursorInsideGraph: () => boolean;
  isTypingTarget: (target: EventTarget | null) => boolean;
  onCopy: () => void;
  onPaste: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSaveGraphContext: () => void;
  onSaveDataContext: () => void;
  onSelectAll: () => void;
  onDeleteSelection: () => void;
  onClearSelection: () => void;
  onAddNodeAtCursor: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onEscape: () => boolean;
}

const isGraphShortcutContext = (
  isCursorInsideGraph: boolean,
  lastShortcutContext: ShortcutContext,
): boolean => isCursorInsideGraph || lastShortcutContext === "graph";

export const installKeyboardShortcutsController = (options: KeyboardShortcutsControllerOptions): (() => void) => {
  const onKeyDown = (event: KeyboardEvent): void => {
    const graphContext = isGraphShortcutContext(options.isCursorInsideGraph(), options.getLastShortcutContext());

    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "c") {
      if (graphContext) {
        event.preventDefault();
        options.onCopy();
      }
      return;
    }

    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "v") {
      if (graphContext) {
        event.preventDefault();
        options.onPaste();
      }
      return;
    }

    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "z") {
      if (graphContext) {
        event.preventDefault();
        options.onUndo();
      }
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
      if (graphContext) {
        event.preventDefault();
        options.onRedo();
      }
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      if (graphContext) {
        options.onSaveGraphContext();
      } else {
        options.onSaveDataContext();
      }
      return;
    }

    if (event.key === "Escape" && options.onEscape()) {
      return;
    }

    if (options.isTypingTarget(event.target)) {
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a" && options.isCursorInsideGraph()) {
      event.preventDefault();
      options.onSelectAll();
      return;
    }

    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      options.onDeleteSelection();
      return;
    }

    if (event.key === "Escape") {
      options.onClearSelection();
      return;
    }

    if (event.key.toLowerCase() === "n") {
      event.preventDefault();
      options.onAddNodeAtCursor();
      return;
    }

    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      options.onZoomIn();
      return;
    }

    if (event.key === "-") {
      event.preventDefault();
      options.onZoomOut();
      return;
    }

    if (event.key === "0") {
      event.preventDefault();
      options.onZoomReset();
    }
  };

  window.addEventListener("keydown", onKeyDown);
  return () => {
    window.removeEventListener("keydown", onKeyDown);
  };
};
