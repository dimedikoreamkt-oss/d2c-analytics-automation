#!/usr/bin/env python3
"""
Fetch Meta creatives + insights (with demographic breakdowns).
Loads data into:
  - meta_creatives                (creative metadata)
  - meta_ad_insights              (base metrics, no breakdown)
  - meta_ad_insights_age_gender   (breakdown: age, gender)
  - meta_ad_insights_platform     (breakdown: publisher_platform, platform_position, device_platform)
  - meta_ad_insights_region       (breakdown: region)
"""
import os, json, time, sys, requests
from datetime import datetime, timedelta, timezone
from google.cloud import bigquery

# ===== Config =====
META_ACCESS_TOKEN  = os.environ["META_ACCESS_TOKEN"]
META_AD_ACCOUNT_ID = os.environ["META_AD_ACCOUNT_ID"]
BACKFILL_DAYS      = int(os.environ.get("BACKFILL_DAYS", "7"))
PROJECT_ID         = os.environ.get("PROJECT_ID", "d2c-analytics-502304")
DATASET            = "marts"
API_VERSION        = "v20.0"
BASE_URL           = f"https://graph.facebook.com/{API_VERSION}"

USD_TO_KRW = 1350.0  # override if needed via secret

# ===== Breakdown configurations =====
BREAKDOWNS = [
    {
        "name": "base",
        "breakdowns": None,
        "table": "meta_ad_insights",
        "extra_cols": []
    },
    {
        "name": "age_gender",
        "breakdowns": "age,gender",
        "table": "meta_ad_insights_age_gender",
        "extra_cols": [("age", "STRING"), ("gender", "STRING")]
    },
    {
        "name": "platform",
        "breakdowns": "publisher_platform,platform_position,device_platform",
        "table": "meta_ad_insights_platform",
        "extra_cols": [
            ("publisher_platform", "STRING"),
            ("platform_position",  "STRING"),
            ("device_platform",    "STRING")
        ]
    },
    {
        "name": "region",
        "breakdowns": "region",
        "table": "meta_ad_insights_region",
        "extra_cols": [("region", "STRING")]
    }
]

bq = bigquery.Client(project=PROJECT_ID)

def log(msg):
    print(f"[{datetime.now(timezone.utc).isoformat()}] {msg}", flush=True)

# ===== Fetch creative metadata =====
def fetch_creatives():
    log("Fetching creative metadata...")
    all_ads = []
    url = f"{BASE_URL}/{META_AD_ACCOUNT_ID}/ads"
    params = {
        "access_token": META_ACCESS_TOKEN,
        "fields": "id,name,status,effective_status,campaign{name},adset{name},creative{id,image_url,thumbnail_url,body,title,video_id}",
        "limit": 100
    }
    while url:
        r = requests.get(url, params=params, timeout=60)
        r.raise_for_status()
        j = r.json()
        all_ads.extend(j.get("data", []))
        url = j.get("paging", {}).get("next")
        params = None  # next URL already has params
        time.sleep(0.5)
    log(f"  fetched {len(all_ads)} creatives total")
    return all_ads

# ===== Fetch insights with breakdown =====
def fetch_insights_for_ad(ad_id, since, until, breakdown_str=None):
    url = f"{BASE_URL}/{ad_id}/insights"
    params = {
        "access_token":   META_ACCESS_TOKEN,
        "time_range":     json.dumps({"since": since, "until": until}),
        "time_increment": 7,  # weekly aggregate to reduce API calls
        "level":          "ad",
        "fields":         "impressions,reach,clicks,spend,ctr,cpc,cpm,frequency,actions,action_values",
        "limit":          500
    }
    if breakdown_str:
        params["breakdowns"] = breakdown_str
    all_rows = []
    while url:
        try:
            r = requests.get(url, params=params, timeout=60)
            if r.status_code == 429 or (r.status_code == 400 and "rate limit" in r.text.lower()):
                log(f"    [RATE LIMIT] sleeping 60s...")
                time.sleep(60)
                continue
            r.raise_for_status()
        except requests.exceptions.RequestException as e:
            log(f"    [ERROR] {ad_id}: {e}")
            return []
        j = r.json()
        all_rows.extend(j.get("data", []))
        url = j.get("paging", {}).get("next")
        params = None
        time.sleep(0.3)
    return all_rows

# ===== Transform Meta insight row → BQ row =====
def parse_purchase_actions(row):
    purchases, value = 0, 0.0
    for a in row.get("actions", []) or []:
        if a.get("action_type") in ("purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"):
            purchases += int(float(a.get("value", 0) or 0))
    for a in row.get("action_values", []) or []:
        if a.get("action_type") in ("purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"):
            value += float(a.get("value", 0) or 0)
    return purchases, value

def build_row(insight, ad, bd_cfg):
    purchases, purchase_value = parse_purchase_actions(insight)
    spend_usd = float(insight.get("spend", 0) or 0)
    row = {
        "event_date":          insight.get("date_start"),
        "date_end":            insight.get("date_stop"),
        "ad_id":               ad["id"],
        "ad_name":             ad.get("name"),
        "campaign_name":       (ad.get("campaign") or {}).get("name"),
        "adset_name":          (ad.get("adset") or {}).get("name"),
        "impressions":         int(insight.get("impressions", 0) or 0),
        "reach":               int(insight.get("reach", 0) or 0),
        "clicks":              int(insight.get("clicks", 0) or 0),
        "spend_original":      spend_usd,
        "spend_krw":           spend_usd * USD_TO_KRW,
        "ctr":                 float(insight.get("ctr", 0) or 0),
        "cpc":                 float(insight.get("cpc", 0) or 0),
        "cpm":                 float(insight.get("cpm", 0) or 0),
        "frequency":           float(insight.get("frequency", 0) or 0),
        "meta_purchases":      purchases,
        "meta_purchase_value": purchase_value * USD_TO_KRW
    }
    for col, _ in bd_cfg["extra_cols"]:
        row[col] = insight.get(col)
    return row

# ===== Load rows into staging table then merge =====
def load_to_bq(table_name, rows, extra_cols):
    if not rows:
        log(f"  [SKIP] {table_name}: 0 rows")
        return
    schema = [
        bigquery.SchemaField("event_date",          "DATE"),
        bigquery.SchemaField("date_end",            "DATE"),
        bigquery.SchemaField("ad_id",               "STRING"),
        bigquery.SchemaField("ad_name",             "STRING"),
        bigquery.SchemaField("campaign_name",       "STRING"),
        bigquery.SchemaField("adset_name",          "STRING"),
        bigquery.SchemaField("impressions",         "INT64"),
        bigquery.SchemaField("reach",               "INT64"),
        bigquery.SchemaField("clicks",              "INT64"),
        bigquery.SchemaField("spend_original",      "FLOAT64"),
        bigquery.SchemaField("spend_krw",           "FLOAT64"),
        bigquery.SchemaField("ctr",                 "FLOAT64"),
        bigquery.SchemaField("cpc",                 "FLOAT64"),
        bigquery.SchemaField("cpm",                 "FLOAT64"),
        bigquery.SchemaField("frequency",           "FLOAT64"),
        bigquery.SchemaField("meta_purchases",      "INT64"),
        bigquery.SchemaField("meta_purchase_value", "FLOAT64")
    ]
    for col, typ in extra_cols:
        schema.append(bigquery.SchemaField(col, typ))

    table_id = f"{PROJECT_ID}.{DATASET}.{table_name}"
    job_config = bigquery.LoadJobConfig(
        schema=schema,
        write_disposition="WRITE_TRUNCATE",
        time_partitioning=bigquery.TimePartitioning(field="event_date")
    )
    job = bq.load_table_from_json(rows, table_id, job_config=job_config)
    job.result()
    log(f"  [OK] loaded {len(rows)} rows into {table_name}")

# ===== Main =====
def main():
    today = datetime.now(timezone.utc).date()
    since = (today - timedelta(days=BACKFILL_DAYS)).isoformat()
    until = today.isoformat()
    log(f"range: {since} ~ {until}  (backfill_days={BACKFILL_DAYS}, time_increment=7)")

    ads = fetch_creatives()
    # save creatives metadata
    creative_rows = []
    for ad in ads:
        c = ad.get("creative") or {}
        creative_rows.append({
            "ad_id":            ad["id"],
            "ad_name":          ad.get("name"),
            "status":           ad.get("status"),
            "effective_status": ad.get("effective_status"),
            "campaign_name":    (ad.get("campaign") or {}).get("name"),
            "adset_name":       (ad.get("adset") or {}).get("name"),
            "creative_id":      c.get("id"),
            "image_url":        c.get("image_url"),
            "thumbnail_url":    c.get("thumbnail_url"),
            "body_text":        c.get("body"),
            "title_text":       c.get("title"),
            "video_id":         c.get("video_id"),
            "fetched_at":       datetime.now(timezone.utc).isoformat()
        })
    creative_schema = [
        bigquery.SchemaField(n, "STRING")
        for n in ["ad_id","ad_name","status","effective_status","campaign_name","adset_name",
                  "creative_id","image_url","thumbnail_url","body_text","title_text","video_id","fetched_at"]
    ]
    job_config = bigquery.LoadJobConfig(schema=creative_schema, write_disposition="WRITE_TRUNCATE")
    bq.load_table_from_json(creative_rows, f"{PROJECT_ID}.{DATASET}.meta_creatives", job_config=job_config).result()
    log(f"[OK] loaded {len(creative_rows)} creatives into meta_creatives")

    # Fetch insights for each breakdown
    for bd_cfg in BREAKDOWNS:
        log(f"\n=== Breakdown: {bd_cfg['name']} ===")
        all_rows = []
        for i, ad in enumerate(ads, 1):
            if i % 20 == 0:
                log(f"  progress: {i}/{len(ads)}")
            insights = fetch_insights_for_ad(ad["id"], since, until, bd_cfg["breakdowns"])
            for ins in insights:
                all_rows.append(build_row(ins, ad, bd_cfg))
        load_to_bq(bd_cfg["table"], all_rows, bd_cfg["extra_cols"])

    log("\n[DONE] fetch_meta_creatives complete")

if __name__ == "__main__":
    main()
