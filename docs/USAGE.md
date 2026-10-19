# Codex Workbench Usage

Codex Workbench is a local Electron client for the workflow:

```text
Prompt -> Kanban -> Executor -> Review -> Memory
```

It is designed for one local project mapping to one agent. A single requirement can be distributed to multiple projects, and each project receives its own Codex task package.

The app has two complementary execution paths:

- `Quick Change`: for a small, explicit change in one project.
- Standard workflow: for requirements that need clarification, planning, distribution, or durable documentation.

## Start

Install dependencies once:

```bash
npm install
```

Start the Electron app:

```bash
npm run dev
```

The app stores local data under:

```text
~/Library/Application Support/codex-prompt-studio
```

## Add Projects

1. Click `Add Project`.
2. Select a local project directory.
3. The app creates one agent for that project.
4. The app scans package metadata, scripts, common docs, and important directories.

Only manually added projects become agents.

Projects can be organized in the left sidebar:

- Click the group button near `Add Project` to create a group.
- Drag a project onto a group to move it there.
- Drag a project onto another project in the same group to reorder it.
- Project removal actions appear when hovering a project row.

Each project row has two removal actions:

- `Hide`: removes the project from the active workspace views, but keeps agent, conversations, tasks, runs, and memory in local data. Add the same directory again to restore it.
- `Delete`: removes the project record and its related agent, conversations, tasks, runs, project/agent/conversation memory, and task-group project references. This does not delete the source code directory from disk.

## Prompt Module

Use Prompt to turn rough requirements into executable task packages.

1. Select the current project/agent on the left.
2. Create or select a requirement thread.
3. Fill in the title and raw requirement.
4. Click `Template` if you want to insert the default requirement expansion structure.
5. Review `Related memory` for similar past conclusions.
6. Click `Save`.
7. Click `Expand` to ask Codex CLI to produce a clearer execution prompt.
8. Click `To Board` to create a task group for the current project.

`Related memory` is computed from saved memories and matches the current title and requirement text.

## Quick Change

Use Quick Change for copy, styling, layout, small component behavior, and focused bug fixes where the intended result is already clear.

1. Select the target project in the left sidebar.
2. Open `Issues` and click `快速修改`.
3. Describe the change. The title is optional and defaults to the first line of the description.
4. Optionally attach files or paste screenshots.
5. Click `立即修改` or press `Cmd/Ctrl + Enter`.

Quick Change creates a `Ready` task and starts Codex immediately. It skips Work Item, Prompt expansion, Task Group, and the manual Ready transition. It still captures the pre-run Git state and supports per-run Undo.

After the first run:

- Enter feedback and click `继续修改` to iterate in the same task context.
- Click `完成` to close the task without a mandatory archive.
- Click `归档` when the result should be saved to project memory.
- Click `升级为标准任务` if the change needs requirement clarification or broader planning.

Codex is instructed to stop and recommend a standard task instead of editing when it detects cross-project work, architecture changes, data migrations, security-policy changes, destructive API changes, or unclear requirements.

## Kanban Module

Kanban is global by default.

- `All Projects` shows tasks across all agents.
- `Current Project` narrows planning to the selected project.
- Recent task groups appear above the board.
- Clicking a task group opens its cross-project status detail.

Common flow:

1. Open the task group generated from Prompt.
2. Review each project task.
3. Use `Add Project` in the task group detail if the same requirement should be distributed to another project.
4. Click `Move to Ready` when the requirement is clear enough.
5. Click `Execute` to open that group in Executor.

Task states:

- `Inbox`: generated but not scheduled.
- `Ready`: clear enough to execute.
- `In Progress`: Codex CLI is running.
- `Blocked`: execution failed or needs more context.
- `Review`: Codex completed and needs confirmation.
- `Done`: closed.

## Executor Module

Executor uses Codex CLI only.

Execution scope options:

- `Current Project`: run tasks for the selected project.
- A task group: run tasks from one cross-project requirement group.

Run flow:

1. Move a task or group to `Ready`.
2. Open Executor.
3. Choose the execution scope.
4. Click `Start`.
5. Watch the streamed Codex output in `Run Log`.
6. On success, the task moves to `Review`.
7. On failure, the task moves to `Blocked`.
8. A cancelled run moves back to `Ready`.

In `Review`, the app shows a `Memory Candidate` built from the task, project, run status, requirement, and recent Codex output.

Use:

- `Done` to close without saving memory.
- `Save Memory & Done` to save the structured conclusion to project memory.

## Memory Module

Memory is global by default and supports local search.

Scopes:

- `All Agents`: search all visible memories across projects.
- `Current Project`: focus on the selected project.

Search matches:

- memory title
- memory content
- memory scope
- project name

Manual memory can be saved to four layers:

- `Global`: shared by every project and agent.
- `Current Project`: shared by all conversations for the selected project.
- `Current Agent`: attached to the selected project's agent.
- `Current Conversation`: attached to one requirement thread.

The Prompt and Executor builders read these layers in context, so higher-level conventions and local task conclusions can both influence future work.

Existing memory cards support:

- `Edit`: loads the record into the left form and preserves the original owner unless the layer is changed.
- `Delete`: removes the record after confirmation.

Use Memory for:

- project conventions
- repeated implementation patterns
- task conclusions from successful Codex runs
- warnings from failed or blocked runs

## Recommended Daily Workflow

1. Decide whether the work is a focused Quick Change or a standard requirement.
2. For a Quick Change, select the project, describe the edit, and run it immediately.
3. Continue adjustments in the same Executor task; complete or archive when verified.
4. For a standard requirement, draft it in Prompt and check related memory.
5. Expand the prompt, select target projects, and send it to Kanban.
6. Review the task group, move it to Ready, and execute one project task at a time.
7. Review results and save reusable conclusions to Memory.

## Weekly Report

The right sidebar has a weekly report button. It reads the selected project's git commits for the current natural week and generates a Markdown report with commit details, a work summary, and a follow-up section. It does not modify the repository.

## Layout

Both sidebars can be collapsed with the panel buttons. The left sidebar keeps navigation compact, and the right sidebar can be hidden when you need more room for Prompt, Kanban, Executor, or Memory.

## Current Limits

- Codex execution is single-task at a time.
- Memory search is local keyword matching, not vector search.
- The app assumes Codex CLI is already authenticated locally.
