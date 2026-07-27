"""
Meta Ads Dynamic Creative 자산별 성과 수집
- image_asset: 각 이미지 카드의 노출/클릭/지출/전환
- body_asset: 본문 텍스트별 성과
- title_asset: 제목별 성과
- call_to_action_asset: CTA별 성과
- BigQuery: marts.meta_asset_performance
"""
import os, sys, json, time, requests
from datetime import datetime, timedelta
from google.cloud import bigquery

META_ACCESS_TOKEN  = os.environ.get("META_ACCESS_TOKEN", "")
META_AD_ACCOUNT_ID = os.environ.get("META_AD_ACCOUNT_ID", "")
PROJECT_ID         = os.environ.get("PROJECT_ID", "d2c-analytics-502304")
BQ_TABLE_ID        = f"{PROJECT_ID}.marts.meta_asset_performance"
API_VERSION        = "v20.0"

if not META_ACCESS_TOKEN:
    print("❌ META_ACCESS_TOKEN 환경변수가 없습니다.")
    sys.exit(1)

# 광고 계정 ID 정규화 (act_ 접두사 보장)
if not META_AD_ACCOUNT_ID.startswith("act_"):
    META_AD_ACCOUNT_ID = f"act_{META_AD_ACCOUNT_ID}"


def graph_get(url, params, retries=3):
    for attempt in range(retries):
        try:
            r = requests.get(url, params=params, timeout=60)
            if r.status_code == 200:
                return r.json()
            print(f"  [ERR] {r.status_code}: {r.text[:200]}")
            if r.status_code == 429 or r.status_code >= 500:
                time.sleep(2 ** attempt)
                continue
            return None
        except Exception as e:
            print(f"  [EXC] {e}")
            time.sleep(2 ** attempt)
    return None


def fetch_active_ads():
    """활성 광고 목록 + 크리에이티브 정보"""
    url = f"https://graph.facebook.com/{API_VERSION}/{META_AD_ACCOUNT_ID}/ads"
    all_ads = []
    params = {
        "access_token": META_ACCESS_TOKEN,
        "fields": "id,name,status,effective_status,adset_id,adset{name},campaign_id,campaign{name},creative{id,name,image_hash,image_url,thumbnail_url,asset_feed_spec{images{hash,url}}}",
        "limit": 100,
        "filtering": '[{"field":"effective_status","operator":"IN","value":["ACTIVE","PAUSED"]}]',
    }
    while True:
        data = graph_get(url, params)
        if not data:
            break
        all_ads.extend(data.get("data", []))
        paging = data.get("paging", {})
        if "next" in paging:
            url = paging["next"]
            params = {}
        else:
            break
    return all_ads


def parse_actions(actions, action_values):
    """actions/action_values 배열에서 주요 지표 추출"""
    a = {a["action_type"]: float(a["value"]) for a in (actions or [])}
    v = {a["action_type"]: float(a["value"]) for a in (action_values or [])}
    return {
        "link_clicks": int(a.get("link_click", 0)),
        "landing_page_views": int(a.get("landing_page_view", 0)),
        "view_content": int(a.get("offsite_conversion.fb_pixel_view_content", a.get("view_content", 0))),
        "add_to_cart": int(a.get("offsite_conversion.fb_pixel_add_to_cart", a.get("add_to_cart", 0))),
        "initiate_checkout": int(a.get("offsite_conversion.fb_pixel_initiate_checkout", a.get("initiate_checkout", 0))),
        "purchases": int(a.get("offsite_conversion.fb_pixel_purchase", a.get("purchase", 0))),
        "purchase_value": float(v.get("offsite_conversion.fb_pixel_purchase", v.get("purchase", 0))),
    }


def fetch_asset_breakdown(ad_id, asset_type, since, until):
    """
    asset breakdown별 성과 조회
    asset_type: image_asset, body_asset, title_asset, description_asset,
                call_to_action_asset, link_url_asset, video_asset
    """
    url = f"https://graph.facebook.com/{API_VERSION}/{ad_id}/insights"
    params = {
        "access_token": META_ACCESS_TOKEN,
        "fields": "impressions,reach,clicks,spend,actions,action_values",
        "breakdowns": asset_type,
        "time_range": json.dumps({"since": since, "until": until}),
        "time_increment": "1",  # 일별
    }
    data = graph_get(url, params)
    if not data:
        return []
    return data.get("data", [])


def collect_asset_rows(ads, since, until):
    """각 광고의 asset별 일별 성과 수집"""
    rows = []
    ASSET_TYPES = ["image_asset", "body_asset", "title_asset",
                   "description_asset", "call_to_action_asset", "video_asset"]

    for idx, ad in enumerate(ads, 1):
        ad_id = ad["id"]
        ad_name = ad.get("name", "")
        adset_name = (ad.get("adset") or {}).get("name", "")
        campaign_name = (ad.get("campaign") or {}).get("name", "")
        creative = ad.get("creative") or {}

        print(f"  [{idx}/{len(ads)}] {ad_name[:40]} (ID: {ad_id})")

        for asset_type in ASSET_TYPES:
            asset_data = fetch_asset_breakdown(ad_id, asset_type, since, until)
            time.sleep(0.3)

            for row in asset_data:
                asset_info = row.get(asset_type) or {}
                # asset_info는 dict일 수도, string(hash)일 수도 있음
                if isinstance(asset_info, dict):
                    asset_id = str(asset_info.get("id", "") or asset_info.get("hash", ""))
                    asset_url = asset_info.get("url", "") or asset_info.get("image_url", "")
                    asset_text = asset_info.get("text", "") or asset_info.get("body", "") or asset_info.get("title", "")
                else:
                    asset_id = str(asset_info)
                    asset_url = ""
                    asset_text = ""

                metrics = parse_actions(row.get("actions"), row.get("action_values"))
                spend = float(row.get("spend", 0) or 0)
                impressions = int(row.get("impressions", 0) or 0)
                clicks = int(row.get("clicks", 0) or 0)

                rows.append({
                    "event_date": row.get("date_start"),
                    "ad_id": ad_id,
                    "ad_name": ad_name,
                    "adset_name": adset_name,
                    "campaign_name": campaign_name,
                    "asset_type": asset_type,
                    "asset_id": asset_id,
                    "asset_url": asset_url,
                    "asset_text": asset_text[:500] if asset_text else "",
                    "impressions": impressions,
                    "reach": int(row.get("reach", 0) or 0),
                    "clicks": clicks,
                    "spend_krw": spend,
                    "link_clicks": metrics["link_clicks"],
                    "landing_page_views": metrics["landing_page_views"],
                    "view_content": metrics["view_content"],
                    "add_to_cart": metrics["add_to_cart"],
                    "initiate_checkout": metrics["initiate_checkout"],
                    "purchases": metrics["purchases"],
                    "purchase_value": metrics["purchase_value"],
                })

    return rows


def load_to_bq(rows):
    if not rows:
        print("⚠️ 수집 데이터 없음")
        return
    client = bigquery.Client(project=PROJECT_ID)
    schema = [
        bigquery.SchemaField("event_date", "DATE"),
        bigquery.SchemaField("ad_id", "STRING"),
        bigquery.SchemaField("ad_name", "STRING"),
        bigquery.SchemaField("adset_name", "STRING"),
        bigquery.SchemaField("campaign_name", "STRING"),
        bigquery.SchemaField("asset_type", "STRING"),
        bigquery.SchemaField("asset_id", "STRING"),
        bigquery.SchemaField("asset_url", "STRING"),
        bigquery.SchemaField("asset_text", "STRING"),
        bigquery.SchemaField("impressions", "INTEGER"),
        bigquery.SchemaField("reach", "INTEGER"),
        bigquery.SchemaField("clicks", "INTEGER"),
        bigquery.SchemaField("spend_krw", "FLOAT"),
        bigquery.SchemaField("link_clicks", "INTEGER"),
        bigquery.SchemaField("landing_page_views", "INTEGER"),
        bigquery.SchemaField("view_content", "INTEGER"),
        bigquery.SchemaField("add_to_cart", "INTEGER"),
        bigquery.SchemaField("initiate_checkout", "INTEGER"),
        bigquery.SchemaField("purchases", "INTEGER"),
        bigquery.SchemaField("purchase_value", "FLOAT"),
    ]

    try:
        client.get_table(BQ_TABLE_ID)
    except Exception:
        table = bigquery.Table(BQ_TABLE_ID, schema=schema)
        table.time_partitioning = bigquery.TimePartitioning(field="event_date")
        table.clustering_fields = ["ad_id", "asset_type"]
        client.create_table(table)
        print(f"  ✅ 테이블 생성: {BQ_TABLE_ID}")

    # 해당 기간 데이터 삭제 후 재적재
    dates = sorted(set(r["event_date"] for r in rows if r["event_date"]))
    if dates:
        min_d, max_d = dates[0], dates[-1]
        delete_sql = f"""
        DELETE FROM `{BQ_TABLE_ID}`
        WHERE event_date BETWEEN '{min_d}' AND '{max_d}'
        """
        client.query(delete_sql).result()
        print(f"  🗑 기존 데이터 삭제: {min_d} ~ {max_d}")

    job_config = bigquery.LoadJobConfig(schema=schema, write_disposition="WRITE_APPEND")
    client.load_table_from_json(rows, BQ_TABLE_ID, job_config=job_config).result()
    print(f"  ✅ BigQuery 적재 완료: {len(rows)}행")


def main():
    end_date = datetime.now().strftime("%Y-%m-%d")
    start_date = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
    if os.environ.get("CUSTOM_SINCE"):
        start_date = os.environ["CUSTOM_SINCE"]
    if os.environ.get("CUSTOM_UNTIL"):
        end_date = os.environ["CUSTOM_UNTIL"]

    print(f"📅 수집 기간: {start_date} ~ {end_date}")
    print(f"🎯 광고 계정: {META_AD_ACCOUNT_ID}")

    ads = fetch_active_ads()
    print(f"\n📋 활성/일시중지 광고: {len(ads)}개")

    rows = collect_asset_rows(ads, start_date, end_date)
    print(f"\n📊 수집된 asset 성과 행: {len(rows)}")

    load_to_bq(rows)

    # 요약
    print("\n" + "=" * 60)
    print("📊 수집 요약")
    print("=" * 60)
    by_type = {}
    for r in rows:
        by_type.setdefault(r["asset_type"], 0)
        by_type[r["asset_type"]] += 1
    for atype, cnt in sorted(by_type.items()):
        print(f"  {atype:25s}: {cnt}행")


if __name__ == "__main__":
    main()
