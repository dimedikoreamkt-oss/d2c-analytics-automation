CREATE OR REPLACE TABLE `d2c-analytics-502304.marts.mart_engagement_scroll_depth`
PARTITION BY event_date
CLUSTER BY engagement_tier AS
WITH base_events AS (
  SELECT
    DATE(TIMESTAMP_MICROS(event_timestamp), 'Asia/Seoul') AS event_date,
    user_pseudo_id,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS session_id,
    event_name,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'percent_scrolled') AS percent_scrolled,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'engagement_time_msec') AS engagement_time_msec,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'file_name') AS file_name,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'link_url') AS link_url
  FROM `d2c-analytics-502304.analytics_537721411.events_*`
  WHERE _TABLE_SUFFIX NOT LIKE 'intraday%'
    AND event_name IN ('scroll','click','file_download','video_start','video_progress','video_complete','user_engagement','page_view')
),
session_agg AS (
  SELECT
    event_date,
    user_pseudo_id,
    session_id,
    MAX(IF(event_name = 'scroll', 1, 0)) AS scrolled_90pct,
    MAX(IF(event_name = 'file_download', 1, 0)) AS downloaded_file,
    MAX(IF(event_name = 'video_start', 1, 0)) AS started_video,
    MAX(IF(event_name = 'video_complete', 1, 0)) AS completed_video,
    MAX(IF(event_name = 'click' AND link_url IS NOT NULL, 1, 0)) AS clicked_outbound,
    COUNTIF(event_name = 'page_view') AS pageviews_in_session,
    SUM(IF(event_name = 'user_engagement', engagement_time_msec, 0)) AS total_engagement_msec
  FROM base_events
  GROUP BY event_date, user_pseudo_id, session_id
),
scored AS (
  SELECT *,
    (scrolled_90pct + downloaded_file + started_video + completed_video + clicked_outbound) AS engagement_action_count,
    ROUND(total_engagement_msec / 1000.0, 1) AS engagement_seconds,
    CASE
      WHEN (scrolled_90pct + downloaded_file + completed_video) >= 2 OR total_engagement_msec >= 60000 THEN 'high'
      WHEN (scrolled_90pct + downloaded_file + started_video + clicked_outbound) >= 1 OR total_engagement_msec >= 15000 THEN 'medium'
      ELSE 'low'
    END AS engagement_tier
  FROM session_agg
)
SELECT
  event_date,
  engagement_tier,
  COUNT(DISTINCT user_pseudo_id) AS users,
  COUNT(*) AS sessions,
  ROUND(AVG(pageviews_in_session), 2) AS avg_pageviews_per_session,
  ROUND(AVG(engagement_seconds), 1) AS avg_engagement_seconds,
  SUM(scrolled_90pct) AS sessions_scrolled_90pct,
  SUM(downloaded_file) AS sessions_downloaded_file,
  SUM(started_video) AS sessions_started_video,
  SUM(completed_video) AS sessions_completed_video,
  SUM(clicked_outbound) AS sessions_clicked_outbound
FROM scored
GROUP BY event_date, engagement_tier;
