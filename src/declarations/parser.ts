import type { DeclarationError, Declarations, DerivedVariable, ElementaryVariable, Variable } from "./types.js";
import { isElementaryType } from "./types.js";

export const sanitizeName = (s: string): string => {
  if (!s) {
    return s;
  }

  const replaced = s.replace(/[^A-Za-z0-9_]/g, "");
  return /^[0-9]/.test(replaced) ? `_${replaced}` : replaced;
};

/**
 * Parsed eine Deklarationszeichenkette im Format:
 * PROGRAM CFC
 * VAR
 *   variable_name : TYPE;
 *   ...
 * END_VAR
 */
export const parseDeclarations = (raw: string): Declarations => {
  const lines = raw.split("\n");
  const errors: DeclarationError[] = [];
  const variables: Variable[] = [];

  let isInsideVarBlock = false;
  let lineNumber = 0;

  for (const line of lines) {
    lineNumber++;
    const trimmed = line.trim();

    // Leerzeilen und Kommentare ignorieren
    if (trimmed.length === 0 || trimmed.startsWith("//") || trimmed.startsWith("(*") || trimmed.startsWith("*)")) {
      continue;
    }

    // PROGRAM-Zeile
    if (trimmed.startsWith("PROGRAM")) {
      continue;
    }

    // VAR-Block Start
    if (trimmed === "VAR") {
      isInsideVarBlock = true;
      continue;
    }

    // VAR-Block End
    if (trimmed === "END_VAR") {
      isInsideVarBlock = false;
      continue;
    }

    // Außerhalb von VAR-Block ignorieren
    if (!isInsideVarBlock) {
      continue;
    }

    // Variablendeklaration parsen
    const variableResult = parseVariableDeclaration(trimmed, lineNumber);
    if (variableResult.error) {
      errors.push(variableResult.error);
    } else if (variableResult.variable) {
      // Duplikate verhindern
      if (!variables.some((v) => v.name === variableResult.variable!.name)) {
        variables.push(variableResult.variable);
      } else {
        errors.push({
          line: lineNumber,
          message: `Duplicate variable name: ${variableResult.variable.name}`,
        });
      }
    }
  }

  const isValid = errors.length === 0;

  return {
    variables,
    rawText: raw,
    errors,
    isValid,
  };
};

interface ParseVariableResult {
  variable?: Variable;
  error?: DeclarationError;
}

/**
 * Parse eine einzelne Variablendeklaration:
 * "variable_name : TYPE;" -> { name: "variable_name", type: "TYPE" }
 */
const parseVariableDeclaration = (line: string, lineNumber: number): ParseVariableResult => {
  // Semikolon am Ende entfernen
  const withoutSemicolon = line.endsWith(";") ? line.slice(0, -1) : line;
  const trimmed = withoutSemicolon.trim();

  if (trimmed.length === 0) {
    return {};
  }

  // Auf Doppelpunkt prüfen
  const colonIndex = trimmed.indexOf(":");
  if (colonIndex === -1) {
    return {
      error: {
        line: lineNumber,
        message: `Missing ':' in variable declaration: ${trimmed}`,
      },
    };
  }

  const nameRaw = trimmed.slice(0, colonIndex).trim();
  const typeRaw = trimmed.slice(colonIndex + 1).trim();

  // Validierungen
  if (!nameRaw) {
    return {
      error: {
        line: lineNumber,
        message: "Variable name is empty",
      },
    };
  }

  if (!typeRaw) {
    return {
      error: {
        line: lineNumber,
        message: "Variable type is empty",
      },
    };
  }

  // Variablennamen validieren (alphanumerisch + Unterstrich, nicht mit Zahl anfangen)
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(nameRaw)) {
    return {
      error: {
        line: lineNumber,
        message: `Invalid variable name: ${nameRaw}. Must start with letter or underscore, contain only alphanumeric characters and underscores.`,
      },
    };
  }

  // Typ bestimmen
  const isElementary = isElementaryType(typeRaw);

  const variable: Variable = isElementary
    ? {
        name: nameRaw,
        type: typeRaw,
        isElementary: true,
      }
    : {
        name: nameRaw,
        type: typeRaw,
        isElementary: false,
      };

  return { variable };
};

/**
 * Generiert eine Deklarationszeichenkette aus Variablen
 */
export const generateDeclarations = (variables: Variable[]): string => {
  const lines = ["PROGRAM CFC", "VAR"];

  for (const variable of variables) {
    lines.push(`    ${variable.name} : ${variable.type};`);
  }

  lines.push("END_VAR");

  return lines.join("\n");
};

/**
 * Gibt eine Variablendeklaration im Textformat zurück
 */
export const variableToString = (variable: Variable): string => `${variable.name} : ${variable.type}`;

/**
 * Rename a variable inside a declarations raw text. Only renames occurrences in the VAR block
 * where the variable name appears at the start of a declaration (before ':').
 */
export const renameVariableInDeclarations = (raw: string, oldName: string, newName: string): string => {
  const lines = raw.split("\n");
  let isInsideVar = false;
  const out: string[] = [];
  const varNameRe = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "VAR") {
      isInsideVar = true;
      out.push(line);
      continue;
    }
    if (trimmed === "END_VAR") {
      isInsideVar = false;
      out.push(line);
      continue;
    }

    if (!isInsideVar) {
      out.push(line);
      continue;
    }

    const m = line.match(varNameRe);
    if (m && m[1] === oldName) {
      out.push(line.replace(oldName, newName));
    } else {
      out.push(line);
    }
  }

  return out.join("\n");
};

/**
 * Appends a variable declaration into the raw declarations text, inserting it
 * immediately before the `END_VAR` line. Preserves all other content (comments,
 * formatting) and does nothing if a variable with the same name already exists.
 */
export const appendVariableToDeclarations = (raw: string, variable: Variable): string => {
  const lines = raw.split("\n");
  // If variable already exists in the VAR block, return original
  const parsed = parseDeclarations(raw);
  if (parsed.variables.some((v) => v.name === variable.name)) {
    return raw;
  }

  // Find END_VAR line index
  let endVarIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const currentLine = lines[i] ?? "";
    if (currentLine.trim() === "END_VAR") {
      endVarIndex = i;
      break;
    }
  }

  const declLine = `    ${variableToString(variable)};`;

  if (endVarIndex === -1) {
    // No END_VAR found: append a minimal VAR block at end
    const out = lines.concat(["VAR", declLine, "END_VAR"]);
    return out.join("\n");
  }

  // Insert declLine before END_VAR, but ensure there's a blank line before END_VAR
  const before = lines.slice(0, endVarIndex);
  const after = lines.slice(endVarIndex);
  // If the line immediately before END_VAR is non-empty and not a variable line, still insert
  before.push(declLine);
  return before.concat(after).join("\n");
};
