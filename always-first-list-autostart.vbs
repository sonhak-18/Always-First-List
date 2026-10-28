Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "D:\Gits\Private\wa-bimbingan-bot"
WshShell.Run """C:\Program Files\nodejs\node.exe"" ""D:\Gits\Private\wa-bimbingan-bot\src\index.js""", 0, False
