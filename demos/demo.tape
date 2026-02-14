# exp — instant project forking
# Run: vhs demo.tape

Output demo.gif

Set Shell "zsh"
Set FontFamily "JetBrainsMono Nerd Font Mono"
Set FontSize 15
Set Width 900
Set Height 480
Set Padding 20
Set Theme { "name": "exp", "black": "#1e1e2e", "red": "#f38ba8", "green": "#a6e3a1", "yellow": "#f9e2af", "blue": "#89b4fa", "magenta": "#cba6f7", "cyan": "#94e2d5", "white": "#cdd6f4", "brightBlack": "#585b70", "brightRed": "#f38ba8", "brightGreen": "#a6e3a1", "brightYellow": "#f9e2af", "brightBlue": "#89b4fa", "brightMagenta": "#cba6f7", "brightCyan": "#94e2d5", "brightWhite": "#cdd6f4", "background": "#1e1e2e", "foreground": "#cdd6f4", "selection": "#45475a", "cursor": "#f5e0dc" }

# Set up clean shell: no % mark, minimal prompt
Hide
Type "unset PROMPT_EOL_MARK && PS1='$ ' && clear"
Enter
Sleep 1s
Show

Sleep 500ms

# Three forks, rapid-fire
Type "exp new 'upgrade turbo' --no-terminal"
Sleep 400ms
Enter
Sleep 3s

Type "exp new 'fix ci config' --no-terminal"
Sleep 400ms
Enter
Sleep 3s

Type "exp new 'add dark mode' --no-terminal"
Sleep 400ms
Enter
Sleep 3s

# List all three
Type "exp ls"
Sleep 400ms
Enter
Sleep 4s
