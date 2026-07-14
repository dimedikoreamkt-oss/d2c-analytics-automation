CREATE OR REPLACE TABLE `d2c-analytics-502304.marts.mart_cohort_retention`
PARTITION BY cohort_week AS
WITH base_events AS (
  SELECT
    user_pseudo_id,
    DATE(TIMESTAMP_MICROS(event_timestamp), 'Asia/Seoul') AS event_date,
    event_name,
    ecommerce.purchase_revenue_in_usd AS revenue_usd
  FROM `d2c-analytics-502304.analytics_537721411.events_*`
  WHERE _TABLE_SUFFIX NOT LIKE 'intraday%'
    AND event_name IN ('session_start','purchase')
),
user_cohort AS (
  SELECT
    user_pseudo_id,
    DATE_TRUNC(MIN(event_date), WEEK(MONDAY)) AS cohort_week
  FROM base_events
  GROUP BY user_pseudo_id
),
user_activity_week AS (
  SELECT
    b.user_pseudo_id,
    c.cohort_week,
    DATE_TRUNC(b.event_date, WEEK(MONDAY)) AS activity_week,
    DATE_DIFF(DATE_TRUNC(b.event_date, WEEK(MONDAY)), c.cohort_week, WEEK) AS week_number,
    b.event_name,
    b.revenue_usd
  FROM base_events b
  JOIN user_cohort c USING (user_pseudo_id)
),
cohort_sizes AS (
  SELECT cohort_week, COUNT(DISTINCT user_pseudo_id) AS cohort_size
  FROM user_cohort
  GROUP BY cohort_week
),
weekly_agg AS (
  SELECT
    cohort_week,
    week_number,
    COUNT(DISTINCT IF(event_name = 'session_start', user_pseudo_id, NULL)) AS retained_users,
    COUNT(DISTINCT IF(event_name = 'purchase', user_pseudo_id, NULL)) AS repurchase_users,
    ROUND(SUM(IF(event_name = 'purchase', revenue_usd, 0)), 2) AS revenue
  FROM user_activity_week
  WHERE week_number >= 0
  GROUP BY cohort_week, week_number
)
SELECT
  w.cohort_week,
  s.cohort_size,
  w.week_number,
  w.retained_users,
  ROUND(SAFE_DIVIDE(w.retained_users, s.cohort_size) * 100, 2) AS retention_rate_pct,
  w.repurchase_users,
  ROUND(SAFE_DIVIDE(w.repurchase_users, s.cohort_size) * 100, 2) AS repurchase_rate_pct,
  w.revenue
FROM weekly_agg w
JOIN cohort_sizes s USING (cohort_week);
