@echo off
:: 1. 確保工作目錄為檔案所在資料夾
cd /d "%~dp0"

:: 2. 自動尋找並強制關閉佔用 Port 58889 的舊程式
echo 正在檢查並清除舊有 Port 58889 連線...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :58889') do (
    taskkill /f /pid %%a >nul 2>&1
)

:: 3. 啟動 Python FastAPI 回測後端伺服器
echo 正在啟動 AI 回測實驗室後端服務 (Port 58889)...
start /b python backtest_engine.py

:: 4. 暫停 2 秒確保伺服器順利開機
timeout /t 2 /nobreak >nul

:: 5. 自動以預設瀏覽器打開回測實驗室網頁
echo 正在開啟瀏覽器回測實驗室...
start "" "%~dp0backtest.html"
