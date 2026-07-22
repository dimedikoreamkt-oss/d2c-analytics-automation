"""
Meta Marketing API -> BigQuery
- meta_creatives: 활성/정지/아카이브 광고 + 소재 이미지 URL, 카피, CTA, 랜딩 URL
- meta_ad_insights: 광고별 일별 성과 (impressions/reach/frequency/spend/cpc/cpm/clicks/ctr/actions/videos)
"""
import os
import json
import requests
from datetime import date, timedelta, datetime
from google.cloud import bigquery

META_TOKEN = os.environ["META_ACCESS_TOKEN"]
AD_ACCOUNT_ID = os.environ["META_AD_ACCOUNT_ID"]
PROJECT_ID = "d2c-analytics-502304"
DATASET = "marts"
LOCATION = "asia-northeast3"
API_VERSION = "v20.0"
BASE_URL = f"https://graph.facebook.com/{API_VERSION}"


def api_get(endpoint, params=None):
    params = params or {}
    params["access_token"] = META_TOKEN
    r = requests.get(f"{BASE_URL}/{endpoint}", params=params, timeout=60)
    r.raise_for_status()
    return r.json()


def fetch_active_ads():
    """계정의 모든 광고 (활성/정지/아카이브 포함)"""
    ads = []
    url = f"act_{AD_ACCOUNT_ID}/ads"
    params = {
        "fields": (
            "id,name,status,effective_status,"
            "campaign_id,campaign{name,status,effective_status},"
            "adset_id,adset{name,status,effective_status},"
            "creative{id,name,thumbnail_url,image_url,object_story_spec,"
            "body,title,call_to_action_type,instagram_permalink_url,video_id}"
        ),
        "limit": 100,
        "filtering": json.dumps([{
            "field": "effective_status",
            "operator": "IN",
            "value": [
                "ACTIVE", "PAUSED",
                "CAMPAIGN_PAUSED", "ADSET_PAUSED",
                "ARCHIVED",
                "PENDING_REVIEW", "DISAPPROVED",
                "PREAPPROVED", "PENDING_BILLING_INFO",
                "IN_PROCESS", "WITH_ISSUES"
            ]
        }]),
    }
    while True:
        data = api_get(url, params)
        ads.extend(data.get("data", []))
        next_url = data.get("paging", {}).get("next")
        if not next_url:
            break
        url = next_url.replace(f"{BASE_URL}/", "")
        params = {}
    return ads


def enrich_creative(creative_id):
    """소재의 고해상도 이미지 URL과 카피 상세 조회"""
    if not creative_id:
        return {}
    fields = (
        "id,name,thumbnail_url,image_url,image_hash,video_id,"
        "object_story_spec{link_data{image_hash,image_url,message,name,description,call_to_action,link},"
        "video_data{image_url,video_id,message,title,call_to_action}}"
    )
    try:
        return api_get(creative_id, {"fields": fields})
    except Exception as e:
        print(f"[WARN] enrich creative {creative_id}: {e}")
        return {}


def fetch_insights(ad_id, since, until):
    """광고별 일별 성과"""
    params = {
        "level": "ad",
        "fields": (
            "ad_id,ad_name,campaign_name,adset_name,"
            "impressions,reach,frequency,spend,cpc,cpm,clicks,ctr,"
            "unique_clicks,unique_ctr,inline_link_clicks,inline_link_click_ctr,"
            "actions,action_values,purchase_roas,"
            "video_p25_watched_actions,video_p50_watched_actions,"
            "video_p75_watched_actions,video_p100_watched_actions,"
            "video_avg_time_watched_actions"
        ),
        "time_range": json.dumps({"since": since, "until": until}),
        "time_increment": 1,
    }
    try:
        data = api_get(f"{ad_id}/insights", params)
        return data.get("data", [])
    except Exception as e:
        print(f"[WARN] insights {ad_id}: {e}")
        return []


def extract_action(actions, action_type):
    if not actions:
        return 0
    for a in actions:
        if a.get("action_type") == action_type:
            return float(a.get("value", 0) or 0)
    return 0


def extract_action_value(action_values, action_type):
    if not action_values:
        return 0.0
    for a in action_values:
        if a.get("action_type") == action_type:
            return float(a.get("value", 0) or 0)
    return 0.0


def load_creatives_to_bq(rows):
    client = bigquery.Client(project=PROJECT_ID)
    table_id = f"{PROJECT_ID}.{DATASET}.meta_creatives"
    schema = [
        bigquery.SchemaField("ad_id", "STRING"),
        bigquery.SchemaField("ad_name", "STRING"),
        bigquery.SchemaField("campaign_id", "STRING"),
        bigquery.SchemaField("campaign_name", "STRING"),
        bigquery.SchemaField("campaign_status", "STRING"),
        bigquery.SchemaField("adset_id", "STRING"),
        bigquery.SchemaField("adset_name", "STRING"),
        bigquery.SchemaField("adset_status", "STRING"),
        bigquery.SchemaField("creative_id", "STRING"),
        bigquery.SchemaField("creative_name", "STRING"),
        bigquery.SchemaField("effective_status", "STRING"),
        bigquery.SchemaField("thumbnail_url", "STRING"),
        bigquery.SchemaField("image_url", "STRING"),
        bigquery.SchemaField("local_image_path", "STRING"),
        bigquery.SchemaField("video_id", "STRING"),
        bigquery.SchemaField("body_text", "STRING"),
        bigquery.SchemaField("title_text", "STRING"),
        bigquery.SchemaField("cta_type", "STRING"),
        bigquery.SchemaField("landing_url", "STRING"),
        bigquery.SchemaField("instagram_permalink", "STRING"),
        bigquery.SchemaField("fetched_at", "TIMESTAMP"),
    ]
    job = client.load_table_from_json(
        rows,
        table_id,
        job_config=bigquery.LoadJobConfig(
            schema=schema,
            write_disposition="WRITE_TRUNCATE",
        ),
    )
    job.result()
    print(f"[OK] loaded {len(rows)} creatives to {table_id}")


def load_insights_to_bq(rows):
    if not rows:
        print("[INFO] no insights rows to load")
        return
    client = bigquery.Client(project=PROJECT_ID)
    table_id = f"{PROJECT_ID}.{DATASET}.meta_ad_insights"
    staging_id = f"{PROJECT_ID}.{DATASET}.meta_ad_insights_staging"

    schema = [
        bigquery.SchemaField("event_date", "DATE"),
        bigquery.SchemaField("ad_id", "STRING"),
        bigquery.SchemaField("ad_name", "STRING"),
        bigquery.SchemaField("campaign_name", "STRING"),
        bigquery.SchemaField("adset_name", "STRING"),
        bigquery.SchemaField("impressions", "INT64"),
        bigquery.SchemaField("reach", "INT64"),
        bigquery.SchemaField("frequency", "FLOAT64"),
        bigquery.SchemaField("spend_krw", "FLOAT64"),
        bigquery.SchemaField("cpc", "FLOAT64"),
        bigquery.SchemaField("cpm", "FLOAT64"),
        bigquery.SchemaField("clicks", "INT64"),
        bigquery.SchemaField("ctr", "FLOAT64"),
        bigquery.SchemaField("unique_clicks", "INT64"),
        bigquery.SchemaField("inline_link_clicks", "INT64"),
        bigquery.SchemaField("link_ctr", "FLOAT64"),
        bigquery.SchemaField("meta_purchases", "INT64"),
        bigquery.SchemaField("meta_add_to_cart", "INT64"),
        bigquery.SchemaField("meta_initiate_checkout", "INT64"),
        bigquery.SchemaField("meta_view_content", "INT64"),
        bigquery.SchemaField("meta_lead", "INT64"),
        bigquery.SchemaField("meta_purchase_value", "FLOAT64"),
        bigquery.SchemaField("meta_roas", "FLOAT64"),
        bigquery.SchemaField("video_p25", "INT64"),
        bigquery.SchemaField("video_p50", "INT64"),
        bigquery.SchemaField("video_p75", "INT64"),
        bigquery.SchemaField("video_p100", "INT64"),
        bigquery.SchemaField("video_avg_watch_sec", "FLOAT64"),
        bigquery.SchemaField("fetched_at", "TIMESTAMP"),
    ]

    stage_job = client.load_table_from_json(
        rows,
        staging_id,
        job_config=bigquery.LoadJobConfig(
            schema=schema,
            write_disposition="WRITE_TRUNCATE",
        ),
    )
    stage_job.result()
    print(f"[OK] staged {len(rows)} rows -> {staging_id}")

    try:
        client.get_table(table_id)
        exists = True
    except Exception:
        exists = False

    if exists:
        query = f"""
        CREATE OR REPLACE TABLE `{table_id}`
        PARTITION BY event_date AS
        SELECT * FROM `{table_id}`
        WHERE event_date NOT IN (SELECT DISTINCT event_date FROM `{staging_id}`)
        UNION ALL
        SELECT * FROM `{staging_id}`
        """
        client.query(query, location=LOCATION).result()
    else:
        query = f"""
        CREATE TABLE `{table_id}`
        PARTITION BY event_date AS
        SELECT * FROM `{staging_id}`
        """
        client.query(query, location=LOCATION).result()

    print(f"[OK] merged into {table_id}")


def main():
    backfill_days = int(os.environ.get("BACKFILL_DAYS", "7"))
    until = date.today() - timedelta(days=1)
    since = until - timedelta(days=backfill_days - 1)
    print(f"[INFO] range: {since} ~ {until}")

    ads = fetch_active_ads()
    print(f"[INFO] fetched ads: {len(ads)}")

    creatives_rows = []
    insights_rows = []
    fetched_at = datetime.utcnow().isoformat()

    for ad in ads:
        ad_id = ad["id"]
        creative = ad.get("creative", {}) or {}
        creative_id = creative.get("id")
        enriched = enrich_creative(creative_id) if creative_id else {}

        oss = enriched.get("object_story_spec", {}) or {}
        link_data = oss.get("link_data", {}) or {}
        video_data = oss.get("video_data", {}) or {}

        img_url = (
            enriched.get("image_url")
            or link_data.get("image_url")
            or video_data.get("image_url")
            or enriched.get("thumbnail_url")
            or creative.get("thumbnail_url")
        )

        body = link_data.get("message") or video_data.get("message") or creative.get("body")
        title = link_data.get("name") or video_data.get("title") or creative.get("title")
        cta = (link_data.get("call_to_action") or {}).get("type") \
              or (video_data.get("call_to_action") or {}).get("type") \
              or creative.get("call_to_action_type")
        landing = link_data.get("link")

        local_path = f"creatives/{ad_id}.jpg" if img_url else None

        campaign_obj = ad.get("campaign") or {}
        adset_obj = ad.get("adset") or {}

        creatives_rows.append({
            "ad_id": ad_id,
            "ad_name": ad.get("name"),
            "campaign_id": ad.get("campaign_id"),
            "campaign_name": campaign_obj.get("name"),
            "campaign_status": campaign_obj.get("effective_status"),
            "adset_id": ad.get("adset_id"),
            "adset_name": adset_obj.get("name"),
            "adset_status": adset_obj.get("effective_status"),
            "creative_id": creative_id,
            "creative_name": creative.get("name"),
            "effective_status": ad.get("effective_status"),
            "thumbnail_url": creative.get("thumbnail_url"),
            "image_url": img_url,
            "local_image_path": local_path,
            "video_id": creative.get("video_id"),
            "body_text": body,
            "title_text": title,
            "cta_type": cta,
            "landing_url": landing,
            "instagram_permalink": creative.get("instagram_permalink_url"),
            "fetched_at": fetched_at,
        })

        for ins in fetch_insights(ad_id, since.isoformat(), until.isoformat()):
            actions = ins.get("actions", []) or []
            action_values = ins.get("action_values", []) or []
            purchase_roas_list = ins.get("purchase_roas") or []
            purchase_roas = float(purchase_roas_list[0].get("value", 0)) if purchase_roas_list else 0

            insights_rows.append({
                "event_date": ins.get("date_start"),
                "ad_id": ad_id,
                "ad_name": ins.get("ad_name"),
                "campaign_name": ins.get("campaign_name"),
                "adset_name": ins.get("adset_name"),
                "impressions": int(float(ins.get("impressions", 0) or 0)),
                "reach": int(float(ins.get("reach", 0) or 0)),
                "frequency": float(ins.get("frequency", 0) or 0),
                "spend_krw": float(ins.get("spend", 0) or 0),
                "cpc": float(ins.get("cpc", 0) or 0),
                "cpm": float(ins.get("cpm", 0) or 0),
                "clicks": int(float(ins.get("clicks", 0) or 0)),
                "ctr": float(ins.get("ctr", 0) or 0),
                "unique_clicks": int(float(ins.get("unique_clicks", 0) or 0)),
                "inline_link_clicks": int(float(ins.get("inline_link_clicks", 0) or 0)),
                "link_ctr": float(ins.get("inline_link_click_ctr", 0) or 0),
                "meta_purchases": int(
                    extract_action(actions, "purchase")
                    or extract_action(actions, "offsite_conversion.fb_pixel_purchase")
                ),
                "meta_add_to_cart": int(
                    extract_action(actions, "add_to_cart")
                    or extract_action(actions, "offsite_conversion.fb_pixel_add_to_cart")
                ),
                "meta_initiate_checkout": int(
                    extract_action(actions, "initiate_checkout")
                    or extract_action(actions, "offsite_conversion.fb_pixel_initiate_checkout")
                ),
                "meta_view_content": int(
                    extract_action(actions, "view_content")
                    or extract_action(actions, "offsite_conversion.fb_pixel_view_content")
                ),
                "meta_lead": int(extract_action(actions, "lead")),
                "meta_purchase_value": (
                    extract_action_value(action_values, "purchase")
                    or extract_action_value(action_values, "offsite_conversion.fb_pixel_purchase")
                ),
                "meta_roas": purchase_roas,
                "video_p25": int(extract_action(ins.get("video_p25_watched_actions"), "video_view")),
                "video_p50": int(extract_action(ins.get("video_p50_watched_actions"), "video_view")),
                "video_p75": int(extract_action(ins.get("video_p75_watched_actions"), "video_view")),
                "video_p100": int(extract_action(ins.get("video_p100_watched_actions"), "video_view")),
                "video_avg_watch_sec": float(extract_action(ins.get("video_avg_time_watched_actions"), "video_view")),
                "fetched_at": fetched_at,
            })

    load_creatives_to_bq(creatives_rows)
    load_insights_to_bq(insights_rows)


if __name__ == "__main__":
    main()
