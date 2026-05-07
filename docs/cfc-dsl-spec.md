# CFC-DSL Spezifikation

Diese DSL ist Mermaid-flowchart-aehnlich, aber auf den CFC-Editor und dessen Datenmodell zugeschnitten.

## 1. Ziel und Design

- Header basiert auf Mermaid (`cfc LR`).
- Knoten-Syntax ist kompakt und visuell lesbar.
- Jede Knotenzeile enthaelt einen Metadatenblock fuer Position und (optional Ausfuehrungsreihenfolge.
- Verbindungen werden per Pfeil `-->` notiert.
- Texte werden standardmaessig ohne Anfuehrungszeichen geschrieben.

## 2. Grundstruktur

```text
cfc LR

<NodeDefinition> {[o: <order>, ]x: <x>, y: <y>}
...

<ConnectionDefinition>
...
```

Regeln:
- Erste sinnvolle Zeile muss exakt `cfc LR` sein.
- `x` und `y` sind verpflichtend in den Metadaten; `o` (executionOrder) ist optional und wird nur angegeben, wenn explizit gesetzt.
- `w`, `h` werden nicht verwendet.
- Breite und Hoehe werden implizit bestimmt:
   - Hoehe folgt dem Node-Typ/Port-Layout.
   - Breite wird automatisch am Label (und Typ-Kontext) ausgerichtet.
- Leerzeilen sind erlaubt.
- Kommentare als ganze Zeile mit `%%` oder `#`.
- Quoted Schreibweise bleibt aus Kompatibilitaetsgruenden erlaubt, ist aber optional.

## 3. Metadaten

```text
{x: 10, y: 5}
```

- `o`: executionOrder. Wird nur angegeben, wenn das Feld fuer den Knoten explizit gesetzt ist. Verwenden Sie nicht `o: 0` als Platzhalter.
- `x`, `y`: Rasterposition.
- `width`/`height` sind kein Teil der DSL und werden beim Laden berechnet.

Hinweis:
- Die Validierung fuer `executionOrder` (eindeutig, lueckenlos, etc.) entspricht der bestehenden Graph-Logik.
- Beim Serialisieren wird das `o`-Feld weggelassen, wenn kein executionOrder vorhanden ist.

## 4. Knoten (Auswahl von CFC-Bestandteilen)

1. Input
   - Syntax: `id[/Variablenname/]`
   - Beispiel ohne executionOrder: `In1[/bSensor/] {x: 2, y: 5}`

2. Output
   - Syntax: `id[\Variablenname\]`
   - Beispiel mit executionOrder: `Out1[\bMotor\] {o: 1, x: 20, y: 5}`

3. Box
   - Syntax: `id[Typ:Instanzname]` oder `id[Typ]`
   - Beispiel: `Timer1[TON:instTimer] {o: 2, x: 10, y: 5}`

   - Optionales `typeName`: Ein Box-Knoten kann einen abgeleiteten `typeName` haben, der mit `@` angehängt wird: `id[Instance @ typeName]` oder `id[Type:Instance @ typeName]`.
   - Beispiel mit `typeName`: `Timer1[TON:instTimer @ TON_TIME] {o: 2, x: 10, y: 5}`

4. Box mit EN/ENO
   - Syntax: `id[+Type:Instanzname]` oder `id[+Type]`
   - Beispiel: `Add1[+ADD] {o: 3, x: 15, y: 10}`

   - Optionales `typeName` wie bei normalen Boxen: `Add1[+ADD@ADD_TIME] {o: 3, x: 15, y: 10}`

5. Jump
   - Syntax: `id(LabelName)`
   - Beispiel: `JmpErr(ErrorRoutine) {o: 4, x: 30, y: 10}`

6. Label
   - Syntax: `id{{LabelName}}`
   - Beispiel ohne executionOrder: `LblErr{{ErrorRoutine}} {x: 2, y: 20}`

7. Return
   - Syntax: `id((RETURN))`
   - Beispiel: `Ret1((RETURN)) {o: 5, x: 30, y: 15}`

8. Composer
   - Syntax: `id[[C: StructType]]`
   - Beispiel: `Comp1[[C: stMotorData]] {o: 6, x: 25, y: 5}`

9. Selector
   - Syntax: `id[[S: StructType]]`
   - Beispiel: `Sel1[[S: stMotorData]] {o: 7, x: 5, y: 25}`

10. Comment
   - Syntax: `id[*CommentText*]`
   - Beispiel ohne executionOrder: `Doc1[*Init-Phase*] {x: 2, y: 2}`

11. Connection Mark - Source
   - Syntax: `id>MarkName]`
   - Beispiel: `MarkOut1>ToPhase2] {x: 30, y: 5}`

12. Connection Mark - Sink
   - Syntax: `id[MarkName<`
   - Beispiel: `MarkIn1[ToPhase2< {x: 2, y: 30}`

Hinweis zur Formatierung:
- Innerhalb der Klammern (z.B. `[...]`, `{{...}}`, `((...))`, `[[...]]`) sollen keine Leerzeichen direkt zwischen der öffnenden Klammer und dem Namen bzw. zwischen Namen und schließender Klammer stehen. Beispiele: `In1[/bSensor/]`, `LblErr{{ErrorRoutine}}`, `Ret1((RETURN))`, `Timer1[TON:instTimer]`.

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

Hinweis:
- Nur diese Knotentypen dürfen ohne explizite Portangabe geschrieben werden: `Input`, `Output`, `Jump`, `Return`, `Connection Mark - Source`, `Connection Mark - Sink`.
- Bei Mehrport-Typen wie `Box`, `Box with EN/ENO`, `Composer` und `Selector` bleibt der Port Pflicht.

## 6. Vollstaendiges Beispiel

```text
cfc LR

In1[/bSensor/] {x: 2, y: 5}
Add1[+ADD] {o: 1, x: 10, y: 5}
Out1[\bMotor\] {o: 2, x: 20, y: 5}
Doc1[*Init-Phase*] {x: 2, y: 2}

In1.OUT --> Add1.EN
Add1.OUT --> Out1.IN1
```

%% DECLARATIONS
PROGRAM CFC
VAR
   bSensor : BOOL;
   bMotor : BOOL;
END_VAR

## 6.1 Kompatibilitaet (alt -> neu)

- Die folgenden aelteren Formen werden weiterhin akzeptiert:
   - Quoted Texte, z. B. `In1[/ "GVL.bSensor" /]`
   - Kommentar in C-Stil, z. B. `Doc1[/* Text */]`
- Der Serializer erzeugt standardmaessig die kompaktere unquoted Form.

## 7. Mermaid-Bezug und Abgrenzung

Was uebernommen wurde:
- Diagramm-Header-Idee (`<keyword> LR`).
- Knoten/Edge-Notation in einer Zeile.

Was CFC-spezifisch ist:
- Pflicht-Metadaten fuer Editor-Layout (x,y).
- CFC-Knotentypen inkl. EN/ENO, Composer/Selector und Connection Marks.
- Execution-Order-Semantik fuer CFC; `o` wird nur exportiert, wenn gesetzt.

## 8. Erweiterbarkeit

Fuer interne/seltene Typen kann folgende Fallback-Syntax genutzt werden:

```text
id[[T:node-type|"Label"]] {x: 1, y: 1}
```

Beispiel:

```text
Pin1[[T:input-pin|"StartPin"]] {x: 1, y: 1}
```
