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

  updateVisibility();
  updateLineNumbers();

  return {
    setMetrics: (text) => {
      options.metrics.textContent = text;
    },
    setDataText: (value) => {
      options.dataText.value = value;
      updateLineNumbers();
    },
    getDataText: () => options.dataText.value,
  };
};
