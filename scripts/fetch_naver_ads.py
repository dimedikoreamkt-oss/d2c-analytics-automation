"""
네이버 검색광고 API - 회사 전체 광고 데이터 수집
- 캠페인 레벨 일별 통계 수집 (/stats?id= 단일 호출)
- 다중 CUSTOMER_ID 지원 (여러 브랜드/광고주 계정)
- BigQuery marts.naver_ad_insights 에 통합 저장
"""
import os, sys, time, hmac, hashlib, base64, json, requests
from datetime import datetime, timedelta
from google.cloud import bigquery

NAVER_API_URL = "https://api.searchad.naver.com"
NAVER_ACCOUNTS_JSON = os.environ.get("NAVER_ACCOUNTS")
if not NAVER_ACCOUNTS_JSON:
    print("❌ ERROR: NAVER_ACCOUNTS 환경변수가 없습니다.")
    sys.exit(1)
NAVER_ACCOUNTS = json.loads(NAVER_ACCOUNTS_JSON)
PROJECT_ID = os.environ.get("PROJECT_ID", "d2c-analytics-502304")
BQ_TABLE_ID = f"{PROJECT_ID}.marts.naver_ad_insights"

STAT_FIELDS = ["impCnt", "clkCnt", "salesAmt", "purchaseCcnt", "ctr", "cpc", "avgRnk", "purchaseConvAmt"]


def generate_signature(timestamp, method, uri, secret_key):
    msg = f"{timestamp}.{method}.{uri}"
    return base64.b64encode(
        hmac.new(secret_key.encode(), msg.encode(), hashlib.sha256).digest()
    ).decode()


def get_headers(method, uri, account):
    timestamp = str(int(time.time() * 1000))
    return {
        "Content-Type": "application/json; charset=UTF-8",
        "X-Timestamp": timestamp,
        "X-API-KEY": account["api_license"],
        "X-Customer": str(account["customer_id"]),
        "X-Signature": generate_signature(timestamp, method, uri, account["secret_key"]),
    }


def api_get(uri_path, params, account, retries=3):
    url = NAVER_API_URL + uri_path
    for attempt in range(retries):
        try:
            r = requests.get(
                url, params=params,
                headers=get_headers("GET", uri_path, account),
                timeout=30,
            )
            if r.status_code == 200:
                return r.json()
            if r.status_code == 429:
                print(f"  ⚠️ Rate limit, 재시도 {attempt+1}/{retries}")
                time.sleep(2 ** attempt)
                continue
            print(f"  [ERR] {uri_path} status {r.status_code}: {r.text[:200]}")
            return None
        except Exception as e:
            print(f"  [ERR] {uri_path} exception: {e}")
            time.sleep(2 ** attempt)
    return None


def fetch_campaigns(account):
    """캠페인 목록 조회"""
    return api_get("/ncc/campaigns", {}, account) or []


def fetch_adgroups(campaign_id, account):
    """광고그룹 목록 조회 (메타데이터용)"""
    return api_get("/ncc/adgroups", {"nccCampaignId": campaign_id}, account) or []


def fetch_keywords(adgroup_id, account):
    """키워드 목록 조회 (메타데이터용)"""
    return api_get("/ncc/keywords", {"nccAdgroupId": adgroup_id}, account) or []


def fetch_daily_stats(entity_id, start_date, end_date, account):
    """
    단일 엔티티의 일별 통계 조회
    /stats?id=<NCC_ID> → 일별 데이터 자동 반환
    응답: {"summary":{...}, "data":[{dateStart, dateEnd, impCnt, clkCnt, ...}, ...]}
    """
    params = {
        "id": entity_id,
        "fields": json.dumps(STAT_FIELDS),
        "timeRange": json.dumps({"since": start_date, "until": end_date}),
    }
    res = api_get("/stats", params, account)
    if res is None:
        return []
    # 일별 데이터는 res["data"] 배열에 있음
    return res.get("data", [])


def fetch_summary_stats(entity_ids, start_date, end_date, account):
    """
    여러 엔티티의 요약 통계 조회 (일별 아님, 엔티티별 합계)
    /stats?ids=id1,id2,id3 (콤마 구분 문자열, NOT JSON array)
    응답: {"data":[{id, impCnt, clkCnt, ...}, ...]}
    """
    if not entity_ids:
        return []
    params = {
        "ids": ",".join(entity_ids),  # 핵심: 콤마 구분 문자열!
        "fields": json.dumps(STAT_FIELDS),
        "timeRange": json.dumps({"since": start_date, "until": end_date}),
    }
    res = api_get("/stats", params, account)
    if res is None:
        return []
    return res.get("data", [])


def collect_account_data(account, start_date, end_date):
    """계정별 데이터 수집: 캠페인 레벨 일별 통계 + 키워드 메타데이터"""
    print(f"\n📊 [{account['brand']}] Customer {account['customer_id']} 수집 시작")
    print(f"   📅 기간: {start_date} ~ {end_date}")

    campaigns = fetch_campaigns(account)
    if not campaigns:
        print("  ⚠️ 캠페인 없음")
        return []

    print(f"  📋 캠페인 {len(campaigns)}개 발견")
    all_rows = []

    for c_idx, campaign in enumerate(campaigns, 1):
        camp_id = campaign.get("nccCampaignId", "")
        camp_name = campaign.get("name", "(unnamed)")
        camp_type = campaign.get("campaignTp", "UNKNOWN")
        camp_status = campaign.get("status", "UNKNOWN")

        print(f"  [{c_idx}/{len(campaigns)}] {camp_name[:40]} ({camp_type})")

        # 1. 캠페인 일별 통계
        daily_data = fetch_daily_stats(camp_id, start_date, end_date, account)
        time.sleep(0.3)

        for row in daily_data:
            event_date = row.get("dateStart", "")
            if not event_date:
                continue

            # 광고그룹/키워드 메타데이터 수집 (캠페인 레벨이므로 빈 값)
            all_rows.append({
                "event_date": event_date,
                "brand": account["brand"],
                "customer_id": str(account["customer_id"]),
                "campaign_id": camp_id,
                "campaign_name": camp_name,
                "campaign_type": camp_type,
                "adgroup_id": "",
                "adgroup_name": "",
                "keyword_id": "",
                "keyword": "",
                "keyword_status": "",
                "bid_amt": 0.0,
                "impressions": int(float(row.get("impCnt", 0) or 0)),
                "clicks": int(float(row.get("clkCnt", 0) or 0)),
                "cost_krw": float(row.get("salesAmt", 0) or 0),
                "conversions": int(float(row.get("purchaseCcnt", 0) or 0)),
                "conversion_value": float(row.get("purchaseConvAmt", 0) or 0),
                "ctr": float(row.get("ctr", 0) or 0),
                "cpc": float(row.get("cpc", 0) or 0),
                "avg_rank": float(row.get("avgRnk", 0) or 0),
            })

        # 2. 광고그룹 + 키워드 메타데이터 수집 (통계 없이 이름만)
        adgroups = fetch_adgroups(camp_id, account)
        time.sleep(0.2)

        for adgroup in adgroups:
            ag_id = adgroup.get("nccAdgroupId", "")
            ag_name = adgroup.get("name", "(unnamed)")

            keywords = fetch_keywords(ag_id, account)
            time.sleep(0.2)

            for kw in keywords:
                kw_id = kw.get("nccKeywordId", "")
                kw_text = kw.get("keyword", "")
                kw_status = kw.get("status", "")
                bid = float(kw.get("bidAmt", 0) or 0)

                # 키워드 요약 통계 (콤마 구분 형식)
                if kw_id:
                    kw_stats = fetch_summary_stats([kw_id], start_date, end_date, account)
                    time.sleep(0.2)

                    for stat in kw_stats:
                        all_rows.append({
                            "event_date": start_date,  # 요약이므로 시작일 사용
                            "brand": account["brand"],
                            "customer_id": str(account["customer_id"]),
                            "campaign_id": camp_id,
                            "campaign_name": camp_name,
                            "campaign_type": camp_type,
                            "adgroup_id": ag_id,
                            "adgroup_name": ag_name,
                            "keyword_id": kw_id,
                            "keyword": kw_text,
                            "keyword_status": kw_status,
                            "bid_amt": bid,
                            "impressions": int(float(stat.get("impCnt", 0) or 0)),
                            "clicks": int(float(stat.get("clkCnt", 0) or 0)),
                            "cost_krw": float(stat.get("salesAmt", 0) or 0),
                            "conversions": int(float(stat.get("purchaseCcnt", 0) or 0)),
                            "conversion_value": float(stat.get("purchaseConvAmt", 0) or 0),
                            "ctr": float(stat.get("ctr", 0) or 0),
                            "cpc": float(stat.get("cpc", 0) or 0),
                            "avg_rank": float(stat.get("avgRnk", 0) or 0),
                        })

    print(f"  ✅ {len(all_rows)}행 수집 완료")
    return all_rows


def load_to_bq(rows):
    """BigQuery에 데이터 적재 (MERGE 방식)"""
    if not rows:
        print("⚠️ 수집 데이터 없음 - BigQuery 저장 스킵")
        return

    client = bigquery.Client(project=PROJECT_ID)
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

    try:
        client.get_table(BQ_TABLE_ID)
        print(f"  📝 기존 테이블 확인: {BQ_TABLE_ID}")
    except Exception:
        table = bigquery.Table(BQ_TABLE_ID, schema=schema)
        table.time_partitioning = bigquery.TimePartitioning(
            field="event_date", expiration_ms=180 * 24 * 60 * 60 * 1000
        )
        table.clustering_fields = ["brand", "campaign_id"]
        client.create_table(table)
        print(f"  ✅ 테이블 생성: {BQ_TABLE_ID}")

    # 기존 데이터 삭제 후 새로 적재 (해당 기간)
    dates = sorted(set(r["event_date"] for r in rows))
    brands = sorted(set(r["brand"] for r in rows))
    min_date, max_date = dates[0], dates[-1]

    delete_sql = f"""
    DELETE FROM `{BQ_TABLE_ID}`
    WHERE event_date BETWEEN '{min_date}' AND '{max_date}'
      AND brand IN ({','.join(f"'{b}'" for b in brands)})
    """
    client.query(delete_sql).result()
    print(f"  🗑 기존 데이터 삭제: {min_date} ~ {max_date}, brands={brands}")

    # 새 데이터 적재
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
    print(f"🏢 광고주 계정 수: {len(NAVER_ACCOUNTS)}개")
    print(f"🎯 대상 브랜드: {', '.join(a['brand'] for a in NAVER_ACCOUNTS)}")

    all_rows = []
    for account in NAVER_ACCOUNTS:
        try:
            rows = collect_account_data(account, start_date, end_date)
            all_rows.extend(rows)
        except Exception as e:
            print(f"❌ [{account['brand']}] 수집 실패: {e}")
            import traceback
            traceback.print_exc()

    load_to_bq(all_rows)

    print("\n" + "=" * 60)
    print("📊 수집 완료 요약")
    print("=" * 60)
    brands = set(r["brand"] for r in all_rows)
    for brand in sorted(brands):
        brand_rows = [r for r in all_rows if r["brand"] == brand]
        total_cost = sum(r["cost_krw"] for r in brand_rows)
        total_clicks = sum(r["clicks"] for r in brand_rows)
        total_conv = sum(r["conversions"] for r in brand_rows)
        total_rev = sum(r["conversion_value"] for r in brand_rows)
        total_imp = sum(r["impressions"] for r in brand_rows)
        roas = total_rev / total_cost if total_cost else 0
        print(f"  🏷 {brand}")
        print(f"     행수: {len(brand_rows):,}")
        print(f"     노출: {total_imp:,}")
        print(f"     클릭: {total_clicks:,}")
        print(f"     지출: ₩{total_cost:,.0f}")
        print(f"     전환: {total_conv:,}")
        print(f"     매출: ₩{total_rev:,.0f}")
        print(f"     ROAS: {roas:.2f}x")
    print(f"\n✅ 전체 총 {len(all_rows):,}행 처리 완료")


if __name__ == "__main__":
    main()
