import re

with open("/Users/jujmac/.gemini/antigravity/brain/1d1b04ad-e9cd-4387-bfcd-616d1bfca15e/scratch/user_provided.js", "r") as f:
    text = f.read()

# The split boundaries:
# First const API_BASE_URL is start of app.js.
# Second const API_BASE_URL is start of history.js.
# '[]\n<!DOCTYPE html>' is start of index.html.
# 'import secrets' is start of main.py. But main.py wasn't included!

history_idx = text.find('const API_BASE_URL', 50) # find second occurrence
html_idx = text.find('<!DOCTYPE html>')
if html_idx != -1:
    # There's a '[]\n' before it, let's find that
    html_start = text.rfind('[]\n', 0, html_idx)
    if html_start == -1: html_start = html_idx
else:
    html_start = -1

app_js = text[:history_idx]
history_js = text[history_idx:html_start].replace('[]\n', '')
index_html = text[html_start:].replace('[]\n', '')

with open("app.js", "w") as f:
    f.write(app_js)

with open("history.js", "w") as f:
    f.write(history_js)
    
with open("index.html", "w") as f:
    f.write(index_html)
    
print("app.js size:", len(app_js))
print("history.js size:", len(history_js))
print("index.html size:", len(index_html))
