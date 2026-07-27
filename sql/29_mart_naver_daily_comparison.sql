-- ============================================
-- Mart 29: 네이버 일별 KPI 비교 (DoD/WoW/MoM) + 이상 탐지
-- ============================================
CREATE OR REPLACE TABLE `d2c-analytics-502304.marts.mart_naver_daily_comparison` AS
WITH daily_raw AS (
  SELECT
    event_date,
    SUM(impressions)      AS impressions,
    SUM(clicks)           AS clicks,
    SUM(cost_krw)         AS cost_krw,
    SUM(conversions)      AS purchases,
    SUM(conversion_value) AS revenue,
    COUNT(DISTINCT campaign_id) AS active_campaigns
  FROM `d2c-analytics-502304.marts.naver_ad_insights`
  WHERE device IS NULL OR device = ''
  GROUP BY event_date
),
daily AS (
  SELECT
    event_date,
    impressions, clicks, cost_krw, purchases, revenue, active_campaigns,
    SAFE_DIVIDE(clicks, NULLIF(impressions, 0)) * 100  AS ctr_pct,
    SAFE_DIVIDE(cost_krw, NULLIF(clicks, 0))           AS cpc_krw,
    SAFE_DIVIDE(cost_krw, NULLIF(purchases, 0))        AS cpa_krw,
    SAFE_DIVIDE(revenue, NULLIF(cost_krw, 0))          AS roas,
    SAFE_DIVIDE(purchases, NULLIF(clicks, 0)) * 100    AS click_cvr_pct
  FROM daily_raw
),
with_lag AS (
  SELECT
    d.*,
    -- 전일 (DoD)
    LAG(impressions, 1) OVER (ORDER BY event_date)  AS prev_day_impressions,
    LAG(clicks, 1) OVER (ORDER BY event_date)       AS prev_day_clicks,
    LAG(cost_krw, 1) OVER (ORDER BY event_date)     AS prev_day_cost,
    LAG(purchases, 1) OVER (ORDER BY event_date)    AS prev_day_purchases,
    LAG(revenue, 1) OVER (ORDER BY event_date)      AS prev_day_revenue,
    LAG(roas, 1) OVER (ORDER BY event_date)         AS prev_day_roas,
    -- 전주 같은 요일 (WoW)
    LAG(impressions, 7) OVER (ORDER BY event_date)  AS prev_week_impressions,
    LAG(clicks, 7) OVER (ORDER BY event_date)       AS prev_week_clicks,
    LAG(cost_krw, 7) OVER (ORDER BY event_date)     AS prev_week_cost,
    LAG(purchases, 7) OVER (ORDER BY event_date)    AS prev_week_purchases,
    LAG(revenue, 7) OVER (ORDER BY event_date)      AS prev_week_revenue,
    LAG(roas, 7) OVER (ORDER BY event_date)         AS prev_week_roas,
    -- 전월 (MoM)
    LAG(impressions, 30) OVER (ORDER BY event_date) AS prev_month_impressions,
    LAG(clicks, 30) OVER (ORDER BY event_date)      AS prev_month_clicks,
    LAG(cost_krw, 30) OVER (ORDER BY event_date)    AS prev_month_cost,
    LAG(purchases, 30) OVER (ORDER BY event_date)   AS prev_month_purchases,
    LAG(revenue, 30) OVER (ORDER BY event_date)     AS prev_month_revenue,
    LAG(roas, 30) OVER (ORDER BY event_date)        AS prev_month_roas
  FROM daily d
)
SELECT
  event_date,
  impressions, clicks, cost_krw, purchases, revenue,
  ROUND(ctr_pct, 2) AS ctr_pct,
  ROUND(cpc_krw, 0) AS cpc_krw,
  ROUND(cpa_krw, 0) AS cpa_krw,
  ROUND(roas, 2) AS roas,
  ROUND(click_cvr_pct, 2) AS click_cvr_pct,
  active_campaigns,

  ROUND(SAFE_DIVIDE(impressions - prev_day_impressions, NULLIF(prev_day_impressions, 0)) * 100, 1) AS imp_dod_pct,
  ROUND(SAFE_DIVIDE(clicks - prev_day_clicks, NULLIF(prev_day_clicks, 0)) * 100, 1) AS clk_dod_pct,
  ROUND(SAFE_DIVIDE(cost_krw - prev_day_cost, NULLIF(prev_day_cost, 0)) * 100, 1) AS cost_dod_pct,
  ROUND(SAFE_DIVIDE(purchases - prev_day_purchases, NULLIF(prev_day_purchases, 0)) * 100, 1) AS pur_dod_pct,
  ROUND(SAFE_DIVIDE(revenue - prev_day_revenue, NULLIF(prev_day_revenue, 0)) * 100, 1) AS rev_dod_pct,
  ROUND(SAFE_DIVIDE(roas - prev_day_roas, NULLIF(prev_day_roas, 0)) * 100, 1) AS roas_dod_pct,

  ROUND(SAFE_DIVIDE(impressions - prev_week_impressions, NULLIF(prev_week_impressions, 0)) * 100, 1) AS imp_wow_pct,
  ROUND(SAFE_DIVIDE(clicks - prev_week_clicks, NULLIF(prev_week_clicks, 0)) * 100, 1) AS clk_wow_pct,
  ROUND(SAFE_DIVIDE(cost_krw - prev_week_cost, NULLIF(prev_week_cost, 0)) * 100, 1) AS cost_wow_pct,
  ROUND(SAFE_DIVIDE(purchases - prev_week_purchases, NULLIF(prev_week_purchases, 0)) * 100, 1) AS pur_wow_pct,
  ROUND(SAFE_DIVIDE(revenue - prev_week_revenue, NULLIF(prev_week_revenue, 0)) * 100, 1) AS rev_wow_pct,
  ROUND(SAFE_DIVIDE(roas - prev_week_roas, NULLIF(prev_week_roas, 0)) * 100, 1) AS roas_wow_pct,

  ROUND(SAFE_DIVIDE(impressions - prev_month_impressions, NULLIF(prev_month_impressions, 0)) * 100, 1) AS imp_mom_pct,
  ROUND(SAFE_DIVIDE(clicks - prev_month_clicks, NULLIF(prev_month_clicks, 0)) * 100, 1) AS clk_mom_pct,
  ROUND(SAFE_DIVIDE(cost_krw - prev_month_cost, NULLIF(prev_month_cost, 0)) * 100, 1) AS cost_mom_pct,
  ROUND(SAFE_DIVIDE(purchases - prev_month_purchases, NULLIF(prev_month_purchases, 0)) * 100, 1) AS pur_mom_pct,
  ROUND(SAFE_DIVIDE(revenue - prev_month_revenue, NULLIF(prev_month_revenue, 0)) * 100, 1) AS rev_mom_pct,
  ROUND(SAFE_DIVIDE(roas - prev_month_roas, NULLIF(prev_month_roas, 0)) * 100, 1) AS roas_mom_pct,

  CASE
    WHEN SAFE_DIVIDE(revenue - prev_week_revenue, NULLIF(prev_week_revenue, 0)) <= -0.20 THEN '🔴 매출 20%+ 하락'
    WHEN SAFE_DIVIDE(revenue - prev_week_revenue, NULLIF(prev_week_revenue, 0)) >= 0.20 THEN '🟢 매출 20%+ 상승'
    WHEN SAFE_DIVIDE(cost_krw - prev_week_cost, NULLIF(prev_week_cost, 0)) >= 0.30 THEN '⚠️ 광고비 30%+ 증가'
    WHEN SAFE_DIVIDE(cost_krw - prev_week_cost, NULLIF(prev_week_cost, 0)) <= -0.30 THEN '⚠️ 광고비 30%+ 감소'
    WHEN SAFE_DIVIDE(roas - prev_week_roas, NULLIF(prev_week_roas, 0)) <= -0.15 THEN '🔴 ROAS 15%+ 하락'
    ELSE '✅ 정상'
  END AS alert_status,

  CASE
    WHEN SAFE_DIVIDE(revenue - prev_week_revenue, NULLIF(prev_week_revenue, 0)) <= -0.20
         AND SAFE_DIVIDE(cost_krw - prev_week_cost, NULLIF(prev_week_cost, 0)) >= 0 THEN
      '매출 하락 + 광고비 증가 → 키워드 품질 점검, 랜딩페이지 개선 필요'
    WHEN SAFE_DIVIDE(revenue - prev_week_revenue, NULLIF(prev_week_revenue, 0)) <= -0.20
         AND SAFE_DIVIDE(cost_krw - prev_week_cost, NULLIF(prev_week_cost, 0)) < 0 THEN
      '매출+광고비 동시 하락 → 예산 복원 또는 키워드 확장 검토'
    WHEN SAFE_DIVIDE(roas - prev_week_roas, NULLIF(prev_week_roas, 0)) <= -0.15 THEN
      'ROAS 하락 → 고비용 저성과 키워드 입찰가 하향'
    WHEN SAFE_DIVIDE(cost_krw - prev_week_cost, NULLIF(prev_week_cost, 0)) >= 0.30
         AND SAFE_DIVIDE(revenue - prev_week_revenue, NULLIF(prev_week_revenue, 0)) >= 0 THEN
      '광고비 증가 + 매출 상승 → 효율 양호, 예산 유지'
    ELSE '추세 모니터링'
  END AS recommended_action

FROM with_lag
ORDER BY event_date DESC;
