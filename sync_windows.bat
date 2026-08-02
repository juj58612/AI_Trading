@echo off
cd /d "%~dp0"
git add strategy_core.py backtest_engine.py main.py app.js index.html style.css ai_stock_list.txt backtest_satellite.py .env.example .gitignore README.md order_planner.html order_planner.js history.html history.js backtest.html
git commit -m "auto: Windows one-click sync %date% %time%"
git push origin main
msg %username% 已成功將最新程式碼同步至 GitHub！
