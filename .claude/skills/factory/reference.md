# Riferimento della factory

## Stadi di un job

| Stadio | Chi lavora | Esiti → stadio successivo |
| --- | --- | --- |
| `intake` | factory-intake (Fable) | ACCEPT → `route` → `spec` · REJECT → `rejected` · NEEDS-INFO → `needs-info` |
| `route` | `factory/bin/route` (automatico dentro `job finish`) | sceglie reviewer e modelli → `spec` |
| `spec` | factory-spec-writer (Opus) | DONE → `build` · BLOCKED → `needs-human` |
| `build` | factory-builder (Opus) | DONE → `gate` · BLOCKED → `needs-human` |
| `gate` | `factory/bin/gate` + `checks.sh` | PASS → `review` · FAIL → `build` (round +1) · ERROR → `needs-human` |
| `review` | reviewer scelti dal routing, in parallelo | tutti PASS → `approval` · almeno un CHANGES → `build` (round +1) |
| `approval` | factory-approver (Opus) | APPROVE → `final-gate` · ESCALATE → `needs-human` |
| `final-gate` | `factory/bin/gate --final` | PASS → `done` · FAIL → `build` (round +1) · ERROR → `needs-human` |
| `needs-info` | autore | feedback → `intake` |
| `needs-human` | umano | feedback → `build` (nuovo ciclo) · `retry` → stadio di ripresa · `approve` → `done` · `close` → `closed` |
| `done` | umano | crea la PR/MR dal branch. Un feedback riapre il job in `build` (nuovo ciclo) |
| `rejected`, `closed` | — | terminali (`rejected` accetta un feedback che riapre l'intake) |

Round e cicli:

- Un **round** è un passaggio del builder. Ogni ritorno al builder (gate FAIL, review CHANGES, gate finale FAIL) aggiunge un round.
- Oltre `max_rounds` (default 3) il job va in `needs-human` invece di tornare al builder.
- Un **ciclo** si apre con un feedback umano o un `retry` verso `build`: round azzerati, il builder riceve il feedback e l'esito del ciclo precedente.
- Un ruolo che fallisce due volte di fila (`job fail`) manda il job in `needs-human`; `retry` riprende dallo stesso stadio.

Etichette (configurabili in `labels`): `factory:in-progress`, `factory:needs-info`, `factory:needs-human`, `factory:done`, `factory:rejected`, `factory:closed`.

## Formato dei report

Ogni step scrive un markdown in `factory/jobs/<id>/steps/NN-<ruolo>-c<ciclo>r<round>.md` che inizia con:

```
---
verdict: <verdetto>
summary: <una riga>
---
```

| Ruolo | Verdetti | Campi aggiuntivi | File aggiuntivi |
| --- | --- | --- | --- |
| intake | ACCEPT, REJECT, NEEDS-INFO | `risk` (obbligatorio se ACCEPT), `surfaces`, `title`, `question` | — |
| spec-writer | DONE, BLOCKED | — | `spec.md` (obbligatorio se DONE) |
| builder | DONE, BLOCKED | `commits` | commit sul branch, worktree pulito |
| code/ux/ui/security-review | PASS, CHANGES | — | — |
| approver | APPROVE, ESCALATE | `pr_title` | `PR.md` (obbligatorio se APPROVE) |
| gate, final-gate | PASS, FAIL, ERROR | `head`, `duration_s` | log in `logs/` |

`job finish` rifiuta (exit 3) un report mancante, un verdetto non previsto, un ACCEPT senza rischio,
un DONE della spec senza `spec.md`, un DONE del builder con modifiche non committate, un APPROVE senza `PR.md`.

## Cartella di un job

```
factory/jobs/0007-titolo/
  job.json        stato (scritto solo da factory/bin/job)
  request.md      richiesta originale
  spec.md         spec tecnica
  PR.md           titolo e descrizione della PR/MR (approver)
  HANDOFF.md      istruzioni finali per l'umano
  steps/          un report per step
  logs/           log del gate
  feedback/       feedback umani numerati
```

Il codice vive nel worktree `../<repo>.factory-worktrees/<id>` sul branch `factory/<id>`.

## Comandi di `factory/bin/job`

| Comando | Uso |
| --- | --- |
| `new --source F \| --text T \| --stdin [--title T]` | crea un job in `intake` |
| `ingest` | crea job dai `.md` in `factory/inbox/` e li sposta in `inbox/processed/` |
| `dispatch --session S [--recover] [--ingest]` | avvia gli step eseguibili e restituisce i payload |
| `finish JOB RUOLO [--agent-id ID]` | registra il report e applica la transizione |
| `fail JOB RUOLO --reason R` | registra uno step fallito |
| `feedback JOB --text T \| --file F \| --stdin` | aggiunge un feedback, riparte se il job aspettava |
| `retry JOB` · `approve JOB [--note N]` · `close JOB [--reason R]` | decisioni umane |
| `cleanup JOB [--delete-branch]` | rimuove il worktree di un job concluso |
| `list [--brief\|--json\|--all]` · `show JOB [--json]` | consultazione |
| `cost [JOB ...] [--force]` · `index` | ricalcolo costi e indice della dashboard |
