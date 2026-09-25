import urllib.request
import ssl
from PIL import Image
import io

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Referer': 'https://sofifa.com/',
    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
}
ctx = ssl.create_default_context()

urls = [
    'https://cdn.sofifa.net/players/239/085/24_360.png',
    'https://cdn.sofifa.net/players/239/085/24_240.png',
    'https://cdn.sofifa.net/players/239/085/24_120.png',
    'https://cdn.sofifa.net/players/239/085/24_60.png',
]
for url in urls:
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=5, context=ctx) as resp:
            data = resp.read()
            img = Image.open(io.BytesIO(data))
            print(f'{url} -> 200, format: {img.format}, size: {img.size}, mode: {img.mode}, bytes: {len(data)}')
    except Exception as e:
        print(f'{url} -> {e}')
