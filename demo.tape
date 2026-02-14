# exp — instant project forking
# Run: vhs demo.tape

Output demo.gif

Set Shell "zsh"
Set FontFamily "JetBrains Mono"
Set FontSize 15
Set Width 900
Set Height 480
Set Padding 20
Set Theme { "name": "exp", "black": "#0d1117", "red": "#ff7b72", "green": "#7ee787", "yellow": "#e3b341", "blue": "#58a6ff", "magenta": "#d2a8ff", "cyan": "#79c0ff", "white": "#e6edf3", "brightBlack": "#484f58", "brightRed": "#ffa198", "brightGreen": "#56d364", "brightYellow": "#e3b341", "brightBlue": "#79c0ff", "brightMagenta": "#d2a8ff", "brightCyan": "#56d364", "brightWhite": "#f0f6fc", "background": "#0d1117", "foreground": "#e6edf3", "selection": "#264f78", "cursor": "#e6edf3" }

Sleep 1s

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
