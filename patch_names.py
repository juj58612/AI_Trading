import re

with open('/Users/jujmac/Desktop/AI_Trading/app.js', 'r') as f:
    content = f.read()

names = {}
for match in re.finditer(r'\{ ticker: "(\d+)", name: "(\d+) ([^"]+)"', content):
    ticker = match.group(1)
    name = match.group(3)
    names[ticker] = name

with open('/Users/jujmac/Desktop/AI_Trading/backtest_engine.py', 'r') as f:
    engine_code = f.read()

dict_str = "STOCK_NAMES = {\n"
for t, n in names.items():
    dict_str += f'    "{t}": "{n}",\n'
dict_str += "}\n\n"

engine_code = engine_code.replace('TICKERS = [', dict_str + 'TICKERS = [')

with open('/Users/jujmac/Desktop/AI_Trading/backtest_engine.py', 'w') as f:
    f.write(engine_code)
print("Patched STOCK_NAMES!")
