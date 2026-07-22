DROP TABLE IF EXISTS `d2c-analytics-502304.marts.mart_creative_platform`;
CREATE TABLE `d2c-analytics-502304.marts.mart_creative_platform`
PARTITION BY event_date AS
SELECT
  event_date, ad_id, ad_name, campaign_name, adset_name,
  IFNULL(publisher_platform, 'unknown') AS publisher_platform,
  IFNULL(platform_position,  'unknown') AS platform_position,
  IFNULL(device_platform,    'unknown') AS device_platform,
  SUM(impressions) AS impressions,
  SUM(clicks)      AS clicks,
  SUM(spend_krw)   AS spend_krw,
  SUM(meta_purchases)      AS purchases,
  SUM(meta_purchase_value) AS revenue,
  SAFE_DIVIDE(SUM(clicks),NULLIF(SUM(impressions),0)) * 100 AS ctr_pct,
  SAFE_DIVIDE(SUM(meta_purchases),NULLIF(SUM(clicks),0)) * 100 AS click_cvr_pct,
  SAFE_DIVIDE(SUM(meta_purchase_value),NULLIF(SUM(spend_krw),0)) AS roas
FROM `d2c-analytics-502304.marts.meta_ad_insights_platform`
GROUP BY event_date, ad_id, ad_name, campaign_name, adset_name,
         publisher_platform, platform_position, device_platform;
