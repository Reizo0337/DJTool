Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "Z:\Music Converter\"
WshShell.Run "node server.js", 0, false
