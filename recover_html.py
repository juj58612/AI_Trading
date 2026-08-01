import json
html_content = ""
with open("/Users/jujmac/.gemini/antigravity/brain/1d1b04ad-e9cd-4387-bfcd-616d1bfca15e/.system_generated/logs/transcript_full.jsonl", "r") as f:
    for line in f:
        try:
            data = json.loads(line)
            content = data.get("content", "")
            if "<!DOCTYPE html>" in content and '<script src="app.js"></script>' in content:
                html_content = content
        except Exception:
            pass

if html_content:
    # It might be wrapped in markdown or it might be raw
    if "```html\n" in html_content:
        html_content = html_content.split("```html\n")[1].split("```")[0]
    
    with open("index.html", "w") as f:
        f.write(html_content)
    print("Recovered index.html successfully.")
else:
    print("Could not find index.html in transcript.")
