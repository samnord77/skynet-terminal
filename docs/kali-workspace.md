# Kali Workspace Architecture

`Skynet Terminal` now ships with a neutral `Kali Workspace` layer that sits on top of the historical eDEX-style renderer.

## Runtime shape

- `src/core/terminal.js`
  - wraps the active xterm tab
  - exposes visual typing, direct command send and output streaming
- `src/core/kali-integration.js`
  - launches `wsl.exe -d <distro>`
  - supports environment checks and one-shot `bash -lc` commands
- `src/core/ai-engine.js`
  - talks to either `LM Studio` or `OpenAI`
  - builds plans, explanations, chat replies and summaries
- `src/modules/tools/index.js`
  - registry of workspace tools shown in the UI
- `src/modules/workflows/index.js`
  - reusable baseline workflows rendered by the workspace modal

## UI integration

- The historical renderer remains the app entrypoint.
- `src/main.js` creates a bridge that the renderer uses to:
  - open a Kali shell in the visible terminal
  - run a Kali command with visual typing
  - request an AI plan from the active AI provider
  - display workflow cards, tool cards and session summaries

## TypeScript strategy

- The runtime still executes `.js` files today to avoid breaking the Electron 12 flow.
- Matching `.ts` files live next to the runtime modules and re-export the same APIs.
- `tsconfig.json` is included so the workspace layer can be type-checked incrementally without forcing a full repo migration.
