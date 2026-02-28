export const query = <T extends HTMLElement>(selector: string): T => {
  const element = document.querySelector(selector);
  if (!element) {
    throw new Error(`Element nicht gefunden: ${selector}`);
  }
  return element as T;
};
