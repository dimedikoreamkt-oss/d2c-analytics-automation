"""
네이버 검색광고 API - 회사 전체 광고 데이터 수집
- 다중 CUSTOMER_ID 지원
- 브랜드 태그 자동 매핑
- BigQuery에 통합 저장
"""
import os, time, hmac, hashlib, base64, json, requests
from datetime import datetime, timedelta
from google.cloud import bigquery

# ===== 네이버 검색광고 API 인증 =====
NAVER_API_URL = "https://api.searchad.naver.com"

# 다중 계정 지원: 여러 CUSTOMER_ID를 JSON 배열로 관리
# 형식: [{"customer_id": "1234567", "api_license": "...", "secret_key": "...", "brand": "8LineFit"}, ...]
NAVER_ACCOUNTS = json.loads(os.environ["NAVER_ACCOUNTS"])

def generate_signature(timestamp, method, uri, secret_key):
    """네이버 API HMAC-SHA256 서명"""
    msg = f"{timestamp}.{method}.{uri}"
    signature = hmac.new(
        secret_key.encode('utf-8'),
        msg.encode('utf-8'),
        hashlib.sha256
    ).digest()
    return base64.b64encode(signature).decode('utf-8')

def get_headers(method, uri, account):
    """API 요청 헤더 생성 (계정별)"""
    timestamp = str(int(time.time() * 1000))
    return {
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Timestamp': timestamp,
        'X-API-KEY': account['api_license'],
        'X-Customer': account['customer_id'],
        'X-Signature': generate_signature(timestamp, method, uri, account['secret_key'])
    }

# ===== 1) 캠페인 목록 조회 =====
def fetch_campaigns(account):
    """캠페인 목록 조회"""
    uri = "/ncc/campaigns"
    r = requests.get(NAVER_API_URL + uri, headers=get_headers("GET", uri, account))
    if r.status_code != 200:
        print(f"[ERR] {account['brand']} campaigns fetch: {r.status_code}")
        return []
    return r.json()

# ===== 2) 광고그룹 목록 조회 =====
def fetch_adgroups(campaign_id, account):
    """캠페인별 광고그룹 조회"""
    uri = "/ncc/adgroups"
    params = {"nccCampaignId": campaign_id}
    r = requests.get(NAVER_API_URL + uri, params=params, headers=get_headers("GET", uri, account))
    if r.status_code != 200:
        return []
    return r.json()

# ===== 3) 키워드 조회 =====
def fetch_keywords(adgroup_id, account):
    """광고그룹별 키워드 조회"""
    uri = "/ncc/keywords"
    params = {"nccAdgroupId": adgroup_id}
    r = requests.get(NAVER_API_URL + uri, params=params, headers=get_headers("GET", uri, account))
    if r.status_code != 200:
        return []
    return r.json()

# ===== 4) 통계 리포트 (핵심) =====
def fetch_stats_report(account, ids, start_date, end_date, breakdown="day", fields=None):
    """
    통계 조회
    - ids: 캠페인/광고그룹/키워드 ID 배열
    - breakdown: day, hh1(시간), PC, MO
    - fields: 조회 지표 배열
    """
    uri = "/stats"
    default_fields = ["impCnt", "clkCnt", "salesAmt", "ccnt", "ctr", "cpc", "avgRnk", "convAmt"]

    params = {
        "ids": json.dumps(ids),
        "fields": json.dumps(fields or default_fields),
        "timeRange": json.dumps({"since": start_date, "until": end_date}),
        "breakdown": breakdown
    }
    r = requests.get(NAVER_API_URL + uri, params=params, headers=get_headers("GET", uri, account))
    if r.status_code != 200:
        print(f"[ERR] stats fetch: {r.status_code} - {r.text[:200]}")
        return []
    return r.json().get('data', [])

# ===== 5) 계정별 전체 데이터 수집 =====
def collect_account_data(account, start_date, end_date):
    """단일 계정의 전체 데이터 수집"""
    print(f"\n📊 {account['brand']} (Customer: {account['customer_id']}) 수집 시작")

    campaigns = fetch_campaigns(account)
    print(f"  캠페인 {len(campaigns)}개 발견")

    all_rows = []

    for campaign in campaigns:
        campaign_id = campaign.get('nccCampaignId')
        campaign_name = campaign.get('name')

        # 광고그룹
        adgroups = fetch_adgroups(campaign_id, account)
        time.sleep(0.3)

        for adgroup in adgroups:
            adgroup_id = adgroup.get('nccAdgroupId')
            adgroup_name = adgroup.get('name')

            # 키워드
            keywords = fetch_keywords(adgroup_id, account)
            time.sleep(0.3)

            # 키워드별 통계 (최대 100개씩 배치)
            keyword_ids = [k.get('nccKeywordId') for k in keywords]
            if not keyword_ids:
                continue

            # 100개씩 배치 처리
            for i in range(0, len(keyword_ids), 100):
                batch_ids = keyword_ids[i:i+100]
                stats = fetch_stats_report(account, batch_ids, start_date, end_date, breakdown="day")

                for stat in stats:
                    keyword_info = next((k for k in keywords if k.get('nccKeywordId') == stat.get('id')), {})
                    all_rows.append({
                        "event_date": stat.get('startDate'),
                        "brand": account['brand'],
                        "customer_id": account['customer_id'],
                        "campaign_id": campaign_id,
                        "campaign_name": campaign_name,
                        "campaign_type": campaign.get('campaignTp'),  # WEB_SITE, SHOPPING, POWER_CONTENTS 등
                        "adgroup_id": adgroup_id,
                        "adgroup_name": adgroup_name,
                        "keyword_id": stat.get('id'),
                        "keyword": keyword_info.get('keyword'),
                        "keyword_status": keyword_info.get('status'),
                        "bid_amt": keyword_info.get('bidAmt'),
                        "impressions": int(stat.get('impCnt', 0)),
                        "clicks": int(stat.get('clkCnt', 0)),
                        "cost_krw": float(stat.get('salesAmt', 0)),
                        "conversions": int(stat.get('ccnt', 0)),
                        "conversion_value": float(stat.get('convAmt', 0)),
                        "ctr": float(stat.get('ctr', 0)),
                        "cpc": float(stat.get('cpc', 0)),
                        "avg_rank": float(stat.get('avgRnk', 0)),
                    })
                time.sleep(0.5)

    print(f"  ✅ {len(all_rows)}행 수집 완료")
    return all_rows

# ===== 6) BigQuery 적재 =====
def load_to_bq(rows):
    """BigQuery에 저장 (파티션 + 클러스터링)"""
    if not rows:
        print("⚠️ 수집 데이터 없음")
        return

    client = bigquery.Client(project="d2c-analytics-502304")
    table_id = "d2c-analytics-502304.marts.naver_ad_insights"

    schema = [
        bigquery.SchemaField("event_date", "DATE"),
        bigquery.SchemaField("brand", "STRING"),
        bigquery.SchemaField("customer_id", "STRING"),
        bigquery.SchemaField("campaign_id", "STRING"),
        bigquery.SchemaField("campaign_name", "STRING"),
        bigquery.SchemaField("campaign_type", "STRING"),
        bigquery.SchemaField("adgroup_id", "STRING"),
        bigquery.SchemaField("adgroup_name", "STRING"),
        bigquery.SchemaField("keyword_id", "STRING"),
        bigquery.SchemaField("keyword", "STRING"),
        bigquery.SchemaField("keyword_status", "STRING"),
        bigquery.SchemaField("bid_amt", "FLOAT"),
        bigquery.SchemaField("impressions", "INTEGER"),
        bigquery.SchemaField("clicks", "INTEGER"),
        bigquery.SchemaField("cost_krw", "FLOAT"),
        bigquery.SchemaField("conversions", "INTEGER"),
        bigquery.SchemaField("conversion_value", "FLOAT"),
        bigquery.SchemaField("ctr", "FLOAT"),
        bigquery.SchemaField("cpc", "FLOAT"),
        bigquery.SchemaField("avg_rank", "FLOAT"),
    ]

    # MERGE 방식으로 UPSERT (중복 방지)
    # Staging → MERGE → 원본 테이블
    staging_id = table_id + "_staging"

    # 1) Staging에 적재
    job_config = bigquery.LoadJobConfig(
        schema=schema,
        write_disposition="WRITE_TRUNCATE"
    )
    client.load_table_from_json(rows, staging_id, job_config=job_config).result()

    # 2) MERGE
    merge_sql = f"""
    MERGE `{table_id}` T
    USING `{staging_id}` S
    ON T.event_date = S.event_date
      AND T.brand = S.brand
      AND T.keyword_id = S.keyword_id
    WHEN MATCHED THEN
      UPDATE SET
        impressions = S.impressions,
        clicks = S.clicks,
        cost_krw = S.cost_krw,
        conversions = S.conversions,
        conversion_value = S.conversion_value,
        ctr = S.ctr,
        cpc = S.cpc,
        avg_rank = S.avg_rank
    WHEN NOT MATCHED THEN
      INSERT ROW
    """

    # 원본 테이블 없으면 먼저 생성
    try:
        client.get_table(table_id)
    except:
        table = bigquery.Table(table_id, schema=schema)
        table.time_partitioning = bigquery.TimePartitioning(
            field="event_date",
            expiration_ms=180 * 24 * 60 * 60 * 1000  # 180일
        )
        table.clustering_fields = ["brand", "campaign_id"]
        client.create_table(table)
        print(f"✅ 테이블 생성: {table_id}")

    query_job = client.query(merge_sql)
    query_job.result()

    # 3) Staging 정리
    client.delete_table(staging_id, not_found_ok=True)

    print(f"✅ {len(rows)}행 BigQuery 저장 완료")

# ===== Main =====
def main():
    # 지난 7일 데이터
    end_date = datetime.now().strftime("%Y-%m-%d")
    start_date = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")

    # 백필 옵션
    if os.environ.get("CUSTOM_SINCE"):
        start_date = os.environ["CUSTOM_SINCE"]
    if os.environ.get("CUSTOM_UNTIL"):
        end_date = os.environ["CUSTOM_UNTIL"]

    print(f"📅 수집 기간: {start_date} ~ {end_date}")
    print(f"🏢 광고주 계정 수: {len(NAVER_ACCOUNTS)}개")

    all_rows = []
    for account in NAVER_ACCOUNTS:
        rows = collect_account_data(account, start_date, end_date)
        all_rows.extend(rows)

    load_to_bq(all_rows)

    # 통계 요약
    print("\n=== 수집 요약 ===")
    brands = set(r['brand'] for r in all_rows)
    for brand in brands:
        brand_rows = [r for r in all_rows if r['brand'] == brand]
        total_cost = sum(r['cost_krw'] for r in brand_rows)
        total_clicks = sum(r['clicks'] for r in brand_rows)
        print(f"  {brand}: {len(brand_rows)}행, 클릭 {total_clicks:,}, 지출 ₩{total_cost:,.0f}")

if __name__ == "__main__":
    main()
