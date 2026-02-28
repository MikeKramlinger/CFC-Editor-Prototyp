import type { CfcGraph } from "../model.js";

export interface CfcFormatAdapter {
  id: string;
  label: string;
  fileExtension: string;
  serialize(graph: CfcGraph): string;
  deserialize(raw: string): CfcGraph;
}
