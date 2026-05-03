import { type CfcNodeType, isCfcNodeType } from "../../model.js";

export interface BulkTypeSpec {
  type: CfcNodeType;
  label: string;
}

export interface BulkController {
  readTypeCounts: () => Partial<Record<CfcNodeType, number>>;
  dispose: () => void;
}

export const createBulkController = (
  container: HTMLDivElement,
  typeOptions: BulkTypeSpec[],
  resetButton?: HTMLButtonElement,
): BulkController => {
  const build = (): void => {
    const fragment = document.createDocumentFragment();
    typeOptions.forEach((option) => {
      const id = `bulk-type-${option.type.replace(/[^a-z0-9]+/gi, "-")}`;
      const label = document.createElement("label");
      label.setAttribute("for", id);
      label.textContent = option.label;

      const input = document.createElement("input");
      input.id = id;
      input.type = "number";
      input.min = "0";
      input.step = "1";
      input.value = "0";
      input.dataset.nodeType = option.type;

      fragment.append(label, input);
    });
    container.replaceChildren(fragment);
  };

  const readTypeCounts = (): Partial<Record<CfcNodeType, number>> => {
    const counts: Partial<Record<CfcNodeType, number>> = {};
    const inputs = container.querySelectorAll<HTMLInputElement>("input[data-node-type]");
    inputs.forEach((input) => {
      const nodeType = input.dataset.nodeType;
      if (!nodeType || !isCfcNodeType(nodeType)) {
        return;
      }
      const count = Math.max(0, Number.parseInt(input.value || "0", 10) || 0);
      if (count > 0) {
        counts[nodeType] = count;
      }
    });
    return counts;
  };

  const resetHandler = (): void => {
    const inputs = container.querySelectorAll<HTMLInputElement>("input[data-node-type]");
    inputs.forEach((input) => {
      input.value = "0";
    });
  };

  build();
  if (resetButton) {
    resetButton.addEventListener("click", resetHandler);
  }

  return {
    readTypeCounts,
    dispose: () => {
      if (resetButton) {
        resetButton.removeEventListener("click", resetHandler);
      }
    },
  };
};
