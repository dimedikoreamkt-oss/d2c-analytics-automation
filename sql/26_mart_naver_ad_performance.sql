-- ============================================
-- Mart 26: 네이버 검색광고 통합 성과
-- 회사 전체 네이버 광고 데이터 (모든 브랜드)
-- ============================================
DROP TABLE IF EXISTS `d2c-analytics-502304.marts.mart_naver_ad_performance`;
CREATE TABLE `d2c-analytics-502304.marts.mart_naver_ad_performance`
PARTITION BY event_date
CLUSTER BY brand, campaign_id AS
WITH naver_base AS (
  SELECT
    event_date,
    brand,
    customer_id,
    campaign_id,
    campaign_name,
    campaign_type,
    adgroup_id,
    adgroup_name,
    keyword_id,
    keyword,
    bid_amt,
    SUM(impressions)      AS impressions,
    SUM(clicks)           AS clicks,
    SUM(cost_krw)         AS cost_krw,
    SUM(conversions)      AS conversions,
    SUM(conversion_value) AS revenue,
    AVG(avg_rank)         AS avg_rank
  FROM `d2c-analytics-502304.marts.naver_ad_insights`
  WHERE event_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
  GROUP BY event_date, brand, customer_id, campaign_id, campaign_name, campaign_type,
           adgroup_id, adgroup_name, keyword_id, keyword, bid_amt
),
ga_join AS (
  -- GA4 데이터와 조인 (네이버 유입 세션/구매)
  SELECT
    event_date,
    LOWER(utm_campaign) AS utm_campaign,
    SUM(sessions)  AS ga_sessions,
    SUM(purchases) AS ga_purchases,
    SUM(revenue)   AS ga_revenue
  FROM `d2c-analytics-502304.marts.mart_ad_channel_deep`
  WHERE LOWER(source) = 'naver' AND LOWER(medium) IN ('cpc', 'paid', 'search')
  GROUP BY event_date, utm_campaign
)
SELECT
  n.*,
  g.ga_sessions,
  g.ga_purchases,
  g.ga_revenue,
  -- 계산 지표
  SAFE_DIVIDE(n.clicks, NULLIF(n.impressions, 0)) * 100    AS ctr_pct,
  SAFE_DIVIDE(n.cost_krw, NULLIF(n.clicks, 0))             AS cpc_krw,
  SAFE_DIVIDE(n.cost_krw, NULLIF(n.conversions, 0))        AS cpa_krw,
  SAFE_DIVIDE(n.revenue, NULLIF(n.cost_krw, 0))            AS roas,
  SAFE_DIVIDE(g.ga_revenue, NULLIF(n.cost_krw, 0))         AS ga_roas,
  SAFE_DIVIDE(g.ga_purchases, NULLIF(g.ga_sessions, 0)) * 100 AS ga_session_cvr_pct,
  -- 등급
  CASE
    WHEN SAFE_DIVIDE(n.revenue, NULLIF(n.cost_krw, 0)) >= 5.0 THEN 'WINNER'
    WHEN SAFE_DIVIDE(n.revenue, NULLIF(n.cost_krw, 0)) >= 2.0 THEN 'HEALTHY'
    WHEN SAFE_DIVIDE(n.revenue, NULLIF(n.cost_krw, 0)) >= 1.0 THEN 'BREAKEVEN'
    WHEN n.cost_krw > 0 THEN 'LOSS'
    ELSE 'NO_SPEND'
  END AS performance_grade
FROM naver_base n
LEFT JOIN ga_join g
  ON n.event_date = g.event_date
  AND LOWER(n.campaign_name) = g.utm_campaign;
