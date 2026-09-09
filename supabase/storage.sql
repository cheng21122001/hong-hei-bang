-- 价目截图的存放处。在 Supabase 后台 SQL Editor 里整段跑一次即可。
-- 可以重复运行，不会破坏已有数据。

-- 私有桶：没有签名 URL 谁都读不到，即使知道路径。
insert into storage.buckets (id, name, public)
values ('shots', 'shots', false)
on conflict (id) do nothing;

-- 路径约定是 <user_id>/<记录id>.jpg，所以第一段文件夹名就是所有者。
-- 四条策略全都拿它和 auth.uid() 比，别人的目录一个字节都碰不到。

drop policy if exists "shots own select" on storage.objects;
create policy "shots own select" on storage.objects
  for select using (
    bucket_id = 'shots' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "shots own insert" on storage.objects;
create policy "shots own insert" on storage.objects
  for insert with check (
    bucket_id = 'shots' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "shots own update" on storage.objects;
create policy "shots own update" on storage.objects
  for update using (
    bucket_id = 'shots' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "shots own delete" on storage.objects;
create policy "shots own delete" on storage.objects
  for delete using (
    bucket_id = 'shots' and (storage.foldername(name))[1] = auth.uid()::text
  );
