"""
Meta Marketing API → BigQuery 소재/성과 수집기
- Step 1: /act_{id}/ads → 활성 광고 목록 + creative_id
- Step 2: /{creative_id} → 이미지 URL, 카피, CTA, 랜딩 URL
- Step 3: /{ad_id}/insights → 성과 지표 (impressions, clicks, spend, actions...)
"""
import os, requests, json, hashlib
from datetime import date, timedelta, datetime
from google.cloud import bigquery

META_TOKEN = os.environ["META_ACCESS_TOKEN"]
AD_ACCOUNT_ID = os.environ["META_AD_ACCOUNT_ID"]  # act_ 없이 숫자만
PROJECT_ID = "d2c-analytics-502304"
DATASET = "marts"
API_VERSION = "v20.0"
BASE_URL = f"https://graph.facebook.com/{API_VERSION}"

def api_get(endpoint, params=None):
    params = params or {}
    params["access_token"] = META_TOKEN
    r = requests.get(f"{BASE_URL}/{endpoint}", params=params, timeout=60)
    r.raise_for_status()
    return r.json()

# ============ Step 1: 활성 광고 + creative 매핑 ============
def fetch_active_ads():
    """현재 활성 광고 목록 (creative_id 포함)"""
    ads = []
    url = f"act_{AD_ACCOUNT_ID}/ads"
    params = {
        "fields": "id,name,status,effective_status,campaign_id,campaign{name},adset_id,adset{name},creative{id,name,thumbnail_url,image_url,object_story_spec,body,title,call_to_action_type,link_url,instagram_permalink_url,video_id}",
        "limit": 100,
        "filtering": json.dumps([{"field":"effective_status","operator":"IN","value":["ACTIVE","PAUSED"]}])
    }
    while url:
        data = api_get(url, params)
        ads.extend(data.get("data", []))
        paging = data.get("paging", {}).get("next")
        if paging:
            url = paging
            params = {}  # next URL에 포함됨
        else:
            break
    return ads

# ============ Step 2: 소재 이미지 URL 상세 조회 ============
def enrich_creative(creative_id):
    """소재의 실제 고해상도 이미지/영상 URL 확보"""
    fields = "id,name,thumbnail_url,image_url,image_hash,video_id,object_story_spec{link_data{image_hash,image_url,message,name,description,call_to_action,link},video_data{image_url,video_id,message,title,call_to_action}},asset_feed_spec{images,videos,bodies,titles,descriptions,link_urls,call_to_action_types}"
    return api_get(creative_id, {"fields": fields})

# ============ Step 3: 광고별 성과 (일별) ============
def fetch_insights(ad_id, since, until):
    """
    ad_id 성과: 노출/도달/빈도/비용/CPC/CPM/클릭/CTR/전환/ROAS
    """
    params = {
        "level": "ad",
        "fields": "ad_id,ad_name,campaign_name,adset_name,impressions,reach,frequency,spend,cpc,cpm,cpp,clicks,ctr,unique_clicks,unique_ctr,inline_link_clicks,inline_link_click_ctr,actions,action_values,cost_per_action_type,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions,video_avg_time_watched_actions,purchase_roas,website_ctr",
        "time_range": json.dumps({"since": since, "until": until}),
        "time_increment": 1,  # 일별
    }
    try:
        data = api_get(f"{ad_id}/insights", params)
        return data.get("data", [])
    except Exception as e:
        print(f"[WARN] insights failed for {ad_id}: {e}")
        return []

# ============ 액션 추출 유틸 ============
def extract_action(actions, action_type):
    if not actions: return 0
    for a in actions:
        if a.get("action_type") == action_type:
            return float(a.get("value", 0))
    return 0

def extract_action_value(action_values, action_type):
    if not action_values: return 0.0
    for a in action_values:
        if a.get("action_type") == action_type:
            return float(a.get("value", 0))
    return 0.0

# ============ BigQuery 로드 ============
def load_creatives_to_bq(creatives_rows):
    client = bigquery.Client(project=PROJECT_ID)
    table_id = f"{PROJECT_ID}.{DATASET}.meta_creatives"
    schema = [
        bigquery.SchemaField("ad_id","STRING"),
        bigquery.SchemaField("ad_name","STRING"),
        bigquery.SchemaField("campaign_id","STRING"),
        bigquery.SchemaField("campaign_name","STRING"),
        bigquery.SchemaField("adset_id","STRING"),
        bigquery.SchemaField("adset_name","STRING"),
        bigquery.SchemaField("creative_id","STRING"),
        bigquery.SchemaField("creative_name","STRING"),
        bigquery.SchemaField("effective_status","STRING"),
        bigquery.SchemaField("thumbnail_url","STRING"),
        bigquery.SchemaField("image_url","STRING"),
        bigquery.SchemaField("local_image_path","STRING"),
        bigquery.SchemaField("video_id","STRING"),
        bigquery.SchemaField("body_text","STRING"),
        bigquery.SchemaField("title_text","STRING"),
        bigquery.SchemaField("cta_type","STRING"),
        bigquery.SchemaField("landing_url","STRING"),
        bigquery.SchemaField("instagram_permalink","STRING"),
        bigquery.SchemaField("fetched_at","TIMESTAMP"),
    ]
    job_config = bigquery.LoadJobConfig(
        schema=schema,
        write_disposition="WRITE_TRUNCATE",  # 매일 최신 스냅샷
    )
    job = client.load_table_from_json(creatives_rows, table_id, job_config=job_config)
    job.result()
    print(f"[OK] loaded {len(creatives_rows)} creatives to {table_id}")

def load_insights_to_bq(insights_rows):
    client = bigquery.Client(project=PROJECT_ID)
    table_id = f"{PROJECT_ID}.{DATASET}.meta_ad_insights"
    schema = [
        bigquery.SchemaField("event_date","DATE"),
        bigquery.SchemaField("ad_id","STRING"),
        bigquery.SchemaField("ad_name","STRING"),
        bigquery.SchemaField("campaign_name","STRING"),
        bigquery.SchemaField("adset_name","STRING"),
        bigquery.SchemaField("impressions","INT64"),
        bigquery.SchemaField("reach","INT64"),
        bigquery.SchemaField("frequency","FLOAT64"),
        bigquery.SchemaField("spend_krw","FLOAT64"),
        bigquery.SchemaField("cpc","FLOAT64"),
        bigquery.SchemaField("cpm","FLOAT64"),
        bigquery.SchemaField("clicks","INT64"),
        bigquery.SchemaField("ctr","FLOAT64"),
        bigquery.SchemaField("unique_clicks","INT64"),
        bigquery.SchemaField("inline_link_clicks","INT64"),
        bigquery.SchemaField("link_ctr","FLOAT64"),
        bigquery.SchemaField("meta_purchases","INT64"),
        bigquery.SchemaField("meta_add_to_cart","INT64"),
        bigquery.SchemaField("meta_initiate_checkout","INT64"),
        bigquery.SchemaField("meta_view_content","INT64"),
        bigquery.SchemaField("meta_lead","INT64"),
        bigquery.SchemaField("meta_purchase_value","FLOAT64"),
        bigquery.SchemaField("meta_roas","FLOAT64"),
        bigquery.SchemaField("video_p25","INT64"),
        bigquery.SchemaField("video_p50","INT64"),
        bigquery.SchemaField("video_p75","INT64"),
        bigquery.SchemaField("video_p100","INT64"),
        bigquery.SchemaField("video_avg_watch_sec","FLOAT64"),
        bigquery.SchemaField("fetched_at","TIMESTAMP"),
    ]
    # DELETE + INSERT (billing off 상태 대응)
    client = bigquery.Client(project=PROJECT_ID)
    job_config = bigquery.LoadJobConfig(
        schema=schema,
        write_disposition="WRITE_APPEND",
        time_partitioning=bigquery.TimePartitioning(type_=bigquery.TimePartitioningType.DAY, field="event_date"),
    )
    # 기존 날짜 삭제 후 재적재는 MERGE 대신 CREATE OR REPLACE 스테이징 방식 사용
    staging_id = f"{PROJECT_ID}.{DATASET}.meta_ad_insights_staging"
    stage_job = client.load_table_from_json(insights_rows, staging_id,
        job_config=bigquery.LoadJobConfig(schema=schema, write_disposition="WRITE_TRUNCATE"))
    stage_job.result()

    query = f"""
    CREATE OR REPLACE TABLE `{table_id}`
    PARTITION BY event_date AS
    SELECT * FROM `{table_id}` WHERE event_date NOT IN (SELECT DISTINCT event_date FROM `{staging_id}`)
    UNION ALL
    SELECT * FROM `{staging_id}`
    """
    # 최초 실행 시 table_id가 없으면 fallback
    try:
        client.query(query).result()
    except Exception:
        stage_job2 = client.load_table_from_json(insights_rows, table_id, job_config=job_config)
        stage_job2.result()
    print(f"[OK] loaded {len(insights_rows)} insights rows to {table_id}")

# ============ 메인 ============
def main():
    backfill_days = int(os.environ.get("BACKFILL_DAYS", "7"))
    until = date.today() - timedelta(days=1)
    since = until - timedelta(days=backfill_days-1)
    print(f"[INFO] range: {since} ~ {until}")

    # 1. 활성 광고 목록
    ads = fetch_active_ads()
    print(f"[INFO] active ads: {len(ads)}")

    creatives_rows = []
    insights_rows = []

    for ad in ads:
        ad_id = ad["id"]
        creative = ad.get("creative", {})
        creative_id = creative.get("id")

        # 2. 소재 상세 (이미지 URL 확보)
        try:
            enriched = enrich_creative(creative_id) if creative_id else {}
        except Exception as e:
            print(f"[WARN] enrich {creative_id}: {e}")
            enriched = {}

        # 이미지 URL 우선순위: image_url > object_story_spec.link_data.image_url > thumbnail_url
        img_url = (enriched.get("image_url")
                   or enriched.get("object_story_spec", {}).get("link_data", {}).get("image_url")
                   or enriched.get("object_story_spec", {}).get("video_data", {}).get("image_url")
                   or enriched.get("thumbnail_url")
                   or creative.get("thumbnail_url"))

        body = (enriched.get("object_story_spec", {}).get("link_data", {}).get("message")
                or enriched.get("object_story_spec", {}).get("video_data", {}).get("message"))
        title = (enriched.get("object_story_spec", {}).get("link_data", {}).get("name"))
        cta = (enriched.get("object_story_spec", {}).get("link_data", {}).get("call_to_action", {}).get("type"))
        landing = (enriched.get("object_story_spec", {}).get("link_data", {}).get("link"))

        # 로컬 저장 경로 (이미지 다운로드는 별도 스크립트에서)
        local_path = f"creatives/{ad_id}.jpg" if img_url else None

        creatives_rows.append({
            "ad_id": ad_id,
            "ad_name": ad.get("name"),
            "campaign_id": ad.get("campaign_id"),
            "campaign_name": ad.get("campaign", {}).get("name"),
            "adset_id": ad.get("adset_id"),
            "adset_name": ad.get("adset", {}).get("name"),
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
            "fetched_at": datetime.utcnow().isoformat(),
        })

        # 3. 성과 데이터 (일별)
        for ins in fetch_insights(ad_id, since.isoformat(), until.isoformat()):
            actions = ins.get("actions", [])
            action_values = ins.get("action_values", [])
            insights_rows.append({
                "event_date": ins.get("date_start"),
                "ad_id": ad_id,
                "ad_name": ins.get("ad_name"),
                "campaign_name": ins.get("campaign_name"),
                "adset_name": ins.get("adset_name"),
                "impressions": int(float(ins.get("impressions", 0))),
                "reach": int(float(ins.get("reach", 0))),
                "frequency": float(ins.get("frequency", 0)),
                "spend_krw": float(ins.get("spend", 0)),
                "cpc": float(ins.get("cpc", 0) or 0),
                "cpm": float(ins.get("cpm", 0) or 0),
                "clicks": int(float(ins.get("clicks", 0))),
                "ctr": float(ins.get("ctr", 0) or 0),
                "unique_clicks": int(float(ins.get("unique_clicks", 0) or 0)),
                "inline_link_clicks": int(float(ins.get("inline_link_clicks", 0) or 0)),
                "link_ctr": float(ins.get("inline_link_click_ctr", 0) or 0),
                "meta_purchases": int(extract_action(actions, "purchase") or extract_action(actions, "offsite_conversion.fb_pixel_purchase")),
                "meta_add_to_cart": int(extract_action(actions, "add_to_cart") or extract_action(actions, "offsite_conversion.fb_pixel_add_to_cart")),
                "meta_initiate_checkout": int(extract_action(actions, "initiate_checkout") or extract_action(actions, "offsite_conversion.fb_pixel_initiate_checkout")),
                "meta_view_content": int(extract_action(actions, "view_content") or extract_action(actions, "offsite_conversion.fb_pixel_view_content")),
                "meta_lead": int(extract_action(actions, "lead")),
                "meta_purchase_value": extract_action_value(action_values, "purchase") or extract_action_value(action_values, "offsite_conversion.fb_pixel_purchase"),
                "meta_roas": float((ins.get("purchase_roas") or [{}])[0].get("value", 0)) if ins.get("purchase_roas") else 0,
                "video_p25": int(extract_action(ins.get("video_p25_watched_actions"), "video_view")),
                "video_p50": int(extract_action(ins.get("video_p50_watched_actions"), "video_view")),
                "video_p75": int(extract_action(ins.get("video_p75_watched_actions"), "video_view")),
                "video_p100": int(extract_action(ins.get("video_p100_watched_actions"), "video_view")),
                "video_avg_watch_sec": float(extract_action(ins.get("video_avg_time_watched_actions"), "video_view")),
                "fetched_at": datetime.utcnow().isoformat(),
            })

    load_creatives_to_bq(creatives_rows)
    load_insights_to_bq(insights_rows)

if __name__ == "__main__":
    main()
