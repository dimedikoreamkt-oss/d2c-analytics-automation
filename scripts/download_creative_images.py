"""
BigQuery meta_creatives.image_url -> docs/creatives/{ad_id}.jpg
- 이미 다운로드된 파일은 스킵
- Meta CDN URL 만료 대비하여 GitHub Pages 정적 자산으로 저장
"""
import requests
from pathlib import Path
from google.cloud import bigquery

PROJECT_ID = "d2c-analytics-502304"
OUT_DIR = Path("docs/creatives")
OUT_DIR.mkdir(parents=True, exist_ok=True)


def main():
    client = bigquery.Client(project=PROJECT_ID)
    q = f"""
    SELECT ad_id, image_url
    FROM `{PROJECT_ID}.marts.meta_creatives`
    WHERE image_url IS NOT NULL
    """
    rows = list(client.query(q).result())
    print(f"[INFO] {len(rows)} creatives to check")

    downloaded, skipped, failed = 0, 0, 0
    for row in rows:
        ad_id = row["ad_id"]
        url = row["image_url"]
        out_path = OUT_DIR / f"{ad_id}.jpg"
        if out_path.exists() and out_path.stat().st_size > 0:
            skipped += 1
            continue
        try:
            r = requests.get(url, timeout=30)
            r.raise_for_status()
            out_path.write_bytes(r.content)
            downloaded += 1
            print(f"[OK] {ad_id} ({len(r.content)/1024:.1f}KB)")
        except Exception as e:
            failed += 1
            print(f"[WARN] {ad_id}: {e}")

    print(f"[DONE] downloaded={downloaded} skipped={skipped} failed={failed}")


if __name__ == "__main__":
    main()
