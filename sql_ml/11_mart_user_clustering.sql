-- 1단계: RFM 특성으로 K-means 모델 학습
CREATE OR REPLACE MODEL `d2c-analytics-502304.marts.model_user_clusters`
OPTIONS(
  MODEL_TYPE = 'KMEANS',
  NUM_CLUSTERS = 4,
  STANDARDIZE_FEATURES = TRUE
) AS
WITH user_purchases AS (
  SELECT
    user_pseudo_id,
    PARSE_DATE('%Y%m%d', event_date) AS purchase_date,
    ecommerce.purchase_revenue AS revenue
  FROM `d2c-analytics-502304.analytics_537721411.events_*`
  WHERE event_name = 'purchase'
),
user_features AS (
  SELECT
    user_pseudo_id,
    DATE_DIFF(CURRENT_DATE(), MAX(purchase_date), DAY) AS recency_days,
    COUNT(*) AS frequency,
    SUM(revenue) AS monetary
  FROM user_purchases
  GROUP BY user_pseudo_id
)
SELECT recency_days, frequency, monetary
FROM user_features;

-- 2단계: 각 사용자에게 군집 번호 부여
DROP TABLE IF EXISTS `d2c-analytics-502304.marts.mart_user_clustering`;

CREATE TABLE `d2c-analytics-502304.marts.mart_user_clustering` AS
WITH user_purchases AS (
  SELECT
    user_pseudo_id,
    PARSE_DATE('%Y%m%d', event_date) AS purchase_date,
    ecommerce.purchase_revenue AS revenue
  FROM `d2c-analytics-502304.analytics_537721411.events_*`
  WHERE event_name = 'purchase'
),
user_features AS (
  SELECT
    user_pseudo_id,
    DATE_DIFF(CURRENT_DATE(), MAX(purchase_date), DAY) AS recency_days,
    COUNT(*) AS frequency,
    SUM(revenue) AS monetary
  FROM user_purchases
  GROUP BY user_pseudo_id
)
SELECT
  user_pseudo_id,
  recency_days,
  frequency,
  monetary,
  CENTROID_ID AS cluster_id
FROM ML.PREDICT(
  MODEL `d2c-analytics-502304.marts.model_user_clusters`,
  (SELECT user_pseudo_id, recency_days, frequency, monetary FROM user_features)
);
