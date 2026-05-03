import type { CfcNode } from "../model.js";
import { isElementaryType, type Variable } from "./types.js";
import { appendVariableToDeclarations, parseDeclarations, sanitizeName } from "./parser.js";

export interface CreatedNodeDeclarationSyncResult {
  declarations: string;
  label: string;
  typeName?: string;
}

const getInitialDeclarationsText = (raw: string): string =>
  raw && raw.trim().length > 0 ? raw : "PROGRAM CFC\nVAR\nEND_VAR";

const makeElementaryVariable = (name: string): Variable => ({
  name,
  type: "INT",
  isElementary: true,
});

const makeDerivedVariable = (name: string, typeName: string): Variable => ({
  name,
  type: typeName,
  isElementary: false,
});

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getNextIndexedVariableName = (existingNames: string[], baseName: string): string => {
  const prefixRe = new RegExp(`^${escapeRegExp(baseName)}_(\\d+)$`);
  let maxIndex = -1;

  existingNames.forEach((name) => {
    const match = name.match(prefixRe);
    if (!match) {
      return;
    }
    const index = Number.parseInt(match[1] ?? "", 10);
    if (!Number.isNaN(index) && index > maxIndex) {
      maxIndex = index;
    }
  });

  return `${baseName}_${maxIndex + 1}`;
};

export const syncCreatedNodeDeclaration = (
  rawDeclarations: string,
  node: Pick<CfcNode, "type" | "label" | "typeName">,
): CreatedNodeDeclarationSyncResult => {
  const declarationsText = getInitialDeclarationsText(rawDeclarations);
  const declarations = parseDeclarations(declarationsText);

  if (node.type === "input" || node.type === "output") {
    const variableName = sanitizeName(node.label);
    const newVariable = makeElementaryVariable(variableName);
    if (!declarations.variables.some((variable) => variable.name === newVariable.name)) {
      return {
        declarations: appendVariableToDeclarations(declarationsText, newVariable),
        label: variableName,
      };
    }
    return { declarations: declarationsText, label: variableName };
  }

  if (node.type === "box" || node.type === "box-en-eno") {
    const typeName = node.typeName && node.typeName.length > 0 ? node.typeName : node.label;
    const sanitizedTypeName = sanitizeName(typeName);
    const variableName = getNextIndexedVariableName(
      declarations.variables.map((variable) => variable.name),
      sanitizedTypeName,
    );
    const newVariable = isElementaryType(typeName)
      ? makeElementaryVariable(variableName)
      : makeDerivedVariable(variableName, typeName);

    if (!declarations.variables.some((variable) => variable.name === newVariable.name)) {
      return {
        declarations: appendVariableToDeclarations(declarationsText, newVariable),
        label: variableName,
        typeName,
      };
    }

    return { declarations: declarationsText, label: variableName, typeName };
  }

  return {
    declarations: declarationsText,
    label: node.label,
    typeName: node.typeName,
  };
};
