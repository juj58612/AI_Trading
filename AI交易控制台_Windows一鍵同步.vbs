Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c sync_windows.bat", 0, True
WshShell.Popup "已成功將最新程式碼同步至 GitHub！", 5, "GitHub 同步完成", 64
