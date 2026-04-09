#!/usr/bin/env bash
# nixlog shell hook
# Source this file from .bashrc / .zshrc — do not execute directly.
# nixlog init writes the source line automatically.

# Resolve the nixlog binary relative to this hook file (works when sourced).
if [ -n "$ZSH_VERSION" ]; then
    _NIXLOG_DIR="$(dirname "$(realpath "${(%):-%x}")")"
else
    _NIXLOG_DIR="$(dirname "$(realpath "${BASH_SOURCE[0]}")")"
fi
_NIXLOG_BIN="${NIXLOG_BIN:-$_NIXLOG_DIR/nixlog}"

# ─── Session ID ───────────────────────────────────────────────────────────────

_nixlog_gen_uuid() {
    if [ -r /proc/sys/kernel/random/uuid ]; then
        cat /proc/sys/kernel/random/uuid
    elif command -v python3 &>/dev/null; then
        python3 -c "import uuid; print(uuid.uuid4())"
    else
        # Fallback: timestamp + PID
        printf '%s-%s' "$(date +%s%N)" "$$"
    fi
}

_NIXLOG_SESSION_ID="$(_nixlog_gen_uuid)"
_NIXLOG_LAST_HIST=""   # used by bash to deduplicate history reads

# ─── Shared log writer ────────────────────────────────────────────────────────

_nixlog_write() {
    local cmd="$1" exit_code="$2"
    [ -z "$cmd" ] && return
    ( "$_NIXLOG_BIN" _log \
        --cmd        "$cmd"                    \
        --exit-code  "$exit_code"              \
        --session    "$_NIXLOG_SESSION_ID"     \
        --pwd        "$PWD"                    \
        --user       "${USER:-$(id -un)}"      \
        --terminal   "$(tty 2>/dev/null || echo '')" \
        2>/dev/null & )
}

# ─── Zsh ──────────────────────────────────────────────────────────────────────

if [ -n "$ZSH_VERSION" ]; then
    autoload -Uz add-zsh-hook

    _nixlog_zsh_preexec() {
        # $1 is the command string as typed (full pipeline included)
        _NIXLOG_ZSH_CMD="$1"
    }

    _nixlog_zsh_precmd() {
        local exit_code=$?
        local cmd="${_NIXLOG_ZSH_CMD:-}"
        _NIXLOG_ZSH_CMD=""
        [ -z "$cmd" ] && return
        _nixlog_write "$cmd" "$exit_code"
    }

    add-zsh-hook preexec _nixlog_zsh_preexec
    add-zsh-hook precmd  _nixlog_zsh_precmd

# ─── Bash ─────────────────────────────────────────────────────────────────────

elif [ -n "$BASH_VERSION" ]; then
    _NIXLOG_CMD_RAN=0

    _nixlog_bash_preexec() {
        # Fires before every simple command; we only set a flag here.
        [ -n "$COMP_LINE" ] && return   # skip during tab-completion
        case "$BASH_COMMAND" in
            _nixlog_*) return ;;         # skip our own internal functions
        esac
        _NIXLOG_CMD_RAN=1
    }

    _nixlog_bash_precmd() {
        local exit_code=$?
        [ "$_NIXLOG_CMD_RAN" -eq 0 ] && return
        _NIXLOG_CMD_RAN=0

        # Read the full command (including pipelines) from history.
        # history 1 gives: "  NNN  command text"
        local cmd
        cmd=$(HISTTIMEFORMAT='' history 1 2>/dev/null \
              | sed 's/^[[:space:]]*[0-9]\+[[:space:]]*//')

        [ -z "$cmd" ] && return

        # Deduplicate: skip if this is the same entry we already logged.
        [ "$cmd" = "$_NIXLOG_LAST_HIST" ] && return
        _NIXLOG_LAST_HIST="$cmd"

        _nixlog_write "$cmd" "$exit_code"
    }

    trap '_nixlog_bash_preexec' DEBUG
    # Prepend our hook so it runs first; preserve any existing PROMPT_COMMAND.
    if [ -z "$PROMPT_COMMAND" ]; then
        PROMPT_COMMAND="_nixlog_bash_precmd"
    else
        PROMPT_COMMAND="_nixlog_bash_precmd;$PROMPT_COMMAND"
    fi
fi
