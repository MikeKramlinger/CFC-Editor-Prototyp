# CFC-DSL Spezifikation (Version 2.0)

Diese DSL ist Mermaid-flowchart-aehnlich, aber auf den CFC-Editor und dessen Datenmodell zugeschnitten.

## 1. Ziel und Design

- Header basiert auf Mermaid (`cfc LR`).
- Knoten-Syntax ist kompakt und visuell lesbar.
- Jede Knotenzeile enthaelt einen Metadatenblock fuer Position und Ausfuehrungsreihenfolge.
- Verbindungen werden per Pfeil `-->` notiert.

## 2. Grundstruktur

```text
cfc LR

<NodeDefinition> {o: <order>, x: <x>, y: <y>, w: <width>, h: <height>}
...

<ConnectionDefinition>
...
```

Regeln:
- Erste sinnvolle Zeile muss exakt `cfc LR` sein.
- `o`, `x`, `y` sind verpflichtend.
- `w`, `h` sind optional, aber fuer stabile Geometrie empfohlen.
- Leerzeilen sind erlaubt.
- Kommentare als ganze Zeile mit `%%` oder `#`.

## 3. Metadaten

```text
{o: 2, x: 10, y: 5, w: 6, h: 3}
```

- `o`: executionOrder. `0` bedeutet "nicht explizit gesetzt".
- `x`, `y`: Rasterposition.
- `w`, `h`: Knotenbreite/-hoehe.

Hinweis:
- Die Validierung fuer `executionOrder` (eindeutig, lueckenlos, etc.) entspricht der bestehenden Graph-Logik.

## 4. Knoten (12 CFC-Bestandteile)

1. Input
   - Syntax: `id[/ "Variablenname" /]`
   - Beispiel: `In1[/ "bSensor" /] {o: 0, x: 2, y: 5}`

2. Output
   - Syntax: `id[\ "Variablenname" \]`
   - Beispiel: `Out1[\ "bMotor" \] {o: 1, x: 20, y: 5}`

3. Box
   - Syntax: `id[Typ: Instanzname]` oder `id[Typ]`
   - Beispiel: `Timer1[TON: instTimer] {o: 2, x: 10, y: 5}`

4. Box mit EN/ENO
   - Syntax: `id[+Typ: Instanzname]` oder `id[+Typ]`
   - Beispiel: `Add1[+ADD] {o: 3, x: 15, y: 10}`

5. Jump
   - Syntax: `id("Labelname")`
   - Beispiel: `JmpErr("ErrorRoutine") {o: 4, x: 30, y: 10}`

6. Label
   - Syntax: `id{{ "Labelname" }}`
   - Beispiel: `LblErr{{ "ErrorRoutine" }} {o: 0, x: 2, y: 20}`

7. Return
   - Syntax: `id(( RETURN ))`
   - Beispiel: `Ret1(( RETURN )) {o: 5, x: 30, y: 15}`

8. Composer
   - Syntax: `id[[C: StrukturTyp]]`
   - Beispiel: `Comp1[[C: stMotorData]] {o: 6, x: 25, y: 5}`

9. Selector
   - Syntax: `id[[S: StrukturTyp]]`
   - Beispiel: `Sel1[[S: stMotorData]] {o: 7, x: 5, y: 25}`

10. Comment
    - Syntax: `id[/* "Kommentartext" */]`
    - Beispiel: `Doc1[/* "Hier startet die Init-Phase" */] {o: 0, x: 2, y: 2}`

11. Connection Mark - Source
    - Syntax: `id>"Markenname"]`
    - Beispiel: `MarkOut1>"ToPhase2"] {o: 0, x: 30, y: 5}`

12. Connection Mark - Sink
    - Syntax: `id["Markenname"<`
    - Beispiel: `MarkIn1["ToPhase2"< {o: 0, x: 2, y: 30}`

## 5. Verbindungen und Pin-Adressierung

Grundsyntax:

```text
Quelle --> Ziel
```

Empfohlen:

```text
Knoten.Pin --> Knoten.Pin
```

Beispiele:

```text
In1.OUT --> Add1.EN
Add1.ENO --> Timer1.IN1
Timer1.OUT --> Out1.IN1
BoxA.OUT --> MarkOut1
MarkIn1 --> BoxB.IN1
```

Parser-Regeln fuer Pins:
- Ohne Pinangabe wird Standardport verwendet (`output:0` bzw. `input:0`).
- `!` vor Input-Pin ist erlaubt (`Node.!IN1`) und wird als derselbe Zielport interpretiert.
- Allgemein:
  - Input-Pins: `IN1`, `IN2`, ...
  - Output-Pins: `OUT`, `OUT2`, ...
- Speziell fuer `box-en-eno`:
  - Input: `EN`, `IN1`, `IN2`, ...
  - Output: `ENO`, `OUT`, `OUT2`, ...

## 6. Vollstaendiges Beispiel

```text
cfc LR

In1[/ "bSensor" /] {o: 0, x: 2, y: 5, w: 5, h: 2}
Add1[+ADD] {o: 1, x: 10, y: 5, w: 7, h: 6}
Out1[\ "bMotor" \] {o: 2, x: 20, y: 5, w: 5, h: 2}
Doc1[/* "Init-Phase" */] {o: 0, x: 2, y: 2, w: 12, h: 2}

In1.OUT --> Add1.EN
Add1.OUT --> Out1.IN1
```

## 7. Mermaid-Bezug und Abgrenzung

Was uebernommen wurde:
- Diagramm-Header-Idee (`<keyword> LR`).
- Knoten/Edge-Notation in einer Zeile.

Was CFC-spezifisch ist:
- Pflicht-Metadaten fuer Editor-Layout.
- CFC-Knotentypen inkl. EN/ENO, Composer/Selector und Connection Marks.
- Execution-Order-Semantik fuer CFC.

## 8. Erweiterbarkeit

Fuer interne/seltene Typen kann folgende Fallback-Syntax genutzt werden:

```text
id[[T: node-type | "Label"]] {o: 0, x: 1, y: 1}
```

Beispiel:

```text
Pin1[[T: input-pin | "StartPin"]] {o: 0, x: 1, y: 1}
```
