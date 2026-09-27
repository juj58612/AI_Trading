#!/bin/bash
# 1. 進入專案資料夾（用腳本自身的位置，不寫死路徑）
cd "$(dirname "$0")"
# 調高同時可開啟的檔案數（macOS 預設 256，下載 126 檔股票資料時不夠用）
ulimit -n 4096 2>/dev/null || true
PROJECT_DIR="$(pwd)"

# 2. 自動尋找並關閉舊的 Port 58889 背景程序
OLD_PID=$(lsof -t -i:58889)
if [ -n "$OLD_PID" ]; then
    kill -9 $OLD_PID
fi

# 3. 啟動 Python 後端伺服器 (指定連線埠 58889，並於背景執行)
# backtest_engine.py 內建 uvicorn run，因此直接執行即可
# 用 nohup 讓程序不掛在這個終端機的工作群組下——關掉這個 Terminal 視窗時，
# 系統才不會連帶送 SIGHUP 把伺服器一併關掉。
nohup python3 backtest_engine.py > backtest_engine.log 2>&1 &
disown

# 4. 暫停 2 秒確保伺服器開機完成
sleep 2

# 5. 確保主控台伺服器 (Port 58888) 也在執行：回測頁改從 http://localhost:58888 開啟，
#    才能沿用首頁的登入狀態（用 file:// 開啟時瀏覽器視為不同網站，會變成未登入而無法同步/回測）
if [ -z "$(lsof -t -i:58888)" ]; then
    nohup python3 -m uvicorn main:app --port 58888 > server.log 2>&1 &
    disown
    sleep 3
fi

# 6. 以預設瀏覽器打開回測實驗室
open -a "Google Chrome" "http://localhost:58888/backtest.html" 2>/dev/null || open -a "Microsoft Edge" "http://localhost:58888/backtest.html" 2>/dev/null || open "http://localhost:58888/backtest.html"
