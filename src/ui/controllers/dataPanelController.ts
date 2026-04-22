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

const INDENT_SIZE = 2;
const INDENT_UNIT = " ".repeat(INDENT_SIZE);

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

const getLineStart = (text: string, index: number): number => {
  const clampedIndex = Math.max(0, Math.min(index, text.length));
  return text.lastIndexOf("\n", clampedIndex - 1) + 1;
};

const getSpacesToNextTabStop = (text: string, caretIndex: number): number => {
  const lineStart = getLineStart(text, caretIndex);
  const column = Math.max(0, caretIndex - lineStart);
  const remainder = column % INDENT_SIZE;
  return remainder === 0 ? INDENT_SIZE : INDENT_SIZE - remainder;
};

const getLineRangeForSelection = (
  text: string,
  selectionStart: number,
  selectionEnd: number,
): { start: number; end: number } => {
  const start = getLineStart(text, selectionStart);

  const hasSelection = selectionEnd > selectionStart;
  const endAnchor = hasSelection && text[selectionEnd - 1] === "\n"
    ? selectionEnd - 1
    : selectionEnd;
  const lineEndBreak = text.indexOf("\n", Math.max(start, endAnchor));
  const end = lineEndBreak >= 0 ? lineEndBreak : text.length;

  return { start, end };
};

const replaceTextRange = (
  textarea: HTMLTextAreaElement,
  start: number,
  end: number,
  replacement: string,
  fallbackSelectMode: SelectionMode,
): void => {
  textarea.setSelectionRange(start, end, "forward");

  const insertedViaCommand = typeof document.execCommand === "function"
    ? document.execCommand("insertText", false, replacement)
    : false;

  if (!insertedViaCommand) {
    textarea.setRangeText(replacement, start, end, fallbackSelectMode);
  }
};

const indentSelectedLines = (textarea: HTMLTextAreaElement): void => {
  const value = textarea.value;
  const selectionStart = textarea.selectionStart;
  const selectionEnd = textarea.selectionEnd;

  if (selectionStart === selectionEnd) {
    const spacesToInsert = getSpacesToNextTabStop(value, selectionStart);
    replaceTextRange(textarea, selectionStart, selectionEnd, " ".repeat(spacesToInsert), "end");
    return;
  }

  const range = getLineRangeForSelection(value, selectionStart, selectionEnd);
  const selectedBlock = value.slice(range.start, range.end);
  const lineCount = selectedBlock.length === 0 ? 1 : selectedBlock.split("\n").length;
  const indented = selectedBlock.split("\n").map((line) => `${INDENT_UNIT}${line}`).join("\n");

  replaceTextRange(textarea, range.start, range.end, indented, "select");
  const nextStart = selectionStart + INDENT_UNIT.length;
  const nextEnd = selectionEnd + INDENT_UNIT.length * lineCount;
  textarea.setSelectionRange(nextStart, nextEnd, "forward");
};

const outdentSelectedLines = (textarea: HTMLTextAreaElement): void => {
  const value = textarea.value;
  const selectionStart = textarea.selectionStart;
  const selectionEnd = textarea.selectionEnd;
  const range = getLineRangeForSelection(value, selectionStart, selectionEnd);
  const selectedBlock = value.slice(range.start, range.end);
  const lines = selectedBlock.split("\n");

  const removedByLine: number[] = [];
  const outdented = lines
    .map((line) => {
      const leadingSpaces = line.match(/^ +/)?.[0].length ?? 0;
      const toRemove = Math.min(INDENT_UNIT.length, leadingSpaces);
      removedByLine.push(toRemove);
      return line.slice(toRemove);
    })
    .join("\n");

  replaceTextRange(textarea, range.start, range.end, outdented, "select");

  const firstLineStart = range.start;
  const firstRemoved = removedByLine[0] ?? 0;

  if (selectionStart === selectionEnd) {
    const offsetInLine = selectionStart - firstLineStart;
    const nextCaret = firstLineStart + Math.max(0, offsetInLine - firstRemoved);
    textarea.setSelectionRange(nextCaret, nextCaret, "forward");
    return;
  }

  const nextStart = Math.max(firstLineStart, selectionStart - Math.min(firstRemoved, selectionStart - firstLineStart));
  const totalRemoved = removedByLine.reduce((sum, current) => sum + current, 0);
  const nextEnd = Math.max(nextStart, selectionEnd - totalRemoved);
  textarea.setSelectionRange(nextStart, nextEnd, "forward");
};

const insertNewLineWithAutoIndent = (textarea: HTMLTextAreaElement): void => {
  const value = textarea.value;
  const selectionStart = textarea.selectionStart;
  const selectionEnd = textarea.selectionEnd;
  const lineStart = getLineStart(value, selectionStart);
  const currentLinePrefix = value.slice(lineStart, selectionStart);
  const indent = currentLinePrefix.match(/^[ \t]*/)?.[0] ?? "";
  replaceTextRange(textarea, selectionStart, selectionEnd, `\n${indent}`, "end");
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

    if (event.key === "Tab") {
      event.preventDefault();
      options.dataText.focus();

      if (event.shiftKey) {
        outdentSelectedLines(options.dataText);
      } else {
        indentSelectedLines(options.dataText);
      }

      updateLineNumbers();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      options.dataText.focus();
      insertNewLineWithAutoIndent(options.dataText);
      updateLineNumbers();
    }
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
