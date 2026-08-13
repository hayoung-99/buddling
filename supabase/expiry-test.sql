-- 초대코드 만료가 실제로 동작하는지 확인하기 위한 임시 설정.
-- 유효시간을 24시간 → 10초로 줄인다.
--
--   1) 이 파일을 SQL Editor 에 붙여넣고 실행
--   2) 터미널에서  npm run check:expiry
--   3) 확인이 끝나면 supabase/schema.sql 을 다시 실행해 24시간으로 되돌린다
--
-- 되돌리기 전까지는 새로 만든 팀의 초대코드가 10초 만에 죽으니 주의하세요.

create or replace function public.invite_ttl()
returns interval language sql immutable as $$ select interval '10 seconds' $$;
