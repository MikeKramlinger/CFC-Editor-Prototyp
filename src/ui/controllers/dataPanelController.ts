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

export const createDataPanelController = (options: DataPanelControllerOptions): DataPanelController => {
  let isExpanded = false;

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
