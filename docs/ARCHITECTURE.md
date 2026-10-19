# Architecture

Codex Workbench is intentionally local-first.

## Runtime Shape

```text
Electron main process
  - reads selected project folders
  - scans package metadata and docs
  - stores local app data
  - invokes Codex CLI for prompt expansion

Electron preload
  - exposes a narrow IPC API

React renderer
  - project/agent list
  - independent requirement conversations
  - layered memory editing
  - final expanded prompt display
```

## First Version Storage

The first version uses a local repository abstraction backed by:

```text
~/Library/Application Support/codex-prompt-studio/data.json
```

The API is intentionally centralized in `AppStore` so the backing store can be moved to SQLite without changing renderer code.

Projects support grouping, manual ordering, and two removal modes. Hide marks the project with `hiddenAt` and removes it from active workspace views while preserving related records. Delete removes the project and its related agent, conversations, tasks, runs, scoped memories, and task-group project references from the local app data. Neither mode deletes source files from disk.

## Project Scan Rules

The scanner reads project-level metadata and documentation:

- `package.json`
- `README*`
- `AGENTS.md`
- `docs/**`
- `*CONTRIBUTING*`
- `*ISSUES*`
- `*MIGRATION*`
- `*SETUP*`
- `*ENV*`

It ignores:

- `node_modules`
- `.git`
- `_next`
- `.next`
- `dist`
- `build`
- `.turbo`
- `coverage`
- `.env*`

## Codex CLI Boundary

The MVP calls Codex CLI only to expand a requirement prompt. It does not ask Codex to edit files or run project commands.

## Workflow Modules

The product is moving toward a local replacement for the useful parts of the previous Slock AI + Cline workflow:

```text
Prompt -> Kanban -> Executor -> Review -> Memory
```

### Prompt

The Prompt module turns rough requirements, PRDs, design notes, and project summaries into structured execution prompts.

Responsibilities:

- collect the raw requirement
- provide a default requirement expansion template for executor-ready context
- combine project summary and memory
- surface related memory while the user drafts the requirement
- expand the requirement into a clear execution prompt
- push the result into Kanban as a task group for the current project

Multi-project distribution happens in Kanban, not Prompt. The task group lets the user track one PRD or design request across PC, H5, and related business projects as a single planning unit.

### Kanban

The Kanban module schedules work before execution.

Kanban is global by default. It shows work across all agents/projects, with a current-project filter available when the user needs a narrower view.

Task groups are the planning unit for one requirement distributed to multiple projects. The Kanban module shows recent groups, opens a group detail view, adds projects to an existing requirement group, compares each project's task status, can move every Inbox or Blocked task in that group to Ready, and can open the group directly in Executor.

Task states:

- Inbox
- Ready
- In Progress
- Blocked
- Review
- Done

### Executor

The Executor module is Codex-only. It uses the local authenticated Codex CLI as the execution engine.

Every Kanban task stores a generated Codex task package. For multi-project distribution, each selected project receives its own task package. This package is built in the Electron main process from:

- raw requirement
- Prompt module expansion
- project scan summary
- layered memory
- execution rules
- final report contract

This keeps execution stable even if the visible conversation changes later.

Planned run stages:

- Plan: read task context and generate an execution plan
- Act: call Codex CLI to modify code
- Verify: run checks and collect command output
- Report: summarize changes and memory candidates

Current executor behavior:

- execution can target the current project queue or a global task group
- a global task group runs one selected project task at a time through Codex CLI
- `Start` creates an executor run record
- the task moves to `In Progress`
- the main process calls local `codex` in the task project directory
- stdout/stderr are streamed through IPC into the renderer
- successful runs move the task to `Review`
- failed runs move the task to `Blocked`
- cancelled runs move the task back to `Ready`
- completed tasks can be rerun from the Executor panel
- Review tasks can be marked `Done`
- Review tasks show a structured memory candidate before completion
- Review tasks can save the structured task conclusion into project memory before moving to `Done`

Retries with richer policy controls are planned after the Codex streaming path is stable.

### Memory

Memory remains layered:

- Global memory
- Project memory
- Agent memory
- Conversation memory

The UI can create, edit, and delete memory at every layer. Global memory carries cross-project conventions, project memory captures local implementation patterns, agent memory keeps project-agent operating notes, and conversation memory stores conclusions for one requirement thread.

The Memory module is global by default. It summarizes memories across all agents/projects, with a current-project filter for local context. Search is scoped after the global/current filter and matches memory title, content, scope, and owner label so similar past tasks can be found before prompting or executing.
