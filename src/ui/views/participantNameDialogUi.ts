import { query } from "./domQueryUi.js";

export interface ParticipantNameDialogUiElements {
  dialog: HTMLDialogElement;
  form: HTMLFormElement;
  input: HTMLInputElement;
  cancelButton: HTMLButtonElement;
}

export const getParticipantNameDialogUiElements = (): ParticipantNameDialogUiElements => ({
  dialog: query<HTMLDialogElement>("#participant-name-dialog"),
  form: query<HTMLFormElement>("#participant-name-form"),
  input: query<HTMLInputElement>("#participant-name-input"),
  cancelButton: query<HTMLButtonElement>("#participant-name-cancel"),
});
