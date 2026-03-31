import type { ParticipantNameDialogUiElements } from "../views/participantNameDialogUi.js";

interface ParticipantNameDialogControllerOptions {
  ui: ParticipantNameDialogUiElements;
}

export interface ParticipantNameDialogController {
  requestName: (initialValue: string) => Promise<string | null>;
}

export const createParticipantNameDialogController = (
  options: ParticipantNameDialogControllerOptions,
): ParticipantNameDialogController => {
  let pendingResolve: ((value: string | null) => void) | null = null;

  const resolvePending = (value: string | null): void => {
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
    options.ui.dialog.close("submit");
  });

  options.ui.dialog.addEventListener("close", () => {
    if (options.ui.dialog.returnValue === "submit") {
      resolvePending(options.ui.input.value.trim());
      return;
    }
    resolvePending(null);
  });

  const requestName = (initialValue: string): Promise<string | null> => {
    if (typeof HTMLDialogElement === "undefined") {
      const fallback = window.prompt("Quiz-Export: Name der teilnehmenden Person (optional)", initialValue);
      return Promise.resolve(fallback === null ? null : fallback.trim());
    }

    if (pendingResolve) {
      resolvePending(null);
    }

    options.ui.input.value = initialValue;

    return new Promise((resolve) => {
      pendingResolve = resolve;
      options.ui.dialog.showModal();
      window.setTimeout(() => {
        options.ui.input.focus();
        options.ui.input.select();
      }, 0);
    });
  };

  return { requestName };
};
