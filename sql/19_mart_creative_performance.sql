-- Mart 19: 광고 소재별 Meta + GA4 통합 성과
DROP TABLE IF EXISTS `d2c-analytics-502304.marts.mart_creative_performance`;

CREATE TABLE `d2c-analytics-502304.marts.mart_creative_performance`
PARTITION BY event_date AS

WITH meta_perf AS (
  SELECT
    event_date, ad_id, ad_name, campaign_name, adset_name,
    SUM(impressions) AS impressions,
    SUM(reach) AS reach,
    AVG(frequency) AS frequency,
    SUM(spend_krw) AS spend_krw,
    SAFE_DIVIDE(SUM(spend_krw), NULLIF(SUM(clicks), 0))          AS cpc,
    SAFE_DIVIDE(SUM(spend_krw)*1000, NULLIF(SUM(impressions),0)) AS cpm,
    SUM(clicks) AS clicks,
    SAFE_DIVIDE(SUM(clicks), NULLIF(SUM(impressions),0)) * 100    AS ctr_pct,
    SUM(clicks) AS link_clicks,
    SAFE_DIVIDE(SUM(clicks), NULLIF(SUM(impressions),0)) * 100    AS link_ctr_pct,
    SUM(meta_purchases) AS meta_purchases,
    CAST(NULL AS INT64)   AS meta_add_to_cart,
    CAST(NULL AS INT64)   AS meta_initiate_checkout,
    CAST(NULL AS INT64)   AS meta_view_content,
    SUM(meta_purchase_value) AS meta_purchase_value,
    SAFE_DIVIDE(SUM(meta_purchase_value), NULLIF(SUM(spend_krw),0)) AS meta_roas,
    CAST(NULL AS INT64)   AS video_p25,
    CAST(NULL AS INT64)   AS video_p50,
    CAST(NULL AS INT64)   AS video_p75,
    CAST(NULL AS INT64)   AS video_p100,
    CAST(NULL AS FLOAT64) AS video_avg_watch_sec,
    CAST(NULL AS FLOAT64) AS video_hold_rate_pct
  FROM `d2c-analytics-502304.marts.meta_ad_insights`
  WHERE event_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 60 DAY)
  GROUP BY event_date, ad_id, ad_name, campaign_name, adset_name
),

ga_events AS (
  SELECT
    PARSE_DATE('%Y%m%d', event_date) AS event_date,
    user_pseudo_id,
    (SELECT value.int_value    FROM UNNEST(event_params) WHERE key = 'ga_session_id')       AS session_id,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'content')             AS utm_content,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'source')              AS utm_source,
    event_name,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'engagement_time_msec')   AS engagement_msec,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'percent_scrolled')       AS percent_scrolled,
    ecommerce.purchase_revenue                                                              AS revenue
  FROM `d2c-analytics-502304.analytics_537721411.events_*`
  WHERE _TABLE_SUFFIX BETWEEN
        FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 60 DAY))
    AND FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY))
),

ga_session_agg AS (
  SELECT
    event_date,
    utm_content AS ad_id,
    user_pseudo_id,
    session_id,
    SUM(engagement_msec) / 1000.0 AS engagement_sec,
    MAX(percent_scrolled) AS max_scroll_depth,
    MAX(CASE WHEN event_name = 'view_item'       THEN 1 ELSE 0 END) AS viewed_pdp,
    MAX(CASE WHEN event_name = 'add_to_cart'     THEN 1 ELSE 0 END) AS added_cart,
    MAX(CASE WHEN event_name = 'login'           THEN 1 ELSE 0 END) AS logged_in,
    MAX(CASE WHEN event_name = 'sign_up'         THEN 1 ELSE 0 END) AS signed_up,
    MAX(CASE WHEN event_name = 'begin_checkout'  THEN 1 ELSE 0 END) AS began_checkout,
    MAX(CASE WHEN event_name = 'purchase'        THEN 1 ELSE 0 END) AS purchased,
    SUM(CASE WHEN event_name = 'purchase' THEN revenue ELSE 0 END)  AS session_revenue
  FROM ga_events
  WHERE LOWER(IFNULL(utm_source, '')) IN ('meta_asc','meta','facebook','fb','ig','instagram')
    AND utm_content IS NOT NULL AND utm_content != ''
  GROUP BY event_date, ad_id, user_pseudo_id, session_id
),

ga_ad_agg AS (
  SELECT
    event_date, ad_id,
    COUNT(DISTINCT user_pseudo_id)                              AS ga_users,
    COUNT(DISTINCT session_id)                                  AS ga_sessions,
    AVG(engagement_sec)                                         AS avg_engagement_sec,
    AVG(max_scroll_depth)                                       AS avg_scroll_depth_pct,
    SUM(viewed_pdp)                                             AS ga_pdp_views,
    SUM(added_cart)                                             AS ga_add_to_cart,
    SUM(logged_in)                                              AS ga_logins,
    SUM(signed_up)                                              AS ga_signups,
    SUM(began_checkout)                                         AS ga_checkouts,
    SUM(purchased)                                              AS ga_purchases,
    SUM(session_revenue)                                        AS ga_revenue,
    SAFE_DIVIDE(SUM(purchased), COUNT(DISTINCT session_id))*100 AS ga_session_cvr_pct
  FROM ga_session_agg
  GROUP BY event_date, ad_id
)

SELECT
  m.event_date, m.ad_id, m.ad_name, m.campaign_name, m.adset_name,
  m.impressions, m.reach, m.frequency,
  m.spend_krw, m.cpc, m.cpm,
  m.clicks, m.ctr_pct, m.link_clicks, m.link_ctr_pct,
  m.meta_purchases, m.meta_add_to_cart, m.meta_initiate_checkout, m.meta_view_content,
  m.meta_purchase_value, m.meta_roas,
  m.video_p25, m.video_p50, m.video_p75, m.video_p100,
  m.video_avg_watch_sec, m.video_hold_rate_pct,
  g.ga_users, g.ga_sessions,
  ROUND(g.avg_engagement_sec, 1)   AS ga_avg_engagement_sec,
  ROUND(g.avg_scroll_depth_pct, 1) AS ga_avg_scroll_depth_pct,
  g.ga_pdp_views, g.ga_add_to_cart, g.ga_logins, g.ga_signups,
  g.ga_checkouts, g.ga_purchases, g.ga_revenue, g.ga_session_cvr_pct,
  ROUND(SAFE_DIVIDE(m.spend_krw, NULLIF(g.ga_purchases, 0)), 0) AS ga_cac_krw,
  ROUND(SAFE_DIVIDE(g.ga_revenue, NULLIF(m.spend_krw, 0)),   3) AS ga_roas
FROM meta_perf m
LEFT JOIN ga_ad_agg g
  ON m.event_date = g.event_date AND m.ad_id = g.ad_id;
