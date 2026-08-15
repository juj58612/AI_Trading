#!/bin/bash
# 1. 進入專案資料夾（用腳本自身的位置，不寫死路徑）
cd "$(dirname "$0")"
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

# 5. 自動以預設瀏覽器打開回測控制台 (本地 HTML 檔案)
open -a "Google Chrome" "file://$PROJECT_DIR/backtest.html" 2>/dev/null || open -a "Microsoft Edge" "file://$PROJECT_DIR/backtest.html" 2>/dev/null || open "file://$PROJECT_DIR/backtest.html"
