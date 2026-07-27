-- ============================================
-- Mart 31: 네이버 키워드 일별 트렌드 (7일 이동평균)
-- ============================================
CREATE OR REPLACE TABLE `d2c-analytics-502304.marts.mart_naver_keyword_trend` AS
WITH kw_daily AS (
  SELECT
    event_date,
    keyword,
    campaign_name,
    campaign_type,
    SUM(impressions)    AS impressions,
    SUM(clicks)         AS clicks,
    SUM(cost_krw)       AS cost_krw,
    SUM(conversions)    AS purchases,
    SUM(conversion_value) AS revenue
  FROM `d2c-analytics-502304.marts.naver_ad_insights`
  WHERE (device IS NULL OR device = '')
    AND keyword IS NOT NULL AND keyword != ''
  GROUP BY event_date, keyword, campaign_name, campaign_type
),
with_ma AS (
  SELECT
    *,
    -- 7일 이동평균
    AVG(impressions) OVER w AS imp_7d_avg,
    AVG(clicks) OVER w      AS clk_7d_avg,
    AVG(cost_krw) OVER w    AS cost_7d_avg,
    AVG(purchases) OVER w   AS pur_7d_avg,
    AVG(revenue) OVER w     AS rev_7d_avg,
    -- 전주 같은 날
    LAG(impressions, 7) OVER w AS prev_week_impressions,
    LAG(clicks, 7) OVER w      AS prev_week_clicks,
    LAG(cost_krw, 7) OVER w    AS prev_week_cost,
    LAG(revenue, 7) OVER w     AS prev_week_revenue
  FROM kw_daily
  WINDOW w AS (PARTITION BY keyword, campaign_name ORDER BY event_date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)
)
SELECT
  event_date,
  keyword,
  campaign_name,
  campaign_type,
  impressions, clicks, cost_krw, purchases, revenue,
  ROUND(SAFE_DIVIDE(clicks, NULLIF(impressions, 0)) * 100, 2)  AS ctr_pct,
  ROUND(SAFE_DIVIDE(cost_krw, NULLIF(clicks, 0)), 0)           AS cpc_krw,
  ROUND(SAFE_DIVIDE(revenue, NULLIF(cost_krw, 0)), 2)          AS roas,
  ROUND(SAFE_DIVIDE(purchases, NULLIF(clicks, 0)) * 100, 2)    AS click_cvr_pct,
  -- 7일 이동평균
  ROUND(imp_7d_avg, 0) AS imp_7d_avg,
  ROUND(clk_7d_avg, 1) AS clk_7d_avg,
  ROUND(cost_7d_avg, 0) AS cost_7d_avg,
  ROUND(pur_7d_avg, 1) AS pur_7d_avg,
  ROUND(rev_7d_avg, 0) AS rev_7d_avg,
  -- WoW 변화
  ROUND(SAFE_DIVIDE(impressions - prev_week_impressions, NULLIF(prev_week_impressions, 0)) * 100, 1) AS imp_wow_pct,
  ROUND(SAFE_DIVIDE(clicks - prev_week_clicks, NULLIF(prev_week_clicks, 0)) * 100, 1) AS clk_wow_pct,
  ROUND(SAFE_DIVIDE(cost_krw - prev_week_cost, NULLIF(prev_week_cost, 0)) * 100, 1) AS cost_wow_pct,
  ROUND(SAFE_DIVIDE(revenue - prev_week_revenue, NULLIF(prev_week_revenue, 0)) * 100, 1) AS rev_wow_pct,
  -- 트렌드 방향
  CASE
    WHEN SAFE_DIVIDE(rev_7d_avg - LAG(rev_7d_avg, 7) OVER w, NULLIF(LAG(rev_7d_avg, 7) OVER w, 0)) >= 0.15 THEN '📈 상승'
    WHEN SAFE_DIVIDE(rev_7d_avg - LAG(rev_7d_avg, 7) OVER w, NULLIF(LAG(rev_7d_avg, 7) OVER w, 0)) <= -0.15 THEN '📉 하락'
    ELSE '➡️ 횡보'
  END AS trend_direction
FROM with_ma
WHERE event_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
ORDER BY event_date DESC, cost_krw DESC;
