import { type ShellType, detectShell } from "../utils/shell-integration.ts";

const ZSH_INIT = `
exp() {
  local cdfile
  cdfile=$(mktemp "\${TMPDIR:-/tmp}/exp-cd.XXXXXX")
  EXP_CD_FILE="$cdfile" command exp "$@"
  local rc=$?
  local target
  target=$(<"$cdfile" 2>/dev/null)
  /bin/rm -f "$cdfile"
  if [[ -n "$target" && "$target" != "$PWD" ]]; then
    builtin cd "$target" || return
  fi
  return $rc
}
`.trimStart();

const BASH_INIT = `
exp() {
  local cdfile
  cdfile=$(mktemp "\${TMPDIR:-/tmp}/exp-cd.XXXXXX")
  EXP_CD_FILE="$cdfile" command exp "$@"
  local rc=$?
  local target
  target=$(cat "$cdfile" 2>/dev/null)
  /bin/rm -f "$cdfile"
  if [[ -n "$target" && "$target" != "$PWD" ]]; then
    builtin cd "$target" || return
  fi
  return $rc
}
`.trimStart();

const FISH_INIT = `
function exp
  set -l cdfile (mktemp (set -q TMPDIR; and echo $TMPDIR; or echo /tmp)"/exp-cd.XXXXXX")
  EXP_CD_FILE=$cdfile command exp $argv
  set -l rc $status
  set -l target (cat $cdfile 2>/dev/null)
  /bin/rm -f $cdfile
  if test -n "$target" -a "$target" != "$PWD"
    builtin cd $target
  end
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
