#!/usr/bin/env python3
"""
Meta Ad Insights → BigQuery Sync
- 어드민과 100% 일치하도록 어트리뷰션 창/purchase 필터 명시
- custom_since / custom_until 로 임의 기간 지정 가능
- 계정 통화 자동 감지 (KRW면 환율 미적용)
- Breakdowns: base / age,gender / publisher_platform,platform_position / region
- 크리에이티브 텍스트/CTA/랜딩URL 수집 (Mart 20 어필 분석용)
"""
import os
import sys
import json
import time
import requests
from datetime import datetime, timedelta
from io import BytesIO
from google.cloud import bigquery

# ===== 환경변수 =====
META_ACCESS_TOKEN  = os.getenv("META_ACCESS_TOKEN", "").strip()
META_AD_ACCOUNT_ID = os.getenv("META_AD_ACCOUNT_ID", "").strip()
PROJECT_ID         = os.getenv("PROJECT_ID", "d2c-analytics-502304")
DATASET            = "marts"
API_VERSION        = "v20.0"

if not META_ACCESS_TOKEN:
    raise SystemExit("[FATAL] META_ACCESS_TOKEN is empty")
if not META_AD_ACCOUNT_ID:
    raise SystemExit("[FATAL] META_AD_ACCOUNT_ID is empty")
if not META_AD_ACCOUNT_ID.startswith("act_"):
    META_AD_ACCOUNT_ID = "act_" + META_AD_ACCOUNT_ID

# ===== 날짜 범위 =====
CUSTOM_SINCE  = os.getenv("CUSTOM_SINCE", "").strip()
CUSTOM_UNTIL  = os.getenv("CUSTOM_UNTIL", "").strip()
BACKFILL_DAYS = int(os.getenv("BACKFILL_DAYS", "7"))

if CUSTOM_SINCE and CUSTOM_UNTIL:
    SINCE = CUSTOM_SINCE
    UNTIL = CUSTOM_UNTIL
    print(f"[INFO] Custom date range: {SINCE} ~ {UNTIL}")
else:
    today = datetime.utcnow().date()
    UNTIL = today.strftime("%Y-%m-%d")
    SINCE = (today - timedelta(days=BACKFILL_DAYS)).strftime("%Y-%m-%d")
    print(f"[INFO] Backfill range (last {BACKFILL_DAYS} days): {SINCE} ~ {UNTIL}")

# ===== 계정 통화 자동 감지 =====
def detect_currency():
    url = f"https://graph.facebook.com/{API_VERSION}/{META_AD_ACCOUNT_ID}"
    r = requests.get(url, params={
        "access_token": META_ACCESS_TOKEN,
        "fields": "name,currency,timezone_name"
    }, timeout=30)
    r.raise_for_status()
    d = r.json()
    print(f"[INFO] Account: {d.get('name')} / Currency: {d.get('currency')} / TZ: {d.get('timezone_name')}")
    return d.get("currency", "USD")

ACCOUNT_CURRENCY = detect_currency()
USD_TO_KRW = 1350.0

# ===== BigQuery =====
bq = bigquery.Client(project=PROJECT_ID)

# ===== Insight 필드 =====
INSIGHT_FIELDS = [
    "ad_id", "ad_name",
    "adset_id", "adset_name",
    "campaign_id", "campaign_name",
    "date_start", "date_stop",
    "impressions", "reach", "frequency",
    "clicks", "inline_link_clicks",
    "spend", "cpc", "cpm", "ctr",
    "actions", "action_values",
    "video_p25_watched_actions",
    "video_p50_watched_actions",
    "video_p75_watched_actions",
    "video_p100_watched_actions",
    "video_avg_time_watched_actions",
]

# ===== Ad 목록 (텍스트/CTA/랜딩URL 포함) =====
AD_FIELDS = (
    "id,name,status,effective_status,"
    "adset_id,adset{name},"
    "campaign_id,campaign{name},"
    "creative{"
        "id,image_url,thumbnail_url,video_id,"
        "body,title,object_type,"
        "object_story_spec{"
            "link_data{message,name,description,link,call_to_action{type,value{link}},image_hash},"
            "video_data{message,title,link_description,call_to_action{type,value{link}},image_url}"
        "},"
        "asset_feed_spec{"
            "bodies{text},titles{text},descriptions{text},call_to_action_types,link_urls{website_url}"
        "}"
    "}"
)

def fetch_all_ads():
    ads = []
    url = f"https://graph.facebook.com/{API_VERSION}/{META_AD_ACCOUNT_ID}/ads"
    params = {
        "access_token": META_ACCESS_TOKEN,
        "fields": AD_FIELDS,
        "limit": 200,
    }
    while url:
        r = requests.get(url, params=params, timeout=60)
        r.raise_for_status()
        d = r.json()
        for ad in d.get("data", []):
            ads.append(ad)
        url = d.get("paging", {}).get("next")
        params = None
    print(f"[OK] fetched {len(ads)} ads")
    return ads

# ===== Insights 가져오기 =====
def fetch_insights_for_ad(ad_id, breakdown=None, retries=3):
    url = f"https://graph.facebook.com/{API_VERSION}/{ad_id}/insights"
    params = {
        "access_token": META_ACCESS_TOKEN,
        "time_range": json.dumps({"since": SINCE, "until": UNTIL}),
        "time_increment": 1,
        "action_attribution_windows": json.dumps(["7d_click", "1d_view"]),
        "use_unified_attribution_setting": "true",
        "fields": ",".join(INSIGHT_FIELDS),
        "limit": 500,
    }
    if breakdown:
        params["breakdowns"] = breakdown

    for attempt in range(retries):
        try:
            r = requests.get(url, params=params, timeout=90)
            if r.status_code == 200:
                return r.json().get("data", [])
            if r.status_code in (429, 500, 502, 503):
                wait = 60 * (attempt + 1)
                print(f"[WARN] {ad_id} status {r.status_code}, retry in {wait}s")
                time.sleep(wait)
                continue
            print(f"[ERR] {ad_id} status {r.status_code}: {r.text[:200]}")
            return []
        except Exception as e:
            print(f"[ERR] {ad_id} exception: {e}")
            time.sleep(10)
    return []

# ===== Action 파서 =====
def parse_purchases(actions):
    if not actions:
        return 0
    for a in actions:
        if a.get("action_type") == "offsite_conversion.fb_pixel_purchase":
            return int(float(a.get("value", 0)))
    for a in actions:
        if a.get("action_type") == "onsite_web_purchase":
            return int(float(a.get("value", 0)))
    return 0

def parse_purchase_value(action_values):
    if not action_values:
        return 0.0
    for a in action_values:
        if a.get("action_type") == "offsite_conversion.fb_pixel_purchase":
            return float(a.get("value", 0))
    for a in action_values:
        if a.get("action_type") == "onsite_web_purchase":
            return float(a.get("value", 0))
    return 0.0

def parse_action_by_type(actions, action_type):
    if not actions:
        return 0
    for a in actions:
        if a.get("action_type") == action_type:
            return int(float(a.get("value", 0)))
    return 0

def parse_video_metric(video_actions):
    if not video_actions:
        return 0
    total = 0
    for v in video_actions:
        total += int(float(v.get("value", 0)))
    return total

# ===== 크리에이티브 텍스트/CTA 추출 =====
def extract_creative_content(creative):
    """object_story_spec 또는 asset_feed_spec에서 텍스트/CTA/랜딩URL 추출"""
    if not creative:
        return {
            "body_text": None, "title_text": None, "description_text": None,
            "call_to_action_type": None, "landing_url": None, "object_type": None,
        }

    body_text = creative.get("body")
    title_text = creative.get("title")
    description_text = None
    cta_type = None
    landing_url = None
    object_type = creative.get("object_type")

    # 1) object_story_spec 우선
    story = creative.get("object_story_spec") or {}
    link_data  = story.get("link_data")  or {}
    video_data = story.get("video_data") or {}

    if link_data:
        body_text        = body_text        or link_data.get("message")
        title_text       = title_text       or link_data.get("name")
        description_text = description_text or link_data.get("description")
        landing_url      = landing_url      or link_data.get("link")
        cta = link_data.get("call_to_action") or {}
        cta_type = cta_type or cta.get("type")
        if not landing_url:
            landing_url = ((cta.get("value") or {}).get("link"))

    if video_data:
        body_text        = body_text        or video_data.get("message")
        title_text       = title_text       or video_data.get("title")
        description_text = description_text or video_data.get("link_description")
        cta = video_data.get("call_to_action") or {}
        cta_type = cta_type or cta.get("type")
        if not landing_url:
            landing_url = ((cta.get("value") or {}).get("link"))

    # 2) asset_feed_spec fallback (Advantage+ / dynamic creative)
    afs = creative.get("asset_feed_spec") or {}
    if afs:
        if not body_text:
            bodies = afs.get("bodies") or []
            if bodies:
                body_text = bodies[0].get("text")
        if not title_text:
            titles = afs.get("titles") or []
            if titles:
                title_text = titles[0].get("text")
        if not description_text:
            descs = afs.get("descriptions") or []
            if descs:
                description_text = descs[0].get("text")
        if not cta_type:
            ctas = afs.get("call_to_action_types") or []
            if ctas:
                cta_type = ctas[0]
        if not landing_url:
            urls = afs.get("link_urls") or []
            if urls:
                landing_url = urls[0].get("website_url")

    return {
        "body_text": body_text,
        "title_text": title_text,
        "description_text": description_text,
        "call_to_action_type": cta_type,
        "landing_url": landing_url,
        "object_type": object_type,
    }

# ===== 행 빌드 =====
def to_krw(amount):
    if ACCOUNT_CURRENCY == "KRW":
        return float(amount or 0)
    return float(amount or 0) * USD_TO_KRW

def build_base_row(ins, ad_meta):
    spend_orig = float(ins.get("spend", 0) or 0)
    spend_krw  = to_krw(spend_orig)
    purchases  = parse_purchases(ins.get("actions"))
    purch_val_orig = parse_purchase_value(ins.get("action_values"))
    purch_val_krw  = to_krw(purch_val_orig)

    return {
        "event_date":            ins.get("date_start"),
        "date_end":              ins.get("date_stop"),
        "ad_id":                 ins.get("ad_id"),
        "ad_name":               ins.get("ad_name") or ad_meta.get("name"),
        "adset_id":              ins.get("adset_id"),
        "adset_name":            ins.get("adset_name"),
        "campaign_id":           ins.get("campaign_id"),
        "campaign_name":         ins.get("campaign_name"),
        "impressions":           int(float(ins.get("impressions", 0) or 0)),
        "reach":                 int(float(ins.get("reach", 0) or 0)),
        "frequency":             float(ins.get("frequency", 0) or 0),
        "clicks":                int(float(ins.get("clicks", 0) or 0)),
        "inline_link_clicks":    int(float(ins.get("inline_link_clicks", 0) or 0)),
        "spend_original":        spend_orig,
        "spend_krw":             spend_krw,
        "currency":              ACCOUNT_CURRENCY,
        "cpc":                   float(ins.get("cpc", 0) or 0),
        "cpm":                   float(ins.get("cpm", 0) or 0),
        "ctr":                   float(ins.get("ctr", 0) or 0),
        "meta_purchases":        purchases,
        "meta_purchase_value":   purch_val_krw,
        "meta_add_to_cart":      parse_action_by_type(ins.get("actions"), "add_to_cart"),
        "meta_initiate_checkout": parse_action_by_type(ins.get("actions"), "initiate_checkout"),
        "meta_view_content":     parse_action_by_type(ins.get("actions"), "view_content"),
        "video_p25":             parse_video_metric(ins.get("video_p25_watched_actions")),
        "video_p50":             parse_video_metric(ins.get("video_p50_watched_actions")),
        "video_p75":             parse_video_metric(ins.get("video_p75_watched_actions")),
        "video_p100":            parse_video_metric(ins.get("video_p100_watched_actions")),
        "video_avg_watch_sec":   parse_video_metric(ins.get("video_avg_time_watched_actions")),
    }

def build_demo_row(ins, ad_meta):
    row = build_base_row(ins, ad_meta)
    row["age_bracket"] = ins.get("age")
    row["gender"]      = ins.get("gender")
    return row

def build_platform_row(ins, ad_meta):
    row = build_base_row(ins, ad_meta)
    row["publisher_platform"] = ins.get("publisher_platform")
    row["platform_position"]  = ins.get("platform_position")
    return row

def build_region_row(ins, ad_meta):
    row = build_base_row(ins, ad_meta)
    row["region"]  = ins.get("region")
    row["country"] = ins.get("country")
    return row

# ===== Ad 메타 저장 (텍스트/CTA/랜딩URL 포함) =====
def build_creatives_row(ad):
    creative = ad.get("creative") or {}
    content = extract_creative_content(creative)
    return {
        "ad_id":               ad.get("id"),
        "ad_name":             ad.get("name"),
        "status":              ad.get("status"),
        "effective_status":    ad.get("effective_status"),
        "adset_id":            ad.get("adset_id"),
        "adset_name":          (ad.get("adset") or {}).get("name"),
        "campaign_id":         ad.get("campaign_id"),
        "campaign_name":       (ad.get("campaign") or {}).get("name"),
        "creative_id":         creative.get("id"),
        "image_url":           creative.get("image_url") or creative.get("thumbnail_url"),
        "thumbnail_url":       creative.get("thumbnail_url"),
        "video_id":            creative.get("video_id"),
        "object_type":         content["object_type"],
        "body_text":           content["body_text"],
        "title_text":          content["title_text"],
        "description_text":    content["description_text"],
        "call_to_action_type": content["call_to_action_type"],
        "landing_url":         content["landing_url"],
        "synced_at":           datetime.utcnow().isoformat(),
    }

# ===== BigQuery Load =====
def load_to_bq(table, rows, schema):
    if not rows:
        print(f"[SKIP] {table}: 0 rows")
        return
    table_ref = f"{PROJECT_ID}.{DATASET}.{table}"
    job_config = bigquery.LoadJobConfig(
        schema=schema,
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
        source_format=bigquery.SourceFormat.NEWLINE_DELIMITED_JSON,
    )
    ndjson = "\n".join(json.dumps(r, default=str) for r in rows)
    load_job = bq.load_table_from_file(
        BytesIO(ndjson.encode("utf-8")),
        table_ref,
        job_config=job_config,
    )
    load_job.result()
    print(f"[OK] loaded {len(rows)} rows into {table}")

# ===== 스키마 =====
BASE_SCHEMA = [
    bigquery.SchemaField("event_date", "DATE"),
    bigquery.SchemaField("date_end", "DATE"),
    bigquery.SchemaField("ad_id", "STRING"),
    bigquery.SchemaField("ad_name", "STRING"),
    bigquery.SchemaField("adset_id", "STRING"),
    bigquery.SchemaField("adset_name", "STRING"),
    bigquery.SchemaField("campaign_id", "STRING"),
    bigquery.SchemaField("campaign_name", "STRING"),
    bigquery.SchemaField("impressions", "INT64"),
    bigquery.SchemaField("reach", "INT64"),
    bigquery.SchemaField("frequency", "FLOAT64"),
    bigquery.SchemaField("clicks", "INT64"),
    bigquery.SchemaField("inline_link_clicks", "INT64"),
    bigquery.SchemaField("spend_original", "FLOAT64"),
    bigquery.SchemaField("spend_krw", "FLOAT64"),
    bigquery.SchemaField("currency", "STRING"),
    bigquery.SchemaField("cpc", "FLOAT64"),
    bigquery.SchemaField("cpm", "FLOAT64"),
    bigquery.SchemaField("ctr", "FLOAT64"),
    bigquery.SchemaField("meta_purchases", "INT64"),
    bigquery.SchemaField("meta_purchase_value", "FLOAT64"),
    bigquery.SchemaField("meta_add_to_cart", "INT64"),
    bigquery.SchemaField("meta_initiate_checkout", "INT64"),
    bigquery.SchemaField("meta_view_content", "INT64"),
    bigquery.SchemaField("video_p25", "INT64"),
    bigquery.SchemaField("video_p50", "INT64"),
    bigquery.SchemaField("video_p75", "INT64"),
    bigquery.SchemaField("video_p100", "INT64"),
    bigquery.SchemaField("video_avg_watch_sec", "INT64"),
]

DEMO_SCHEMA     = BASE_SCHEMA + [
    bigquery.SchemaField("age_bracket", "STRING"),
    bigquery.SchemaField("gender", "STRING"),
]
PLATFORM_SCHEMA = BASE_SCHEMA + [
    bigquery.SchemaField("publisher_platform", "STRING"),
    bigquery.SchemaField("platform_position", "STRING"),
]
REGION_SCHEMA   = BASE_SCHEMA + [
    bigquery.SchemaField("region", "STRING"),
    bigquery.SchemaField("country", "STRING"),
]
CREATIVES_SCHEMA = [
    bigquery.SchemaField("ad_id", "STRING"),
    bigquery.SchemaField("ad_name", "STRING"),
    bigquery.SchemaField("status", "STRING"),
    bigquery.SchemaField("effective_status", "STRING"),
    bigquery.SchemaField("adset_id", "STRING"),
    bigquery.SchemaField("adset_name", "STRING"),
    bigquery.SchemaField("campaign_id", "STRING"),
    bigquery.SchemaField("campaign_name", "STRING"),
    bigquery.SchemaField("creative_id", "STRING"),
    bigquery.SchemaField("image_url", "STRING"),
    bigquery.SchemaField("thumbnail_url", "STRING"),
    bigquery.SchemaField("video_id", "STRING"),
    bigquery.SchemaField("object_type", "STRING"),
    bigquery.SchemaField("body_text", "STRING"),
    bigquery.SchemaField("title_text", "STRING"),
    bigquery.SchemaField("description_text", "STRING"),
    bigquery.SchemaField("call_to_action_type", "STRING"),
    bigquery.SchemaField("landing_url", "STRING"),
    bigquery.SchemaField("synced_at", "TIMESTAMP"),
]

# ===== Main =====
def main():
    ads = fetch_all_ads()

    creatives_rows = [build_creatives_row(ad) for ad in ads]
    load_to_bq("meta_creatives", creatives_rows, CREATIVES_SCHEMA)

    # 텍스트 수집 통계
    with_body  = sum(1 for r in creatives_rows if r.get("body_text"))
    with_title = sum(1 for r in creatives_rows if r.get("title_text"))
    with_cta   = sum(1 for r in creatives_rows if r.get("call_to_action_type"))
    print(f"[STATS] body_text: {with_body}/{len(creatives_rows)}, "
          f"title_text: {with_title}/{len(creatives_rows)}, "
          f"cta: {with_cta}/{len(creatives_rows)}")

    base_rows, demo_rows, plat_rows, region_rows = [], [], [], []

    for i, ad in enumerate(ads, 1):
        ad_id = ad.get("id")
        ad_meta = {"name": ad.get("name")}
        print(f"[{i}/{len(ads)}] {(ad.get('name') or '')[:40]}...")

        for ins in fetch_insights_for_ad(ad_id, breakdown=None):
            base_rows.append(build_base_row(ins, ad_meta))
        time.sleep(0.5)

        for ins in fetch_insights_for_ad(ad_id, breakdown="age,gender"):
            demo_rows.append(build_demo_row(ins, ad_meta))
        time.sleep(0.5)

        for ins in fetch_insights_for_ad(ad_id, breakdown="publisher_platform,platform_position"):
            plat_rows.append(build_platform_row(ins, ad_meta))
        time.sleep(0.5)

        for ins in fetch_insights_for_ad(ad_id, breakdown="region"):
            region_rows.append(build_region_row(ins, ad_meta))
        time.sleep(0.5)

    load_to_bq("meta_ad_insights",           base_rows,   BASE_SCHEMA)
    load_to_bq("meta_ad_insights_demo",      demo_rows,   DEMO_SCHEMA)
    load_to_bq("meta_ad_insights_platform",  plat_rows,   PLATFORM_SCHEMA)
    load_to_bq("meta_ad_insights_region",    region_rows, REGION_SCHEMA)

    print("[DONE] fetch_meta_creatives complete")

if __name__ == "__main__":
    main()
