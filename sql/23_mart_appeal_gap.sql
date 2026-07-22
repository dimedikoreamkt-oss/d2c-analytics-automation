-- Mart 23: 자사 vs 시장 소구점 갭 분석
DROP TABLE IF EXISTS `d2c-analytics-502304.marts.mart_appeal_gap`;

CREATE TABLE `d2c-analytics-502304.marts.mart_appeal_gap` AS

WITH market_appeal AS (
  -- 시장 승자 광고(WINNER 이상)에서 소구점 분포
  SELECT
    appeal_tag,
    COUNT(DISTINCT ad_id) AS market_ad_count,
    COUNT(DISTINCT page_id) AS market_advertiser_count
  FROM `d2c-analytics-502304.marts.mart_market_winners`, UNNEST(appeal_tags) AS appeal_tag
  WHERE winner_grade IN ('SUPER_WINNER', 'WINNER', 'GROWING')
  GROUP BY appeal_tag
),

market_total AS (
  SELECT COUNT(DISTINCT ad_id) AS total_market_ads
  FROM `d2c-analytics-502304.marts.mart_market_winners`
  WHERE winner_grade IN ('SUPER_WINNER', 'WINNER', 'GROWING')
),

own_appeal AS (
  -- 자사 광고 소구점 분포 (최근 30일)
  SELECT
    appeal_tag,
    COUNT(DISTINCT ad_id_str) AS own_ad_count,
    SUM(spend_krw) AS own_spend,
    SUM(ga_revenue) AS own_revenue
  FROM (
    SELECT
      appeal_tag,
      ARRAY_TO_STRING([CAST(FARM_FINGERPRINT(CONCAT(event_date, appeal_tag, creative_type)) AS STRING)], '') AS ad_id_str,
      spend_krw,
      ga_revenue
    FROM `d2c-analytics-502304.marts.mart_creative_appeal`
    WHERE event_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
      AND appeal_tag != '미분류'
  )
  GROUP BY appeal_tag
),

own_total AS (
  SELECT SUM(own_ad_count) AS total_own_ads
  FROM own_appeal
)

SELECT
  IFNULL(m.appeal_tag, o.appeal_tag) AS appeal_tag,
  IFNULL(m.market_ad_count, 0) AS market_ad_count,
  IFNULL(m.market_advertiser_count, 0) AS market_advertiser_count,
  ROUND(SAFE_DIVIDE(m.market_ad_count, mt.total_market_ads) * 100, 1) AS market_share_pct,
  IFNULL(o.own_ad_count, 0) AS own_ad_count,
  ROUND(SAFE_DIVIDE(o.own_ad_count, ot.total_own_ads) * 100, 1) AS own_share_pct,
  IFNULL(o.own_spend, 0) AS own_spend,
  IFNULL(o.own_revenue, 0) AS own_revenue,
  ROUND(
    SAFE_DIVIDE(m.market_ad_count, mt.total_market_ads) * 100 -
    SAFE_DIVIDE(o.own_ad_count, ot.total_own_ads) * 100,
    1
  ) AS gap_pct,

  CASE
    WHEN o.own_ad_count IS NULL OR o.own_ad_count = 0 THEN 'UNTOUCHED'
    WHEN SAFE_DIVIDE(m.market_ad_count, mt.total_market_ads) -
         SAFE_DIVIDE(o.own_ad_count, ot.total_own_ads) > 0.15 THEN 'UNDERUSED'
    WHEN SAFE_DIVIDE(o.own_ad_count, ot.total_own_ads) -
         SAFE_DIVIDE(m.market_ad_count, mt.total_market_ads) > 0.15 THEN 'OVERUSED'
    ELSE 'BALANCED'
  END AS gap_status,

  CURRENT_TIMESTAMP() AS analyzed_at

FROM market_appeal m
CROSS JOIN market_total mt
FULL OUTER JOIN own_appeal o ON m.appeal_tag = o.appeal_tag
CROSS JOIN own_total ot
ORDER BY gap_pct DESC;
