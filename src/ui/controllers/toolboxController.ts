import type { CfcNodeTemplate, CfcNodeType } from "../../model.js";

interface ToolboxControllerOptions {
  workspace: HTMLDivElement;
  toolboxList: HTMLDivElement;
  toolboxToggleButton: HTMLButtonElement;
  templates: CfcNodeTemplate[];
  icons: Record<CfcNodeType, string>;
  initialSelectedType: CfcNodeType;
}

export interface ToolboxController {
  getSelectedType: () => CfcNodeType;
  setSelectedType: (type: CfcNodeType) => void;
  getDraggedType: () => CfcNodeType | null;
  clearDraggedType: () => void;
}

export const createToolboxController = (options: ToolboxControllerOptions): ToolboxController => {
  let selectedType: CfcNodeType = options.initialSelectedType;
  let isCollapsed = false;
  let draggedType: CfcNodeType | null = null;

  const updateSelection = (): void => {
    const items = options.toolboxList.querySelectorAll<HTMLButtonElement>(".toolbox-item");
    items.forEach((item) => {
      const isSelected = item.dataset.nodeType === selectedType;
      item.classList.toggle("active", isSelected);
      item.setAttribute("aria-pressed", isSelected ? "true" : "false");
    });
  };

  const updateVisibility = (): void => {
    options.workspace.classList.toggle("toolbox-collapsed", isCollapsed);
    options.toolboxToggleButton.textContent = isCollapsed ? ">" : "<";
    options.toolboxToggleButton.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
    options.toolboxToggleButton.setAttribute(
      "aria-label",
      isCollapsed ? "Toolbox ausklappen" : "Toolbox einklappen",
    );
  };

  options.templates.forEach((template) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "toolbox-item";
    item.draggable = true;
    item.dataset.nodeType = template.type;

    const icon = document.createElement("span");
    icon.className = "toolbox-item__icon";
    icon.textContent = options.icons[template.type] ?? "▣";

    const label = document.createElement("span");
    label.className = "toolbox-item__label";
    label.textContent = template.label;

    item.append(icon, label);

    item.addEventListener("dragstart", (event) => {
      selectedType = template.type;
      draggedType = template.type;
      updateSelection();
      event.dataTransfer?.setData("text/cfc-node-type", template.type);
      event.dataTransfer?.setData("text/plain", template.type);
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "copy";
      }
    });

    item.addEventListener("dragend", () => {
      draggedType = null;
    });

    item.addEventListener("click", () => {
      selectedType = template.type;
      updateSelection();
    });

    options.toolboxList.append(item);
  });

  options.toolboxToggleButton.addEventListener("click", () => {
    isCollapsed = !isCollapsed;
    updateVisibility();
  });

  updateSelection();
  updateVisibility();

  return {
    getSelectedType: () => selectedType,
    setSelectedType: (type) => {
      selectedType = type;
      updateSelection();
    },
    getDraggedType: () => draggedType,
    clearDraggedType: () => {
      draggedType = null;
    },
  };
};
