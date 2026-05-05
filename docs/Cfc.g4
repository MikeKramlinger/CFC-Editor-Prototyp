grammar Cfc;

// ===============================================================================
// PARSER-REGELN
// ===============================================================================

cfcProgram          : declarationSection cfcSection EOF ;

// Verbatim-Block: liest alle Zeilen der Declaration bis zum Marker 'cfc:'.
// Hinweis: 'end_declaration' ist weiterhin erlaubt, wird aber nicht mehr zwingend erwartet.
// Konvention: Die Serialisierung fügt unmittelbar nach 'declaration:' eine Leerzeile ein; der Parser toleriert diese Leerzeile.
// Konvention: Nur Input, Output, Jump, Return, Connection Mark - Source und Connection Mark - Sink dürfen ohne Pin geschrieben werden, z. B. 'Input1 => Box1_0'.
// Hinweis: Struktur-Elemente (z. B. RETURN, JUMP, LABEL) und IO-Deklarationen
// (INPUT/OUTPUT) können anonym ohne vorangestellten Bezeichner geschrieben
// werden. Die ältere Form `Name: TYPE(...)` bleibt zur Abwärtskompatibilität
// weiterhin erlaubt.
declarationSection  : 'declaration:' VERBATIM_ST_BLOCK ;

cfcSection          : 'cfc:' ( nodeDeclaration | connection | commentLine )* ;

// Knoten nutzen NUR den einfachen Identifier (keine Punkte erlaubt!)
nodeDeclaration     : ( IDENT_SIMPLE ':' )? nodeType metaBlock? ;

nodeType            : 'INPUT' '(' IDENT_QUALIFIED ')'  // Variablen dürfen Punkte haben
                    | 'OUTPUT' '(' IDENT_QUALIFIED ')'
                    | 'BOX' '(' IDENT_SIMPLE ')'
                    | 'BOX_EN' '(' IDENT_SIMPLE ')'
                    | 'LABEL' '(' IDENT_SIMPLE ')'
                    | 'JUMP' '(' IDENT_SIMPLE ')'
                    | 'RETURN'
                    | 'COMPOSER'
                    | 'SELECTOR'
                    | 'COMMENT' '(' STRING ')'
                    | IDENT_SIMPLE '(' IDENT_SIMPLE ')' 
                    ;

metaBlock           : '{' metaAssignment ( ','? metaAssignment )* '}' ;
metaAssignment      : AT_META '=' metaValue ;
metaValue           : IDENT_SIMPLE | NUMBER | INTEGER | STRING ;

connection          : source ARROW target
                    | constantInjection 
                    ;

source              : nodePort
                    | IDENT_QUALIFIED  // Signalquelle kann eine strukturierte Variable sein
                    | literalConstant
                    ;

// Exakt definiert: Node (Simple) . Port (Simple)
nodePort            : IDENT_SIMPLE '.' IDENT_SIMPLE portIndex? ;
target              : nodePort ;
portIndex           : '[' INTEGER ']' ;

constantInjection   : literalConstant CONST_ARROW target ;
literalConstant     : 'TRUE' | 'FALSE' | NUMBER | TIME | STRING ;
commentLine         : COMMENT_SINGLE | COMMENT_MULTI ;

// ===============================================================================
// LEXER-TOKENS (Formalisierte lexikalische Regeln)
// ===============================================================================

// Zuerst Whitespace ignorieren (ausserhalb des Verbatim-Blocks)
WS                  : [ \t\r\n]+ -> skip ;

// Pfeile
ARROW               : '->' ;
CONST_ARROW         : '=>' ;
AT_META             : '@' [a-zA-Z_][a-zA-Z0-9_]* ;

// Die zwei Name-Kinds zur Vermeidung von Ambiguitäten
IDENT_SIMPLE        : [a-zA-Z_] [a-zA-Z0-9_]* ;
IDENT_QUALIFIED     : [a-zA-Z_] [a-zA-Z0-9_]* ('.' [a-zA-Z_] [a-zA-Z0-9_]*)+ ;

INTEGER             : [0-9]+ ;
NUMBER              : '-'? [0-9]+ ('.' [0-9]+)? ;

// Strings mit grundlegendem Escape-Support (z.B. \" )
STRING              : '"' (~["\\\r\n] | '\\' .)* '"' ;
TIME                : [Tt] '#' [a-zA-Z0-9_\-:]+ ;

COMMENT_SINGLE      : '//' ~[\r\n]* ;
COMMENT_MULTI       : '/*' .*? '*/' ;

// Liest alles BIS ZUM exakten Text 'cfc:' (oder optional 'end_declaration').
// Hinweis: Für praktische Implementierungen in Tokenizern/Handparsern genügt
// es, alle Zeichen bis zur ersten Zeile zu sammeln, die mit 'cfc:' beginnt.
VERBATIM_ST_BLOCK   : . *? ;
