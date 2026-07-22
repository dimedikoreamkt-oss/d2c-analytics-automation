"""
경쟁사 특정 없이 키워드 기반 광고 자동 발굴
- 자사 소구점(mart_creative_appeal)에서 검색 키워드 자동 추출
- Meta Ads Library API로 대량 검색
- 러닝 기간 기반 자동 등급 판정
"""
import os
import json
import time
import requests
from datetime import date, datetime, timezone
from google.cloud import bigquery

META_TOKEN = os.environ["META_ACCESS_TOKEN"]
PROJECT_ID = "d2c-analytics-502304"
DATASET = "marts"
LOCATION = "asia-northeast3"
API_VERSION = "v20.0"
API = f"https://graph.facebook.com/{API_VERSION}/ads_archive"
COUNTRY = "KR"

# 카테고리 기본 키워드 (자사 소구점에 상관없이 항상 검색)
BASE_KEYWORDS = [
    # 안면 관리 카테고리
    "안면윤곽", "V라인", "리프팅", "탄력", "턱선",
    "이중턱", "볼살", "처진볼", "팔자주름", "광대",
    # 홈케어 기기
    "홈케어 마사지기", "얼굴 마사지기", "안면 마사지기",
    "EMS 마사지기", "LED 마스크", "저주파 마사지",
    "미세전류", "초음파 마사지",
    # 시술 대체
    "울쎄라", "인모드", "리쥬란", "시술없이",
    # 홈뷰티 카테고리
    "홈뷰티 디바이스", "홈리프팅", "얼굴 탄력",
]


def get_dynamic_keywords():
    """자사 소구점에서 상위 키워드 자동 추출"""
    try:
        client = bigquery.Client(project=PROJECT_ID)
        q = f"""
        SELECT appeal_tag, SUM(spend_krw) AS total_spend
        FROM `{PROJECT_ID}.marts.mart_creative_appeal`
        WHERE event_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
          AND appeal_tag NOT IN ('미분류')
        GROUP BY appeal_tag
        ORDER BY total_spend DESC
        LIMIT 8
        """
        rows = list(client.query(q).result())
        # 소구점 이름 자체가 이미 좋은 키워드
        dynamic = []
        for r in rows:
            tag = r["appeal_tag"]
            # 소구점명에서 검색 키워드 유도
            if "얼굴형" in tag or "윤곽" in tag:
                dynamic.extend(["안면윤곽", "V라인", "얼굴형"])
            elif "리프팅" in tag or "탄력" in tag:
                dynamic.extend(["리프팅", "탄력"])
            elif "홈케어" in tag:
                dynamic.extend(["홈케어", "셀프케어"])
            elif "시술대체" in tag:
                dynamic.extend(["시술없이", "울쎄라 대체"])
            elif "디바이스" in tag:
                dynamic.extend(["홈뷰티 기기", "마사지기"])
        return list(set(dynamic))
    except Exception as e:
        print(f"[WARN] dynamic keyword extract failed: {e}")
        return []


def search_ads(keyword, limit=500):
    """키워드로 광고 검색 (페이지네이션 자동 처리)"""
    ads = []
    params = {
        "access_token": META_TOKEN,
        "search_terms": keyword,
        "ad_reached_countries": f'["{COUNTRY}"]',
        "ad_active_status": "ALL",
        "fields": (
            "id,page_id,page_name,ad_creation_time,"
            "ad_delivery_start_time,ad_delivery_stop_time,"
            "ad_snapshot_url,ad_creative_bodies,ad_creative_link_captions,"
            "ad_creative_link_descriptions,ad_creative_link_titles,"
            "publisher_platforms,impressions,spend,currency,"
            "target_ages,target_gender,languages"
        ),
        "limit": 100
    }
    url = API
    while url and len(ads) < limit:
        try:
            r = requests.get(url, params=params, timeout=60)
            r.raise_for_status()
            data = r.json()
            new_ads = data.get("data", [])
            for ad in new_ads:
                ad["_search_keyword"] = keyword
            ads.extend(new_ads)
            url = data.get("paging", {}).get("next")
            params = {}
            time.sleep(0.4)
        except Exception as e:
            print(f"[WARN] '{keyword}': {e}")
            break
    return ads[:limit]


def compute_running_days(start, stop):
    if not start:
        return None
    try:
        s = datetime.fromisoformat(start.replace("Z", "+00:00"))
    except Exception:
        return None
    e = datetime.fromisoformat(stop.replace("Z", "+00:00")) if stop else datetime.now(timezone.utc)
    return max(0, (e - s).days)


def main():
    # 기본 키워드 + 동적 키워드
    dynamic_kws = get_dynamic_keywords()
    keywords = list(set(BASE_KEYWORDS + dynamic_kws))
    print(f"[INFO] total keywords: {len(keywords)}")
    print(f"[INFO] dynamic from own data: {dynamic_kws}")

    all_ads = {}  # ad_id로 중복 제거

    for kw in keywords:
        print(f"[INFO] searching '{kw}'")
        ads = search_ads(kw, limit=300)
        print(f"       -> {len(ads)} ads")
        for ad in ads:
            aid = ad["id"]
            if aid not in all_ads:
                all_ads[aid] = ad
                all_ads[aid]["_matched_keywords"] = [kw]
            else:
                if kw not in all_ads[aid]["_matched_keywords"]:
                    all_ads[aid]["_matched_keywords"].append(kw)

    print(f"[INFO] total unique ads: {len(all_ads)}")

    rows = []
    fetched_at = datetime.utcnow().isoformat()

    for ad in all_ads.values():
        bodies = ad.get("ad_creative_bodies", []) or []
        titles = ad.get("ad_creative_link_titles", []) or []
        captions = ad.get("ad_creative_link_captions", []) or []
        descriptions = ad.get("ad_creative_link_descriptions", []) or []
        platforms = ad.get("publisher_platforms", []) or []
        impressions = ad.get("impressions") or {}
        spend = ad.get("spend") or {}

        rows.append({
            "ad_id": ad["id"],
            "page_id": ad.get("page_id"),
            "page_name": ad.get("page_name"),
            "matched_keywords": ",".join(ad.get("_matched_keywords", [])),
            "keyword_count": len(ad.get("_matched_keywords", [])),
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
            "landing_url": captions[0] if captions else None,
            "platforms": ",".join(platforms),
            "impressions_lower": impressions.get("lower_bound"),
            "impressions_upper": impressions.get("upper_bound"),
            "spend_lower": spend.get("lower_bound"),
            "spend_upper": spend.get("upper_bound"),
            "currency": ad.get("currency"),
            "target_ages": json.dumps(ad.get("target_ages") or []),
            "target_gender": ad.get("target_gender"),
            "languages": ",".join(ad.get("languages", []) or []),
            "fetched_at": fetched_at,
        })

    client = bigquery.Client(project=PROJECT_ID)
    table_id = f"{PROJECT_ID}.{DATASET}.discovered_ads"

    schema = [
        bigquery.SchemaField("ad_id", "STRING"),
        bigquery.SchemaField("page_id", "STRING"),
        bigquery.SchemaField("page_name", "STRING"),
        bigquery.SchemaField("matched_keywords", "STRING"),
        bigquery.SchemaField("keyword_count", "INT64"),
        bigquery.SchemaField("ad_creation_time", "STRING"),
        bigquery.SchemaField("delivery_start", "STRING"),
        bigquery.SchemaField("delivery_stop", "STRING"),
        bigquery.SchemaField("running_days", "INT64"),
        bigquery.SchemaField("is_currently_active", "BOOL"),
        bigquery.SchemaField("snapshot_url", "STRING"),
        bigquery.SchemaField("body_text", "STRING"),
        bigquery.SchemaField("title_text", "STRING"),
        bigquery.SchemaField("description_text", "STRING"),
        bigquery.SchemaField("landing_url", "STRING"),
        bigquery.SchemaField("platforms", "STRING"),
        bigquery.SchemaField("impressions_lower", "INT64"),
        bigquery.SchemaField("impressions_upper", "INT64"),
        bigquery.SchemaField("spend_lower", "FLOAT64"),
        bigquery.SchemaField("spend_upper", "FLOAT64"),
        bigquery.SchemaField("currency", "STRING"),
        bigquery.SchemaField("target_ages", "STRING"),
        bigquery.SchemaField("target_gender", "STRING"),
        bigquery.SchemaField("languages", "STRING"),
        bigquery.SchemaField("fetched_at", "TIMESTAMP"),
    ]

    job = client.load_table_from_json(
        rows, table_id,
        job_config=bigquery.LoadJobConfig(
            schema=schema,
            write_disposition="WRITE_TRUNCATE"
        )
    )
    job.result()
    print(f"[OK] loaded {len(rows)} discovered ads to {table_id}")


if __name__ == "__main__":
    main()
