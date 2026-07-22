"""
Winner 광고의 랜딩 페이지 자동 스크린샷
- WINNER 이상 등급만 캡처 (리소스 절약)
- docs/landings/{ad_id}.png 로 저장
"""
import os
from pathlib import Path
from google.cloud import bigquery
from playwright.sync_api import sync_playwright

PROJECT_ID = "d2c-analytics-502304"
OUT_DIR = Path("docs/landings")
OUT_DIR.mkdir(parents=True, exist_ok=True)

MAX_CAPTURES = 100  # 하루 최대 캡처 수


def main():
    client = bigquery.Client(project=PROJECT_ID)
    q = f"""
    SELECT ad_id, landing_url
    FROM `{PROJECT_ID}.marts.mart_market_winners`
    WHERE winner_grade IN ('SUPER_WINNER', 'WINNER')
      AND landing_url IS NOT NULL
      AND landing_url LIKE 'http%'
      AND is_currently_active
    ORDER BY running_days DESC
    LIMIT {MAX_CAPTURES}
    """
    rows = list(client.query(q).result())
    print(f"[INFO] {len(rows)} winner landings to capture")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 375, "height": 812},  # 모바일 사이즈
            device_scale_factor=2,
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15"
        )

        captured, skipped, failed = 0, 0, 0
        for row in rows:
            ad_id = row["ad_id"]
            url = row["landing_url"]
            out_path = OUT_DIR / f"{ad_id}.png"

            if out_path.exists() and out_path.stat().st_size > 0:
                skipped += 1
                continue

            try:
                page = context.new_page()
                page.goto(url, timeout=30000, wait_until="domcontentloaded")
                page.wait_for_timeout(2000)  # 이미지 로딩 대기
                page.screenshot(path=str(out_path), full_page=False, clip={
                    "x": 0, "y": 0, "width": 375, "height": 812
                })
                page.close()
                captured += 1
                print(f"[OK] {ad_id}")
            except Exception as e:
                failed += 1
                print(f"[WARN] {ad_id}: {e}")

        browser.close()
        print(f"[DONE] captured={captured} skipped={skipped} failed={failed}")


if __name__ == "__main__":
    main()
