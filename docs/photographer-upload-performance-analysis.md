# 작가 업로드 성능 분석

`upload_performance_logs`는 브라우저 업로드 세션당 집계 한 행을 저장한다. 아래 예시는 최근 30일을 보고 내부 테스트 계정 `cand0701@hanmail.net`, `cand0701@naver.com`을 제외한다.

```sql
WITH measured AS (
  SELECT l.*
  FROM public.upload_performance_logs l
  JOIN public.photographers p ON p.id = l.photographer_id
  WHERE l.created_at >= now() - interval '30 days'
    AND lower(coalesce(p.email, '')) NOT IN (
      'cand0701@hanmail.net',
      'cand0701@naver.com'
    )
)
SELECT
  device,
  includes_original,
  count(*) AS sessions,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY elapsed_ms) AS median_elapsed_ms,
  percentile_cont(0.5) WITHIN GROUP (
    ORDER BY elapsed_ms::numeric / nullif(file_count, 0)
  ) AS median_ms_per_photo
FROM measured
GROUP BY device, includes_original
ORDER BY device, includes_original;
```

단계별 시간 비중은 파일별 시간이 겹칠 수 있으므로 병목 후보를 비교하는 값으로만 쓴다.

```sql
WITH measured AS (
  SELECT l.*
  FROM public.upload_performance_logs l
  JOIN public.photographers p ON p.id = l.photographer_id
  WHERE l.created_at >= now() - interval '30 days'
    AND lower(coalesce(p.email, '')) NOT IN ('cand0701@hanmail.net', 'cand0701@naver.com')
), stages AS (
  SELECT device, includes_original, stage.key AS stage, stage.value::numeric AS stage_ms
  FROM measured
  CROSS JOIN LATERAL jsonb_each_text(file_stage_ms) AS stage
)
SELECT
  device,
  includes_original,
  stage,
  round(100 * sum(stage_ms) / nullif(sum(sum(stage_ms)) OVER (PARTITION BY device, includes_original), 0), 1) AS stage_percent
FROM stages
GROUP BY device, includes_original, stage
ORDER BY device, includes_original, stage_percent DESC;
```

```sql
WITH measured AS (
  SELECT l.*
  FROM public.upload_performance_logs l
  JOIN public.photographers p ON p.id = l.photographer_id
  WHERE l.created_at >= now() - interval '30 days'
    AND lower(coalesce(p.email, '')) NOT IN ('cand0701@hanmail.net', 'cand0701@naver.com')
)
SELECT
  device,
  includes_original,
  count(*) AS sessions,
  round(100.0 * count(*) FILTER (WHERE outcome <> 'completed') / nullif(count(*), 0), 1) AS incomplete_percent,
  round(100.0 * count(*) FILTER (WHERE retry_count > 0) / nullif(count(*), 0), 1) AS retried_session_percent,
  round(avg(retry_count), 2) AS retries_per_session
FROM measured
GROUP BY device, includes_original
ORDER BY device, includes_original;
```

Railway의 백엔드 로그에서는 `/photos`는 `photographer upload timing`, 원본 confirm은 `original confirm timing`으로 검색한다. `level:warning` 필터를 함께 쓰면 15초 초과 요청만 볼 수 있다.

90일 보관 정책이 필요해지면 Supabase Scheduled Functions 또는 외부 cron에서 아래 삭제문을 실행할 수 있다. 현재는 자동 삭제를 만들지 않는다.

```sql
DELETE FROM public.upload_performance_logs
WHERE created_at < now() - interval '90 days';
```
