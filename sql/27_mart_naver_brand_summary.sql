-- ============================================
-- Mart 27: 네이버 광고 브랜드별 일별 요약
-- ============================================
DROP TABLE IF EXISTS `d2c-analytics-502304.marts.mart_naver_brand_summary`;
CREATE TABLE `d2c-analytics-502304.marts.mart_naver_brand_summary`
PARTITION BY event_date AS
SELECT
  event_date,
  brand,
  campaign_type,
  COUNT(DISTINCT campaign_id) AS campaigns,
  COUNT(DISTINCT adgroup_id)  AS adgroups,
  COUNT(DISTINCT keyword_id)  AS keywords,
  SUM(impressions)            AS impressions,
  SUM(clicks)                 AS clicks,
  SUM(cost_krw)               AS cost_krw,
  SUM(conversions)            AS conversions,
  SUM(conversion_value)         AS revenue,
  SAFE_DIVIDE(SUM(clicks), NULLIF(SUM(impressions), 0)) * 100 AS ctr_pct,
  SAFE_DIVIDE(SUM(cost_krw), NULLIF(SUM(clicks), 0))          AS cpc_krw,
  SAFE_DIVIDE(SUM(cost_krw), NULLIF(SUM(conversions), 0))     AS cpa_krw,
  SAFE_DIVIDE(SUM(conversion_value), NULLIF(SUM(cost_krw), 0)) AS roas
FROM `d2c-analytics-502304.marts.naver_ad_insights`
WHERE event_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
GROUP BY event_date, brand, campaign_type;
