CREATE OR REPLACE TABLE `d2c-analytics-502304.marts.mart_attribution_multi_touch`
PARTITION BY event_date AS
WITH touchpoints AS (
  SELECT
    user_pseudo_id,
    DATE(TIMESTAMP_MICROS(event_timestamp), 'Asia/Seoul') AS event_date,
    event_timestamp,
    COALESCE(traffic_source.source, '(direct)') AS source,
    COALESCE(traffic_source.medium, '(none)') AS medium,
    COALESCE(traffic_source.name, '(not set)') AS campaign
  FROM `d2c-analytics-502304.analytics_537721411.events_*`
  WHERE _TABLE_SUFFIX NOT LIKE 'intraday%'
    AND event_name = 'session_start'
),
purchases AS (
  SELECT
    user_pseudo_id,
    DATE(TIMESTAMP_MICROS(event_timestamp), 'Asia/Seoul') AS purchase_date,
    event_timestamp AS purchase_timestamp,
    ecommerce.purchase_revenue_in_usd AS revenue_usd,
    ROW_NUMBER() OVER (PARTITION BY user_pseudo_id ORDER BY event_timestamp) AS purchase_seq
  FROM `d2c-analytics-502304.analytics_537721411.events_*`
  WHERE _TABLE_SUFFIX NOT LIKE 'intraday%'
    AND event_name = 'purchase'
    AND ecommerce.purchase_revenue_in_usd IS NOT NULL
),
touchpoints_before_purchase AS (
  SELECT
    p.user_pseudo_id,
    p.purchase_date,
    p.purchase_timestamp,
    p.revenue_usd,
    p.purchase_seq,
    t.source, t.medium, t.campaign, t.event_timestamp AS touch_timestamp,
    ROW_NUMBER() OVER (
      PARTITION BY p.user_pseudo_id, p.purchase_seq
      ORDER BY t.event_timestamp ASC
    ) AS touch_order_asc,
    ROW_NUMBER() OVER (
      PARTITION BY p.user_pseudo_id, p.purchase_seq
      ORDER BY t.event_timestamp DESC
    ) AS touch_order_desc,
    COUNT(*) OVER (PARTITION BY p.user_pseudo_id, p.purchase_seq) AS total_touches
  FROM purchases p
  JOIN touchpoints t
    ON t.user_pseudo_id = p.user_pseudo_id
    AND t.event_timestamp <= p.purchase_timestamp
    AND TIMESTAMP_MICROS(t.event_timestamp) >= TIMESTAMP_SUB(TIMESTAMP_MICROS(p.purchase_timestamp), INTERVAL 30 DAY)
),
attributed AS (
  SELECT
    purchase_date AS event_date,
    user_pseudo_id, purchase_seq, source, medium, campaign,
    revenue_usd, total_touches,
    IF(touch_order_asc = 1, revenue_usd, 0) AS first_touch_revenue,
    IF(touch_order_desc = 1, revenue_usd, 0) AS last_touch_revenue,
    revenue_usd / total_touches AS linear_revenue,
    CASE
      WHEN total_touches = 1 THEN revenue_usd
      WHEN total_touches = 2 THEN
        IF(touch_order_asc = 1, revenue_usd * 0.5, revenue_usd * 0.5)
      ELSE
        CASE
          WHEN touch_order_asc = 1 THEN revenue_usd * 0.4
          WHEN touch_order_desc = 1 THEN revenue_usd * 0.4
          ELSE (revenue_usd * 0.2) / (total_touches - 2)
        END
    END AS position_based_revenue
  FROM touchpoints_before_purchase
)
SELECT
  event_date, source, medium, campaign,
  COUNT(DISTINCT CONCAT(user_pseudo_id, '-', CAST(purchase_seq AS STRING))) AS conversions_touched,
  ROUND(SUM(first_touch_revenue), 2) AS first_touch_revenue,
  ROUND(SUM(last_touch_revenue), 2) AS last_touch_revenue,
  ROUND(SUM(linear_revenue), 2) AS linear_revenue,
  ROUND(SUM(position_based_revenue), 2) AS position_based_revenue
FROM attributed
GROUP BY event_date, source, medium, campaign;
