#!/bin/bash
set -e
PROJECT_ID="d2c-analytics-502304"
LOCATION="asia-northeast3"

echo "=== D2C Analytics marts refresh start: $(date) ==="
for f in sql/*.sql
do
  echo "--- running $f ---"
  bq query --project_id="${PROJECT_ID}" --location="${LOCATION}" \
    --use_legacy_sql=false < "$f"
  echo "--- done $f ---"
done

echo "=== All 5 marts refreshed: $(date) ==="
