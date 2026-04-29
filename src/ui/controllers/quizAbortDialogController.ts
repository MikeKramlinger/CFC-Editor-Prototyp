import type { QuizAbortDialogUiElements } from "../views/quizAbortDialogUi.js";

interface QuizAbortDialogControllerOptions {
  ui: QuizAbortDialogUiElements;
  getFallbackConfirmText?: () => string;
}

export interface QuizAbortDialogController {
  requestConfirm: () => Promise<boolean>;
}

export const createQuizAbortDialogController = (
  options: QuizAbortDialogControllerOptions,
): QuizAbortDialogController => {
  let pendingResolve: ((value: boolean) => void) | null = null;

  const resolvePending = (value: boolean): void => {
    if (!pendingResolve) {
      return;
    }

    const resolve = pendingResolve;
    pendingResolve = null;
    resolve(value);
  };

  options.ui.cancelButton.addEventListener("click", () => {
    options.ui.dialog.close("cancel");
  });

  options.ui.form.addEventListener("submit", (event) => {
    event.preventDefault();
    options.ui.dialog.close("confirm");
  });

  options.ui.dialog.addEventListener("close", () => {
    resolvePending(options.ui.dialog.returnValue === "confirm");
  });

  const requestConfirm = (): Promise<boolean> => {
    if (typeof HTMLDialogElement === "undefined") {
      const fallbackText = options.getFallbackConfirmText?.() ?? "Quiz wirklich abbrechen? Dein aktueller Quiz-Fortschritt wird verworfen.";
      return Promise.resolve(window.confirm(fallbackText));
    }

    if (pendingResolve) {
      resolvePending(false);
    }

    return new Promise((resolve) => {
      pendingResolve = resolve;
      options.ui.dialog.showModal();
      window.setTimeout(() => {
        options.ui.cancelButton.focus();
      }, 0);
    });
  };

  return { requestConfirm };
};
