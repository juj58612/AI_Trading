#!/bin/bash
# 一鍵同步 GitHub（Mac 版）：取代會被 macOS 判定「已損毀」的 一鍵同步GitHub_Mac.app。
# 雙擊執行：把本機修改 commit → 先拉回遠端最新版 → 推上 GitHub（Render 會自動重新部署）。
cd "$(dirname "$0")" || exit 1

echo "=== AI_Trading 一鍵同步 GitHub ==="
# 清掉之前異常中斷留下的鎖定檔
rm -f .git/index.lock .git/objects/maintenance.lock 2>/dev/null

git add -A
if ! git diff --cached --quiet; then
    git commit -m "auto: Mac one-click sync $(date '+%Y-%m-%d %H:%M:%S')"
else
    echo "沒有新的檔案修改，直接同步。"
fi

echo "--- 下載遠端最新版 ---"
if ! git pull --rebase --autostash origin main; then
    echo ""
    echo "❌ 下載遠端版本時發生衝突，未推送。請把這個視窗的訊息截圖給 Claude 處理。"
    read -n 1 -s -r -p "按任意鍵關閉..."
    exit 1
fi

echo "--- 推送到 GitHub ---"
if ! git push origin main; then
    echo ""
    echo "⚠️ GitHub 登入失效，已清除 Mac 鑰匙圈裡舊的 GitHub 登入資料，改用新的權杖重新登入。"
    echo "   Username 輸入：juj58612"
    echo "   Password 貼上：GitHub 個人存取權杖（ghp_ 開頭，貼上時畫面不會顯示任何字，貼完直接按 Enter）"
    echo ""
    printf "protocol=https\nhost=github.com\n\n" | git credential-osxkeychain erase 2>/dev/null
    printf "protocol=https\nhost=github.com\n\n" | git credential reject 2>/dev/null
fi
if git push origin main; then
    echo ""
    echo "✅ 已成功同步至 GitHub！網頁版約數分鐘後自動更新。"
else
    echo ""
    echo "❌ 推送失敗（可能是 GitHub 登入過期）。請把這個視窗的訊息截圖給 Claude 處理。"
fi
git log --oneline -3
read -n 1 -s -r -p "按任意鍵關閉..."
