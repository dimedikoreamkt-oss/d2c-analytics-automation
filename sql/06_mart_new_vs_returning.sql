CREATE OR REPLACE TABLE `d2c-analytics-502304.marts.mart_new_vs_returning`
PARTITION BY event_date
CLUSTER BY user_type AS
WITH base_events AS (
  SELECT
    DATE(TIMESTAMP_MICROS(event_timestamp), 'Asia/Seoul') AS event_date,
    user_pseudo_id,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS session_id,
    IF(
      DATE(TIMESTAMP_MICROS(COALESCE(user_first_touch_timestamp, event_timestamp)), 'Asia/Seoul')
        = DATE(TIMESTAMP_MICROS(event_timestamp), 'Asia/Seoul'),
      'new', 'returning'
    ) AS user_type,
    event_name,
    ecommerce.purchase_revenue_in_usd AS revenue_usd
  FROM `d2c-analytics-502304.analytics_537721411.events_*`
  WHERE _TABLE_SUFFIX NOT LIKE 'intraday%'
)
SELECT
  event_date,
  user_type,
  COUNT(DISTINCT user_pseudo_id) AS users,
  COUNT(DISTINCT CONCAT(user_pseudo_id, CAST(session_id AS STRING))) AS sessions,
  COUNTIF(event_name = 'view_item') AS pdp_views,
  COUNTIF(event_name = 'add_to_cart') AS add_to_carts,
  COUNTIF(event_name = 'begin_checkout') AS checkouts,
  COUNTIF(event_name = 'purchase') AS purchases,
  ROUND(SUM(IF(event_name = 'purchase', revenue_usd, 0)), 2) AS revenue,
  ROUND(SAFE_DIVIDE(COUNTIF(event_name = 'purchase'), COUNT(DISTINCT user_pseudo_id)) * 100, 3) AS cvr_user_pct,
  ROUND(SAFE_DIVIDE(SUM(IF(event_name = 'purchase', revenue_usd, 0)), COUNTIF(event_name = 'purchase')), 2) AS aov,
  ROUND(SAFE_DIVIDE(
    COUNT(DISTINCT CONCAT(user_pseudo_id, CAST(session_id AS STRING))),
    COUNT(DISTINCT user_pseudo_id)), 2) AS sessions_per_user
FROM base_events
GROUP BY event_date, user_type;
