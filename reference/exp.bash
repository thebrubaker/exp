#!/usr/bin/env bash
# exp — instant experiment forking via APFS clonefile
#
# The worktree replacement: no branches, no stash, no complexity.
# Just an instant copy of EVERYTHING — node_modules, .env, .git,
# build cache, exported sessions — and a new terminal to work in.
#
# Works because macOS APFS clonefile (cp -c) is copy-on-write:
# 800MB node_modules clones in <1 second, near-zero disk until files diverge.
#
# Designed for Claude Code:
#   1. /export               ← optional: saves session context to a file
#   2. exp new "try redis"   ← instant clone, new terminal opens
#   3. The export file rides along in the clone
#   4. exp clean-export      ← removes the export from the original (keeps clone's copy)
#
# Requires: macOS with APFS, bash

set -euo pipefail

VERSION="0.3.0"

# ── Config ──────────────────────────────────────────────────────────────────

EXP_ROOT="${EXP_ROOT:-}"              # override experiment storage dir
EXP_TERMINAL="${EXP_TERMINAL:-auto}"  # auto | iterm | terminal | warp | ghostty | tmux | none
EXP_OPEN_EDITOR="${EXP_OPEN_EDITOR:-}" # code | cursor | zed | (empty)
EXP_CLEAN="${EXP_CLEAN:-}"            # space-separated dirs to nuke post-clone: ".next .turbo dist"

# ── Colors ──────────────────────────────────────────────────────────────────

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'
BLUE='\033[0;34m'; MAGENTA='\033[0;35m'; CYAN='\033[0;36m'
DIM='\033[2m'; BOLD='\033[1m'; RESET='\033[0m'

info()  { echo -e "${BLUE}▸${RESET} $*"; }
ok()    { echo -e "${GREEN}✓${RESET} $*"; }
warn()  { echo -e "${YELLOW}⚠${RESET} $*"; }
err()   { echo -e "${RED}✗${RESET} $*" >&2; }
dim()   { echo -e "${DIM}$*${RESET}"; }

# ── Helpers ─────────────────────────────────────────────────────────────────

get_project_root() {
    local dir="${1:-$PWD}"
    while [[ "$dir" != "/" ]]; do
        if [[ -d "$dir/.git" ]] || [[ -f "$dir/package.json" ]] || \
           [[ -f "$dir/Cargo.toml" ]] || [[ -f "$dir/pyproject.toml" ]] || \
           [[ -f "$dir/go.mod" ]] || [[ -f "$dir/.exp-root" ]]; then
            echo "$dir"
            return 0
        fi
        dir="$(dirname "$dir")"
    done
    echo "${1:-$PWD}"
}

get_project_name() { basename "$(get_project_root)"; }

get_exp_base() {
    local root; root="$(get_project_root)"
    if [[ -n "$EXP_ROOT" ]]; then
        echo "$EXP_ROOT/$(get_project_name)"
    else
        echo "$(dirname "$root")/.exp-$(basename "$root")"
    fi
}

slugify() {
    echo "$*" | tr '[:upper:]' '[:lower:]' | \
        sed "s/[^a-z0-9]/-/g; s/--*/-/g; s/^-//; s/-$//"
}

ensure_exp_base() { local b; b="$(get_exp_base)"; mkdir -p "$b"; echo "$b"; }

resolve_exp() {
    local q="$1" base; base="$(get_exp_base)"
    [[ ! -d "$base" ]] && return 1

    # Direct match
    [[ -d "$base/$q" ]] && { echo "$base/$q"; return 0; }

    # Number prefix: "3" → "003-*"
    if [[ "$q" =~ ^[0-9]+$ ]]; then
        local m; m=$(find "$base" -maxdepth 1 -type d -name "$(printf '%03d' "$q")-*" | head -1)
        [[ -n "$m" ]] && { echo "$m"; return 0; }
    fi

    # Partial match
    local m; m=$(find "$base" -maxdepth 1 -type d -name "*${q}*" | sort | head -1)
    [[ -n "$m" ]] && { echo "$m"; return 0; }

    return 1
}

next_num() {
    local base; base="$(get_exp_base)"
    [[ ! -d "$base" ]] && { echo "001"; return; }
    local max; max=$(find "$base" -maxdepth 1 -type d -name '[0-9]*' | \
        sed 's|.*/||' | cut -d'-' -f1 | sort -n | tail -1)
    printf "%03d" $(( 10#${max:-0} + 1 ))
}

# ── Terminal ────────────────────────────────────────────────────────────────

detect_terminal() {
    [[ "$EXP_TERMINAL" != "auto" ]] && { echo "$EXP_TERMINAL"; return; }
    if [[ -n "${ITERM_SESSION_ID:-}" ]]; then echo "iterm"
    elif [[ "${TERM_PROGRAM:-}" == "WarpTerminal" ]] || [[ -n "${WARP_TERMINAL:-}" ]]; then echo "warp"
    elif [[ "${TERM_PROGRAM:-}" == "ghostty" ]]; then echo "ghostty"
    elif [[ -n "${TMUX:-}" ]]; then echo "tmux"
    elif [[ "${TERM_PROGRAM:-}" == "Apple_Terminal" ]]; then echo "terminal"
    else echo "terminal"
    fi
}

open_terminal_at() {
    local dir="$1" title="$2" term
    term="$(detect_terminal)"

    # Escape single quotes for osascript embedding
    local safe_dir="${dir//\'/\'\\\'\'}"
    local safe_title="${title//\'/\'\\\'\'}"
    local cmd="cd '${safe_dir}' && clear && echo '🧪 Experiment: ${safe_title}' && echo ''"

    case "$term" in
        iterm)
            osascript -e "
tell application \"iTerm\"
    activate
    tell current window
        create tab with default profile
        tell current session
            write text \"$cmd\"
        end tell
    end tell
end tell" 2>/dev/null
            ;;
        tmux)
            tmux new-window -n "$title" -c "$dir"
            ;;
        terminal|*)
            osascript -e "
tell application \"Terminal\"
    activate
    do script \"$cmd\"
end tell" 2>/dev/null
            ;;
    esac
}

# ── Commands ────────────────────────────────────────────────────────────────

cmd_new() {
    local description="${*:-experiment}"
    local root; root="$(get_project_root)"
    local name; name="$(get_project_name)"
    local slug; slug="$(slugify "$description")"
    local num; num="$(next_num)"
    local exp_name="${num}-${slug}"
    local base; base="$(ensure_exp_base)"
    local exp_dir="$base/$exp_name"

    # ── Clone ──
    info "Cloning ${CYAN}${name}${RESET} → ${MAGENTA}${exp_name}${RESET}"
    local clone_method="apfs"
    if cp -cR "$root" "$exp_dir" 2>/dev/null; then
        : # APFS clonefile — instant
    else
        # Fallback: regular copy (Linux, non-APFS)
        cp -R "$root" "$exp_dir"
        clone_method="copy"
    fi

    # ── Metadata ──
    cat > "$exp_dir/.exp" <<JSON
{"name":"$exp_name","description":"$description","source":"$root","created":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","number":$((10#$num))}
JSON

    # ── Seed CLAUDE.md with experiment context ──
    local marker_start="<!-- exp:start -->"
    local marker_end="<!-- exp:end -->"
    local header="${marker_start}
## ⚡ Side quest: ${description}

APFS clone of \`${name}\`. Original untouched at \`${root}\`.
Goal: **${description}**
Promote: \`exp promote ${num}\` | Trash: \`exp trash ${num}\`
${marker_end}
"
    if [[ -f "$exp_dir/CLAUDE.md" ]]; then
        local tmp; tmp=$(mktemp)
        printf '%s\n' "$header" > "$tmp"
        cat "$exp_dir/CLAUDE.md" >> "$tmp"
        mv "$tmp" "$exp_dir/CLAUDE.md"
    else
        printf '%s\n' "$header" > "$exp_dir/CLAUDE.md"
    fi

    # ── Optional: clean build artifacts that have hardcoded paths ──
    if [[ -n "$EXP_CLEAN" ]]; then
        for d in $EXP_CLEAN; do
            [[ -e "$exp_dir/$d" ]] && { rm -rf "$exp_dir/$d"; dim "  Cleaned $d"; }
        done
    fi

    # ── Stats ──
    if [[ "$clone_method" == "apfs" ]]; then
        ok "Cloned (instant, copy-on-write)"
    else
        ok "Cloned (regular copy)"
    fi
    dim "  source: $root"
    dim "  exp:    $exp_dir"

    # ── Port conflict warning ──
    if [[ -f "$root/package.json" ]] || [[ -f "$root/next.config.js" ]] || [[ -f "$root/next.config.mjs" ]] || [[ -f "$root/next.config.ts" ]]; then
        warn "If dev server is running, the experiment may need a different port"
        dim "  e.g. PORT=3001 pnpm dev"
    fi

    # ── Open terminal ──
    if [[ "$EXP_TERMINAL" != "none" ]]; then
        open_terminal_at "$exp_dir" "$exp_name"
        ok "Terminal open — go jam 🎸"
    else
        ok "Ready: cd '$exp_dir'"
    fi

    # ── Editor ──
    if [[ -n "$EXP_OPEN_EDITOR" ]]; then
        command -v "$EXP_OPEN_EDITOR" &>/dev/null && "$EXP_OPEN_EDITOR" "$exp_dir"
    fi

    echo ""
    dim "  exp diff $num · exp promote $num · exp trash $num"
}

cmd_ls() {
    local base; base="$(get_exp_base)"
    local name; name="$(get_project_name)"

    if [[ ! -d "$base" ]] || [[ -z "$(ls -A "$base" 2>/dev/null)" ]]; then
        dim "No experiments for ${name}. Run: exp new \"my idea\""
        return 0
    fi

    echo ""
    echo -e "${BOLD}Experiments for ${CYAN}${name}${RESET}"
    echo ""

    for d in "$base"/*/; do
        [[ ! -d "$d" ]] && continue
        local dn; dn=$(basename "$d")
        local desc="" created=""
        if [[ -f "$d/.exp" ]]; then
            desc=$(grep -o '"description":"[^"]*"' "$d/.exp" | sed 's/"description":"//;s/"//')
            created=$(grep -o '"created":"[^"]*"' "$d/.exp" | sed 's/"created":"//;s/"//')
        fi
        local sz; sz=$(du -sh "$d" 2>/dev/null | cut -f1)
        echo -e "  🧪 ${BOLD}${dn}${RESET}"
        [[ -n "$desc" ]] && dim "    $desc"
        dim "    ${sz} · ${created:-?}"
        echo ""
    done
}

cmd_diff() {
    local q="${1:?Usage: exp diff <id>}"
    local exp_dir; exp_dir="$(resolve_exp "$q")" || { err "Not found: $q"; return 1; }
    local root; root="$(get_project_root)"

    echo ""
    echo -e "${BOLD}Diff: ${CYAN}$(get_project_name)${RESET} ↔ ${MAGENTA}$(basename "$exp_dir")${RESET}"
    echo ""

    diff -rq "$root" "$exp_dir" \
        --exclude='.exp' --exclude='.git' --exclude='node_modules' \
        --exclude='.next' --exclude='.turbo' --exclude='dist' \
        --exclude='build' --exclude='.cache' --exclude='__pycache__' \
        --exclude='.DS_Store' --exclude='.pnpm-store' \
        2>/dev/null | \
        sed "s|$root|[source]|g; s|$exp_dir|[exp]|g" | \
        while IFS= read -r line; do
            if [[ "$line" == *"Only in [exp]"* ]]; then
                echo -e "  ${GREEN}+${RESET} $line"
            elif [[ "$line" == *"Only in [source]"* ]]; then
                echo -e "  ${RED}-${RESET} $line"
            elif [[ "$line" == *"differ"* ]]; then
                echo -e "  ${YELLOW}~${RESET} $line"
            fi
        done

    echo ""
    dim "Full: diff -r '$root' '$exp_dir' --exclude=node_modules --exclude=.git"
}

cmd_promote() {
    local q="${1:?Usage: exp promote <id>}"
    local exp_dir; exp_dir="$(resolve_exp "$q")" || { err "Not found: $q"; return 1; }
    local root; root="$(get_project_root)"
    local name; name="$(get_project_name)"
    local base; base="$(get_exp_base)"
    local exp_name; exp_name=$(basename "$exp_dir")
    local ts; ts=$(date +"%Y%m%d-%H%M%S")

    echo ""
    warn "Promote ${MAGENTA}${exp_name}${RESET} → ${CYAN}${name}${RESET}?"
    echo -e "  Original backed up to ${DIM}_backup-${ts}${RESET}"
    read -p "  Continue? [y/N] " -n 1 -r; echo ""
    [[ ! $REPLY =~ ^[Yy]$ ]] && { dim "Cancelled."; return 0; }

    local backup="$base/_backup-${ts}"
    mv "$root" "$backup"
    mv "$exp_dir" "$root"

    # Clean experiment markers
    rm -f "$root/.exp"
    if [[ -f "$root/CLAUDE.md" ]]; then
        sed -i '' '/<!-- exp:start -->/,/<!-- exp:end -->/d' "$root/CLAUDE.md" 2>/dev/null || true
    fi

    ok "Promoted. Backup: ${DIM}${backup}${RESET}"
}

cmd_trash() {
    local q="${1:?Usage: exp trash <id>}"
    local exp_dir; exp_dir="$(resolve_exp "$q")" || { err "Not found: $q"; return 1; }
    local exp_name; exp_name=$(basename "$exp_dir")
    local sz; sz=$(du -sh "$exp_dir" 2>/dev/null | cut -f1)

    warn "Delete ${MAGENTA}${exp_name}${RESET}? (${sz})"
    read -p "  Confirm? [y/N] " -n 1 -r; echo ""
    [[ ! $REPLY =~ ^[Yy]$ ]] && { dim "Cancelled."; return 0; }

    rm -rf "$exp_dir"
    ok "Trashed ${exp_name}"
}

cmd_open() {
    local q="${1:?Usage: exp open <id>}"
    local exp_dir; exp_dir="$(resolve_exp "$q")" || { err "Not found: $q"; return 1; }
    open_terminal_at "$exp_dir" "$(basename "$exp_dir")"
    ok "Opened"
}

cmd_cd() {
    local q="${1:?Usage: cd \$(exp cd <id>)}"
    local exp_dir; exp_dir="$(resolve_exp "$q")" || { err "Not found: $q" >&2; return 1; }
    echo "$exp_dir"
}

cmd_clean_export() {
    # Remove /export output files from the ORIGINAL project (they rode along into the clone)
    local root; root="$(get_project_root)"
    local removed=0

    for f in "$root"/claude-export-*.md "$root"/claude-session-*.md; do
        if [[ -f "$f" ]]; then
            rm "$f"
            ok "Removed $(basename "$f") from original"
            removed=$((removed + 1))
        fi
    done

    [[ $removed -eq 0 ]] && dim "No export files found in project root"
}

cmd_nuke() {
    local base; base="$(get_exp_base)"
    local name; name="$(get_project_name)"
    [[ ! -d "$base" ]] && { dim "No experiments for ${name}"; return 0; }

    local count; count=$(find "$base" -maxdepth 1 -mindepth 1 -type d | wc -l | tr -d ' ')
    local sz; sz=$(du -sh "$base" 2>/dev/null | cut -f1)
    warn "Delete ALL ${count} experiments for ${CYAN}${name}${RESET}? (${sz})"
    read -p "  Type project name to confirm: " confirm
    [[ "$confirm" != "$name" ]] && { dim "Cancelled."; return 0; }

    rm -rf "$base"
    ok "Nuked all experiments for ${name}"
}

cmd_status() {
    local root; root="$(get_project_root)"
    local name; name="$(get_project_name)"
    local base; base="$(get_exp_base)"

    echo ""
    echo -e "${BOLD}Project:${RESET}  ${CYAN}${name}${RESET}"
    echo -e "${BOLD}Root:${RESET}     ${root}"
    echo -e "${BOLD}Exp dir:${RESET}  ${base}"

    if [[ -d "$base" ]]; then
        local count; count=$(find "$base" -maxdepth 1 -mindepth 1 -type d | wc -l | tr -d ' ')
        local sz; sz=$(du -sh "$base" 2>/dev/null | cut -f1)
        echo -e "${BOLD}Active:${RESET}   ${count} experiments (${sz})"
    else
        echo -e "${BOLD}Active:${RESET}   0"
    fi
    echo -e "${BOLD}Terminal:${RESET} $(detect_terminal)"

    # Check for export files that could ride along
    local exports; exports=$(ls "$root"/claude-export-*.md "$root"/claude-session-*.md 2>/dev/null | wc -l | tr -d ' ')
    if [[ "$exports" -gt 0 ]]; then
        echo -e "${BOLD}Exports:${RESET}  ${exports} session export(s) in project root"
    fi
    echo ""
}

# ── Help ────────────────────────────────────────────────────────────────────

cmd_help() {
    cat <<'HELP'

  exp — instant experiment forking via APFS clonefile

  WORKFLOW
    /export                       ← optional: save Claude session to file
    exp new "try redis caching"   ← instant clone, terminal opens
    exp clean-export              ← remove export from original (clone keeps it)

  COMMANDS
    exp new "description"     Clone project + open terminal
    exp ls                    List experiments
    exp open <id>             Open terminal in experiment
    exp diff <id>             What changed vs original
    exp promote <id>          Experiment replaces original (with backup)
    exp trash <id>            Delete experiment
    exp nuke                  Delete ALL experiments
    exp cd <id>               Print path (use: cd $(exp cd 3))
    exp status                Project info
    exp clean-export          Remove /export files from original after cloning

  IDs
    Number (1), full name (001-try-redis), or partial match (redis).

  CONFIG (env vars)
    EXP_ROOT           Override experiment storage location
    EXP_TERMINAL       auto | iterm | terminal | warp | ghostty | tmux | none
    EXP_OPEN_EDITOR    code | cursor | zed
    EXP_CLEAN          Dirs to nuke after clone, e.g. ".next .turbo dist"

  HOW IT WORKS
    macOS APFS clonefile (cp -cR): instant copy-on-write clone.
    800MB node_modules → cloned in <1s, near-zero disk.
    .env, .git, node_modules, exports — everything comes along.

HELP
}

# ── Main ────────────────────────────────────────────────────────────────────

main() {
    local cmd="${1:-help}"; shift || true
    case "$cmd" in
        new|n)            cmd_new "$@" ;;
        ls|list|l)        cmd_ls "$@" ;;
        diff|d)           cmd_diff "$@" ;;
        promote|p)        cmd_promote "$@" ;;
        trash|rm|t)       cmd_trash "$@" ;;
        open|o)           cmd_open "$@" ;;
        cd)               cmd_cd "$@" ;;
        status|st)        cmd_status "$@" ;;
        nuke)             cmd_nuke "$@" ;;
        clean-export|ce)  cmd_clean_export "$@" ;;
        help|--help|-h)   cmd_help ;;
        --version|-v)     echo "exp $VERSION" ;;
        *)                err "Unknown: $cmd"; cmd_help; exit 1 ;;
    esac
}

main "$@"
