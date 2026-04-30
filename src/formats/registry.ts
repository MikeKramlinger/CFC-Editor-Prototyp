import type { CfcFormatAdapter } from "./types.js";
import { cfcDslFormat } from "./cfcDsl.js";
import { jsonFormat } from "./json.js";
import { plcopenXmlFormat } from "./plcopenXml.js";
import { xmlFormat } from "./xml.js";

const adapters: CfcFormatAdapter[] = [plcopenXmlFormat, xmlFormat, jsonFormat, cfcDslFormat];

export const listAdapters = (): CfcFormatAdapter[] => [...adapters];

export const getAdapterById = (id: string): CfcFormatAdapter => {
  const adapter = adapters.find((entry) => entry.id === id);
  if (!adapter) {
    throw new Error(`Unbekanntes Datenformat: ${id}`);
  }
  return adapter;
};
