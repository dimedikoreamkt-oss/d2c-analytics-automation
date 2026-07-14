-- 1단계: 일별 매출 시계열로 ARIMA+ 모델 학습
CREATE OR REPLACE MODEL `d2c-analytics-502304.marts.model_daily_revenue_arima`
OPTIONS(
  MODEL_TYPE = 'ARIMA_PLUS',
  TIME_SERIES_TIMESTAMP_COL = 'event_date',
  TIME_SERIES_DATA_COL = 'daily_revenue',
  AUTO_ARIMA = TRUE,
  DATA_FREQUENCY = 'DAILY',
  HOLIDAY_REGION = 'KR'
) AS
SELECT
  PARSE_DATE('%Y%m%d', event_date) AS event_date,
  SUM(ecommerce.purchase_revenue) AS daily_revenue
FROM `d2c-analytics-502304.analytics_537721411.events_*`
WHERE event_name = 'purchase'
GROUP BY event_date;

-- 2단계: 이상치 탐지 결과를 테이블로 저장
DROP TABLE IF EXISTS `d2c-analytics-502304.marts.mart_anomaly_detection`;

CREATE TABLE `d2c-analytics-502304.marts.mart_anomaly_detection` AS
SELECT
  event_date,
  daily_revenue AS actual_revenue,
  is_anomaly,
  lower_bound,
  upper_bound,
  anomaly_probability
FROM ML.DETECT_ANOMALIES(
  MODEL `d2c-analytics-502304.marts.model_daily_revenue_arima`,
  STRUCT(0.95 AS anomaly_prob_threshold)
);
