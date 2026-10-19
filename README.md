# Codex Workbench

Local Electron client for turning rough requirements, project documentation, and shared memory into executable Codex CLI task flows.

## MVP Scope

- Electron app with Vite, React, Tailwind, and a Material Design 3 inspired light theme.
- One local project maps to one agent.
- Each agent can have multiple independent requirement conversations.
- Memory is separated into global, project, agent, and conversation layers.
- Project scanning reads package metadata and documentation, while ignoring build output and sensitive files.
- Prompt, Kanban, Executor, Review, and Memory are connected into one local workflow.
- Quick Change provides a project-level fast lane for small, explicit edits while keeping Git snapshots, review feedback, and undo support.
- Codex CLI is the only execution engine.

## Commands

```bash
npm install
npm run dev
```

### Build and Package

```bash
# Type-check and build Electron main/preload plus Vite renderer.
npm run build

# Create an unpacked macOS app in release/mac-arm64 for quick local testing.
npm run package:dir

# Create local unsigned macOS dmg and zip artifacts in release/.
npm run package
```

The default package flow is intended for local use and disables macOS code signing. If the app is opened from a downloaded `.dmg`, macOS may require approving it in System Settings because it is not notarized.

## Data

App data is stored in:

```text
~/Library/Application Support/codex-prompt-studio
```

The folder keeps the original app identifier so existing local projects, tasks, settings, and memory remain available after the app was renamed to Codex Workbench.
# workbench
