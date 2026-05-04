/**
 * Deklarationen für den CFC-Editor
 * Format: PROGRAM CFC
 *         VAR
 *           variableName : TYPE;
 *         END_VAR
 */

export type ElementaryType =
  | "BOOL"
  | "BYTE"
  | "WORD"
  | "DWORD"
  | "LWORD"
  | "SINT"
  | "INT"
  | "DINT"
  | "LINT"
  | "USINT"
  | "UINT"
  | "UDINT"
  | "ULINT"
  | "REAL"
  | "LREAL"
  | "TIME"
  | "DATE"
  | "DT"
  | "TOD"
  | "STRING"
  | "WSTRING";

export const ELEMENTARY_TYPES: ElementaryType[] = [
  "BOOL",
  "BYTE",
  "WORD",
  "DWORD",
  "LWORD",
  "SINT",
  "INT",
  "DINT",
  "LINT",
  "USINT",
  "UINT",
  "UDINT",
  "ULINT",
  "REAL",
  "LREAL",
  "TIME",
  "DATE",
  "DT",
  "TOD",
  "STRING",
  "WSTRING",
];

export const isElementaryType = (value: string): value is ElementaryType =>
  ELEMENTARY_TYPES.includes(value as ElementaryType);

/**
 * Variable mit elementarem Typ (z.B. INT, BOOL)
 */
export interface ElementaryVariable {
  name: string;
  type: ElementaryType;
  isElementary: true;
}

/**
 * Variable mit Derived Type (z.B. FB_BOX)
 */
export interface DerivedVariable {
  name: string;
  type: string;
  isElementary: false;
}

export type Variable = ElementaryVariable | DerivedVariable;

/**
 * Deklarations-Sammlung
 */
export interface Declarations {
  variables: Variable[];
  // Raw-Text für Errorhandling und Debugging
  rawText: string;
  // Parse-Fehler
  errors: DeclarationError[];
  isValid: boolean;
}

export interface DeclarationError {
  line: number;
  message: string;
  startColumn?: number;
  endColumn?: number;
}

/**
 * Info für die UI über verfügbare Deklarationen
 */
export interface DeclarationsInfo {
  allVariables: Variable[];
  elementaryVariables: ElementaryVariable[];
  derivedVariables: DerivedVariable[];
}
