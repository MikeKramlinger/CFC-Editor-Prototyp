import type { CfcNode } from "../../model.js";
import { createNodeElement } from "../views/nodeRendererUi.js";

interface RenderNodeLayerOptions {
  nodeLayer: HTMLDivElement;
  nodes: CfcNode[];
  selectedNodeIds: Set<string>;
  isInteractionLocked: boolean;
  snapPortYToInteger: boolean;
  getExecutionOrderByNodeId: (nodeId: string) => number | null;
  unitToPx: (value: number) => number;
  onOutputPortPointerDown: (nodeId: string, portId: string, clientX: number, clientY: number) => void;
  onInputPortPointerDown: (nodeId: string, portId: string, clientX: number, clientY: number) => void;
  onNodeDoubleClick: (node: CfcNode) => void;
  onNodePointerDown: (node: CfcNode, event: PointerEvent) => void;
}

export const renderNodeLayer = (options: RenderNodeLayerOptions): void => {
  options.nodeLayer.innerHTML = "";

  options.nodes.forEach((node) => {
    const nodeElement = createNodeElement(
      {
        node,
        executionOrder: options.getExecutionOrderByNodeId(node.id),
        selected: options.selectedNodeIds.has(node.id),
        interactive: !options.isInteractionLocked,
        leftPx: options.unitToPx(node.x),
        topPx: options.unitToPx(node.y),
        widthPx: options.unitToPx(node.width),
        heightPx: options.unitToPx(node.height),
        snapPortYToInteger: options.snapPortYToInteger,
      },
      {
        onOutputPortPointerDown: options.onOutputPortPointerDown,
        onInputPortPointerDown: options.onInputPortPointerDown,
      },
    );

    if (!options.isInteractionLocked) {
      nodeElement.addEventListener("dblclick", (event) => {
        event.stopPropagation();
        options.onNodeDoubleClick(node);
      });

      nodeElement.addEventListener("pointerdown", (event) => {
        options.onNodePointerDown(node, event);
      });
    }

    options.nodeLayer.append(nodeElement);
  });
};
