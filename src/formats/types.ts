import type { CfcGraph } from "../model.js";

export type { FormatError, DeserializeResult } from "./errors.js";
export { createFormatError, createFormatErrorWithFallback, createDeserializeResult, groupErrorsByLine, formatErrorMessage } from "./errors.js";

export interface CfcFormatAdapter {
  id: string;
  label: string;
  fileExtension: string;
  serialize(graph: CfcGraph): string;
  /**
   * Deserialize raw data. Returns an object with graph and errors.
   * If errors are present (errors.length > 0), the graph should not be imported.
   */
  deserialize(raw: string): import("./errors.js").DeserializeResult;
}
