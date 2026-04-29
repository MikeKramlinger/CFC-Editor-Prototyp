import { query } from "./domQueryUi.js";

export interface QuizAbortDialogUiElements {
  dialog: HTMLDialogElement;
  form: HTMLFormElement;
  message: HTMLParagraphElement;
  cancelButton: HTMLButtonElement;
  confirmButton: HTMLButtonElement;
}

export const getQuizAbortDialogUiElements = (): QuizAbortDialogUiElements => ({
  dialog: query<HTMLDialogElement>("#quiz-abort-dialog"),
  form: query<HTMLFormElement>("#quiz-abort-form"),
  message: query<HTMLParagraphElement>("#quiz-abort-message"),
  cancelButton: query<HTMLButtonElement>("#quiz-abort-cancel"),
  confirmButton: query<HTMLButtonElement>("#quiz-abort-confirm"),
});
