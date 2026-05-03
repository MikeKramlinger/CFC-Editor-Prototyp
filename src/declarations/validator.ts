import type { CfcNodeType } from "../model.js";
import type { DerivedVariable, ElementaryVariable, Variable } from "./types.js";

/**
 * Bestimmt, ob ein Node-Typ nur Derived-Types akzeptiert (Box, Box-EN-ENO)
 */
export const nodeTypeAcceptsDerivedTypes = (nodeType: CfcNodeType): boolean =>
  nodeType === "box" || nodeType === "box-en-eno";

/**
 * Bestimmt, ob ein Node-Typ eine Deklaration akzeptiert
 */
export const canNodeUseDeclaration = (nodeType: CfcNodeType, variable: Variable): boolean => {
  // Input und Output akzeptieren nur Elementary Types
  if (nodeType === "input" || nodeType === "output") {
    return variable.isElementary;
  }

  // Box und Box-EN-ENO akzeptieren nur Derived Types
  if (nodeType === "box" || nodeType === "box-en-eno") {
    return !variable.isElementary;
  }

  // Alle anderen Node-Typen akzeptieren keine Deklarationen
  return false;
};

/**
 * Gibt alle Variablen zurück, die zu einem bestimmten Node-Typ passen
 */
export const getCompatibleVariables = (nodeType: CfcNodeType, variables: Variable[]): Variable[] =>
  variables.filter((variable) => canNodeUseDeclaration(nodeType, variable));

/**
 * Gibt alle Elementary-Variablen zurück
 */
export const getElementaryVariables = (variables: Variable[]): ElementaryVariable[] =>
  variables.filter((v): v is ElementaryVariable => v.isElementary);

/**
 * Gibt alle Derived-Variablen zurück
 */
export const getDerivedVariables = (variables: Variable[]): DerivedVariable[] =>
  variables.filter((v): v is DerivedVariable => !v.isElementary);

/**
 * Findet eine Variable nach Name
 */
export const findVariableByName = (variables: Variable[], name: string): Variable | undefined =>
  variables.find((v) => v.name === name);

/**
 * Validiert, dass ein Node nur eine kompatible Deklaration hat
 */
export const validateNodeDeclarationAssignment = (
  nodeType: CfcNodeType,
  variableName: string | null,
  variables: Variable[],
): { isValid: boolean; error?: string } => {
  // Wenn keine Deklaration zugewiesen ist, ist das OK
  if (!variableName) {
    return { isValid: true };
  }

  // Finde die Variable
  const variable = findVariableByName(variables, variableName);
  if (!variable) {
    return {
      isValid: false,
      error: `Variable not found: ${variableName}`,
    };
  }

  // Prüfe Kompatibilität
  if (!canNodeUseDeclaration(nodeType, variable)) {
    const expectedType = nodeType === "input" || nodeType === "output" ? "elementary" : "derived";
    const actualType = variable.isElementary ? "elementary" : "derived";
    return {
      isValid: false,
      error: `Node type ${nodeType} expects ${expectedType} type, but variable is ${actualType}: ${variableName}`,
    };
  }

  return { isValid: true };
};
