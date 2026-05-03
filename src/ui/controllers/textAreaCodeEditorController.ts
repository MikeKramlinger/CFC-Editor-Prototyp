interface TextAreaCodeEditorControllerOptions {
  textArea: HTMLTextAreaElement;
  lineNumbers: HTMLPreElement;
  highlightLayer?: HTMLElement;
  highlightKeywords?: string[];
}

export interface TextAreaCodeEditorController {
  updateLineNumbers: () => void;
  setText: (value: string) => void;
  getText: () => string;
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

const highlightKeywordsInLayer = (text: string, keywords: string[], layer: HTMLElement): void => {
  if (!keywords || keywords.length === 0) {
    layer.innerHTML = "";
    return;
  }

  const escapeHtml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Create a regex that matches whole words only (case-insensitive)
  const keywordPattern = keywords.map((kw) => kw.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")).join("|");
  const regex = new RegExp(`\\b(${keywordPattern})\\b`, "gi");

  // Walk through matches and build escaped HTML, wrapping matched keywords
  const parts: (string | { keyword: true; text: string })[] = [];
  let lastIndex = 0;

  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    const match = m[0];
    const offset = m.index;
    if (offset > lastIndex) {
      parts.push(text.slice(lastIndex, offset));
    }
    parts.push({ keyword: true, text: match });
    lastIndex = offset + match.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  const html = parts
    .map((part) => {
      if (typeof part === "string") {
        // escape non-keyword parts and preserve newlines
        return escapeHtml(part).split("\n").join("<br>");
      }
      return `<span class="syntax-keyword">${escapeHtml(part.text)}</span>`;
    })
    .join("");

  layer.innerHTML = html;
  layer.scrollTop = (layer.parentElement as HTMLElement)?.querySelector("textarea")?.scrollTop ?? 0;
};

export const createTextAreaCodeEditorController = (
  options: TextAreaCodeEditorControllerOptions,
): TextAreaCodeEditorController => {
  let wordSelectionAnchor: number | null = null;

  const updateLineNumbers = (): void => {
    const lineCount = Math.max(1, options.textArea.value.split("\n").length);
    options.lineNumbers.textContent = Array.from({ length: lineCount }, (_, index) => String(index + 1)).join("\n");
    options.lineNumbers.scrollTop = options.textArea.scrollTop;
  };

  options.textArea.addEventListener("input", () => {
    updateLineNumbers();
    if (options.highlightLayer && options.highlightKeywords) {
      highlightKeywordsInLayer(options.textArea.value, options.highlightKeywords, options.highlightLayer);
    }
  });

  options.textArea.addEventListener("scroll", () => {
    options.lineNumbers.scrollTop = options.textArea.scrollTop;
    if (options.highlightLayer) {
      options.highlightLayer.scrollTop = options.textArea.scrollTop;
    }
  });

  options.textArea.addEventListener("keydown", (event) => {
    const isWordSelectionShortcut =
      (event.ctrlKey || event.metaKey) &&
      event.shiftKey &&
      (event.key === "ArrowLeft" || event.key === "ArrowRight");

    if (isWordSelectionShortcut) {
      event.preventDefault();
      options.textArea.focus();

      const currentStart = options.textArea.selectionStart;
      const currentEnd = options.textArea.selectionEnd;

      if (wordSelectionAnchor === null) {
        if (currentStart === currentEnd) {
          wordSelectionAnchor = currentStart;
        } else {
          wordSelectionAnchor = options.textArea.selectionDirection === "backward" ? currentEnd : currentStart;
        }
      }

      const anchor = wordSelectionAnchor;
      const focus = anchor <= currentStart ? currentEnd : currentStart;
      const nextFocus = event.key === "ArrowLeft"
        ? findPreviousSelectionBoundary(options.textArea.value, focus)
        : findNextSelectionBoundary(options.textArea.value, focus);
      const nextStart = Math.min(anchor, nextFocus);
      const nextEnd = Math.max(anchor, nextFocus);
      const nextDirection: "forward" | "backward" = nextFocus < anchor ? "backward" : "forward";

      options.textArea.setSelectionRange(nextStart, nextEnd, nextDirection);
      return;
    }

    wordSelectionAnchor = null;

    if (event.key === "Tab") {
      event.preventDefault();
      options.textArea.focus();

      if (event.shiftKey) {
        outdentSelectedLines(options.textArea);
      } else {
        indentSelectedLines(options.textArea);
      }

      updateLineNumbers();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      options.textArea.focus();
      insertNewLineWithAutoIndent(options.textArea);
      updateLineNumbers();
    }
  });

  options.textArea.addEventListener("pointerdown", () => {
    wordSelectionAnchor = null;
  });

  options.textArea.addEventListener("blur", () => {
    wordSelectionAnchor = null;
  });

  updateLineNumbers();
  if (options.highlightLayer && options.highlightKeywords) {
    highlightKeywordsInLayer(options.textArea.value, options.highlightKeywords, options.highlightLayer);
  }

  return {
    updateLineNumbers,
    setText: (value) => {
      const isFocused = document.activeElement === options.textArea;
      const previousSelectionStart = options.textArea.selectionStart;
      const previousSelectionEnd = options.textArea.selectionEnd;
      const previousScrollTop = options.textArea.scrollTop;
      const previousScrollLeft = options.textArea.scrollLeft;

      options.textArea.value = value;

      if (isFocused) {
        const maxIndex = options.textArea.value.length;
        const nextSelectionStart = Math.min(previousSelectionStart, maxIndex);
        const nextSelectionEnd = Math.min(previousSelectionEnd, maxIndex);
        options.textArea.setSelectionRange(nextSelectionStart, nextSelectionEnd);
      }

      options.textArea.scrollTop = previousScrollTop;
      options.textArea.scrollLeft = previousScrollLeft;
      updateLineNumbers();
      if (options.highlightLayer && options.highlightKeywords) {
        highlightKeywordsInLayer(options.textArea.value, options.highlightKeywords, options.highlightLayer);
      }
    },
    getText: () => options.textArea.value,
  };
};
