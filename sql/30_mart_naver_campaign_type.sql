-- ============================================
-- Mart 30: 네이버 캠페인 타입별 심층 분석
-- SHOPPING vs WEB_SITE vs BRAND_SEARCH
-- ============================================
CREATE OR REPLACE TABLE `d2c-analytics-502304.marts.mart_naver_campaign_type` AS
WITH type_daily AS (
  SELECT
    event_date,
    campaign_type,
    COUNT(DISTINCT campaign_id) AS campaigns,
    SUM(impressions)    AS impressions,
    SUM(clicks)         AS clicks,
    SUM(cost_krw)       AS cost_krw,
    SUM(conversions)    AS purchases,
    SUM(conversion_value) AS revenue
  FROM `d2c-analytics-502304.marts.naver_ad_insights`
  WHERE device IS NULL OR device = ''
  GROUP BY event_date, campaign_type
),
with_lag AS (
  SELECT
    *,
    LAG(impressions, 7) OVER (PARTITION BY campaign_type ORDER BY event_date) AS prev_week_impressions,
    LAG(clicks, 7) OVER (PARTITION BY campaign_type ORDER BY event_date)      AS prev_week_clicks,
    LAG(cost_krw, 7) OVER (PARTITION BY campaign_type ORDER BY event_date)    AS prev_week_cost,
    LAG(purchases, 7) OVER (PARTITION BY campaign_type ORDER BY event_date)   AS prev_week_purchases,
    LAG(revenue, 7) OVER (PARTITION BY campaign_type ORDER BY event_date)     AS prev_week_revenue
  FROM type_daily
)
SELECT
  event_date,
  campaign_type,
  campaigns,
  impressions, clicks, cost_krw, purchases, revenue,
  ROUND(SAFE_DIVIDE(clicks, NULLIF(impressions, 0)) * 100, 2)  AS ctr_pct,
  ROUND(SAFE_DIVIDE(cost_krw, NULLIF(clicks, 0)), 0)           AS cpc_krw,
  ROUND(SAFE_DIVIDE(cost_krw, NULLIF(impressions, 0)) * 1000, 0) AS cpm_krw,
  ROUND(SAFE_DIVIDE(cost_krw, NULLIF(purchases, 0)), 0)        AS cpa_krw,
  ROUND(SAFE_DIVIDE(revenue, NULLIF(cost_krw, 0)), 2)          AS roas,
  ROUND(SAFE_DIVIDE(purchases, NULLIF(clicks, 0)) * 100, 2)    AS click_cvr_pct,
  -- WoW 변화율
  ROUND(SAFE_DIVIDE(impressions - prev_week_impressions, NULLIF(prev_week_impressions, 0)) * 100, 1) AS imp_wow_pct,
  ROUND(SAFE_DIVIDE(clicks - prev_week_clicks, NULLIF(prev_week_clicks, 0)) * 100, 1) AS clk_wow_pct,
  ROUND(SAFE_DIVIDE(cost_krw - prev_week_cost, NULLIF(prev_week_cost, 0)) * 100, 1) AS cost_wow_pct,
  ROUND(SAFE_DIVIDE(revenue - prev_week_revenue, NULLIF(prev_week_revenue, 0)) * 100, 1) AS rev_wow_pct,
  -- 효율 등급
  CASE
    WHEN SAFE_DIVIDE(revenue, NULLIF(cost_krw, 0)) >= 5.0 THEN '🟢 HIGH_ROAS'
    WHEN SAFE_DIVIDE(revenue, NULLIF(cost_krw, 0)) >= 2.0 THEN '🟡 STABLE'
    WHEN SAFE_DIVIDE(revenue, NULLIF(cost_krw, 0)) >= 1.0 THEN '🟠 BREAKEVEN'
    ELSE '🔴 LOSS'
  END AS efficiency_grade
FROM with_lag
ORDER BY event_date DESC, cost_krw DESC;
