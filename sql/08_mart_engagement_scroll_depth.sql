DROP TABLE IF EXISTS `d2c-analytics-502304.marts.mart_engagement_scroll_depth`;

CREATE TABLE `d2c-analytics-502304.marts.mart_engagement_scroll_depth`
PARTITION BY event_date AS

WITH base_events AS (
  SELECT
    PARSE_DATE('%Y%m%d', event_date) AS event_date,
    user_pseudo_id,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS session_id,
    event_name,
    event_timestamp,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'percent_scrolled') AS percent_scrolled,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'link_url') AS link_url,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'outbound') AS outbound_flag,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'file_name') AS file_name,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'video_percent') AS video_percent,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'engagement_time_msec') AS engagement_time_msec
  FROM `d2c-analytics-502304.analytics_537721411.events_*`
  WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY))
                          AND FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY))
    AND event_name IN ('scroll','click','file_download','video_start','video_progress','video_complete','page_view')
),

session_actions AS (
  SELECT
    event_date,
    user_pseudo_id,
    session_id,
    MAX(CASE WHEN event_name = 'scroll' AND percent_scrolled >= 90 THEN 1 ELSE 0 END) AS scrolled_90pct,
    MAX(CASE WHEN event_name = 'file_download' THEN 1 ELSE 0 END) AS downloaded_file,
    MAX(CASE WHEN event_name = 'video_start' THEN 1 ELSE 0 END) AS started_video,
    MAX(CASE WHEN event_name = 'video_complete' THEN 1 ELSE 0 END) AS completed_video,
    MAX(CASE WHEN event_name = 'click' AND outbound_flag = 'true' THEN 1 ELSE 0 END) AS clicked_outbound,
    COUNTIF(event_name = 'page_view') AS pageviews,
    SUM(engagement_time_msec) / 1000.0 AS engagement_seconds
  FROM base_events
  GROUP BY event_date, user_pseudo_id, session_id
),

scored AS (
  SELECT
    *,
    (scrolled_90pct + downloaded_file + started_video + completed_video + clicked_outbound) AS action_score,
    CASE
      WHEN (scrolled_90pct + downloaded_file + started_video + completed_video + clicked_outbound) >= 2
        OR engagement_seconds >= 60 THEN 'high'
      WHEN (scrolled_90pct + downloaded_file + started_video + completed_video + clicked_outbound) >= 1
        OR engagement_seconds >= 15 THEN 'medium'
      ELSE 'low'
    END AS engagement_tier
  FROM session_actions
)

SELECT
  event_date,
  engagement_tier,
  COUNT(DISTINCT user_pseudo_id) AS users,
  COUNT(DISTINCT session_id) AS sessions,
  ROUND(AVG(pageviews), 2) AS avg_pageviews_per_session,
  ROUND(AVG(engagement_seconds), 1) AS avg_engagement_seconds,
  SUM(scrolled_90pct) AS scroll_90pct_sessions,
  SUM(downloaded_file) AS download_sessions,
  SUM(started_video) AS video_start_sessions,
  SUM(completed_video) AS video_complete_sessions,
  SUM(clicked_outbound) AS outbound_click_sessions
FROM scored
GROUP BY event_date, engagement_tier;
