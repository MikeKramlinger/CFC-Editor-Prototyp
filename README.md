# CFC-Editor Prototyp (TypeScript)

Interaktiver CFC-Editor für die Masterarbeit mit Fokus auf visuelles Modellieren, Routing und Format-Roundtrips.

## Features

- Node-Erstellung per Toolbox (inkl. spezieller Typen wie `composer`, `selector`, `connection-mark-*`, `input-pin`, `output-pin`)
- Drag & Drop mit Mehrfachselektion, Marquee-Selektion und Zoom/Pan
- Verbindungen mit Port-Validierung, Drop-Indikator und zwei Routing-Modi:
   - **Aktuell** (`bezier`)
   - **CFC** (`astar`, orthogonales Routing mit Fallback)
- Verbindungserstellung von beiden Seiten möglich (Start auf Output **oder** Input), intern weiterhin konsistent als `output -> input`
- Node-Edit-Dialog (Label + Execution Order)
- Automatische Node-Breitenanpassung bei langen Labels (inkl. Mindestgröße/Template-Breite)
- Dark/Light Theme
- Undo/Redo mit Historie (`Ctrl+Z` / `Ctrl+Y`)
- Import/Export + Roundtrip über mehrere Formate
- Quiz-Modus mit aufgabenbasierten Graph-Checks (direkt im Prototyp)

## Unterstützte Formate

- PLCopenXML
- XML
- JSON
- CFC-DSL

Die CFC-DSL-Spezifikation ist in `docs/cfc-dsl-spec.md` dokumentiert.

Die Adapter werden über `src/formats/registry.ts` registriert.

## Architektur (kurz)

- `src/model.ts`: neutrales CFC-Datenmodell + Node-Templates
- `src/editor.ts`: Kernlogik (Graph, Rendering-Orchestrierung, Routing, Undo/Redo, Interaktion)
- `src/core/*`: domänennahe Logik (Routing, Connection-Regeln, Execution-Order, History)
- `src/ui/controllers/*`: UI-Verhaltenslogik (Toolbar, Toolbox, Data-Panel, Drag-Lifecycle)
- `src/ui/views/*`: DOM-Erzeugung/Renderer
- `src/formats/*`: Serialisierung/Deserialisierung pro Format
- `src/styles/base.css` + `src/styles/themes/*`: Basis-Styles und Theme-Overrides

## Setup

```bash
npm install
```

## Skripte

```bash
npm run build   # TypeScript kompilieren
npm run start   # Statischen Server starten
npm run dev     # tsc --watch + Server parallel
npm run test    # Unit-Tests einmalig ausführen
npm run test:watch # Unit-Tests im Watch-Modus
```

Danach im Browser z. B. `http://localhost:3000` öffnen.

## Wichtige Shortcuts

- `Ctrl+S`:
   - im Graph-Kontext: Export
   - im Datenfeld-Kontext: Import
- `Ctrl+Z`: Undo (Graph-Kontext)
- `Ctrl+Y`: Redo (Graph-Kontext)
- `Ctrl+A`: Alles selektieren (Graph-Kontext)
- `Delete` / `Backspace`: Selektion löschen
- `Escape`: Selektion/Bulk-Menü schließen

## Hinweise zur Execution Order

- Die angezeigte Execution Order basiert auf `src/core/graph/executionOrder.ts`.
- Beim Export wird dieselbe Logik verwendet (inkl. ausgeschlossener Node-Typen), damit Anzeige und serialisierte Daten konsistent sind.

## Quiz-Modus für Aufgaben

- Oben in der Toolbar auf `Quiz-Modus` klicken.
- Aufgabe auswählen.
- Teilnehmende bearbeiten ausschließlich das Datenformat (Import/Export).
- Mit `Prüfen` wird der aktuelle Graph gegen die Aufgabe validiert.

Die Aufgaben sind aktuell in `src/quiz/sampleQuiz.ts` als `SAMPLE_QUIZ_TASKS` hinterlegt.

### Datenformat einer Quiz-Aufgabe

Jede Aufgabe hat:

- `title`, `description`
- `initialGraph` (Startzustand)
- `criteria` (z. B. `requiredNodes`, `requiredConnections`, `exactNodeCount`)

Dadurch lassen sich konkrete Übungen modellieren wie „Füge eine Box an x/y ein“ oder „Erzeuge eine bestimmte Verbindung“.

## Erweiterung um neue Formate

Neuen Adapter in `src/formats/` anlegen und `CfcFormatAdapter` aus `src/formats/types.ts` implementieren:

- `serialize(graph)`
- `deserialize(raw)`

Anschließend in `src/formats/registry.ts` registrieren.
