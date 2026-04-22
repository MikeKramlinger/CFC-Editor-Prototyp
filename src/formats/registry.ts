import type { CfcFormatAdapter } from "./types.js";
import { cfcDslFormat } from "./cfcDsl.js";
import { jsonFormat } from "./json.js";
import { ogPlcopenXmlFormat } from "./ogPlcopenXml.js";
import { plcopenXmlFormat } from "./plcopenXml.js";

const adapters: CfcFormatAdapter[] = [plcopenXmlFormat, ogPlcopenXmlFormat, jsonFormat, cfcDslFormat];

export const listAdapters = (): CfcFormatAdapter[] => [...adapters];

export const getAdapterById = (id: string): CfcFormatAdapter => {
  const adapter = adapters.find((entry) => entry.id === id);
  if (!adapter) {
    throw new Error(`Unbekanntes Datenformat: ${id}`);
  }
  return adapter;
};
