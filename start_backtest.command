#!/bin/bash
# 1. 進入專案資料夾
cd ~/Desktop/AI_Trading

# 2. 自動尋找並關閉舊的 Port 58889 背景程序
OLD_PID=$(lsof -t -i:58889)
if [ -n "$OLD_PID" ]; then
    kill -9 $OLD_PID
fi

# 3. 啟動 Python 後端伺服器 (指定連線埠 58889，並於背景執行)
# backtest_engine.py 內建 uvicorn run，因此直接執行即可
python3 backtest_engine.py > backtest_engine.log 2>&1 &

# 4. 暫停 2 秒確保伺服器開機完成
sleep 2

# 5. 自動以預設瀏覽器打開回測控制台 (本地 HTML 檔案)
open -a "Google Chrome" "file://$HOME/Desktop/AI_Trading/backtest.html" 2>/dev/null || open -a "Microsoft Edge" "file://$HOME/Desktop/AI_Trading/backtest.html" 2>/dev/null || open "file://$HOME/Desktop/AI_Trading/backtest.html"
