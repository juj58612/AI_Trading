# 新對話接續摘要

> 這是一份「工作階段交接」筆記，開新對話時把整段複製貼到第一則訊息即可接續。
> 內容會隨進度變動，過時後可以直接覆寫或刪除，不是永久文件。
> 這份文件本身是公開 git repo 的一部分，**絕對不要把任何密碼、API 金鑰、私鑰貼進這份文件**——只寫「去哪裡找那個值」，不要寫值本身。

## 1.【核心目標與背景】

專案：`AI_Trading`（台股 AI 概念股量化交易策略控制台），GitHub `https://github.com/juj58612/AI_Trading`，Render 正式站 `https://ai-trading-console-wf88.onrender.com`。

使用者在**三台不同電腦**上平行開發此專案，靠 GitHub 同步：
- 一台 Mac（自稱 "Mac mini"，有時用非 Claude Code 的其他 AI 工具開發）
- 這台 Windows（這次對話所在的機器，`D:\AI_Trading`）
- 另一台 Windows，使用者稱為 **"WIN2"**（也是 `D:\AI_Trading`，這個對話的 Claude **沒有工具權限連線過去**，只能用文字引導使用者自己操作）

架構原則：**本機負責重運算（回測/大數據網格），正式站只負責展示已發布的結果**，因為 Render 免費方案沒有永久硬碟。本機跑 `backtest_engine.py`（port 58889，用 `start_backtest_windows.bat`/`start_backtest.command` 啟動）＋`main.py`（port 58888，用 `start_windows.bat`/`start.command` 啟動）兩個服務。

## 2.【這次對話做過的重大變更（已 commit + push，GitHub 最新 commit：`3d62917`）】

- **資安大掃除**：修掉外洩的管理者密碼/FinMind token/邀請碼（改用環境變數）、`history.js`/`order_planner.js` 的認證繞過漏洞、清理 git 歷史（force-push 改寫過，Mac 端如果還沒同步過這次改寫，`git pull` 會失敗，要改用 `git fetch && git reset --hard origin/main`）。
- **穩定性修正**：Render 上 yfinance 被 Yahoo 封鎖（改用 curl_cffi 偽裝瀏覽器連線）、FinMind 逾時+重試、`/api/scan_all` 與下單規劃器的資料一致性 bug（首頁跟下單頁曾經顯示不同天的資料）。
- **回測實驗室（`backtest.html`）本機/雲端畫面一致化**：雲端版現在畫面跟本機長得一樣，只是操作元件變成 disabled（不是整塊隱藏），避免兩邊看到完全不同的內容而搞混。
- **新增「5. 個股買賣交易明細」區塊**（在排行榜之前），可即時查看/匯出頂尖策略組合的逐筆股票買賣明細。
- **使用者帳號改用 Firebase Firestore 永久保存 + 密碼改用 bcrypt 雜湊**——**已於 2026-08-10 完成部署並驗證**，見下方第 3 節。
- 登入表單補上正規 `<form>` + `autocomplete` 屬性，讓瀏覽器能正常提示「儲存密碼」。
- 管理者密碼目前是 `bbg7965`——**這是使用者在被告知風險後、知情狀況下自己選的**（是先前外洩過的舊密碼），不要在新對話裡重複警告這件事，使用者已經表態不想再聽這個提醒。

## 3.【Firebase Firestore 整合狀態——已完成】

- 使用者已在 Firebase Console 建立專案（`ai-trading-users`）、啟用 Firestore（Standard 版、asia-east1）、下載服務帳戶金鑰 JSON。
- 金鑰已寫進這台電腦本機的 `.env`（key 名稱：`FIREBASE_SERVICE_ACCOUNT_JSON`），本機測試通過（註冊→登入→重啟伺服器後帳號仍存在）。
- 使用者已把同一組值貼進 **Render 後台環境變數**（`https://dashboard.render.com/web/srv-d9knueqjnfac739i9el0/settings`）並存檔觸發重新部署。
- **已在正式站驗證**：呼叫 `/api/register` + `/api/login`（測試帳號 `firebasetest2`）皆成功，且 Render 部署 log 有出現 `✅ Firebase Firestore 已連線，自助註冊帳號將永久保存`，證實正式站的自助註冊帳號現在會永久保存、不會再因重新部署而消失。

## 4.【下一步具體任務（剩餘、尚未完成）】

1. 如果之後要開放邀請碼給真的親友使用，記得先把 `INVITATION_CODE` 想清楚要不要換一組（目前這組 `owAsxRo1InuW` 只有這個對話串知道，還沒外流，但也還沒正式開放給人用）。
2. **WIN2 那台電腦的本機 `.env` 也要補上同一組 `FIREBASE_SERVICE_ACCOUNT_JSON`**，還有前面幾輪已經同步過的 `ADMIN_PASSWORD=bbg7965`，這個新對話沒辦法直接連過去改，要請使用者自己動手（或引導使用者複製這台電腦 `.env` 的內容過去）。
3. 這次對話裝了幾個新的本機 Python 套件（`bcrypt`、`firebase-admin`、`python-dotenv`），都已經加進 `requirements.txt`，Render 重新部署時會自動安裝，不用額外處理；但如果之後要在 WIN2 或 Mac 本機重新 `pip install -r requirements.txt`，記得這幾個新套件需要一點時間安裝。
4. 正式站上殘留的測試帳號 `firebasetest2`（密碼 `test1234`）目前還在 Firestore 裡，非必要但可以考慮之後清掉。
