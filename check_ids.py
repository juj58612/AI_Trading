import re

with open('app.js', 'r') as f:
    app_js = f.read()

with open('index.html', 'r') as f:
    index_html = f.read()

ids_in_app = re.findall(r"document\.getElementById\(['\"](.*?)['\"]\)", app_js)
ids_in_html = re.findall(r"id=['\"](.*?)['\"]", index_html)

for el_id in ids_in_app:
    if el_id not in ids_in_html:
        print(f"ERROR: {el_id} is in app.js but NOT in index.html!")
    else:
        print(f"OK: {el_id}")
