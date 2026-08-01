import requests
import json
import time

tickers = ["2330", "2317", "2382", "3231", "6669", "2376", "2356", "2324", "3706", "2357", "2353", "3017", "3324", "2421", "3653", "3338", "8996", "3013", "6117", "3693", "8210", "2059", "2308", "6282", "2345", "2368", "3044", "2313", "3037", "8046", "3189", "2383", "6274", "6213", "3661", "3443", "3035", "6643", "3529", "6531", "2454", "3034", "8299", "5269", "4966", "3711", "2449", "3131", "3583", "6187", "6515", "2360", "3533", "2359", "6414", "2395", "6139", "5443", "2303", "6230"]

start = time.time()
print("Starting full scan test...")
try:
    res = requests.post("http://127.0.0.1:58888/api/scan_all", json={"tickers": tickers})
    print(f"Status Code: {res.status_code}")
    print(f"Time taken: {time.time() - start:.2f} seconds")
    
    if res.status_code == 200:
        data = res.json()
        print(f"Received {len(data.get('data', []))} items.")
        if data.get('data'):
            print(f"First item: {data['data'][0]}")
    else:
        print(f"Error: {res.text}")
except Exception as e:
    print(f"Exception: {e}")
