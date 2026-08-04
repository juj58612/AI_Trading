# 修改紀錄

用來記錄每次跨機器（Mac / Windows）作業時做的重要調整，方便日後查找原因，不用每次都翻 `git log`。

---

## 2026-08-04 — Mac 端環境整理：修復跨平台換行符號問題

**背景**：這台 Mac 上 `git status` 顯示 `app.js`、`main.py`、`backtest_engine.py` 等十幾個檔案「整檔修改」，比對後發現內容其實完全沒變，純粹是檔案在 Windows 端被存成 CRLF 換行，`start.command` / `start_backtest.command` 也同時被拔掉了可執行權限（100755 → 100644）。

**處理**：
- 捨棄工作目錄裡這些純換行符號差異，還原成與 GitHub 一致的內容。
- 新增 `.gitattributes`，強制所有文字檔統一用 LF 換行，`.command` 腳本強制保留可執行權限 — 之後不論在 Mac 或 Windows 編輯都不會再整檔誤判成修改。
- 把 `.DS_Store`、`backtest_engine.log`、`server.log` 從 git 追蹤中移除（本機檔案保留，只是不再進版控），讓既有的 `.gitignore` 規則真正生效。
- `.gitignore` 新增規則忽略 `.app` 內的 `_CodeSignature/`（macOS 第一次執行未簽章 App 會自動重新簽章，每台機器都會產生差異，不需要進版控）。

Commit：[`36ce91e`](https://github.com/juj58612/AI_Trading/commit/36ce91e)
