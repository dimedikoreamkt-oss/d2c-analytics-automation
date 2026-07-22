DROP TABLE IF EXISTS `d2c-analytics-502304.marts.mart_channel_deep`;
CREATE TABLE `d2c-analytics-502304.marts.mart_channel_deep`
PARTITION BY event_date AS
WITH sess AS (
  SELECT
    PARSE_DATE('%Y%m%d', event_date) AS event_date,
    user_pseudo_id,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key='ga_session_id') AS session_id,
    LOWER(IFNULL(traffic_source.source,'(direct)'))   AS source,
    LOWER(IFNULL(traffic_source.medium,'(none)'))     AS medium,
    LOWER(IFNULL(traffic_source.name,'(not set)'))    AS campaign,
    event_name,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key='engagement_time_msec') AS eng_ms,
    ecommerce.purchase_revenue                        AS purchase_revenue
  FROM `d2c-analytics-502304.analytics_537721411.events_*`
  WHERE _TABLE_SUFFIX BETWEEN
        FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 60 DAY))
    AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
),
session_agg AS (
  SELECT
    event_date, source, medium, campaign,
    user_pseudo_id, session_id,
    SUM(IF(eng_ms IS NOT NULL, eng_ms, 0))/1000                       AS session_duration_sec,
    COUNTIF(event_name='page_view')                                   AS page_views,
    COUNTIF(event_name='add_to_cart')                                 AS carts,
    COUNTIF(event_name='begin_checkout')                              AS checkouts,
    COUNTIF(event_name='purchase')                                    AS purchases,
    SUM(IF(event_name='purchase', purchase_revenue, 0))               AS revenue
  FROM sess
  WHERE session_id IS NOT NULL
  GROUP BY event_date, source, medium, campaign, user_pseudo_id, session_id
)
SELECT
  event_date, source, medium, campaign,
  COUNT(*)                                                      AS sessions,
  COUNT(DISTINCT user_pseudo_id)                                AS users,
  AVG(session_duration_sec)                                     AS avg_session_duration,
  SAFE_DIVIDE(COUNTIF(page_views<=1), COUNT(*)) * 100           AS bounce_rate,
  SUM(page_views)                                               AS page_views,
  SUM(carts)                                                    AS add_to_carts,
  SUM(checkouts)                                                AS checkouts,
  SUM(purchases)                                                AS purchases,
  SUM(revenue)                                                  AS revenue,
  SAFE_DIVIDE(SUM(purchases), COUNT(*)) * 100                   AS cvr_pct
FROM session_agg
GROUP BY event_date, source, medium, campaign;
