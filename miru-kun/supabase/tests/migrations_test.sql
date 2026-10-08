-- マイグレーションの動作テスト（run.sh から実行）
-- 失敗すると例外で止まる

\set ON_ERROR_STOP 1
\o /dev/null

insert into auth.users (id) values
  ('aaaaaaaa-0000-0000-0000-000000000001'),  -- オーナーA
  ('bbbbbbbb-0000-0000-0000-000000000002');  -- オーナーB

create function pg_temp.as_user(uid text) returns void language sql as $$
  select set_config('role', 'authenticated', false), set_config('request.jwt.claim.sub', uid, false);
$$;
create function pg_temp.as_anon() returns void language sql as $$
  select set_config('role', 'anon', false), set_config('request.jwt.claim.sub', '', false);
$$;
create function pg_temp.as_admin() returns void language sql as $$
  select set_config('role', 'postgres', false), set_config('request.jwt.claim.sub', '', false);
$$;
create function pg_temp.expect_error(stmt text, label text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'FAIL: % (エラーになるはずが成功した)', label;
exception when others then
  if sqlerrm like 'FAIL:%' then raise; end if;
end;
$$;
create function pg_temp.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
end;
$$;

-- 共有する値（テスト内で受け渡し）
create temp table t (k text primary key, v text);
grant all on t to anon, authenticated;
grant execute on all functions in schema pg_temp to anon, authenticated;

-- ---------- 店舗 ----------
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
with x as (insert into public.stores (name) values ('A店') returning id) insert into t select 'storeA', id::text from x;
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
with x as (insert into public.stores (name) values ('B店') returning id) insert into t select 'storeB', id::text from x;
select pg_temp.ok((select count(*) from public.stores) = 1, 'Bには自分の店舗だけ見える');
select pg_temp.expect_error(
  format($q$insert into public.stores (owner_id, name) values (%L, '乗っ取り')$q$, 'aaaaaaaa-0000-0000-0000-000000000001'),
  '他人名義の店舗は作れない');

-- ---------- 端末登録 ----------
select pg_temp.expect_error(
  format($q$select public.create_device(%L, 'x')$q$, (select v from t where k = 'storeA')),
  'Bは A店に端末を登録できない');
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
insert into t select 'deviceA', id::text from public.create_device((select v::uuid from t where k = 'storeA'), '入口モニター');
insert into t select 'codeA', pairing_code from public.devices where id = (select v::uuid from t where k = 'deviceA');
select pg_temp.ok((select v from t where k = 'codeA') ~ '^[A-Z2-9]{4}-[A-Z2-9]{4}$', 'ペアリングコードの形式');
select pg_temp.expect_error('select token_hash from public.devices', 'オーナーにも token_hash は見えない');
select pg_temp.expect_error(
  format($q$insert into public.devices (store_id, name) values (%L, '直接')$q$, (select v from t where k = 'storeA')),
  '端末は関数経由でしか作れない');

-- ---------- ポスター ----------
insert into public.posters (store_id, name, image_path, sort_order, enabled)
select (select v::uuid from t where k = 'storeA'), n, 'x/' || n || '.jpg', o, e
  from (values ('p2', 2, true), ('p1', 1, true), ('off', 0, false)) v(n, o, e);
insert into t select 'posterA', id::text from public.posters where name = 'p1';
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
insert into public.posters (store_id, name, image_path) values ((select v::uuid from t where k = 'storeB'), 'pb', 'y/pb.jpg');
insert into t select 'posterB', id::text from public.posters where name = 'pb';
select pg_temp.ok((select count(*) from public.posters) = 1, 'Bには A店のポスターが見えない');
select pg_temp.expect_error(
  format($q$insert into public.posters (store_id, name, image_path) values (%L, 'evil', 'z')$q$, (select v from t where k = 'storeA')),
  'Bは A店にポスターを追加できない');

-- ---------- 匿名（店頭端末）----------
select pg_temp.as_anon();
select pg_temp.expect_error('select * from public.stores', '匿名は店舗テーブルを読めない');
select pg_temp.expect_error('select * from public.metrics_minutely', '匿名は計測テーブルを読めない');
select pg_temp.expect_error(
  format($q$select public.create_device(%L, 'x')$q$, (select v from t where k = 'storeA')),
  '匿名は端末を登録できない');
select pg_temp.expect_error($q$select public.pair_device('ZZZZ-ZZZZ')$q$, '存在しないコードではペアリングできない');
insert into t select 'tokenA', device_token from public.pair_device(lower((select v from t where k = 'codeA')));
select pg_temp.ok(length((select v from t where k = 'tokenA')) = 64, 'トークンは 64 桁の16進');
select pg_temp.expect_error(
  format($q$select public.pair_device(%L)$q$, (select v from t where k = 'codeA')),
  'ペアリングコードは1回限り');

-- マニフェスト：有効なポスターだけ、並び順どおり
insert into t select 'manifest', public.device_manifest((select v from t where k = 'tokenA'))::text;
select pg_temp.ok(
  (select jsonb_path_query_array(v::jsonb, '$.posters[*].name') from t where k = 'manifest') = '["p1", "p2"]'::jsonb,
  'マニフェストは有効なポスターを並び順で返す');
select pg_temp.ok((select v::jsonb #>> '{store,name}' from t where k = 'manifest') = 'A店', 'マニフェストに店舗名');
select pg_temp.expect_error($q$select public.device_manifest('bogus')$q$, '不正なトークンは拒否');

-- 計測データの送信
insert into t values ('batch1', gen_random_uuid()::text);
insert into t select 'r1', public.device_report(
  (select v from t where k = 'tokenA'), (select v::uuid from t where k = 'batch1'),
  jsonb_build_array(
    jsonb_build_object('minute', date_trunc('minute', now()) - interval '2 minutes', 'poster_id', (select v from t where k = 'posterA'), 'passers', 3, 'viewers', 1, 'dwell_ms', 1500),
    jsonb_build_object('minute', date_trunc('minute', now()) - interval '2 minutes', 'poster_id', (select v from t where k = 'posterA'), 'passers', 1, 'viewers', 1, 'dwell_ms', 500),
    -- 他店のポスター・未来の時刻・古すぎる時刻は捨てられる
    jsonb_build_object('minute', now(), 'poster_id', (select v from t where k = 'posterB'), 'passers', 99),
    jsonb_build_object('minute', now() + interval '1 hour', 'poster_id', (select v from t where k = 'posterA'), 'passers', 99),
    jsonb_build_object('minute', now() - interval '30 days', 'poster_id', (select v from t where k = 'posterA'), 'passers', 99)
  ))::text;
select pg_temp.ok((select v from t where k = 'r1') = '1', '同じ分・ポスターはまとめて1行、不正な行は除外');
select pg_temp.ok(public.device_report(
  (select v from t where k = 'tokenA'), (select v::uuid from t where k = 'batch1'),
  jsonb_build_array(jsonb_build_object('minute', now(), 'poster_id', (select v from t where k = 'posterA'), 'passers', 50))
) = 0, '同じ batch_id の再送は無視');
select public.device_report(
  (select v from t where k = 'tokenA'), gen_random_uuid(),
  jsonb_build_array(jsonb_build_object('minute', date_trunc('minute', now()) - interval '2 minutes', 'poster_id', (select v from t where k = 'posterA'), 'passers', 2, 'viewers', 0, 'dwell_ms', 0)));
select pg_temp.expect_error(
  $q$select public.device_report('bogus', gen_random_uuid(), '[]'::jsonb)$q$, '不正なトークンでは送信できない');

-- 補正値の保存
select public.device_save_calibration((select v from t where k = 'tokenA'), 7.6, -90);

-- ---------- オーナーから見た集計 ----------
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.ok(
  (select row(sum(passers), sum(viewers), sum(dwell_ms))::text
     from public.store_metrics_hourly((select v::uuid from t where k = 'storeA'), now() - interval '1 day', now() + interval '1 hour'))
  = '(6,2,2000)', 'A は自店の集計（再送分は加算済み・重複なし）を見られる');
select pg_temp.ok(
  (select settings from public.devices where id = (select v::uuid from t where k = 'deviceA'))
  = '{"yawOffset": 8, "pitchOffset": -60}'::jsonb, '補正値は丸め・範囲制限されて保存');
select pg_temp.ok((select last_seen_at is not null from public.devices where id = (select v::uuid from t where k = 'deviceA')), '最終通信時刻が記録される');
update public.devices set settings = '{"yawThreshold": 25}' where id = (select v::uuid from t where k = 'deviceA');
select pg_temp.expect_error(
  format($q$update public.devices set token_hash = 'x' where id = %L$q$, (select v from t where k = 'deviceA')),
  'オーナーも token_hash は書き換えられない');

select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.ok(
  (select count(*) from public.store_metrics_hourly((select v::uuid from t where k = 'storeA'), now() - interval '1 day', now() + interval '1 hour')) = 0,
  'B は A店の集計を見られない');
select pg_temp.expect_error(
  format($q$select public.reset_device_pairing(%L)$q$, (select v from t where k = 'deviceA')),
  'B は A店の端末をリセットできない');

-- ---------- ペアリングのやり直しで旧トークンは無効 ----------
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select public.reset_device_pairing((select v::uuid from t where k = 'deviceA'));
select pg_temp.as_anon();
select pg_temp.expect_error(
  format($q$select public.device_manifest(%L)$q$, (select v from t where k = 'tokenA')),
  'リセット後は旧トークンが使えない');

-- 期限切れのコード
select pg_temp.as_admin();
update public.devices set pairing_expires_at = now() - interval '1 second' where id = (select v::uuid from t where k = 'deviceA');
insert into t select 'expiredCode', pairing_code from public.devices where id = (select v::uuid from t where k = 'deviceA');
select pg_temp.as_anon();
select pg_temp.expect_error(
  format($q$select public.pair_device(%L)$q$, (select v from t where k = 'expiredCode')),
  '期限切れのコードではペアリングできない');

-- ---------- Storage ----------
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
insert into storage.objects (bucket_id, name) values ('posters', (select v from t where k = 'storeA') || '/a.jpg');
select pg_temp.expect_error(
  format($q$insert into storage.objects (bucket_id, name) values ('posters', %L)$q$, (select v from t where k = 'storeB') || '/evil.jpg'),
  '他店のフォルダには画像を置けない');
select pg_temp.expect_error(
  $q$insert into storage.objects (bucket_id, name) values ('posters', 'not-a-uuid/evil.jpg')$q$,
  '店舗IDでないフォルダには画像を置けない');

-- ---------- 表示スケジュール（0003）----------
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
update public.posters set days = '{1,2,3,4,5}', start_time = '11:00', end_time = '14:00' where name = 'p1';
select pg_temp.expect_error($q$update public.posters set days = '{7}' where name = 'p1'$q$, '曜日は 0〜6 のみ');
select pg_temp.expect_error($q$update public.posters set start_time = '10:00', end_time = null where name = 'p1'$q$, '開始と終了は両方指定');
select pg_temp.as_admin();
insert into t select 'deviceS', id::text from public.devices limit 1;
update public.devices set token_hash = extensions.digest('sched-token', 'sha256') where id = (select v::uuid from t where k = 'deviceS');
select pg_temp.as_anon();
select pg_temp.ok(
  (select jsonb_path_query_first(public.device_manifest('sched-token'), '$.posters[*] ? (@.name == "p1")')
     - 'id' - 'image_path' - 'duration_sec' - 'name')
  = '{"days": [1, 2, 3, 4, 5], "start_time": "11:00", "end_time": "14:00"}'::jsonb,
  'マニフェストにスケジュールが入る');
select pg_temp.ok(
  (select jsonb_path_query_first(public.device_manifest('sched-token'), '$.posters[*] ? (@.name == "p2")') -> 'start_time') = 'null'::jsonb,
  '時間帯なしは null');

select pg_temp.as_admin();
\echo 'all assertions passed'
