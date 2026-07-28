-- ============================================
-- Mart 28: 네이버 검색 키워드 인사이트
-- 승자/패자 키워드 자동 분류
-- (SHOPPING 검색 키워드 포함: keyword_id 없이 keyword 값으로 그룹핑)
-- ============================================
DROP TABLE IF EXISTS `d2c-analytics-502304.marts.mart_naver_keyword_insights`;
CREATE TABLE `d2c-analytics-502304.marts.mart_naver_keyword_insights` AS
WITH keyword_summary AS (
  SELECT
    brand,
    campaign_type,
    campaign_name,
    adgroup_name,
    keyword,
    -- keyword_id 는 있으면 남기고 없으면 NULL (SHOPPING 검색 키워드는 keyword_id 가 비어있음)
    ANY_VALUE(NULLIF(keyword_id, "")) AS keyword_id,
    SUM(impressions)                  AS impressions_30d,
    SUM(clicks)                       AS clicks_30d,
    SUM(cost_krw)                     AS cost_30d,
    SUM(conversions)                  AS conversions_30d,
    SUM(conversion_value)             AS revenue_30d,
    AVG(avg_rank)                     AS avg_rank_30d,
    COUNT(DISTINCT event_date)        AS active_days_30d
  FROM `d2c-analytics-502304.marts.naver_ad_insights`
  WHERE event_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
    AND keyword IS NOT NULL
    AND keyword != ""                 -- 빈 키워드 로우 제외 (SHOPPING 상품매칭 로우 등)
  GROUP BY brand, campaign_type, campaign_name, adgroup_name, keyword
)
SELECT
  *,
  SAFE_DIVIDE(clicks_30d, NULLIF(impressions_30d, 0)) * 100 AS ctr_pct,
  SAFE_DIVIDE(cost_30d, NULLIF(clicks_30d, 0))              AS cpc_krw,
  SAFE_DIVIDE(cost_30d, NULLIF(conversions_30d, 0))         AS cpa_krw,
  SAFE_DIVIDE(revenue_30d, NULLIF(cost_30d, 0))             AS roas,
  CASE
    WHEN cost_30d = 0 THEN 'INACTIVE'
    WHEN SAFE_DIVIDE(revenue_30d, NULLIF(cost_30d, 0)) >= 5.0 THEN 'STAR'
    WHEN SAFE_DIVIDE(revenue_30d, NULLIF(cost_30d, 0)) >= 2.0 THEN 'HEALTHY'
    WHEN cost_30d >= 50000 AND conversions_30d = 0 THEN 'DEAD'
    WHEN SAFE_DIVIDE(revenue_30d, NULLIF(cost_30d, 0)) < 1.0 THEN 'LOSING'
    ELSE 'MONITORING'
  END AS keyword_grade,
  CASE
    WHEN SAFE_DIVIDE(revenue_30d, NULLIF(cost_30d, 0)) >= 5.0 THEN '입찰가 20% 인상, 예산 확대'
    WHEN cost_30d >= 50000 AND conversions_30d = 0 THEN '즉시 제외 검토'
    WHEN SAFE_DIVIDE(revenue_30d, NULLIF(cost_30d, 0)) < 1.0 AND cost_30d >= 20000 THEN '입찰가 하향 or 랜딩 개선'
    WHEN SAFE_DIVIDE(revenue_30d, NULLIF(cost_30d, 0)) >= 2.0 THEN '유지'
    ELSE '데이터 수집 중'
  END AS recommended_action
FROM keyword_summary;
