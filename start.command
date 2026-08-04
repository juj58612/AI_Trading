#!/bin/bash
# 1. 進入專案資料夾（用腳本自身的位置，不寫死路徑，這樣不管資料夾放在哪台機器的哪個路徑都能正常運作）
cd "$(dirname "$0")"

# 2. 自動尋找並關閉舊的 Port 58888 背景程序
OLD_PID=$(lsof -t -i:58888)
if [ -n "$OLD_PID" ]; then
    kill -9 $OLD_PID
fi

# 3. 啟動 Python 後端伺服器 (指定連線埠 58888，並於背景執行)
python3 -m uvicorn main:app --port 58888 &

# 4. 暫停 2 秒確保伺服器開機完成
sleep 2

# 5. 自動以預設瀏覽器打開控制台 (透過 FastAPI 直接存取網頁)
open -a "Google Chrome" http://localhost:58888 2>/dev/null || open -a "Microsoft Edge" http://localhost:58888 2>/dev/null || open http://localhost:58888