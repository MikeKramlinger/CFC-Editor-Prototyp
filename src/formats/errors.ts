import type { UiLanguage } from "../i18n.js";

export interface FormatError {
  line: number;
  messageKey: string; // i18n key for the error message
  message?: string; // Fallback plain text message (for runtime construction)
  startColumn?: number;
  endColumn?: number;
  lines?: number[];
}

export interface DeserializeResult {
  graph: import("../model.js").CfcGraph;
  errors: FormatError[];
  isValid: boolean;
}

export const createDeserializeResult = (
  graph: import("../model.js").CfcGraph,
  errors: FormatError[],
): DeserializeResult & import("../model.js").CfcGraph => {
  const result = Object.assign(graph, {
    graph,
    errors,
    isValid: errors.length === 0,
  });

  return result as DeserializeResult & import("../model.js").CfcGraph;
};

/**
 * Erzeugt ein Format-Fehlerobjekt mit i18n-Schlüssel.
 *
 * @param line - 1-basierte Zeilennummer
 * @param messageKey - i18n message key
 * @param startIndex - 0-basierter Start-Index in der Zeile (optional)
 * @param length - Länge der betroffenen Textstelle (optional)
 */
export const createFormatError = (
  line: number,
  messageKey: string,
  startIndex?: number,
  length?: number,
): FormatError => ({
  line,
  messageKey,
  startColumn: startIndex !== undefined && startIndex >= 0 ? startIndex + 1 : undefined,
  endColumn:
    startIndex !== undefined && startIndex >= 0
      ? startIndex + 1 + Math.max(0, length ?? 0)
      : undefined,
});

/**
 * Erzeugt ein Format-Fehlerobjekt mit Fallback-Text.
 * Verwendet, wenn der Fehler zur Laufzeit konstruiert wird und kein i18n-Schlüssel vorhanden ist.
 */
export const createFormatErrorWithFallback = (
  line: number,
  messageKey: string,
  fallbackMessage: string,
  startIndex?: number,
  length?: number,
): FormatError => ({
  line,
  messageKey,
  message: fallbackMessage,
  startColumn: startIndex !== undefined && startIndex >= 0 ? startIndex + 1 : undefined,
  endColumn:
    startIndex !== undefined && startIndex >= 0
      ? startIndex + 1 + Math.max(0, length ?? 0)
      : undefined,
});

export const groupErrorsByLine = (errors: FormatError[]): Map<number, FormatError[]> => {
  const map = new Map<number, FormatError[]>();
  for (const e of errors) {
    const arr = map.get(e.line) ?? [];
    arr.push(e);
    map.set(e.line, arr);
  }
  return map;
};

/**
 * Format error message for display, using i18n translation function if available.
 */
export const formatErrorMessage = (
  error: FormatError,
  t?: (key: string) => string,
): string => {
  const detail = (error as FormatError & { details?: string }).details;
  if (t && error.messageKey) {
    const translated = t(error.messageKey);
    // If translation returns the key itself, fall back to the runtime message.
    if (translated === error.messageKey) {
      return error.message || error.messageKey;
    }

    // Keep translated base text, but preserve dynamic details like duplicate IDs
    // or invalid keys that are only available in the runtime message.
    const runtimeDetail = detail ?? error.message?.match(/\(([^)]+)\)\s*$/)?.[1]?.trim();
    if (runtimeDetail) {
      const normalizedTranslated = translated.replace(/\s*\.$/, "");
      return `${normalizedTranslated} (${runtimeDetail})`;
    }

    return translated;
  }
  return error.message || error.messageKey;
};

export default createFormatError;
