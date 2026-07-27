-- ============================================
-- Mart 34: Meta 광고 자산별 성과 분석
-- 이미지 카드 / 본문 / 제목 / CTA별 성과 순위
-- ============================================
CREATE OR REPLACE TABLE `d2c-analytics-502304.marts.mart_meta_asset_performance`
PARTITION BY event_date
CLUSTER BY ad_id, asset_type AS
WITH asset_agg AS (
  SELECT
    event_date,
    ad_id,
    ad_name,
    adset_name,
    campaign_name,
    asset_type,
    asset_id,
    ANY_VALUE(asset_url) AS asset_url,
    ANY_VALUE(asset_text) AS asset_text,
    SUM(impressions)      AS impressions,
    SUM(reach)            AS reach,
    SUM(clicks)           AS clicks,
    SUM(spend_krw)        AS spend_krw,
    SUM(link_clicks)      AS link_clicks,
    SUM(landing_page_views) AS landing_page_views,
    SUM(view_content)     AS view_content,
    SUM(add_to_cart)      AS add_to_cart,
    SUM(initiate_checkout) AS initiate_checkout,
    SUM(purchases)        AS purchases,
    SUM(purchase_value)   AS purchase_value
  FROM `d2c-analytics-502304.marts.meta_asset_performance`
  WHERE event_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 60 DAY)
  GROUP BY event_date, ad_id, ad_name, adset_name, campaign_name, asset_type, asset_id
),
with_metrics AS (
  SELECT
    *,
    ROUND(SAFE_DIVIDE(clicks, NULLIF(impressions, 0)) * 100, 2)                AS ctr_pct,
    ROUND(SAFE_DIVIDE(spend_krw, NULLIF(clicks, 0)), 0)                        AS cpc,
    ROUND(SAFE_DIVIDE(spend_krw, NULLIF(impressions, 0)) * 1000, 0)            AS cpm,
    ROUND(SAFE_DIVIDE(link_clicks, NULLIF(impressions, 0)) * 100, 2)           AS link_ctr_pct,
    ROUND(SAFE_DIVIDE(add_to_cart, NULLIF(link_clicks, 0)) * 100, 2)           AS atc_rate_pct,
    ROUND(SAFE_DIVIDE(purchases, NULLIF(link_clicks, 0)) * 100, 2)             AS click_to_purchase_pct,
    ROUND(SAFE_DIVIDE(purchases, NULLIF(add_to_cart, 0)) * 100, 2)             AS cart_to_purchase_pct,
    ROUND(SAFE_DIVIDE(spend_krw, NULLIF(purchases, 0)), 0)                     AS cpa_krw,
    ROUND(SAFE_DIVIDE(purchase_value, NULLIF(spend_krw, 0)), 2)                AS roas
  FROM asset_agg
),
ranked AS (
  SELECT
    *,
    -- 광고 세트 내에서 이미지 asset의 지출 순위
    ROW_NUMBER() OVER (
      PARTITION BY ad_id, asset_type
      ORDER BY spend_krw DESC
    ) AS spend_rank_in_ad,
    -- 광고 세트 내에서 매출 순위
    ROW_NUMBER() OVER (
      PARTITION BY ad_id, asset_type
      ORDER BY purchase_value DESC
    ) AS revenue_rank_in_ad,
    -- 광고 세트 총 지출 대비 이 asset의 지출 비중
    ROUND(SAFE_DIVIDE(
      spend_krw,
      SUM(spend_krw) OVER (PARTITION BY ad_id, asset_type)
    ) * 100, 1) AS spend_share_pct
  FROM with_metrics
)
SELECT
  *,
  -- asset 등급 (같은 광고 내에서 상대 평가)
  CASE
    WHEN roas >= 5.0 AND purchases >= 3 THEN '🏆 STAR'
    WHEN roas >= 2.0 AND purchases >= 1 THEN '🟢 WINNER'
    WHEN roas >= 1.0 THEN '🟡 BREAKEVEN'
    WHEN spend_krw >= 30000 AND purchases = 0 THEN '🔴 DEAD'
    WHEN spend_krw >= 10000 AND roas < 1.0 THEN '🟠 LOSING'
    ELSE '⚪ MONITORING'
  END AS asset_grade,
  -- 추천 액션
  CASE
    WHEN roas >= 5.0 AND purchases >= 3 THEN '예산 확대 / 유사 소재 제작'
    WHEN roas >= 2.0 THEN '유지'
    WHEN spend_krw >= 30000 AND purchases = 0 THEN '즉시 제외 검토'
    WHEN spend_krw >= 10000 AND roas < 1.0 THEN '이미지/카피 교체 검토'
    ELSE '데이터 축적 대기'
  END AS recommended_action
FROM ranked;
