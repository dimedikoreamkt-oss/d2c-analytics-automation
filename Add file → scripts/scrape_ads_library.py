"""
Meta 광고 라이브러리 웹 UI 스크래핑
- 개인/내부 리서치 목적으로만 사용
- 하루 1회, 키워드당 100개 광고 제한
- 요청 간 랜덤 딜레이로 서버 부담 최소화
"""
import os
import json
import time
import random
import re
from datetime import date, datetime, timezone
from pathlib import Path
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeoutError
from google.cloud import bigquery

PROJECT_ID = "d2c-analytics-502304"
DATASET = "marts"
LOCATION = "asia-northeast3"

# 크롤링 대상 키워드 (자사 카테고리 기반)
KEYWORDS = [
    # 안면 관리
    "안면윤곽", "V라인", "리프팅", "탄력", "턱선",
    "이중턱", "볼살", "처진볼", "팔자주름",
    # 홈케어 기기
    "홈케어 마사지기", "얼굴 마사지기", "안면 마사지기",
    "EMS 마사지기", "LED 마스크",
    # 시술 대체
    "울쎄라", "인모드", "리쥬란", "시술없이",
    # 홈뷰티
    "홈뷰티 디바이스", "홈리프팅",
]

MAX_ADS_PER_KEYWORD = 100
DELAY_MIN = 3
DELAY_MAX = 6
LIBRARY_URL = "https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=KR&q={query}&sort_data[direction]=desc&sort_data[mode]=relevancy_monthly_grouped"


def parse_running_days(start_str):
    """'YYYY-MM-DD ~ 게재 중' 형태에서 러닝 일수 계산"""
    if not start_str:
        return None
    try:
        m = re.search(r"(\d{4})[.\-\s년]+(\d{1,2})[.\-\s월]+(\d{1,2})", start_str)
        if not m:
            return None
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        start = datetime(y, mo, d, tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - start).days
    except Exception:
        return None


def scrape_keyword(page, keyword, limit=MAX_ADS_PER_KEYWORD):
    """키워드로 검색해서 광고 카드 리스트 수집"""
    url = LIBRARY_URL.format(query=keyword.replace(" ", "%20"))
    print(f"[INFO] scraping '{keyword}' -> {url}")

    try:
        page.goto(url, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(random.randint(3000, 5000))
    except PWTimeoutError:
        print(f"[WARN] timeout '{keyword}'")
        return []

    # 결과 컨테이너 대기
    try:
        page.wait_for_selector('div[role="main"]', timeout=15000)
    except PWTimeoutError:
        print(f"[WARN] no main container for '{keyword}'")
        return []

    # 스크롤로 lazy-loading 유도
    ads = []
    seen_ids = set()
    scroll_attempts = 0
    max_scrolls = min(10, limit // 10)

    while len(ads) < limit and scroll_attempts < max_scrolls:
        # 광고 카드 컨테이너 선택 (Meta UI 구조 기반)
        cards = page.query_selector_all('div[class*="xh8yej3"]')  # 최상위 카드 컨테이너

        for card in cards:
            try:
                # 광고 ID 추출 (라이브러리 ID)
                id_elem = card.query_selector('span:has-text("라이브러리 ID")')
                if not id_elem:
                    id_elem = card.query_selector('span:has-text("Library ID")')
                if id_elem:
                    id_text = id_elem.inner_text()
                    id_match = re.search(r'(\d{10,})', id_text)
                    if not id_match:
                        continue
                    ad_id = id_match.group(1)
                else:
                    continue

                if ad_id in seen_ids:
                    continue
                seen_ids.add(ad_id)

                # 광고주명
                page_name_elem = card.query_selector('a[role="link"] span')
                page_name = page_name_elem.inner_text() if page_name_elem else None

                # 상태 (활성/비활성)
                status_elem = card.query_selector('span:has-text("게재 중"), span:has-text("Active")')
                is_active = status_elem is not None

                # 시작일
                date_elem = card.query_selector('span:has-text("게재 시작일")')
                if not date_elem:
                    date_elem = card.query_selector('span:has-text("Started running")')
                delivery_start_raw = date_elem.inner_text() if date_elem else None

                # 플랫폼
                platform_elems = card.query_selector_all('div[aria-label*="Facebook"], div[aria-label*="Instagram"]')
                platforms = [el.get_attribute("aria-label") for el in platform_elems if el.get_attribute("aria-label")]

                # 카피 텍스트
                text_elem = card.query_selector('div[style*="text-align"]')
                body_text = text_elem.inner_text()[:2000] if text_elem else None

                # 이미지 URL (첫 이미지)
                img_elem = card.query_selector('img[src*="scontent"]')
                image_url = img_elem.get_attribute("src") if img_elem else None

                # 랜딩 URL
                cta_elem = card.query_selector('a[role="link"][href*="l.facebook.com"]')
                landing_url = cta_elem.get_attribute("href") if cta_elem else None

                ads.append({
                    "ad_id": ad_id,
                    "search_keyword": keyword,
                    "page_name": page_name,
                    "is_active": is_active,
                    "delivery_start_raw": delivery_start_raw,
                    "running_days": parse_running_days(delivery_start_raw),
                    "platforms": ",".join(platforms) if platforms else None,
                    "body_text": body_text,
                    "image_url": image_url,
                    "landing_url": landing_url,
                    "snapshot_url": f"https://www.facebook.com/ads/library/?id={ad_id}",
                    "scraped_at": datetime.utcnow().isoformat(),
                })

                if len(ads) >= limit:
                    break
            except Exception as e:
                continue

        # 스크롤 아래로
        page.evaluate("window.scrollBy(0, 1500)")
        page.wait_for_timeout(random.randint(1500, 2500))
        scroll_attempts += 1

    # 매너 딜레이
    time.sleep(random.uniform(DELAY_MIN, DELAY_MAX))
    print(f"       -> collected {len(ads)} ads")
    return ads


def load_to_bq(rows):
    if not rows:
        print("[WARN] no rows to load")
        return
    client = bigquery.Client(project=PROJECT_ID)
    table_id = f"{PROJECT_ID}.{DATASET}.scraped_ads"

    schema = [
        bigquery.SchemaField("ad_id", "STRING"),
        bigquery.SchemaField("search_keyword", "STRING"),
        bigquery.SchemaField("page_name", "STRING"),
        bigquery.SchemaField("is_active", "BOOL"),
        bigquery.SchemaField("delivery_start_raw", "STRING"),
        bigquery.SchemaField("running_days", "INT64"),
        bigquery.SchemaField("platforms", "STRING"),
        bigquery.SchemaField("body_text", "STRING"),
        bigquery.SchemaField("image_url", "STRING"),
        bigquery.SchemaField("landing_url", "STRING"),
        bigquery.SchemaField("snapshot_url", "STRING"),
        bigquery.SchemaField("scraped_at", "TIMESTAMP"),
    ]

    job = client.load_table_from_json(
        rows, table_id,
        job_config=bigquery.LoadJobConfig(
            schema=schema,
            write_disposition="WRITE_TRUNCATE"
        )
    )
    job.result()
    print(f"[OK] loaded {len(rows)} scraped ads to {table_id}")


def main():
    all_ads = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=[
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
                '--disable-dev-shm-usage',
            ]
        )
        context = browser.new_context(
            viewport={"width": 1920, "height": 1080},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            locale="ko-KR",
            timezone_id="Asia/Seoul",
        )
        # 자동화 탐지 우회
        context.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        """)

        page = context.new_page()

        for kw in KEYWORDS:
            try:
                ads = scrape_keyword(page, kw)
                for ad in ads:
                    aid = ad["ad_id"]
                    if aid not in all_ads:
                        all_ads[aid] = ad
                        all_ads[aid]["matched_keywords"] = [kw]
                    else:
                        all_ads[aid]["matched_keywords"].append(kw)
            except Exception as e:
                print(f"[WARN] '{kw}' failed: {e}")

        browser.close()

    rows = []
    for ad in all_ads.values():
        ad["search_keyword"] = ",".join(ad.pop("matched_keywords", [ad.get("search_keyword")]))
        rows.append(ad)

    print(f"[INFO] total unique ads: {len(rows)}")
    load_to_bq(rows)


if __name__ == "__main__":
    main()
