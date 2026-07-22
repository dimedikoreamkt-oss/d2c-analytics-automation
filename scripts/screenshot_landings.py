"""
Winner 광고의 랜딩 페이지 자동 스크린샷
- landing_url이 없거나 실패하면 snapshot_url을 대신 캡처
- 실패해도 최소 1개는 저장되도록 보완
"""
import os
from pathlib import Path
from google.cloud import bigquery
from playwright.sync_api import sync_playwright

PROJECT_ID = "d2c-analytics-502304"
OUT_DIR = Path("docs/landings")
OUT_DIR.mkdir(parents=True, exist_ok=True)
# gitkeep 파일 항상 생성 (empty dir 방지)
(OUT_DIR / ".gitkeep").touch()

MAX_CAPTURES = 50


def main():
    client = bigquery.Client(project=PROJECT_ID)
    q = f"""
    SELECT ad_id, landing_url, snapshot_url, page_name
    FROM `{PROJECT_ID}.marts.mart_market_winners`
    WHERE winner_grade IN ('SUPER_WINNER', 'WINNER')
      AND is_currently_active
      AND (landing_url IS NOT NULL OR snapshot_url IS NOT NULL)
    ORDER BY running_days DESC
    LIMIT {MAX_CAPTURES}
    """
    rows = list(client.query(q).result())
    print(f"[INFO] {len(rows)} winner ads to capture")

    captured, skipped, failed = 0, 0, 0

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 375, "height": 812},
            device_scale_factor=2,
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15"
        )

        for row in rows:
            ad_id = row["ad_id"]
            out_path = OUT_DIR / f"{ad_id}.png"

            if out_path.exists() and out_path.stat().st_size > 0:
                skipped += 1
                continue

            # 1. landing_url 먼저 시도
            targets = []
            if row.get("landing_url") and str(row["landing_url"]).startswith("http"):
                targets.append(row["landing_url"])
            if row.get("snapshot_url") and str(row["snapshot_url"]).startswith("http"):
                targets.append(row["snapshot_url"])

            success = False
            for target_url in targets:
                try:
                    page = context.new_page()
                    page.goto(target_url, timeout=25000, wait_until="domcontentloaded")
                    page.wait_for_timeout(2500)
                    page.screenshot(
                        path=str(out_path),
                        full_page=False,
                        clip={"x": 0, "y": 0, "width": 375, "height": 812}
                    )
                    page.close()
                    captured += 1
                    success = True
                    print(f"[OK] {ad_id} ({row.get('page_name','?')})")
                    break
                except Exception as e:
                    try:
                        page.close()
                    except:
                        pass
                    print(f"[WARN] {ad_id} target failed: {str(e)[:80]}")

            if not success:
                failed += 1

        browser.close()

    print(f"[DONE] captured={captured} skipped={skipped} failed={failed}")


if __name__ == "__main__":
    main()
