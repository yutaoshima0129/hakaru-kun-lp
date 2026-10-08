-- ポスター画像の保存先。店頭で誰でも見る広告なので公開読み取り（パスは推測できない UUID）
-- 書き込みは {store_id}/ フォルダの持ち主だけ

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('posters', 'posters', true, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy posters_owner_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'posters' and public.is_store_owner(((storage.foldername(name))[1])::uuid));

create policy posters_owner_update on storage.objects
  for update to authenticated
  using (bucket_id = 'posters' and public.is_store_owner(((storage.foldername(name))[1])::uuid));

create policy posters_owner_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'posters' and public.is_store_owner(((storage.foldername(name))[1])::uuid));
