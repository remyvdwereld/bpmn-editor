# BPMN Editor

Simpele webapp om BPMN-bestanden te openen, te bewerken en op te slaan, met een properties panel voor Camunda 7-extensies (forms, form fields, listeners, inputs/outputs).

Gebouwd met [bpmn-js](https://bpmn.io/toolkit/bpmn-js/) en [bpmn-js-properties-panel](https://github.com/bpmn-io/bpmn-js-properties-panel) op Vite.

## Gebruik

- **Openen:** knop *Openen…*, `Ctrl+O`, of sleep een `.bpmn`-bestand op het canvas
- **Opslaan:** knop *Opslaan .bpmn* of `Ctrl+S`
- **Exporteren:** knop *Exporteer .svg*
- Een • achter de bestandsnaam betekent dat er niet-opgeslagen wijzigingen zijn
- **Validatie:** [bpmnlint](https://github.com/bpmn-io/bpmnlint) controleert het diagram live; de knop onderaan toont het aantal fouten/waarschuwingen. Regels staan in `.bpmnlintrc`

## Ontwikkelen

```bash
npm install
npm run dev      # lokale dev-server
npm run build    # productiebuild naar dist/
npm run preview  # productiebuild lokaal bekijken
```

## Deployen

Vercel herkent Vite automatisch (build: `npm run build`, output: `dist`), dus er is geen extra configuratie nodig.
