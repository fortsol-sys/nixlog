# nixlog

An OS-wide command logger that silently captures every command you run in a terminal — with metadata, full-text search, real-time updates, and a lightweight browser

Creating this for myself as I need this functionality in multiple environments as I work on my home-lab.

### Disclaimer: This is vibe-coded. Please take precautions to ensure that your data is secure.

---

## Features

- **Automatic capture** — hooks into bash and zsh via `trap DEBUG` / `preexec`; no manual logging required
- **Rich metadata** — timestamp, exit code, working directory, user, terminal ID, session ID
- **Real-time UI** — log entries appear instantly via Server-Sent Events (SSE) as you run commands
- **Search & filter** — full-text search across commands, filter by exit code, and pin field-specific filters from the detail panel
- **Sortable columns** — click any column header to sort; columns are individually resizable by dragging
- **Comments** — annotate any log entry; comments are stored alongside logs and shown in the detail panel
- **Themes** — Dark, Light, and System (follows OS preference), persisted across sessions
- **Sensitive command redaction** — commands containing flags like `--password` or `--token` are redacted by default
- **Hierarchical storage** — logs organised as `YYYY/MM/DD/YYYY-MM-DD.jsonl`; automatic part-files when a day's log exceeds 10 MB

---

## Requirements

- Python 3.8+
- bash or zsh
- A modern browser (Chrome, Firefox, Edge, Safari)

---

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/nixlog.git
cd nixlog

# 2. Make the main script executable
chmod +x nixlog

# 3. Install shell hooks (idempotent — safe to re-run)
./nixlog init

# 4. Reload your shell
source ~/.bashrc   # or source ~/.zshrc

# 5. Start the UI server
./nixlog serve
# Open http://localhost:8765 in your browser
```

From this point on every command you run is logged automatically.

---

## Installation

### `./nixlog init`

Installs the shell hooks and creates the logging directory structure. This command:

- Creates `~/.nixlog/` with subdirectories for logs and config
- Appends a sourcing block to `~/.bashrc` and/or `~/.zshrc`
- Is **idempotent** — safe to run multiple times; will not duplicate hooks

### Removing nixlog

```bash
./nixlog init --remove
```

Strips the shell hooks from your RC files. Pass `--remove-logs` as well to also delete the log directory:

```bash
./nixlog init --remove --remove-logs
```

---

## Usage

### Start the UI

```bash
./nixlog serve
```

Opens the log browser at `http://localhost:8765` by default.

Options:

| Flag | Default | Description |
|------|---------|-------------|
| `--port PORT` | `8765` | Port to listen on |
| `--log-dir DIR` | `~/.nixlog/logs` | Root log directory |

### Browse logs

1. Select a day from the left sidebar (tree: year → month → day → part files)
2. Log entries load in the top pane; new entries stream in live
3. Click a row to see full details in the bottom pane
4. Drag the divider between the two panes to resize them

### Search & filter

- **Search box** — filters by command text, directory, or user (debounced, 150 ms)
- **Exit code dropdown** — show All / Success only / Errors only
- **Field filters** — in the detail panel, click ⊕ next to any field to pin a filter chip; click × on a chip to remove it

### Comments

Select a log entry, type in the comment box at the bottom-right of the detail panel, and press **Add** or **Enter**.  
Comments are stored in sidecar `.comments.jsonl` files and are always linked to entries by their UUID.

---

## Configuration

nixlog reads `~/.nixlog/config` on startup. Create or edit it to override defaults:

```ini
# ~/.nixlog/config

# Where to store logs (default: ~/.nixlog/logs)
log_dir = /path/to/custom/logs

# Commands matching these patterns are excluded from logging (one per line)
# Supports shell-style globs (fnmatch)
exclude =
    ssh-add *
    gpg *
```

Sensitive patterns (commands containing `--password`, `--token`, `--secret`, `--key`, `--auth`) are **redacted automatically**. To log a command that would otherwise be redacted, prefix it with a space:

```bash
 my-tool --token abc123   # leading space opts out of redaction
```

---

## Architecture

```
nixlog/
├── nixlog          # Python executable — HTTP server + _log subcommand
├── hook.sh         # Shell hooks sourced by bash/zsh RC files
└── ui/
    ├── index.html  # Single-page app shell
    ├── app.js      # Vanilla JS — tree, table, SSE, filters, comments
    └── style.css   # CSS variables for theming, split-view layout
```

### Log storage layout

```
~/.nixlog/logs/
└── 2026/
    └── 04/
        └── 08/
            ├── 2026-04-08.jsonl          # primary day file
            ├── 2026-04-08.part2.jsonl    # created when primary exceeds 10 MB
            └── 2026-04-08.comments.jsonl # comments for this day's entries
```

Each log entry (JSONL) looks like:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-04-08T14:23:01.123456",
  "command": "git status",
  "exit_code": 0,
  "pwd": "/home/user/projects/nixlog",
  "user": "user",
  "terminal": "/dev/pts/1",
  "session_id": "abc123"
}
```

### API endpoints (served by `nixlog serve`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/tree` | Directory tree of available log files |
| `GET` | `/api/logs?path=…` | All entries in a given log file |
| `GET` | `/api/stream?path=…` | SSE stream of new entries for a log file |
| `GET` | `/api/comments?path=…` | Comments for a log file |
| `POST` | `/api/comments` | Add a comment to an entry |

---

## License

MIT
