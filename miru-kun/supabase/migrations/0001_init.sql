-- 見る君 第1段階：店舗・端末・ポスター・計測データ
--
-- 認証の考え方
--   オーナー（管理画面）: Supabase Auth でログインし、RLS で自分の店舗のデータだけ触れる
--   店頭端末（サイネージ）: ログインしない。ペアリングで発行した端末トークンを
--                           security definer 関数に渡して読み書きする（DBにはハッシュのみ保存）

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------
-- テーブル
-- ---------------------------------------------------------------

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  created_at timestamptz not null default now()
);
create index stores_owner_idx on public.stores (owner_id);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  -- 端末トークンの SHA-256。平文は端末側にしか残らない
  token_hash bytea unique,
  pairing_code text unique,
  pairing_expires_at timestamptz,
  paired_at timestamptz,
  last_seen_at timestamptz,
  -- 判定設定（AttentionSettings の一部 + showNotice）。未設定の項目はアプリの既定値
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  created_at timestamptz not null default now()
);
create index devices_store_idx on public.devices (store_id);

create table public.posters (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  -- Storage バケット posters 内のパス（{store_id}/{uuid}.jpg）
  image_path text not null,
  duration_sec integer not null default 10 check (duration_sec between 3 and 300),
  enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index posters_store_idx on public.posters (store_id, sort_order);

-- 1分 × 端末 × ポスター単位の集計。ポスター削除後も実績は残すため poster_id に外部キーは張らない
create table public.metrics_minutely (
  device_id uuid not null references public.devices (id) on delete cascade,
  poster_id uuid not null,
  minute timestamptz not null,
  store_id uuid not null references public.stores (id) on delete cascade,
  passers integer not null default 0 check (passers >= 0),
  viewers integer not null default 0 check (viewers >= 0),
  dwell_ms bigint not null default 0 check (dwell_ms >= 0),
  primary key (device_id, poster_id, minute)
);
create index metrics_store_minute_idx on public.metrics_minutely (store_id, minute);

-- 端末からの送信の重複防止（応答が届かず再送した場合に二重計上しない）
create table public.device_report_batches (
  batch_id uuid primary key,
  device_id uuid not null references public.devices (id) on delete cascade,
  received_at timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- 権限と RLS
-- ---------------------------------------------------------------

alter table public.stores enable row level security;
alter table public.devices enable row level security;
alter table public.posters enable row level security;
alter table public.metrics_minutely enable row level security;
alter table public.device_report_batches enable row level security;

revoke all on public.stores, public.devices, public.posters, public.metrics_minutely, public.device_report_batches
  from anon, authenticated;

grant select, insert, update, delete on public.stores to authenticated;
grant select, insert, update, delete on public.posters to authenticated;
grant select on public.metrics_minutely to authenticated;
-- token_hash はオーナーにも見せない。追加はペアリングコード発行を伴うため関数経由
grant select (id, store_id, name, pairing_code, pairing_expires_at, paired_at, last_seen_at, settings, created_at)
  on public.devices to authenticated;
grant update (name, settings) on public.devices to authenticated;
grant delete on public.devices to authenticated;

create function public.is_store_owner(p_store_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.stores s where s.id = p_store_id and s.owner_id = auth.uid());
$$;

create policy stores_owner on public.stores
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy devices_owner on public.devices
  for all to authenticated
  using (public.is_store_owner(store_id))
  with check (public.is_store_owner(store_id));

create policy posters_owner on public.posters
  for all to authenticated
  using (public.is_store_owner(store_id))
  with check (public.is_store_owner(store_id));

create policy metrics_owner on public.metrics_minutely
  for select to authenticated
  using (public.is_store_owner(store_id));

-- ---------------------------------------------------------------
-- オーナー用の関数
-- ---------------------------------------------------------------

-- 紛らわしい文字（0/O, 1/I/L）を除いた 8 文字のコード（XXXX-XXXX）
create function public.new_pairing_code() returns text
language plpgsql volatile set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea := extensions.gen_random_bytes(8);
  code text := '';
begin
  for i in 0..7 loop
    code := code || substr(alphabet, 1 + (get_byte(bytes, i) % length(alphabet)), 1);
  end loop;
  return substr(code, 1, 4) || '-' || substr(code, 5, 4);
end;
$$;

-- 端末を登録し、30分有効のペアリングコードを返す
create function public.create_device(p_store_id uuid, p_name text)
returns table (id uuid, pairing_code text, pairing_expires_at timestamptz)
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not public.is_store_owner(p_store_id) then
    raise exception 'store not found' using errcode = '42501';
  end if;
  return query
    insert into public.devices as d (store_id, name, pairing_code, pairing_expires_at)
    values (p_store_id, p_name, public.new_pairing_code(), now() + interval '30 minutes')
    returning d.id, d.pairing_code, d.pairing_expires_at;
end;
$$;

-- ペアリングをやり直す（今のトークンは無効になる）
create function public.reset_device_pairing(p_device_id uuid)
returns table (pairing_code text, pairing_expires_at timestamptz)
language plpgsql volatile security definer set search_path = ''
as $$
begin
  return query
    update public.devices as d
       set token_hash = null,
           paired_at = null,
           pairing_code = public.new_pairing_code(),
           pairing_expires_at = now() + interval '30 minutes'
     where d.id = p_device_id and public.is_store_owner(d.store_id)
    returning d.pairing_code, d.pairing_expires_at;
  if not found then
    raise exception 'device not found' using errcode = '42501';
  end if;
end;
$$;

-- ダッシュボード用：1時間 × ポスター単位に集約（RLS が効くよう security invoker）
create function public.store_metrics_hourly(
  p_store_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_device_id uuid default null
)
returns table (hour timestamptz, poster_id uuid, passers bigint, viewers bigint, dwell_ms bigint)
language sql stable security invoker set search_path = ''
as $$
  select date_trunc('hour', m.minute), m.poster_id, sum(m.passers), sum(m.viewers), sum(m.dwell_ms)
    from public.metrics_minutely m
   where m.store_id = p_store_id
     and m.minute >= p_from and m.minute < p_to
     and (p_device_id is null or m.device_id = p_device_id)
   group by 1, 2
   order by 1, 2;
$$;

-- ---------------------------------------------------------------
-- 店頭端末用の関数（anon から呼ぶ。トークンで本人確認）
-- ---------------------------------------------------------------

create function public.device_from_token(p_token text) returns public.devices
language plpgsql stable security definer set search_path = ''
as $$
declare
  d public.devices;
begin
  select * into d from public.devices
   where token_hash = extensions.digest(coalesce(p_token, ''), 'sha256');
  if not found then
    raise exception 'invalid device token' using errcode = '28000';
  end if;
  return d;
end;
$$;

-- ペアリングコードを端末トークンに交換する（コードは1回限り）
create function public.pair_device(p_code text)
returns table (device_id uuid, device_token text)
language plpgsql volatile security definer set search_path = ''
as $$
declare
  token text := encode(extensions.gen_random_bytes(32), 'hex');
  dev_id uuid;
begin
  update public.devices
     set token_hash = extensions.digest(token, 'sha256'),
         pairing_code = null,
         pairing_expires_at = null,
         paired_at = now(),
         last_seen_at = now()
   where pairing_code = upper(trim(p_code))
     and pairing_expires_at > now()
  returning id into dev_id;
  if dev_id is null then
    raise exception 'invalid or expired pairing code' using errcode = '28000';
  end if;
  return query select dev_id, token;
end;
$$;

-- 端末が表示に必要な情報（設定・有効なポスター）をまとめて返す
create function public.device_manifest(p_token text) returns jsonb
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
               'id', p.id, 'name', p.name, 'image_path', p.image_path, 'duration_sec', p.duration_sec
             ) order by p.sort_order, p.created_at)
        from public.posters p
       where p.store_id = d.store_id and p.enabled
    ), '[]'::jsonb)
  );
end;
$$;

-- 計測データの送信。p_rows = [{minute, poster_id, passers, viewers, dwell_ms}, ...]
-- 同じ p_batch_id の再送は無視する。戻り値は取り込んだ行数（重複時は 0）
create function public.device_report(p_token text, p_batch_id uuid, p_rows jsonb) returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare
  d public.devices := public.device_from_token(p_token);
  n integer;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 5000 then
    raise exception 'p_rows must be an array of at most 5000 rows' using errcode = '22023';
  end if;

  insert into public.device_report_batches (batch_id, device_id) values (p_batch_id, d.id)
  on conflict (batch_id) do nothing;
  if not found then
    return 0;
  end if;

  update public.devices set last_seen_at = now() where id = d.id;

  with r as (
    select date_trunc('minute', x.minute) as minute, x.poster_id,
           least(greatest(coalesce(x.passers, 0), 0), 10000) as passers,
           least(greatest(coalesce(x.viewers, 0), 0), 10000) as viewers,
           least(greatest(coalesce(x.dwell_ms, 0), 0), 3600000) as dwell_ms
      from jsonb_to_recordset(p_rows) as x (minute timestamptz, poster_id uuid, passers integer, viewers integer, dwell_ms bigint)
     where x.minute is not null and x.poster_id is not null
       -- 端末の時計ずれ・古すぎる再送は捨てる
       and x.minute between now() - interval '7 days' and now() + interval '5 minutes'
       -- 自分の店舗のポスターだけ受け付ける
       and exists (select 1 from public.posters p where p.id = x.poster_id and p.store_id = d.store_id)
  ),
  agg as (
    select minute, poster_id, sum(passers)::integer as passers, sum(viewers)::integer as viewers, sum(dwell_ms)::bigint as dwell_ms
      from r group by minute, poster_id
  )
  insert into public.metrics_minutely as m (device_id, poster_id, minute, store_id, passers, viewers, dwell_ms)
  select d.id, poster_id, minute, d.store_id, passers, viewers, dwell_ms from agg
  on conflict (device_id, poster_id, minute) do update
     set passers = m.passers + excluded.passers,
         viewers = m.viewers + excluded.viewers,
         dwell_ms = m.dwell_ms + excluded.dwell_ms;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- 端末で行った「向きの補正」を保存する
create function public.device_save_calibration(p_token text, p_yaw_offset real, p_pitch_offset real) returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  d public.devices := public.device_from_token(p_token);
begin
  update public.devices
     set settings = settings || jsonb_build_object(
           'yawOffset', round(greatest(-60, least(60, p_yaw_offset))),
           'pitchOffset', round(greatest(-60, least(60, p_pitch_offset))))
   where id = d.id;
end;
$$;

-- 関数の実行権限（既定の PUBLIC 実行権を外して明示的に付与）
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.is_store_owner(uuid) to authenticated;
grant execute on function public.create_device(uuid, text) to authenticated;
grant execute on function public.reset_device_pairing(uuid) to authenticated;
grant execute on function public.store_metrics_hourly(uuid, timestamptz, timestamptz, uuid) to authenticated;
grant execute on function public.pair_device(text) to anon, authenticated;
grant execute on function public.device_manifest(text) to anon, authenticated;
grant execute on function public.device_report(text, uuid, jsonb) to anon, authenticated;
grant execute on function public.device_save_calibration(text, real, real) to anon, authenticated;
