# 离线地图瓦片

本目录随前端静态资源一起发布，用于无外网环境下的地图底图兜底。

- 数据来源：© OpenStreetMap contributors（<https://www.openstreetmap.org/copyright>，ODbL）
- 覆盖范围：重庆市区及景点周边，约 lat 29.497–29.896、lng 106.364–106.632
- 缩放级别：z8–z14，共 392 张 XYZ/PNG 切片，约 3.1 MB
- z15–z18 由 Leaflet 放大 z14 切片显示
- 覆盖范围外或缺失的切片使用 `transparent.png` 兜底，节点、路线等矢量图层仍正常显示

前端默认尝试在线 OpenStreetMap 图层；连续 4 个切片加载失败或浏览器报告离线时，会自动切换到本目录的离线图层。恢复联网后会重新尝试在线图层。

## 重新生成切片

在有外网且遵守 OpenStreetMap 瓦片使用策略的环境中，可在仓库根目录执行以下脚本。脚本会根据后端节点范围加 0.03° 边距生成切片，输出到 `frontend/public/tiles/`：

```bash
python3 - <<'PY'
import csv, math, os, time, urllib.request, concurrent.futures

root = 'frontend/public/tiles'
lats, lngs = [], []
with open('backend/src/main/resources/nodes.csv', encoding='utf-8') as f:
    for row in csv.DictReader(f):
        lats.append(float(row['lat']))
        lngs.append(float(row['lng']))

lat0, lat1 = min(lats) - 0.03, max(lats) + 0.03
lng0, lng1 = min(lngs) - 0.03, max(lngs) + 0.03

def tile_xy(lat, lng, zoom):
    n = 2 ** zoom
    x = (lng + 180) / 360 * n
    y = (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n
    return x, y

jobs = []
for zoom in range(8, 15):
    x0, y1 = tile_xy(lat0, lng0, zoom)
    x1, y0 = tile_xy(lat1, lng1, zoom)
    for x in range(math.floor(x0), math.floor(x1) + 1):
        for y in range(math.floor(y0), math.floor(y1) + 1):
            jobs.append((zoom, x, y))

def fetch_tile(job):
    zoom, x, y = job
    destination = os.path.join(root, str(zoom), str(x), f'{y}.png')
    os.makedirs(os.path.dirname(destination), exist_ok=True)
    url = f'https://{("a", "b", "c")[(x + y) % 3]}.tile.openstreetmap.org/{zoom}/{x}/{y}.png'
    request = urllib.request.Request(url, headers={'User-Agent': 'CQTravel-offline-bundle/1.0'})
    for attempt in range(3):
        try:
            data = urllib.request.urlopen(request, timeout=30).read()
            if not data.startswith(b'\x89PNG'):
                raise ValueError('invalid PNG tile')
            with open(destination, 'wb') as f:
                f.write(data)
            time.sleep(0.2)
            return True
        except Exception:
            if attempt == 2:
                return False
            time.sleep(attempt + 1)

with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    ok = sum(pool.map(fetch_tile, jobs))
print(f'ok: {ok}/{len(jobs)}')
if ok != len(jobs):
    raise SystemExit(1)
PY
```
