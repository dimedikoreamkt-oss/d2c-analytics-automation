-- Mart 22: 시장 승자 광고 자동 판정 + 소구점 태깅
DROP TABLE IF EXISTS `d2c-analytics-502304.marts.mart_market_winners`;

CREATE TABLE `d2c-analytics-502304.marts.mart_market_winners` AS

WITH appeal_dict AS (
  SELECT '할인/프로모션' AS tag, r'(할인|세일|SALE|프로모션|반값|특가|1\+1|무료증정)' AS pattern UNION ALL
  SELECT '전후비교(BA)', r'(전후|비포|before\s*after|BA|변화|달라진|before|after)' UNION ALL
  SELECT '시술대체', r'(시술|병원|리쥬란|울쎄라|인모드|보톡스|필러|대신)' UNION ALL
  SELECT '홈케어/셀프', r'(홈케어|셀프|집에서|매일\s*\d+분|하루\s*\d+분)' UNION ALL
  SELECT '디바이스/기기', r'(마사지기|기기|디바이스|EMS|LED|저주파|초음파|미세전류)' UNION ALL
  SELECT '리프팅/탄력', r'(리프팅|탄력|처짐|당김|주름|팽팽)' UNION ALL
  SELECT '얼굴형/윤곽', r'(안면윤곽|V\s*라인|턱선|광대|처진볼|이중턱|볼살)' UNION ALL
  SELECT '후기/리뷰', r'(후기|리뷰|만족|평가|별점|★|⭐)' UNION ALL
  SELECT '전문가/인증', r'(전문의|의사|피부과|박사|인증|특허|FDA|1위)' UNION ALL
  SELECT '희소성/긴급성', r'(마감|한정|품절|재입고|오늘만|24시간)' UNION ALL
  SELECT '성분/기능', r'(성분|함유|추출|콜라겐|히알루론|펩타이드|천연)' UNION ALL
  SELECT '연예인/셀럽', r'(연예인|아이돌|배우|인플루언서|유튜버|셀럽|톱스타)' UNION ALL
  SELECT '가격노출', r'(₩\s*\d+|\d+\s*원|만원|가성비)' UNION ALL
  SELECT '자연스러움', r'(자연스러운|티안나|부드럽게|부담없이|자연스레)' UNION ALL
  SELECT '인기/검증', r'(완판|품절대란|1위|베스트|누적판매|\d+만개)'
),

ad_appeal AS (
  SELECT
    d.ad_id,
    ARRAY_AGG(DISTINCT a.tag IGNORE NULLS) AS appeal_tags
  FROM `d2c-analytics-502304.marts.discovered_ads` d
  LEFT JOIN appeal_dict a
    ON REGEXP_CONTAINS(
      LOWER(IFNULL(d.body_text,'') || ' ' || IFNULL(d.title_text,'') || ' ' || IFNULL(d.description_text,'')),
      a.pattern
    )
  GROUP BY d.ad_id
)

SELECT
  d.ad_id,
  d.page_id,
  d.page_name,
  d.matched_keywords,
  d.keyword_count,
  d.delivery_start,
  d.delivery_stop,
  d.running_days,
  d.is_currently_active,
  d.snapshot_url,
  d.landing_url,
  d.body_text,
  d.title_text,
  d.description_text,
  d.platforms,
  d.target_ages,
  d.target_gender,
  d.impressions_lower,
  d.impressions_upper,
  d.spend_lower,
  d.spend_upper,
  d.currency,
  aa.appeal_tags,
  ARRAY_LENGTH(aa.appeal_tags) AS appeal_count,

  -- 자동 등급 판정
  CASE
    WHEN d.running_days >= 60 AND d.is_currently_active THEN 'SUPER_WINNER'
    WHEN d.running_days >= 30 AND d.is_currently_active THEN 'WINNER'
    WHEN d.running_days >= 14 AND d.is_currently_active THEN 'GROWING'
    WHEN d.running_days >= 7 AND d.is_currently_active THEN 'TESTING'
    WHEN d.running_days IS NOT NULL AND d.running_days < 7 AND NOT d.is_currently_active THEN 'QUICK_KILL'
    WHEN d.running_days IS NOT NULL AND d.running_days < 14 AND NOT d.is_currently_active THEN 'FAILED'
    WHEN NOT d.is_currently_active AND d.running_days >= 14 THEN 'CONCLUDED'
    ELSE 'UNKNOWN'
  END AS winner_grade,

  -- 신규 진입 감지
  DATE(d.delivery_start) = CURRENT_DATE() AS is_new_today,
  DATE(d.delivery_start) >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY) AS is_new_this_week,

  -- 크리에이티브 유형
  CASE
    WHEN d.platforms LIKE '%instagram%' AND d.platforms LIKE '%facebook%' THEN 'multi_platform'
    WHEN d.platforms LIKE '%instagram%' THEN 'instagram_only'
    WHEN d.platforms LIKE '%facebook%' THEN 'facebook_only'
    ELSE 'other'
  END AS platform_strategy,

  -- 노출 규모 (범위 중앙값)
  (IFNULL(d.impressions_lower, 0) + IFNULL(d.impressions_upper, 0)) / 2 AS impressions_midpoint,

  CURRENT_TIMESTAMP() AS analyzed_at
FROM `d2c-analytics-502304.marts.discovered_ads` d
LEFT JOIN ad_appeal aa ON d.ad_id = aa.ad_id;
