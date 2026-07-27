-- ============================================
-- Mart 32: 네이버 디바이스별 성과 (PC vs Mobile)
-- ============================================
CREATE OR REPLACE TABLE `d2c-analytics-502304.marts.mart_naver_device` AS
WITH device_daily AS (
  SELECT
    event_date,
    device,
    campaign_type,
    COUNT(DISTINCT campaign_id) AS campaigns,
    SUM(impressions)    AS impressions,
    SUM(clicks)         AS clicks,
    SUM(cost_krw)       AS cost_krw,
    SUM(conversions)    AS purchases,
    SUM(conversion_value) AS revenue
  FROM `d2c-analytics-502304.marts.naver_ad_insights`
  WHERE device IS NOT NULL AND device != ''
  GROUP BY event_date, device, campaign_type
)
SELECT
  event_date,
  device,
  campaign_type,
  campaigns,
  impressions, clicks, cost_krw, purchases, revenue,
  ROUND(SAFE_DIVIDE(clicks, NULLIF(impressions, 0)) * 100, 2)  AS ctr_pct,
  ROUND(SAFE_DIVIDE(cost_krw, NULLIF(clicks, 0)), 0)           AS cpc_krw,
  ROUND(SAFE_DIVIDE(cost_krw, NULLIF(impressions, 0)) * 1000, 0) AS cpm_krw,
  ROUND(SAFE_DIVIDE(revenue, NULLIF(cost_krw, 0)), 2)          AS roas,
  ROUND(SAFE_DIVIDE(purchases, NULLIF(clicks, 0)) * 100, 2)    AS click_cvr_pct,
  ROUND(SAFE_DIVIDE(cost_krw, NULLIF(purchases, 0)), 0)        AS cpa_krw,
  -- 디바이스 효율 등급
  CASE
    WHEN SAFE_DIVIDE(revenue, NULLIF(cost_krw, 0)) >= 5.0 THEN '🟢 HIGH'
    WHEN SAFE_DIVIDE(revenue, NULLIF(cost_krw, 0)) >= 2.0 THEN '🟡 OK'
    WHEN SAFE_DIVIDE(revenue, NULLIF(cost_krw, 0)) >= 1.0 THEN '🟠 BREAKEVEN'
    ELSE '🔴 LOSS'
  END AS device_efficiency
FROM device_daily
ORDER BY event_date DESC, device, cost_krw DESC;
