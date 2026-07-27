#!/bin/bash
# ML Marts Refresh - 주간 실행
# mart_user_ltv_rfm, mart_purchase_propensity 등 ML 기반 mart 갱신
PROJECT_ID="d2c-analytics-502304"
LOCATION="asia-northeast3"

echo "=== ML Marts refresh start: $(date) ==="

# ML 관련 SQL 파일이 있으면 실행, 없으면 스킵
ML_SQLS=$(ls sql/*ml* sql*propensity* sql*rfm* sql*ltv* 2>/dev/null)

if [ -z "$ML_SQLS" ]; then
  echo "⚠️ ML SQL 파일이 없습니다. 테이블이 이미 존재하므로 스킵합니다."
  echo "  - mart_user_ltv_rfm: 기존 테이블 유지"
  echo "  - mart_purchase_propensity: 기존 테이블 유지"
else
  for f in $ML_SQLS; do
    echo "--- running $f ---"
    if bq query --project_id="${PROJECT_ID}" --location="${LOCATION}" \
         --use_legacy_sql=false < "$f"; then
      echo "--- done $f ---"
    else
      echo "!!! FAILED $f (continue) !!!"
    fi
  done
fi

echo "=== ML Marts refresh done: $(date) ==="
