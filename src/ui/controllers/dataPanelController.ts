interface DataPanelControllerOptions {
  layout: HTMLElement;
  dataToggleButton: HTMLButtonElement;
  dataText: HTMLTextAreaElement;
  dataLines: HTMLPreElement;
  metrics: HTMLParagraphElement;
}

export interface DataPanelController {
  setMetrics: (text: string) => void;
  setDataText: (value: string) => void;
  getDataText: () => string;
}

const isWordLikeChar = (char: string): boolean => /[A-Za-z0-9_]/.test(char);

const isWhitespace = (char: string): boolean => /\s/.test(char);

const findPreviousSelectionBoundary = (text: string, index: number): number => {
  let cursor = Math.max(0, index);

  while (cursor > 0 && isWhitespace(text[cursor - 1] ?? "")) {
    cursor -= 1;
  }

  if (cursor > 0 && isWordLikeChar(text[cursor - 1] ?? "")) {
    while (cursor > 0 && isWordLikeChar(text[cursor - 1] ?? "")) {
      cursor -= 1;
    }
    return cursor;
  }

  while (
    cursor > 0 &&
    !isWhitespace(text[cursor - 1] ?? "") &&
    !isWordLikeChar(text[cursor - 1] ?? "")
  ) {
    cursor -= 1;
  }

  return cursor;
};

const findNextSelectionBoundary = (text: string, index: number): number => {
  const length = text.length;
  let cursor = Math.min(length, index);

  while (cursor < length && isWhitespace(text[cursor] ?? "")) {
    cursor += 1;
  }

  if (cursor < length && isWordLikeChar(text[cursor] ?? "")) {
    while (cursor < length && isWordLikeChar(text[cursor] ?? "")) {
      cursor += 1;
    }
    return cursor;
  }

  while (cursor < length && !isWhitespace(text[cursor] ?? "") && !isWordLikeChar(text[cursor] ?? "")) {
    cursor += 1;
  }

  return cursor;
};

export const createDataPanelController = (options: DataPanelControllerOptions): DataPanelController => {
  let isExpanded = false;
  let wordSelectionAnchor: number | null = null;

  const updateVisibility = (): void => {
    options.layout.classList.toggle("data-expanded", isExpanded);
    options.dataToggleButton.textContent = isExpanded ? "⤡" : "⤢";
    options.dataToggleButton.setAttribute("aria-expanded", isExpanded ? "true" : "false");
    options.dataToggleButton.setAttribute(
      "aria-label",
      isExpanded ? "Datenbereich einziehen" : "Datenbereich vergrößern",
    );
  };

  const updateLineNumbers = (): void => {
    const lineCount = Math.max(1, options.dataText.value.split("\n").length);
    options.dataLines.textContent = Array.from({ length: lineCount }, (_, index) => String(index + 1)).join("\n");
    options.dataLines.scrollTop = options.dataText.scrollTop;
  };

  options.dataToggleButton.addEventListener("click", () => {
    isExpanded = !isExpanded;
    updateVisibility();
  });

  options.dataText.addEventListener("input", () => {
    updateLineNumbers();
  });

  options.dataText.addEventListener("scroll", () => {
    options.dataLines.scrollTop = options.dataText.scrollTop;
  });

  options.dataText.addEventListener("keydown", (event) => {
    const isWordSelectionShortcut =
      (event.ctrlKey || event.metaKey) &&
      event.shiftKey &&
      (event.key === "ArrowLeft" || event.key === "ArrowRight");

    if (isWordSelectionShortcut) {
      event.preventDefault();
      options.dataText.focus();

      const currentStart = options.dataText.selectionStart;
      const currentEnd = options.dataText.selectionEnd;

      if (wordSelectionAnchor === null) {
        if (currentStart === currentEnd) {
          wordSelectionAnchor = currentStart;
        } else {
          wordSelectionAnchor = options.dataText.selectionDirection === "backward" ? currentEnd : currentStart;
        }
      }

      const anchor = wordSelectionAnchor;
      const focus = anchor <= currentStart ? currentEnd : currentStart;
      const nextFocus = event.key === "ArrowLeft"
        ? findPreviousSelectionBoundary(options.dataText.value, focus)
        : findNextSelectionBoundary(options.dataText.value, focus);
      const nextStart = Math.min(anchor, nextFocus);
      const nextEnd = Math.max(anchor, nextFocus);
      const nextDirection: "forward" | "backward" = nextFocus < anchor ? "backward" : "forward";

      options.dataText.setSelectionRange(nextStart, nextEnd, nextDirection);
      return;
    }

    wordSelectionAnchor = null;

    if (event.key !== "Tab") {
      return;
    }

    event.preventDefault();
    options.dataText.focus();

    const insertedViaCommand = typeof document.execCommand === "function"
      ? document.execCommand("insertText", false, "\t")
      : false;

    if (!insertedViaCommand) {
      const start = options.dataText.selectionStart;
      const end = options.dataText.selectionEnd;
      options.dataText.setRangeText("\t", start, end, "end");
    }

    updateLineNumbers();
  });

  options.dataText.addEventListener("pointerdown", () => {
    wordSelectionAnchor = null;
  });

  options.dataText.addEventListener("blur", () => {
    wordSelectionAnchor = null;
  });

  updateVisibility();
  updateLineNumbers();

  return {
    setMetrics: (text) => {
      options.metrics.textContent = text;
    },
    setDataText: (value) => {
      const isFocused = document.activeElement === options.dataText;
      const previousSelectionStart = options.dataText.selectionStart;
      const previousSelectionEnd = options.dataText.selectionEnd;
      const previousScrollTop = options.dataText.scrollTop;
      const previousScrollLeft = options.dataText.scrollLeft;

      options.dataText.value = value;

      if (isFocused) {
        const maxIndex = options.dataText.value.length;
        const nextSelectionStart = Math.min(previousSelectionStart, maxIndex);
        const nextSelectionEnd = Math.min(previousSelectionEnd, maxIndex);
        options.dataText.setSelectionRange(nextSelectionStart, nextSelectionEnd);
      }

      options.dataText.scrollTop = previousScrollTop;
      options.dataText.scrollLeft = previousScrollLeft;
      updateLineNumbers();
    },
    getDataText: () => options.dataText.value,
  };
};
