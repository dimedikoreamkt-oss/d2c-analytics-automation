#!/usr/bin/env python3
"""
Meta Marketing API → BigQuery ad_spend_daily 적재 스크립트
- 첫 실행 시: 최근 30일 백필
- 이후 매일 실행: 어제 하루치만 upsert (재실행 안전)
"""
import os
import sys
import json
import time
import requests
from datetime import datetime, timedelta, timezone
from google.cloud import bigquery

# ===== 환경 변수 =====
META_ACCESS_TOKEN = os.environ['META_ACCESS_TOKEN']
META_AD_ACCOUNT_ID = os.environ['META_AD_ACCOUNT_ID']
BQ_PROJECT = os.environ.get('BQ_PROJECT', 'd2c-analytics-502304')
BQ_DATASET = os.environ.get('BQ_DATASET', 'marts')
BQ_TABLE = f"{BQ_PROJECT}.{BQ_DATASET}.ad_spend_daily"
BACKFILL_DAYS = int(os.environ.get('BACKFILL_DAYS', '1'))  # 기본 1일 (어제만)

META_API_VERSION = 'v20.0'
META_BASE = f"https://graph.facebook.com/{META_API_VERSION}"

def log(msg):
    print(f"[{datetime.now(timezone.utc).isoformat()}] {msg}", flush=True)

def fetch_meta_insights(since_date: str, until_date: str):
    """Meta Graph API insights 호출. Ad 단위로 breakdown하여 UTM 값 확보."""
    url = f"{META_BASE}/{META_AD_ACCOUNT_ID}/insights"
    fields = [
        'date_start', 'account_id', 'account_name',
        'campaign_id', 'campaign_name',
        'adset_id', 'adset_name',
        'ad_id', 'ad_name',
        'impressions', 'clicks', 'spend',
        'actions', 'action_values'
    ]
    params = {
        'access_token': META_ACCESS_TOKEN,
        'level': 'ad',
        'time_increment': 1,           # 하루 단위로 쪼개서 반환
        'time_range': json.dumps({'since': since_date, 'until': until_date}),
        'fields': ','.join(fields),
        'limit': 500,
        'action_attribution_windows': json.dumps(['7d_click', '1d_view'])
    }

    rows = []
    while url:
        for attempt in range(3):
            try:
                r = requests.get(url, params=params if url.endswith('/insights') else None, timeout=60)
                r.raise_for_status()
                break
            except requests.exceptions.RequestException as e:
                if attempt == 2:
                    log(f"API 호출 실패 (3회 재시도 후): {e}")
                    raise
                log(f"재시도 {attempt+1}/3: {e}")
                time.sleep(2 ** attempt)

        payload = r.json()
        page_data = payload.get('data', [])
        rows.extend(page_data)
        log(f"페이지 로드: {len(page_data)}행 (누적 {len(rows)}행)")
        # 페이지네이션
        next_url = payload.get('paging', {}).get('next')
        if next_url:
            url = next_url
            params = None
        else:
            url = None
    return rows

def fetch_ad_utm_map():
    """각 광고(ad_id)에 설정된 URL 파라미터에서 UTM 값 추출."""
    url = f"{META_BASE}/{META_AD_ACCOUNT_ID}/ads"
    params = {
        'access_token': META_ACCESS_TOKEN,
        'fields': 'id,url_tags',
        'limit': 500
    }
    utm_map = {}
    while url:
        r = requests.get(url, params=params if 'fields' in (params or {}) else None, timeout=60)
        r.raise_for_status()
        payload = r.json()
        for ad in payload.get('data', []):
            tags = ad.get('url_tags') or ((ad.get('creative') or {}).get('url_tags') or '')
            utm = {}
            for pair in tags.split('&'):
                if '=' in pair:
                    k, v = pair.split('=', 1)
                    utm[k.strip().lower()] = v.strip()
            utm_map[ad['id']] = {
                'utm_source': utm.get('utm_source', 'facebook'),
                'utm_medium': utm.get('utm_medium', 'cpc'),
                'utm_campaign': utm.get('utm_campaign', '')
            }
        next_url = payload.get('paging', {}).get('next')
        if next_url:
            url = next_url
            params = None
        else:
            url = None
    log(f"UTM 맵 로드: {len(utm_map)}개 광고")
    return utm_map

def extract_conversions_and_revenue(actions, action_values):
    """actions/action_values에서 구매 전환수·매출액 추출."""
    conversions = 0
    revenue = 0.0
    if actions:
        for a in actions:
            t = a.get('action_type', '')
            if t in ('purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase'):
                try:
                    conversions += int(float(a.get('value', 0)))
                except (ValueError, TypeError):
                    pass
    if action_values:
        for a in action_values:
            t = a.get('action_type', '')
            if t in ('purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase'):
                try:
                    revenue += float(a.get('value', 0))
                except (ValueError, TypeError):
                    pass
    return conversions, revenue

def transform(raw_rows, utm_map):
    """Meta API 응답을 ad_spend_daily 스키마로 정규화."""
    out = []
    for r in raw_rows:
        ad_id = r.get('ad_id', '')
        utm = utm_map.get(ad_id, {})
        # UTM이 광고에 안 걸려있으면 캠페인명 기반 fallback
        utm_source = utm.get('utm_source') or 'facebook'
        utm_medium = utm.get('utm_medium') or 'cpc'
        utm_campaign = utm.get('utm_campaign') or r.get('campaign_name', '')

        spend = float(r.get('spend', 0) or 0)
        impressions = int(float(r.get('impressions', 0) or 0))
        clicks = int(float(r.get('clicks', 0) or 0))
        conv, rev = extract_conversions_and_revenue(r.get('actions'), r.get('action_values'))

        out.append({
            'event_date': r.get('date_start'),
            'platform': 'meta',
            'account_id': r.get('account_id', ''),
            'account_name': r.get('account_name', ''),
            'campaign_id': r.get('campaign_id', ''),
            'campaign_name': r.get('campaign_name', ''),
            'adset_id': r.get('adset_id', ''),
            'adset_name': r.get('adset_name', ''),
            'ad_id': ad_id,
            'ad_name': r.get('ad_name', ''),
            'utm_source': utm_source,
            'utm_medium': utm_medium,
            'utm_campaign': utm_campaign,
            'impressions': impressions,
            'clicks': clicks,
            'spend_krw': spend,          # 계정 통화 KRW이므로 그대로
            'spend_original': spend,
            'currency': 'KRW',
            'platform_conversions': conv,
            'platform_revenue': rev
        })
    return out

def load_to_bigquery(rows, dates_covered):
    """스테이징 로드 후 MERGE로 upsert (같은 날짜·ad_id 재실행 시 덮어씀)."""
    if not rows:
        log("적재할 데이터 없음, 종료.")
        return

    client = bigquery.Client(project=BQ_PROJECT)
    staging_table = f"{BQ_PROJECT}.{BQ_DATASET}.ad_spend_daily_staging_meta"

    # 1. 스테이징 테이블에 write_truncate로 로드
    job_config = bigquery.LoadJobConfig(
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
        schema=[
            bigquery.SchemaField('event_date', 'DATE'),
            bigquery.SchemaField('platform', 'STRING'),
            bigquery.SchemaField('account_id', 'STRING'),
            bigquery.SchemaField('account_name', 'STRING'),
            bigquery.SchemaField('campaign_id', 'STRING'),
            bigquery.SchemaField('campaign_name', 'STRING'),
            bigquery.SchemaField('adset_id', 'STRING'),
            bigquery.SchemaField('adset_name', 'STRING'),
            bigquery.SchemaField('ad_id', 'STRING'),
            bigquery.SchemaField('ad_name', 'STRING'),
            bigquery.SchemaField('utm_source', 'STRING'),
            bigquery.SchemaField('utm_medium', 'STRING'),
            bigquery.SchemaField('utm_campaign', 'STRING'),
            bigquery.SchemaField('impressions', 'INTEGER'),
            bigquery.SchemaField('clicks', 'INTEGER'),
            bigquery.SchemaField('spend_krw', 'NUMERIC'),
            bigquery.SchemaField('spend_original', 'NUMERIC'),
            bigquery.SchemaField('currency', 'STRING'),
            bigquery.SchemaField('platform_conversions', 'INTEGER'),
            bigquery.SchemaField('platform_revenue', 'NUMERIC')
        ]
    )
    job = client.load_table_from_json(rows, staging_table, job_config=job_config)
    job.result()
    log(f"스테이징 로드 완료: {len(rows)}행 → {staging_table}")

    # 2. MERGE로 대상 테이블 upsert
    dates_list = "', '".join(sorted(dates_covered))
    merge_sql = f"""
    MERGE `{BQ_TABLE}` T
    USING `{staging_table}` S
    ON T.event_date = S.event_date
       AND T.platform = S.platform
       AND T.ad_id = S.ad_id
    WHEN MATCHED THEN UPDATE SET
      account_id = S.account_id,
      account_name = S.account_name,
      campaign_id = S.campaign_id,
      campaign_name = S.campaign_name,
      adset_id = S.adset_id,
      adset_name = S.adset_name,
      ad_name = S.ad_name,
      utm_source = S.utm_source,
      utm_medium = S.utm_medium,
      utm_campaign = S.utm_campaign,
      impressions = S.impressions,
      clicks = S.clicks,
      spend_krw = S.spend_krw,
      spend_original = S.spend_original,
      currency = S.currency,
      platform_conversions = S.platform_conversions,
      platform_revenue = S.platform_revenue,
      loaded_at = CURRENT_TIMESTAMP()
    WHEN NOT MATCHED THEN INSERT (
      event_date, platform, account_id, account_name,
      campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name,
      utm_source, utm_medium, utm_campaign,
      impressions, clicks, spend_krw, spend_original, currency,
      platform_conversions, platform_revenue, loaded_at
    ) VALUES (
      S.event_date, S.platform, S.account_id, S.account_name,
      S.campaign_id, S.campaign_name, S.adset_id, S.adset_name, S.ad_id, S.ad_name,
      S.utm_source, S.utm_medium, S.utm_campaign,
      S.impressions, S.clicks, S.spend_krw, S.spend_original, S.currency,
      S.platform_conversions, S.platform_revenue, CURRENT_TIMESTAMP()
    );
    """
    query_job = client.query(merge_sql)
    query_job.result()
    log(f"MERGE 완료: {query_job.num_dml_affected_rows}행 upsert됨")

    # 3. 스테이징 삭제
    client.delete_table(staging_table, not_found_ok=True)
    log("스테이징 테이블 정리 완료")

def main():
    today = datetime.now(timezone.utc).date()
    until = today - timedelta(days=1)
    since = until - timedelta(days=BACKFILL_DAYS - 1)
    log(f"수집 범위: {since} ~ {until} (총 {BACKFILL_DAYS}일)")
    log(f"Ad Account: {META_AD_ACCOUNT_ID}")

    utm_map = fetch_ad_utm_map()
    raw = fetch_meta_insights(since.isoformat(), until.isoformat())
    log(f"Meta API 응답: {len(raw)}행")

    rows = transform(raw, utm_map)
    dates = {r['event_date'] for r in rows if r['event_date']}
    log(f"정규화 완료: {len(rows)}행, 날짜 {len(dates)}일")

    load_to_bigquery(rows, dates)
    log("완료!")

if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        log(f"❌ 오류 발생: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
