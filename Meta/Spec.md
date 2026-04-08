# Project Spec

## Objective
An OS wide command logger for tracking all commands executed on a machine.

## Functional Requirements
- Capture all commands run in a terminal by user and persist them locally as dated files for each day.
- With each command, capture the terminal ID, session ID, PWD, user, timestamp, and exit code.
- The user should be able to browse the history, filter, sort, and full-text search based on fields available, and comment against each line.
- Comments made against log entries are stored with a stable reference to the original entry and surfaced in the detail panel when that entry is selected.
- The log view updates in real-time as commands are executed in other terminals.

## Technical Requirements

### Capture
- An init script is required that will set up the logging directories and update shell RC files (`.bashrc`, `.zshrc`, etc.) to hook the logger. This is executed once per machine and must be idempotent (safe to re-run).
- The init script must support a `--remove` flag to cleanly reverse all shell hooks and optionally remove log files.
- Use `trap DEBUG` to capture the command string before execution, and `PROMPT_COMMAND` (or equivalent) to capture the exit code after — combining both is required to reliably record all fields.
- Logging must be silent and passive, requiring no additional configuration or attention from the user.
- Each log entry must include a stable unique ID (UUID) so that comments can reference entries reliably regardless of file changes.
- A user-level config file (e.g., `~/.nixlog/config`) should allow overriding the log directory path and specifying exclusion patterns for sensitive commands.
- Sensitive commands (e.g., those containing common secret flags like `--password`, `--token`) should be redacted or excluded by default, with an opt-out mechanism (e.g., prefixing a command with a space).

### Log Storage
- ~~The logs are to be captured into a read-only directory.~~
- Logs are organized hierarchically: `year/month/day/` (e.g., `2026/04/08/`).
- Each day's commands are written to a dated log file (e.g., `2026-04-08.jsonl`).
- If a daily log file exceeds a safe size limit (e.g., 10 MB), subsequent entries are written to sequentially numbered part files (e.g., `2026-04-08.part2.jsonl`, `2026-04-08.part3.jsonl`).
- Log format is JSONL (one JSON object per line) for easy parsing, filtering, and sorting.
- Comments are stored in separate files alongside the log files, referencing entries by their UUID.

### UI
- A lightweight browser-based UI served by a local Python HTTP server bundled with the tool (no external hosting required).
- Built with vanilla JS or a minimal framework (e.g., Preact/Svelte) — no heavy dependencies.
- Left pane: hierarchical directory navigator (year → month → day → part files).
- Right pane is split vertically into two panes separated by a draggable divider:
  - **Top pane:** log entry table with real-time updates via SSE (Server-Sent Events). Table columns are individually resizable by dragging the divider between column headers.
  - **Bottom pane:** detail view for the selected log entry, showing all fields (command, time, exit code, user, directory, terminal, session) as a labelled row list, plus the comments section for that entry.
- Clicking a row in the top pane populates the bottom pane; no placeholder messages are shown in either pane.
- Supports filtering and sorting by any field (user, PWD, exit code, timestamp, etc.) and full-text search across command strings.
- A theme selector in the header allows switching between Dark, Light, and System (follows OS preference) themes. The selected theme is persisted across sessions.

## Notes
- Multi-user awareness: the `user` field is captured per entry; log directory structure may be shared or per-user depending on deployment.
