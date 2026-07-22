DROP TABLE IF EXISTS `d2c-analytics-502304.marts.mart_competitor_winners`;

CREATE TABLE `d2c-analytics-502304.marts.mart_competitor_winners` AS

WITH scored AS (
  SELECT
    competitor_name,
    ad_id,
    page_name,
    delivery_start,
    delivery_stop,
    running_days,
    is_currently_active,
    snapshot_url,
    body_text,
    title_text,
    platforms,

    -- 승자 등급 자동 판정
    CASE
      WHEN running_days >= 60 AND is_currently_active THEN '🔥 SUPER_WINNER'
      WHEN running_days >= 30 AND is_currently_active THEN '🏆 WINNER'
      WHEN running_days >= 14 AND is_currently_active THEN '📈 GROWING'
      WHEN running_days < 7 AND NOT is_currently_active THEN '💀 QUICK_KILL'
      ELSE '👀 MONITORING'
    END AS winner_grade,

    -- 소구점 자동 태깅 (Mart 20과 동일 로직)
    ARRAY(
      SELECT tag FROM UNNEST([
        STRUCT('할인' AS tag, r'(할인|세일|SALE|프로모션)' AS pattern),
        STRUCT('전후비교', r'(전후|before|after|BA)'),
        STRUCT('시술대체', r'(시술|병원|보톡스|필러|리쥬란)'),
        STRUCT('홈케어', r'(홈케어|셀프|집에서|매일)'),
        STRUCT('디바이스', r'(마사지기|기기|EMS|LED)'),
        STRUCT('리프팅', r'(리프팅|탄력|처짐|당김)'),
        STRUCT('후기', r'(후기|리뷰|만족)'),
        STRUCT('가격', r'(원|₩|만원|저렴|가성비)')
      ]) WHERE REGEXP_CONTAINS(LOWER(IFNULL(body_text,'')||' '||IFNULL(title_text,'')), pattern)
    ) AS appeal_tags

  FROM `d2c-analytics-502304.marts.competitor_ads`
)

SELECT
  *,
  ARRAY_LENGTH(appeal_tags) AS appeal_count
FROM scored;
