export interface NodeEditDialogSubmitPayload {
  label: string;
  executionOrder: number | null;
}

export interface NodeEditDialogOptions {
  initialLabel: string;
  executionOrder: number | null;
  maxExecutionOrder: number;
  leftPx: number;
  topPx: number;
  onCancel: () => void;
  onSubmit: (payload: NodeEditDialogSubmitPayload) => void;
}

export interface NodeEditDialogHandle {
  dialog: HTMLDivElement;
  focusPrimaryInput: () => void;
}

export const createNodeEditDialog = (options: NodeEditDialogOptions): NodeEditDialogHandle => {
  const dialog = document.createElement("div");
  dialog.className = "cfc-node-edit-dialog";
  dialog.style.pointerEvents = "auto";

  const form = document.createElement("form");
  form.className = "cfc-node-edit-form";

  const labelField = document.createElement("label");
  labelField.className = "cfc-node-edit-field";
  labelField.textContent = "Name";

  const nameInput = document.createElement("input");
  nameInput.className = "cfc-node-edit-input";
  nameInput.type = "text";
  nameInput.value = options.initialLabel;
  labelField.append(nameInput);

  form.append(labelField);

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

  const actions = document.createElement("div");
  actions.className = "cfc-node-edit-actions";

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.textContent = "Abbrechen";

  const saveButton = document.createElement("button");
  saveButton.type = "submit";
  saveButton.textContent = "Übernehmen";

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
    options.onSubmit({
      label: nameInput.value.trim(),
      executionOrder: hasExecutionOrder && !Number.isNaN(parsedOrder) ? parsedOrder : null,
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
