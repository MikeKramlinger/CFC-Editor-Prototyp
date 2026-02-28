import type { CfcFormatAdapter } from "./types.js";
import { jsonFormat } from "./json.js";
import { plcopenXmlFormat } from "./plcopenXml.js";
import { yamlFormat } from "./yaml.js";

const adapters: CfcFormatAdapter[] = [plcopenXmlFormat, jsonFormat, yamlFormat];

export const listAdapters = (): CfcFormatAdapter[] => [...adapters];

export const getAdapterById = (id: string): CfcFormatAdapter => {
  const adapter = adapters.find((entry) => entry.id === id);
  if (!adapter) {
    throw new Error(`Unbekanntes Datenformat: ${id}`);
  }
  return adapter;
};
