-- Mart 25: 랜딩 페이지 URL별 성과 분석 (v2 - GTM 커스텀 스크롤 이벤트 지원)
DROP TABLE IF EXISTS `d2c-analytics-502304.marts.mart_landing_performance`;

CREATE TABLE `d2c-analytics-502304.marts.mart_landing_performance`
PARTITION BY event_date AS

WITH ga_events AS (
  SELECT
    PARSE_DATE('%Y%m%d', event_date) AS event_date,
    user_pseudo_id,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key='ga_session_id') AS session_id,
    event_name,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key='page_location') AS page_location,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key='page_title')    AS page_title,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key='page_referrer') AS page_referrer,
    (SELECT value.int_value    FROM UNNEST(event_params) WHERE key='engagement_time_msec') AS engagement_msec,
    (SELECT value.int_value    FROM UNNEST(event_params) WHERE key='percent_scrolled')     AS percent_scrolled,
    LOWER(IFNULL(traffic_source.source, '(direct)')) AS source,
    LOWER(IFNULL(traffic_source.medium, '(none)'))   AS medium,
    LOWER(IFNULL(traffic_source.name,   '(not set)'))AS campaign,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key='content') AS utm_content,
    ecommerce.purchase_revenue AS purchase_revenue,
    ecommerce.transaction_id AS transaction_id
  FROM `d2c-analytics-502304.analytics_537721411.events_*`
  WHERE _TABLE_SUFFIX BETWEEN
        FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 60 DAY))
    AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
    AND (SELECT value.string_value FROM UNNEST(event_params) WHERE key='page_location') IS NOT NULL
),

first_landing AS (
  SELECT
    event_date, user_pseudo_id, session_id,
    ARRAY_AGG(page_location ORDER BY (SELECT MIN(TIMESTAMP_MICROS(0)) FROM UNNEST([1]))
              LIMIT 1)[OFFSET(0)] AS landing_url
  FROM ga_events
  WHERE event_name = 'page_view'
  GROUP BY event_date, user_pseudo_id, session_id
),

session_metrics AS (
  SELECT
    e.event_date,
    e.user_pseudo_id,
    e.session_id,
    ANY_VALUE(fl.landing_url)                              AS landing_url,
    ANY_VALUE(e.utm_content)                                AS utm_content,
    ANY_VALUE(e.source)                                     AS source,
    ANY_VALUE(e.medium)                                     AS medium,
    SUM(IF(e.engagement_msec IS NOT NULL, e.engagement_msec, 0))/1000 AS engagement_sec,
    
    -- ✅ 수정: GTM 커스텀 스크롤 이벤트 개별 감지
    MAX(IF(e.event_name = '10% Scroll',  1, 0)) AS reached_10,
    MAX(IF(e.event_name = '25% Scroll',  1, 0)) AS reached_25,
    MAX(IF(e.event_name = '50% Scroll',  1, 0)) AS reached_50,
    MAX(IF(e.event_name = '75% Scroll',  1, 0)) AS reached_75,
    MAX(IF(e.event_name = 'scroll' AND e.percent_scrolled = 90, 1, 0)) AS reached_90,
    MAX(IF(e.event_name = '100% Scroll', 1, 0)) AS reached_100,
    
    -- ✅ 세션의 최대 스크롤 % 계산 (평균 스크롤 깊이용)
    GREATEST(
      MAX(IF(e.event_name = '100% Scroll', 100, 0)),
      MAX(IF(e.event_name = 'scroll' AND e.percent_scrolled = 90, 90, 0)),
      MAX(IF(e.event_name = '75% Scroll',  75, 0)),
      MAX(IF(e.event_name = '50% Scroll',  50, 0)),
      MAX(IF(e.event_name = '25% Scroll',  25, 0)),
      MAX(IF(e.event_name = '10% Scroll',  10, 0))
    ) AS max_scroll_pct,
    
    COUNTIF(e.event_name = 'page_view')                     AS page_views,
    COUNTIF(e.event_name = 'view_item')                     AS pdp_views,
    COUNTIF(e.event_name = 'add_to_cart')                   AS carts,
    COUNTIF(e.event_name = 'begin_checkout')                AS checkouts,
    COUNTIF(e.event_name = 'purchase')                      AS purchases,
    SUM(IF(e.event_name='purchase', e.purchase_revenue, 0)) AS revenue
  FROM ga_events e
  LEFT JOIN first_landing fl
    ON e.event_date = fl.event_date
   AND e.user_pseudo_id = fl.user_pseudo_id
   AND e.session_id = fl.session_id
  WHERE e.session_id IS NOT NULL
    AND fl.landing_url IS NOT NULL
  GROUP BY e.event_date, e.user_pseudo_id, e.session_id
),

landing_agg AS (
  SELECT
    event_date,
    REGEXP_REPLACE(landing_url, r'\?.*$', '') AS landing_url,
    REGEXP_EXTRACT(REGEXP_REPLACE(landing_url, r'\?.*$', ''),
                   r'https?://[^/]+(/.*)?')   AS landing_path,
    COUNT(*)                                                          AS sessions,
    COUNT(DISTINCT user_pseudo_id)                                    AS users,
    AVG(engagement_sec)                                               AS avg_engagement_sec,
    AVG(max_scroll_pct)                                               AS avg_scroll_pct,
    COUNTIF(engagement_sec < 10)                                      AS quick_exit_sessions,
    COUNTIF(page_views <= 1)                                          AS bounce_sessions,
    
    -- ✅ 각 스크롤 단계별 실제 도달 세션 수 (누적 방식: 상위 단계 도달 = 하위도 도달)
    SUM(GREATEST(reached_10, reached_25, reached_50, reached_75, reached_90, reached_100))  AS scroll_10_sessions,
    SUM(GREATEST(reached_25, reached_50, reached_75, reached_90, reached_100))               AS scroll_25_sessions,
    SUM(GREATEST(reached_50, reached_75, reached_90, reached_100))                            AS scroll_50_sessions,
    SUM(GREATEST(reached_75, reached_90, reached_100))                                         AS scroll_75_sessions,
    SUM(GREATEST(reached_90, reached_100))                                                     AS scroll_90_sessions,
    SUM(reached_100)                                                                            AS scroll_100_sessions,
    
    SUM(pdp_views)                                                    AS pdp_views,
    SUM(carts)                                                        AS add_to_carts,
    SUM(checkouts)                                                    AS checkouts,
    SUM(purchases)                                                    AS purchases,
    SUM(revenue)                                                      AS revenue,
    APPROX_TOP_COUNT(utm_content, 1)[SAFE_OFFSET(0)].value            AS top_utm_content
  FROM session_metrics
  WHERE landing_url IS NOT NULL
  GROUP BY event_date, landing_url, landing_path
)

SELECT
  event_date,
  landing_url,
  landing_path,
  sessions,
  users,
  ROUND(avg_engagement_sec, 1)                                        AS avg_engagement_sec,
  ROUND(avg_scroll_pct, 1)                                            AS avg_scroll_pct,
  quick_exit_sessions,
  bounce_sessions,
  scroll_10_sessions,
  scroll_25_sessions,
  scroll_50_sessions,
  scroll_75_sessions,
  scroll_90_sessions,
  scroll_100_sessions,
  pdp_views,
  add_to_carts,
  checkouts,
  purchases,
  revenue,
  SAFE_DIVIDE(bounce_sessions,      sessions) * 100 AS bounce_rate_pct,
  SAFE_DIVIDE(quick_exit_sessions,  sessions) * 100 AS quick_exit_rate_pct,
  SAFE_DIVIDE(scroll_10_sessions,   sessions) * 100 AS reach_10_pct,
  SAFE_DIVIDE(scroll_25_sessions,   sessions) * 100 AS reach_25_pct,
  SAFE_DIVIDE(scroll_50_sessions,   sessions) * 100 AS reach_50_pct,
  SAFE_DIVIDE(scroll_75_sessions,   sessions) * 100 AS reach_75_pct,
  SAFE_DIVIDE(scroll_90_sessions,   sessions) * 100 AS reach_90_pct,
  SAFE_DIVIDE(scroll_100_sessions,  sessions) * 100 AS reach_100_pct,
  SAFE_DIVIDE(add_to_carts,         sessions) * 100 AS atc_rate_pct,
  SAFE_DIVIDE(checkouts,            sessions) * 100 AS checkout_rate_pct,
  SAFE_DIVIDE(purchases,            sessions) * 100 AS session_cvr_pct,
  SAFE_DIVIDE(purchases,            add_to_carts) * 100 AS cart_conversion_pct,
  SAFE_DIVIDE(revenue,              sessions)     AS revenue_per_session,
  SAFE_DIVIDE(revenue,              NULLIF(purchases,0)) AS aov,
  top_utm_content
FROM landing_agg;
