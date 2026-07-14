CREATE OR REPLACE TABLE `d2c-analytics-502304.marts.mart_time_pattern_heatmap`
CLUSTER BY day_of_week_num, hour_of_day AS
WITH base_events AS (
  SELECT
    DATETIME(TIMESTAMP_MICROS(event_timestamp), 'Asia/Seoul') AS event_datetime_kst,
    user_pseudo_id,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS session_id,
    event_name,
    ecommerce.purchase_revenue_in_usd AS revenue_usd
  FROM `d2c-analytics-502304.analytics_537721411.events_*`
  WHERE _TABLE_SUFFIX NOT LIKE 'intraday%'
)
SELECT
  EXTRACT(DAYOFWEEK FROM event_datetime_kst) AS day_of_week_num,   -- 1=일요일 ... 7=토요일
  FORMAT_DATETIME('%A', event_datetime_kst) AS day_of_week,
  EXTRACT(HOUR FROM event_datetime_kst) AS hour_of_day,
  COUNT(DISTINCT user_pseudo_id) AS users,
  COUNT(DISTINCT CONCAT(user_pseudo_id, CAST(session_id AS STRING))) AS sessions,
  COUNTIF(event_name = 'add_to_cart') AS add_to_carts,
  COUNTIF(event_name = 'purchase') AS purchases,
  ROUND(SUM(IF(event_name = 'purchase', revenue_usd, 0)), 2) AS revenue,
  ROUND(SAFE_DIVIDE(
    COUNTIF(event_name = 'purchase'),
    COUNT(DISTINCT CONCAT(user_pseudo_id, CAST(session_id AS STRING)))) * 100, 3) AS cvr_session_pct
FROM base_events
GROUP BY day_of_week_num, day_of_week, hour_of_day;
