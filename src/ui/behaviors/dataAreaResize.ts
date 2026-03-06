interface DataAreaResizeOptions {
  resizer: HTMLDivElement;
  dataEditor: HTMLDivElement;
  storageKey: string;
  minHeightPx?: number;
  maxHeightViewportRatio?: number;
}

const clampDataEditorHeight = (height: number, minHeightPx: number, maxHeightViewportRatio: number): number => {
  const maxHeight = Math.max(minHeightPx, Math.round(window.innerHeight * maxHeightViewportRatio));
  return Math.max(minHeightPx, Math.min(maxHeight, Math.round(height)));
};

export const installDataAreaResize = (options: DataAreaResizeOptions): void => {
  const minHeightPx = options.minHeightPx ?? 140;
  const maxHeightViewportRatio = options.maxHeightViewportRatio ?? 0.7;

  const applyDataEditorHeight = (height: number, persist = true): void => {
    const clamped = clampDataEditorHeight(height, minHeightPx, maxHeightViewportRatio);
    document.documentElement.style.setProperty("--data-editor-height", `${clamped}px`);
    if (persist) {
      localStorage.setItem(options.storageKey, String(clamped));
    }
  };

  const raw = localStorage.getItem(options.storageKey);
  if (raw) {
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isNaN(parsed)) {
      applyDataEditorHeight(parsed, false);
    }
  }

  let dragStartY = 0;
  let dragStartHeight = 0;

  const onPointerMove = (event: PointerEvent): void => {
    const deltaY = dragStartY - event.clientY;
    applyDataEditorHeight(dragStartHeight + deltaY);
  };

  const stopDrag = (pointerId: number): void => {
    if (options.resizer.hasPointerCapture(pointerId)) {
      options.resizer.releasePointerCapture(pointerId);
    }
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerCancel);
    document.body.style.userSelect = "";
  };

  const onPointerUp = (event: PointerEvent): void => {
    stopDrag(event.pointerId);
  };

  const onPointerCancel = (event: PointerEvent): void => {
    stopDrag(event.pointerId);
  };

  options.resizer.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    dragStartY = event.clientY;
    dragStartHeight = options.dataEditor.getBoundingClientRect().height;
    options.resizer.setPointerCapture(event.pointerId);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    document.body.style.userSelect = "none";
  });
};