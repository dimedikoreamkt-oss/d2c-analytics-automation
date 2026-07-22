"""
Meta Ads Library API → BigQuery competitor_ads
- 경쟁사 페이지의 활성/과거 광고 수집
- 러닝 기간 계산 → 승자 광고 자동 감지
"""
import os, requests, json
from datetime import date, datetime, timezone
from google.cloud import bigquery

META_TOKEN = os.environ["META_ACCESS_TOKEN"]
PROJECT_ID = "d2c-analytics-502304"
API = "https://graph.facebook.com/v20.0/ads_archive"

# 경쟁사 페이지 ID 리스트 (파일로 관리)
COMPETITOR_PAGES = [
    {"page_id": "100000000000001", "name": "메디큐브"},
    {"page_id": "100000000000002", "name": "AGE20's"},
    {"page_id": "100000000000003", "name": "APLB"},
    {"page_id": "100000000000004", "name": "달바"},
    {"page_id": "100000000000005", "name": "닥터지"},
    # 관심 있는 경쟁사 20~50개 등록
]

def fetch_ads_for_page(page_id, country="KR", limit=1000):
    """특정 페이지의 광고 라이브러리 데이터 수집"""
    ads = []
    params = {
        "access_token": META_TOKEN,
        "ad_reached_countries": f"['{country}']",
        "ad_active_status": "ALL",  # ACTIVE / INACTIVE / ALL
        "search_page_ids": f"[{page_id}]",
        "fields": (
            "id,page_id,page_name,ad_creation_time,"
            "ad_delivery_start_time,ad_delivery_stop_time,"
            "ad_snapshot_url,ad_creative_bodies,ad_creative_link_captions,"
            "ad_creative_link_descriptions,ad_creative_link_titles,"
            "publisher_platforms,estimated_audience_size,"
            "impressions,spend,currency,"
            "target_ages,target_gender,target_locations,"
            "languages,demographic_distribution"
        ),
        "limit": 100
    }
    url = API
    while url and len(ads) < limit:
        r = requests.get(url, params=params, timeout=60)
        r.raise_for_status()
        data = r.json()
        ads.extend(data.get("data", []))
        url = data.get("paging", {}).get("next")
        params = {}
    return ads

def compute_running_days(start, stop):
    if not start: return None
    s = datetime.fromisoformat(start.replace("Z","+00:00"))
    e = datetime.fromisoformat(stop.replace("Z","+00:00")) if stop else datetime.now(timezone.utc)
    return (e - s).days

def main():
    all_rows = []
    for comp in COMPETITOR_PAGES:
        print(f"[INFO] fetching {comp['name']} (page_id={comp['page_id']})")
        try:
            ads = fetch_ads_for_page(comp["page_id"])
            for ad in ads:
                bodies = ad.get("ad_creative_bodies", []) or []
                titles = ad.get("ad_creative_link_titles", []) or []
                descriptions = ad.get("ad_creative_link_descriptions", []) or []
                platforms = ad.get("publisher_platforms", []) or []

                all_rows.append({
                    "competitor_name": comp["name"],
                    "ad_id": ad["id"],
                    "page_id": ad.get("page_id"),
                    "page_name": ad.get("page_name"),
                    "ad_creation_time": ad.get("ad_creation_time"),
                    "delivery_start": ad.get("ad_delivery_start_time"),
                    "delivery_stop": ad.get("ad_delivery_stop_time"),
                    "running_days": compute_running_days(
                        ad.get("ad_delivery_start_time"),
                        ad.get("ad_delivery_stop_time")
                    ),
                    "is_currently_active": ad.get("ad_delivery_stop_time") is None,
                    "snapshot_url": ad.get("ad_snapshot_url"),
                    "body_text": " | ".join(bodies)[:2000],
                    "title_text": " | ".join(titles)[:500],
                    "description_text": " | ".join(descriptions)[:1000],
                    "platforms": ",".join(platforms),
                    "impressions_lower_bound": (ad.get("impressions") or {}).get("lower_bound"),
                    "impressions_upper_bound": (ad.get("impressions") or {}).get("upper_bound"),
                    "spend_lower_bound": (ad.get("spend") or {}).get("lower_bound"),
                    "spend_upper_bound": (ad.get("spend") or {}).get("upper_bound"),
                    "currency": ad.get("currency"),
                    "target_ages": json.dumps(ad.get("target_ages") or []),
                    "target_gender": ad.get("target_gender"),
                    "fetched_at": datetime.utcnow().isoformat(),
                })
        except Exception as e:
            print(f"[WARN] {comp['name']}: {e}")

    client = bigquery.Client(project=PROJECT_ID)
    table_id = f"{PROJECT_ID}.marts.competitor_ads"
    client.load_table_from_json(
        all_rows, table_id,
        job_config=bigquery.LoadJobConfig(
            write_disposition="WRITE_TRUNCATE",
            autodetect=True
        )
    ).result()
    print(f"[OK] loaded {len(all_rows)} competitor ads")

if __name__ == "__main__":
    main()
