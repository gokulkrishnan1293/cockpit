Output out/dark.mp4
Set Shell zsh
Set FontSize 13
Set Width 1680
Set Height 960
Set Padding 16
Set TypingSpeed 35ms
Set Theme { "name": "VS Code Dark", "background": "#1E1E1E", "foreground": "#CCCCCC", "cursor": "#AEAFAD", "selection": "#264F78", "black": "#000000", "red": "#CD3131", "green": "#0DBC79", "yellow": "#E5E510", "blue": "#2472C8", "magenta": "#BC3FBC", "cyan": "#11A8CD", "white": "#E5E5E5", "brightBlack": "#666666", "brightRed": "#F14C4C", "brightGreen": "#23D18B", "brightYellow": "#F5F543", "brightBlue": "#3B8EEA", "brightMagenta": "#D670D6", "brightCyan": "#29B8DB", "brightWhite": "#E5E5E5" }
Hide
Type "cd demo && clear" Enter
Show
Type "claude --permission-mode default" Enter
Wait+Screen@30s /for shortcuts|Try "/
Sleep 2s
Screenshot out/01-sidebar.png
Type "In greet.js, rename greet to welcome with one Edit call using replace_all, then run node greet.js" Enter
Wait+Screen@120s /Allow Edit\?/
Sleep 1s
Screenshot out/02-approval-edit.png
Type "1"
Wait+Screen@120s /Allow Bash\?/
Sleep 1s
Screenshot out/03-approval-bash.png
Type "1"
Wait+Screen@120s /Hello, world!/
Sleep 8s
Screenshot out/04-activity.png
Type "Now delete the build folder with rm -rf build" Enter
Wait+Screen@120s /Would delete/
Sleep 1s
Screenshot out/05-blast-radius.png
Type "2"
Wait+Screen@120s /done \d/
Sleep 3s
Type "/hub usage" Enter
Wait+Screen@20s /Context & limits/
Sleep 1s
Screenshot out/06-usage.png
Type "/hub flags" Enter
Wait+Screen@20s /worth knowing|Nothing to flag/
Sleep 1s
Screenshot out/07-flags.png
Type "/hub activity" Enter
Sleep 3s
Screenshot out/08-activity-again.png
Ctrl+C
Sleep 1s
Ctrl+C
Sleep 2s
