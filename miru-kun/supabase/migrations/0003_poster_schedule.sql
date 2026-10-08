-- ポスターの表示スケジュール（曜日・時間帯）
--   days       … 表示する曜日（0=日〜6=土）。空なら毎日
--   start/end  … 表示する時間帯（店舗のパソコンの現地時刻）。両方 null なら終日。start > end は日付またぎ（例 22:00〜02:00）

alter table public.posters
  add column days smallint[] not null default '{}'
    check (days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  add column start_time time,
  add column end_time time,
  add constraint posters_time_pair check ((start_time is null) = (end_time is null));

-- マニフェストにスケジュールを含める（判定は端末側の現地時刻で行う）
create or replace function public.device_manifest(p_token text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  d public.devices := public.device_from_token(p_token);
begin
  update public.devices set last_seen_at = now() where id = d.id;
  return jsonb_build_object(
    'device', jsonb_build_object('id', d.id, 'name', d.name, 'settings', d.settings),
    'store', (select jsonb_build_object('id', s.id, 'name', s.name) from public.stores s where s.id = d.store_id),
    'posters', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'name', p.name, 'image_path', p.image_path, 'duration_sec', p.duration_sec,
               'days', to_jsonb(p.days),
               'start_time', to_char(p.start_time, 'HH24:MI'),
               'end_time', to_char(p.end_time, 'HH24:MI')
             ) order by p.sort_order, p.created_at)
        from public.posters p
       where p.store_id = d.store_id and p.enabled
    ), '[]'::jsonb)
  );
end;
$$;
