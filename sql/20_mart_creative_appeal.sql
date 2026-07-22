-- Mart 20: 크리에이티브 소구점(Appeal Point) 자동 분석
-- 카피 텍스트에서 소구점 태깅 → 소구점별 CTR/ROAS/CVR 비교
DROP TABLE IF EXISTS `d2c-analytics-502304.marts.mart_creative_appeal`;

CREATE TABLE `d2c-analytics-502304.marts.mart_creative_appeal`
PARTITION BY event_date AS

WITH creative_tagged AS (
  SELECT
    ad_id,
    ad_name,
    campaign_name,
    adset_name,
    body_text,
    title_text,
    -- 소구점 자동 태깅 (하나의 소재가 여러 소구점 가질 수 있음)
    ARRAY(
      SELECT appeal FROM UNNEST([
        STRUCT('할인/프로모션' AS appeal, r'(할인|세일|SALE|프로모션|이벤트|%\s*OFF|반값|특가|1\+1|무료증정)' AS pattern),
        STRUCT('무료배송', r'(무료배송|배송비\s*무료|free\s*shipping)'),
        STRUCT('후기/리뷰', r'(후기|리뷰|평가|별점|★|⭐|만족도|고객\s*추천)'),
        STRUCT('전후비교(BA)', r'(전후|비포|before\s*after|BA|변화|달라진)'),
        STRUCT('희소성/긴급성', r'(마감|한정|품절|재입고|오늘만|D-\s*\d+|24시간|매진)'),
        STRUCT('성분/기능', r'(성분|함유|추출|비타민|콜라겐|히알루론|펩타이드|천연|유기농)'),
        STRUCT('전문가/인증', r'(전문의|의사|피부과|박사|추천|인증|특허|FDA|1위|랭킹)'),
        STRUCT('가격노출', r'(₩\s*\d+|원|만원|price|price)'),
        STRUCT('사용법/튜토리얼', r'(사용법|how\s*to|방법|팁|가이드|이렇게)'),
        STRUCT('감성/스토리', r'(진짜|정말|드디어|경험|이야기|스토리|고민)'),
        STRUCT('시간효과', r'(즉시|바로|하루|일주일|한달|\d+\s*일|\d+\s*분)'),
        STRUCT('타겟명시', r'(30대|40대|50대|60대|주부|직장인|여성|엄마|피부|다이어트)')
      ]) WHERE REGEXP_CONTAINS(LOWER(IFNULL(body_text,'')||' '||IFNULL(title_text,'')), pattern)
    ) AS appeal_tags,
    CASE
      WHEN video_id IS NOT NULL THEN 'video'
      WHEN image_url IS NOT NULL THEN 'image'
      ELSE 'other'
    END AS creative_type
  FROM `d2c-analytics-502304.marts.meta_creatives`
),

creative_expanded AS (
  -- 각 소재를 소구점별로 unpivot (소재 1개 → 소구점 N개 행)
  SELECT
    ad_id, ad_name, campaign_name, adset_name, creative_type,
    appeal_tag
  FROM creative_tagged, UNNEST(appeal_tags) AS appeal_tag
  UNION ALL
  -- 소구점 없는 소재도 '미분류'로 포함
  SELECT
    ad_id, ad_name, campaign_name, adset_name, creative_type,
    '미분류' AS appeal_tag
  FROM creative_tagged
  WHERE ARRAY_LENGTH(appeal_tags) = 0
),

daily_perf AS (
  SELECT
    event_date,
    ad_id,
    SUM(impressions) AS impressions,
    SUM(reach) AS reach,
    SUM(spend_krw) AS spend_krw,
    SUM(clicks) AS clicks,
    SUM(meta_purchases) AS meta_purchases,
    SUM(meta_purchase_value) AS meta_purchase_value,
    SUM(ga_sessions) AS ga_sessions,
    SUM(ga_add_to_cart) AS ga_add_to_cart,
    SUM(ga_purchases) AS ga_purchases,
    SUM(ga_revenue) AS ga_revenue
  FROM `d2c-analytics-502304.marts.mart_creative_performance`
  WHERE event_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 60 DAY)
  GROUP BY event_date, ad_id
)

SELECT
  d.event_date,
  ce.appeal_tag,
  ce.creative_type,
  COUNT(DISTINCT ce.ad_id) AS creative_count,
  SUM(d.impressions) AS impressions,
  SUM(d.spend_krw) AS spend_krw,
  SUM(d.clicks) AS clicks,
  SAFE_DIVIDE(SUM(d.clicks), NULLIF(SUM(d.impressions),0)) * 100 AS ctr_pct,
  SAFE_DIVIDE(SUM(d.spend_krw), NULLIF(SUM(d.clicks),0)) AS cpc_krw,
  SAFE_DIVIDE(SUM(d.spend_krw)*1000, NULLIF(SUM(d.impressions),0)) AS cpm_krw,
  SUM(d.meta_purchases) AS meta_purchases,
  SUM(d.meta_purchase_value) AS meta_purchase_value,
  SAFE_DIVIDE(SUM(d.meta_purchase_value), NULLIF(SUM(d.spend_krw),0)) AS meta_roas,
  SUM(d.ga_sessions) AS ga_sessions,
  SUM(d.ga_add_to_cart) AS ga_add_to_cart,
  SUM(d.ga_purchases) AS ga_purchases,
  SUM(d.ga_revenue) AS ga_revenue,
  SAFE_DIVIDE(SUM(d.ga_revenue), NULLIF(SUM(d.spend_krw),0)) AS ga_roas,
  SAFE_DIVIDE(SUM(d.ga_purchases), NULLIF(SUM(d.ga_sessions),0)) * 100 AS ga_cvr_pct,
  SAFE_DIVIDE(SUM(d.spend_krw), NULLIF(SUM(d.ga_purchases),0)) AS ga_cac_krw
FROM creative_expanded ce
LEFT JOIN daily_perf d ON ce.ad_id = d.ad_id
WHERE d.event_date IS NOT NULL
GROUP BY d.event_date, ce.appeal_tag, ce.creative_type;
