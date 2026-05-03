import type { CfcNode } from "../../model.js";
import type { Variable } from "../../declarations/index.js";
import { getCompatibleVariables } from "../../declarations/index.js";
import { createNodeEditDialog } from "../views/nodeEditDialogUi.js";

interface NodeEditDialogControllerOptions {
  canvas: HTMLDivElement;
  nodeLayer: HTMLDivElement;
  unitToPx: (value: number) => number;
  getZoom: () => number;
  getExecutionOrderByNodeId: (nodeId: string) => number | null;
  getExecutionOrderedNodeCount: () => number;
  setExecutionOrderForNodeId: (nodeId: string, nextOrder: number) => void;
  onBeforeNodeUpdate: (node: CfcNode) => void;
  onNodeUpdated: (node: CfcNode) => void;
  getAvailableVariables?: () => Variable[];
  onNodeDeclarationRenamed?: (oldName: string, newName: string) => void;
}

export interface NodeEditDialogController {
  open: (node: CfcNode) => void;
  close: () => void;
}

export const createNodeEditDialogController = (
  options: NodeEditDialogControllerOptions,
): NodeEditDialogController => {
  let activeDialog: HTMLDivElement | null = null;

  const close = (): void => {
    activeDialog?.remove();
    activeDialog = null;
  };

  const positionDialog = (
    dialog: HTMLDivElement,
    anchorCenterXPx: number,
    anchorTopPx: number,
    anchorBottomPx: number,
  ): void => {
    const viewportMargin = 8;
    const safeZoom = Math.max(0.0001, options.getZoom());

    const applyPlacement = (placement: "above" | "below"): DOMRect => {
      dialog.style.left = `${anchorCenterXPx}px`;
      dialog.style.top = `${placement === "above" ? anchorTopPx : anchorBottomPx}px`;
      dialog.style.transform = placement === "above" ? "translate(-50%, -100%)" : "translate(-50%, 0)";
      return dialog.getBoundingClientRect();
    };

    const canvasRect = options.canvas.getBoundingClientRect();
    let placement: "above" | "below" = "above";
    let dialogRect = applyPlacement(placement);

    if (dialogRect.top < canvasRect.top + viewportMargin) {
      placement = "below";
      dialogRect = applyPlacement(placement);
    }

    if (placement === "below" && dialogRect.bottom > canvasRect.bottom - viewportMargin) {
      const aboveRect = applyPlacement("above");
      const belowOverflow = dialogRect.bottom - (canvasRect.bottom - viewportMargin);
      const aboveOverflow = Math.max(0, canvasRect.top + viewportMargin - aboveRect.top);
      if (aboveOverflow <= belowOverflow) {
        placement = "above";
        dialogRect = aboveRect;
      }
    }

    let nextLeftPx = anchorCenterXPx;
    if (dialogRect.left < canvasRect.left + viewportMargin) {
      const deltaScreenPx = canvasRect.left + viewportMargin - dialogRect.left;
      nextLeftPx += deltaScreenPx / safeZoom;
    } else if (dialogRect.right > canvasRect.right - viewportMargin) {
      const deltaScreenPx = dialogRect.right - (canvasRect.right - viewportMargin);
      nextLeftPx -= deltaScreenPx / safeZoom;
    }

    let nextTopPx = placement === "above" ? anchorTopPx : anchorBottomPx;
    dialog.style.left = `${nextLeftPx}px`;
    dialog.style.top = `${nextTopPx}px`;
    dialog.style.transform = placement === "above" ? "translate(-50%, -100%)" : "translate(-50%, 0)";
    dialogRect = dialog.getBoundingClientRect();

    if (dialogRect.top < canvasRect.top + viewportMargin) {
      const deltaScreenPx = canvasRect.top + viewportMargin - dialogRect.top;
      nextTopPx += deltaScreenPx / safeZoom;
      dialog.style.top = `${nextTopPx}px`;
      dialogRect = dialog.getBoundingClientRect();
    }

    if (dialogRect.bottom > canvasRect.bottom - viewportMargin) {
      const deltaScreenPx = dialogRect.bottom - (canvasRect.bottom - viewportMargin);
      nextTopPx -= deltaScreenPx / safeZoom;
      dialog.style.top = `${nextTopPx}px`;
    }
  };

  const open = (node: CfcNode): void => {
    close();
    const executionOrder = options.getExecutionOrderByNodeId(node.id);
    const nodeCenterXPx = options.unitToPx(node.x + node.width / 2);
    const nodeTopPx = options.unitToPx(node.y);
    const nodeBottomPx = options.unitToPx(node.y + node.height);

    // Provide compatible variables so the dialog can show Declaration dropdown
    const availableVariables = options.getAvailableVariables?.() ?? [];
    const compatibleVariables = getCompatibleVariables(node.type, availableVariables);

    const dialogHandle = createNodeEditDialog({
      initialLabel: node.label,
      executionOrder,
      maxExecutionOrder: options.getExecutionOrderedNodeCount(),
      leftPx: nodeCenterXPx,
      topPx: nodeTopPx,
      compatibleVariables,
      onCancel: () => {
        close();
      },
      onSubmit: ({ label, executionOrder: nextExecutionOrder, typeName }) => {
        options.onBeforeNodeUpdate(node);

        if (label.length > 0) {
          const previousLabel = node.label;
          node.label = label;

          // Only call renaming callback if the new label is NOT an existing variable in declarations
          // If it's an existing variable, it's a "reassignment", not a "rename"
          if (previousLabel !== label && options.onNodeDeclarationRenamed) {
            const isExistingVariable = compatibleVariables.some((v) => v.name === label);
            if (!isExistingVariable) {
              options.onNodeDeclarationRenamed(previousLabel, label);
            }
          }

          if (typeName) {
            node.typeName = typeName;
          }
        }

        if (nextExecutionOrder !== null) {
          options.setExecutionOrderForNodeId(node.id, nextExecutionOrder);
        }

        close();
        options.onNodeUpdated(node);
      },
    });

    activeDialog = dialogHandle.dialog;
    options.nodeLayer.append(dialogHandle.dialog);
    positionDialog(dialogHandle.dialog, nodeCenterXPx, nodeTopPx, nodeBottomPx);
    dialogHandle.focusPrimaryInput();
  };

  return {
    open,
    close,
  };
};
