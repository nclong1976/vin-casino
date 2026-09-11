-- Hardening thuần túy (theo yêu cầu rà soát bảo mật) - 7 hàm nội bộ phục vụ
-- logic game (Tiger Baccarat, Bài Cào, Xì Tố) thiếu khai báo search_path cố
-- định, bị Supabase advisor cảnh báo "Function Search Path Mutable". Đây là
-- các hàm PHỤ TRỢ nội bộ (tiền tố "_", không phải API công khai, không có
-- SECURITY DEFINER) - chỉ thêm "SET search_path TO 'public'" giống các hàm
-- khác trong hệ thống đã làm, KHÔNG đổi tên, tham số, ngôn ngữ, độ ổn định
-- (IMMUTABLE) hay logic bên trong bất kỳ hàm nào.
CREATE OR REPLACE FUNCTION public._baicao_draw_card()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  ranks text[] := array['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  vals int[] := array[1,2,3,4,5,6,7,8,9,10,10,10,10];
  suits text[] := array['♠','♥','♦','♣'];
  reds boolean[] := array[false,true,true,false];
  r_idx int := floor(random()*13)::int + 1;
  s_idx int := floor(random()*4)::int + 1;
begin
  return jsonb_build_object('rank', ranks[r_idx], 'value', vals[r_idx], 'suit', suits[s_idx], 'is_red', reds[s_idx]);
end;
$function$;

CREATE OR REPLACE FUNCTION public._baicao_hand_score(hand jsonb)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select coalesce((select sum((c->>'value')::int) from jsonb_array_elements(hand) c), 0) % 10;
$function$;

CREATE OR REPLACE FUNCTION public._baicao_is_cao(hand jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select
    coalesce((select bool_and((c->>'rank') in ('J','Q','K')) from jsonb_array_elements(hand) c), false)
    or coalesce((select bool_and((c->>'rank') = 'A') from jsonb_array_elements(hand) c), false);
$function$;

CREATE OR REPLACE FUNCTION public._tb_deal_card()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  ranks text[] := array['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  vals int[] := array[2,3,4,5,6,7,8,9,0,0,0,0,1];
  suits text[] := array['♠','♥','♦','♣'];
  reds boolean[] := array[false,true,true,false];
  r_idx int := floor(random()*13)::int + 1;
  s_idx int := floor(random()*4)::int + 1;
begin
  return jsonb_build_object(
    'rank', ranks[r_idx], 'value', vals[r_idx],
    'suit', suits[s_idx], 'is_red', reds[s_idx]
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public._tb_score(hand jsonb)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select coalesce((select sum((c->>'value')::int) from jsonb_array_elements(hand) c), 0) % 10;
$function$;

CREATE OR REPLACE FUNCTION public._xito_draw_card()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  ranks text[] := array['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  vals int[] := array[2,3,4,5,6,7,8,9,10,11,12,13,14];
  suits text[] := array['♠','♥','♦','♣'];
  reds boolean[] := array[false,true,true,false];
  r_idx int := floor(random()*13)::int + 1;
  s_idx int := floor(random()*4)::int + 1;
begin
  return jsonb_build_object('rank', ranks[r_idx], 'value', vals[r_idx], 'suit', suits[s_idx], 'is_red', reds[s_idx]);
end;
$function$;

CREATE OR REPLACE FUNCTION public._xito_evaluate(hand jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare
  v0 int; v1 int; v2 int;
  is_flush boolean;
  is_normal_straight boolean;
  is_ace_low_straight boolean;
  is_straight boolean;
  is_three boolean;
  is_pair boolean;
  pair_val int;
  total_points int;
  point_score int;
  rank_name text;
  score int;
  multiplier numeric;
begin
  select a[1], a[2], a[3] into v0, v1, v2
    from (select array_agg((c->>'value')::int order by (c->>'value')::int desc) as a from jsonb_array_elements(hand) c) t;

  select count(distinct c->>'suit') = 1 into is_flush from jsonb_array_elements(hand) c;

  is_normal_straight := (v0 - 1 = v1) and (v1 - 1 = v2);
  is_ace_low_straight := (v0 = 14 and v1 = 3 and v2 = 2);
  is_straight := is_normal_straight or is_ace_low_straight;
  is_three := (v0 = v1) and (v1 = v2);
  is_pair := (v0 = v1) or (v1 = v2) or (v0 = v2);

  if is_straight and is_flush then
    rank_name := 'THÙNG PHÁ SẢNH'; score := 6000 + v0; multiplier := 5;
  elsif is_three then
    rank_name := 'SÁM CỔ (BA CÂY)'; score := 5000 + v0; multiplier := 4;
  elsif is_straight then
    score := 4000 + (case when is_ace_low_straight then 3 else v0 end);
    rank_name := 'SẢNH'; multiplier := 3;
  elsif is_flush then
    rank_name := 'THÙNG'; score := 3000 + v0*10 + v1; multiplier := 2;
  elsif is_pair then
    pair_val := case when v0 = v1 then v0 when v1 = v2 then v1 else v0 end;
    rank_name := 'ĐÔI'; score := 2000 + pair_val*10; multiplier := 1.5;
  else
    select sum(case when c->>'rank' in ('J','Q','K') then 10 when c->>'rank' = 'A' then 1 else (c->>'rank')::int end)
      into total_points from jsonb_array_elements(hand) c;
    point_score := total_points % 10;
    rank_name := case when point_score = 0 then '10 ĐIỂM' else point_score || ' ĐIỂM' end;
    score := 1000 + point_score*100 + v0;
    multiplier := 1;
  end if;

  return jsonb_build_object('rank_name', rank_name, 'score', score, 'multiplier', multiplier);
end;
$function$;
