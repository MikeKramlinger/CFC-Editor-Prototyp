import { getStoredLanguage, t, type UiLanguage } from "../../i18n.js";
let currentLanguage: UiLanguage = getStoredLanguage() ?? "en";

export interface NodeEditDialogSubmitPayload {
  label: string;
  executionOrder: number | null;
  typeName?: string;
}

export interface NodeEditDialogOptions {
  initialLabel: string;
  executionOrder: number | null;
  maxExecutionOrder: number;
  leftPx: number;
  topPx: number;
  compatibleVariables?: import("../../declarations/index.js").Variable[];
  onCancel: () => void;
  onSubmit: (payload: NodeEditDialogSubmitPayload) => void;
}

export interface NodeEditDialogHandle {
  dialog: HTMLDivElement;
  focusPrimaryInput: () => void;
}

export const createNodeEditDialog = (options: NodeEditDialogOptions): NodeEditDialogHandle => {
  currentLanguage = getStoredLanguage() ?? "en";

  const dialog = document.createElement("div");
  dialog.className = "cfc-node-edit-dialog";
  dialog.style.pointerEvents = "auto";

  const form = document.createElement("form");
  form.className = "cfc-node-edit-form";

  // Name/Label Input
  const labelField = document.createElement("label");
  labelField.className = "cfc-node-edit-field";
  labelField.textContent = "Name";

  const nameInput = document.createElement("input");
  nameInput.className = "cfc-node-edit-input";
  nameInput.type = "text";
  nameInput.value = options.initialLabel;
  labelField.append(nameInput);

  form.append(labelField);

  // Deklarations-Dropdown (immer anzeigen) - keep single Name field
  const vars = options.compatibleVariables ?? [];
  let declarationSelect: HTMLSelectElement | null = null;
  {
    const declarationField = document.createElement("label");
    declarationField.className = "cfc-node-edit-field";
    declarationField.textContent = "Declaration";

    declarationSelect = document.createElement("select");
    declarationSelect.className = "cfc-node-edit-input";

    const emptyOption = document.createElement("option");
    emptyOption.value = "";
    emptyOption.textContent = "— None —";
    declarationSelect.append(emptyOption);
    for (const variable of vars) {
      const option = document.createElement("option");
      option.value = variable.name;
      option.textContent = `${variable.name} : ${variable.type}`;
      // Pre-select if this matches the initial label
      if (variable.name === options.initialLabel) {
        option.selected = true;
      }
      declarationSelect.append(option);
    }

    // When a declaration is selected, update the Name field. If none selected, keep existing.
    declarationSelect.addEventListener("change", () => {
      const selected = declarationSelect!.value;
      if (!selected) {
        return;
      }
      const variable = vars.find((v) => v.name === selected);
      if (!variable) return;
      // Show instanceName in Name field (instanceName == declaration name)
      nameInput.value = variable.name;
    });

    declarationField.append(declarationSelect);
    form.append(declarationField);
  }

  // Execution Order (optional)
  const hasExecutionOrder = options.executionOrder !== null;
  const orderInput = document.createElement("input");
  if (hasExecutionOrder) {
    const orderField = document.createElement("label");
    orderField.className = "cfc-node-edit-field";
    orderField.textContent = "Execution Order";

    orderInput.className = "cfc-node-edit-input";
    orderInput.type = "number";
    orderInput.min = "1";
    orderInput.max = String(options.maxExecutionOrder);
    orderInput.step = "1";
    orderInput.value = String(options.executionOrder);
    orderField.append(orderInput);
    form.append(orderField);
  }

  // Aktionen
  const actions = document.createElement("div");
  actions.className = "cfc-node-edit-actions";

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.textContent = t(currentLanguage, "cancelButton");

  const saveButton = document.createElement("button");
  saveButton.type = "submit";
  saveButton.textContent = t(currentLanguage, "applyButton");

  actions.append(cancelButton, saveButton);
  form.append(actions);
  dialog.append(form);

  dialog.style.left = `${options.leftPx}px`;
  dialog.style.top = `${options.topPx}px`;

  dialog.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });

  cancelButton.addEventListener("click", () => {
    options.onCancel();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const parsedOrder = Number.parseInt(orderInput.value, 10);
    const currentName = nameInput.value.trim();
    const selectedVariable = currentName
      ? vars.find((v) => v.name === currentName)
      : undefined;
    const isDerived = selectedVariable && !selectedVariable.isElementary;

    options.onSubmit({
      label: currentName,
      executionOrder: hasExecutionOrder && !Number.isNaN(parsedOrder) ? parsedOrder : null,
      typeName: isDerived ? selectedVariable!.type : undefined,
    });
  });

  return {
    dialog,
    focusPrimaryInput: () => {
      nameInput.focus();
      nameInput.select();
    },
  };
};
