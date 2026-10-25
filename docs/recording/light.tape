Output out/light.mp4
Set Shell zsh
Set FontSize 13
Set Width 1680
Set Height 960
Set Padding 16
Set TypingSpeed 35ms
Set Theme { "name": "VS Code Light", "background": "#FFFFFF", "foreground": "#3B3B3B", "cursor": "#005FB8", "selection": "#ADD6FF", "black": "#000000", "red": "#CD3131", "green": "#107C10", "yellow": "#949800", "blue": "#0451A5", "magenta": "#BC05BC", "cyan": "#0598BC", "white": "#F3F3F3", "brightBlack": "#666666", "brightRed": "#CD3131", "brightGreen": "#14CE14", "brightYellow": "#B5BA00", "brightBlue": "#0451A5", "brightMagenta": "#BC05BC", "brightCyan": "#0598BC", "brightWhite": "#FFFFFF" }
Hide
Type "cd demo && clear" Enter
Show
Type "claude --permission-mode default" Enter
Wait+Screen@30s /for shortcuts|Try "/
Sleep 2s
Screenshot out/08-light-sidebar.png
Type "Add a one-line comment above the console.log call in greet.js" Enter
Wait+Screen@120s /Allow Edit\?/
Sleep 1s
Screenshot out/09-light-approval.png
Type "1"
Wait+Screen@120s /done \d/
Sleep 3s
Screenshot out/10-light-activity.png
Type "/hub usage" Enter
Wait+Screen@20s /Context & limits/
Sleep 1s
Screenshot out/11-light-usage.png
Ctrl+C
Sleep 1s
Ctrl+C
Sleep 2s
