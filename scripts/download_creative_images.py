"""
BigQuery meta_creatives.image_url → docs/creatives/{ad_id}.jpg
"""
import os, requests
from pathlib import Path
from google.cloud import bigquery

PROJECT_ID = "d2c-analytics-502304"
OUT_DIR = Path("docs/creatives")
OUT_DIR.mkdir(parents=True, exist_ok=True)

client = bigquery.Client(project=PROJECT_ID)
rows = client.query(f"""
    SELECT ad_id, image_url, video_id
    FROM `{PROJECT_ID}.marts.meta_creatives`
    WHERE image_url IS NOT NULL
""").result()

for row in rows:
    ad_id = row["ad_id"]
    url = row["image_url"]
    out_path = OUT_DIR / f"{ad_id}.jpg"
    if out_path.exists():
        continue  # 이미 다운로드됨
    try:
        r = requests.get(url, timeout=30)
        r.raise_for_status()
        out_path.write_bytes(r.content)
        print(f"[OK] {ad_id} -> {out_path}")
    except Exception as e:
        print(f"[WARN] {ad_id}: {e}")
