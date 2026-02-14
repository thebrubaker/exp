Output demo-orchestration.gif

Set Shell "bash"
Set Width 1100
Set Height 600
Set FontSize 14
Set Padding 20
Set WindowBar Colorful
Set WindowBarSize 40
Set BorderRadius 8
Set Margin 20
Set MarginFill "#1e1e2e"
Set TypingSpeed 40ms
Set WaitTimeout 30s

Hide
Type "unset CLAUDECODE && cd ~/Code/exp && export PS1='$ ' && clear"
Enter
Sleep 1s

# Launch Claude and wait for it to be ready
Type "claude --dangerously-skip-permissions --model sonnet"
Sleep 500ms
Enter
Wait+Screen@15s /❯/
Sleep 500ms
Show

# Natural orchestration prompt
Type "I want to knock out three features in parallel — zsh completions, a cherry command for copying files back, and Warp terminal support. Fork the project for each."
Sleep 800ms
Enter
Sleep 90s
