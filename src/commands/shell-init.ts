import { type ShellType, detectShell } from "../utils/shell-integration.ts";

const ZSH_INIT = `
exp() {
  local cdfile
  cdfile=$(mktemp "\${TMPDIR:-/tmp}/exp-cd.XXXXXX")
  EXP_CD_FILE="$cdfile" command exp "$@"
  local rc=$?
  local line
  if [[ -f "$cdfile" ]]; then
    while IFS= read -r line; do
      case "$line" in
        cd:*)
          local target="\${line#cd:}"
          if [[ -n "$target" && "$target" != "$PWD" ]]; then
            builtin cd "$target" || true
          fi
          ;;
        defer:*)
          local payload="\${line#defer:}"
          local src="\${payload%%:*}"
          local dst="\${payload#*:}"
          /bin/cp -cR "$src" "$dst" &>/dev/null &
          disown 2>/dev/null
          ;;
        *)
          # Backwards compat: bare path = cd target
          if [[ -n "$line" && "$line" != "$PWD" ]]; then
            builtin cd "$line" || true
          fi
          ;;
      esac
    done < "$cdfile"
  fi
  /bin/rm -f "$cdfile"
  return $rc
}
`.trimStart();

const BASH_INIT = `
exp() {
  local cdfile
  cdfile=$(mktemp "\${TMPDIR:-/tmp}/exp-cd.XXXXXX")
  EXP_CD_FILE="$cdfile" command exp "$@"
  local rc=$?
  local line
  if [[ -f "$cdfile" ]]; then
    while IFS= read -r line; do
      case "$line" in
        cd:*)
          local target="\${line#cd:}"
          if [[ -n "$target" && "$target" != "$PWD" ]]; then
            builtin cd "$target" || true
          fi
          ;;
        defer:*)
          local payload="\${line#defer:}"
          local src="\${payload%%:*}"
          local dst="\${payload#*:}"
          /bin/cp -cR "$src" "$dst" &>/dev/null &
          disown 2>/dev/null
          ;;
        *)
          if [[ -n "$line" && "$line" != "$PWD" ]]; then
            builtin cd "$line" || true
          fi
          ;;
      esac
    done < "$cdfile"
  fi
  /bin/rm -f "$cdfile"
  return $rc
}
`.trimStart();

const FISH_INIT = `
function exp
  set -l cdfile (mktemp (set -q TMPDIR; and echo $TMPDIR; or echo /tmp)"/exp-cd.XXXXXX")
  EXP_CD_FILE=$cdfile command exp $argv
  set -l rc $status
  if test -f $cdfile
    for line in (cat $cdfile 2>/dev/null)
      switch $line
        case 'cd:*'
          set -l target (string replace 'cd:' '' $line)
          if test -n "$target" -a "$target" != "$PWD"
            builtin cd $target
          end
        case 'defer:*'
          set -l payload (string replace 'defer:' '' $line)
          set -l src (string split ':' $payload)[1]
          set -l dst (string split ':' $payload)[2]
          fish -c "/bin/cp -cR $src $dst" &
          disown 2>/dev/null
        case '*'
          if test -n "$line" -a "$line" != "$PWD"
            builtin cd $line
          end
      end
    end
  end
  /bin/rm -f $cdfile
  return $rc
end
`.trimStart();

function resolveShell(explicit?: string): ShellType {
	if (explicit) {
		const s = explicit.toLowerCase();
		if (s === "zsh" || s === "bash" || s === "fish") return s;
	}
	return detectShell();
}

export function cmdShellInit(args: string[]) {
	if (args.includes("--help") || args.includes("-h")) {
		console.log(`
  exp shell-init [shell]    Print shell function for cd integration

  Supported shells: zsh (default), bash, fish

  Add to your shell config:
    zsh:  eval "$(exp shell-init)"       # ~/.zshrc
    bash: eval "$(exp shell-init bash)"  # ~/.bashrc
    fish: exp shell-init fish | source   # ~/.config/fish/config.fish

  Or let exp do it for you: exp init
`);
		return;
	}

	const shell = resolveShell(args[0]);

	switch (shell) {
		case "zsh":
			process.stdout.write(ZSH_INIT);
			break;
		case "bash":
			process.stdout.write(BASH_INIT);
			break;
		case "fish":
			process.stdout.write(FISH_INIT);
			break;
	}
}
