import type { UiLanguage, UiResourceKey } from "../../i18n.js";
import type { CfcGraph, CfcNode, CfcNodeType } from "../../model.js";

export type Translator = (lang: UiLanguage, key: UiResourceKey) => string;

export interface EditorPage {
  id: string;
  name: string;
  description: string;
  graph: CfcGraph;
}

export type PlcopenPageArea = "contentLeft" | "content" | "contentRight";

export interface PlcopenPageMeta {
  name: string;
  description: string;
  marginWidth: number;
  width: number;
  height: number;
}

export interface PlcopenPagedNode extends CfcNode {
  pageId?: number;
  pageArea?: PlcopenPageArea;
}

export interface PlcopenPagedGraph extends CfcGraph {
  pages?: PlcopenPageMeta[];
}

export interface PageBounds {
  maxX: number;
  maxY: number;
  marginWidth: number;
}

export interface PageControllerUi {
  pagePanel: HTMLElement;
  pageList: HTMLElement;
  pageHeader: HTMLElement | null;
  graphStage: HTMLElement;
  workspace: HTMLElement;
  canvas: HTMLElement;
}

export interface PageControllerOptions {
  ui: PageControllerUi;
  bounds: PageBounds;
  getEditorMode: () => "normal" | "paged";
  isQuizModeActive: () => boolean;
  getPages: () => EditorPage[];
  getActivePageId: () => string | null;
  onActivatePage: (pageId: string) => void;
  onInsertPageAt: (index: number) => void;
  resolveDraggedNodeType: () => CfcNodeType | null;
  isAllowedBorderType: (nodeType: CfcNodeType, side: "left" | "right") => boolean;
  onDropBorderNode: (nodeType: CfcNodeType, side: "left" | "right", unitY: number) => void;
  onClearDraggedType: () => void;
  t: Translator;
  getLanguage: () => UiLanguage;
}

export interface PageController {
  renderPages: () => void;
  renderBorderAreaNodes: () => void;
  getBorderAreas: () => { left: HTMLElement | null; right: HTMLElement | null };
  updateBorderAreaLabels: () => void;
}

export const getPageAreaForNode = (node: CfcNode, bounds: PageBounds): PlcopenPageArea => {
  if (node.borderSide === "left") {
    return "contentLeft";
  }
  if (node.borderSide === "right") {
    return "contentRight";
  }
  if (node.x + node.width <= bounds.marginWidth) {
    return "contentLeft";
  }
  if (node.x >= bounds.maxX - bounds.marginWidth) {
    return "contentRight";
  }
  return "content";
};

export const createPageController = (options: PageControllerOptions): PageController => {
  let graphLeftBorder: HTMLElement | null = null;
  let graphRightBorder: HTMLElement | null = null;

  const updateBorderAreaLabels = (): void => {
    if (graphLeftBorder) {
      graphLeftBorder.setAttribute(
        "aria-label",
        options.t(options.getLanguage(), "graphLeftBorderAriaLabel"),
      );
    }
    if (graphRightBorder) {
      graphRightBorder.setAttribute(
        "aria-label",
        options.t(options.getLanguage(), "graphRightBorderAriaLabel"),
      );
    }
  };

  const registerBorderDropArea = (element: HTMLElement, side: "left" | "right"): void => {
    element.addEventListener("dragover", (event: DragEvent) => {
      const nodeType = options.resolveDraggedNodeType();
      if (!nodeType || !options.isAllowedBorderType(nodeType, side)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
      }
    });

    element.addEventListener("drop", (event: DragEvent) => {
      const nodeType = options.resolveDraggedNodeType();
      if (!nodeType || !options.isAllowedBorderType(nodeType, side)) {
        options.onClearDraggedType();
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      options.onClearDraggedType();
      options.onDropBorderNode(nodeType, side, options.bounds.maxY / 2);
      renderBorderAreaNodes();
    });
  };

  const createGraphBorderArea = (side: "left" | "right"): HTMLElement => {
    const borderArea = document.createElement("aside");
    borderArea.className = `graph-border-area graph-border-area--${side}`;
    borderArea.setAttribute(
      "aria-label",
      options.t(options.getLanguage(), side === "left" ? "graphLeftBorderAriaLabel" : "graphRightBorderAriaLabel"),
    );
    registerBorderDropArea(borderArea, side);

    // Make the border area part of the editor content so it scales with pan/zoom.
    borderArea.style.position = "absolute";
    borderArea.style.top = "0";
    borderArea.style.width = `calc(var(--grid-size) * ${options.bounds.marginWidth})`;
    borderArea.style.height = `calc(var(--grid-size) * ${options.bounds.maxY})`;
    borderArea.style.zIndex = "3";
    borderArea.style.pointerEvents = "none";
    if (side === "left") {
      borderArea.style.left = `calc(var(--grid-size) * 0)`;
    } else {
      borderArea.style.left = `calc(var(--grid-size) * ${options.bounds.maxX - options.bounds.marginWidth})`;
    }
    return borderArea;
  };

  const mountGraphBorderAreas = (): void => {
    if (!options.ui.pageHeader || !options.ui.canvas) {
      return;
    }

    if (!graphLeftBorder) {
      graphLeftBorder = createGraphBorderArea("left");
    }
    if (!graphRightBorder) {
      graphRightBorder = createGraphBorderArea("right");
    }

    const graphLayer = options.ui.canvas.querySelector(".cfc-graph-layer");
    const contentLayer = graphLayer ? graphLayer.querySelector("div") : null;
    if (contentLayer) {
      if (!graphLeftBorder.parentElement) {
        contentLayer.appendChild(graphLeftBorder);
      }
      if (!graphRightBorder.parentElement) {
        contentLayer.appendChild(graphRightBorder);
      }
    } else {
      if (!graphLeftBorder.parentElement) {
        options.ui.graphStage.insertBefore(graphLeftBorder, options.ui.canvas);
      }
      if (!graphRightBorder.parentElement) {
        options.ui.graphStage.insertBefore(
          graphRightBorder,
          options.ui.graphStage.querySelector("#quiz-preview-resizer") ?? null,
        );
      }
    }
  };

  const unmountGraphBorderAreas = (): void => {
    graphLeftBorder?.remove();
    graphRightBorder?.remove();
  };

  const renderBorderAreaNodes = (): void => {
    // In paged mode we don't render nodes into the aside panels to avoid duplicate
    // DOM elements and to keep nodes inside the editor's `nodeLayer` so they are
    // fully interactive (select/drag/routing). Clear the side containers.
    if (!graphLeftBorder || !graphRightBorder) return;
    graphLeftBorder.replaceChildren();
    graphRightBorder.replaceChildren();
  };

  const renderPages = (): void => {
    const isPagedMode = options.getEditorMode() === "paged";
    options.ui.pagePanel.hidden = !isPagedMode;
    if (options.ui.pageHeader) options.ui.pageHeader.hidden = !isPagedMode;
    options.ui.graphStage.classList.toggle("page-mode", isPagedMode);
    options.ui.workspace.classList.toggle("page-mode", isPagedMode);

    if (isPagedMode) {
      mountGraphBorderAreas();
      renderBorderAreaNodes();
    } else {
      unmountGraphBorderAreas();
    }

    options.ui.pageList.replaceChildren();
    if (!isPagedMode) {
      return;
    }

    const appendDropZone = (insertIndex: number): void => {
      const dropZone = document.createElement("div");
      dropZone.className = "page-drop-zone";
      dropZone.dataset.insertIndex = String(insertIndex);
      dropZone.addEventListener("dragover", (event) => {
        if (options.getEditorMode() !== "paged" || options.isQuizModeActive()) {
          return;
        }
        event.preventDefault();
        dropZone.classList.add("is-over");
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = "copy";
        }
      });
      dropZone.addEventListener("dragleave", () => {
        dropZone.classList.remove("is-over");
      });
      dropZone.addEventListener("drop", (event) => {
        if (options.getEditorMode() !== "paged" || options.isQuizModeActive()) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        dropZone.classList.remove("is-over");
        const draggedType = event.dataTransfer?.getData("text/plain");
        if (draggedType === "new-page") {
          options.onInsertPageAt(insertIndex);
        }
      });
      options.ui.pageList.append(dropZone);
    };

    appendDropZone(0);

    options.getPages().forEach((page, index) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "page-item";
      item.dataset.pageId = page.id;
      item.textContent = page.name;
      const isActive = page.id === options.getActivePageId();
      item.classList.toggle("active", isActive);
      item.setAttribute("aria-selected", isActive ? "true" : "false");
      item.setAttribute("role", "tab");
      item.disabled = options.isQuizModeActive();
      item.addEventListener("click", () => {
        if (page.id === options.getActivePageId()) {
          return;
        }
        options.onActivatePage(page.id);
        renderPages();
      });
      options.ui.pageList.append(item);
      appendDropZone(index + 1);
    });
  };

  return {
    renderPages,
    renderBorderAreaNodes,
    getBorderAreas: () => ({ left: graphLeftBorder, right: graphRightBorder }),
    updateBorderAreaLabels,
  };
};
