-- 红黑榜的云端表。在 Supabase 后台 SQL Editor 里整段跑一次即可。
-- 项目和「河」是同一个（qsqcmsznxhuwjrjnihob），账号是通的。
-- 可以重复运行，不会破坏已有数据。

create table if not exists public.dishes (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  id         text        not null,
  name       text        not null,
  taste      text        not null default 'red' check (taste  in ('red','mid','ink')),
  health     text        not null default 'red' check (health in ('red','mid','ink')),
  banned     boolean     not null default false,
  note       text        not null default '',
  -- 小熊测评的分数整块存这里：{ s:[味道,量价比,配料表], total, buy, verdict, date }
  -- 家常菜是 null。用 jsonb 而不是拆成列，是为了以后加评分维度不用再改表结构。
  review     jsonb,
  created_ts bigint      not null,
  edited_ts  bigint,
  -- 墓碑：删除不真删行，否则删除操作传不到另一台设备
  deleted    boolean     not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- 表已经建过了，create table if not exists 不会补列，所以单独加一次。
-- 2026-09-09 合并小熊评分卡时加的。
alter table public.dishes add column if not exists review jsonb;

-- 同步游标走 updated_at，按这个顺序取
create index if not exists dishes_user_updated_idx
  on public.dishes (user_id, updated_at);

alter table public.dishes enable row level security;

-- 只能读写自己的行。anon key 是公开值，安全边界全在这四条策略上。
drop policy if exists "dishes own select" on public.dishes;
create policy "dishes own select" on public.dishes
  for select using (auth.uid() = user_id);

drop policy if exists "dishes own insert" on public.dishes;
create policy "dishes own insert" on public.dishes
  for insert with check (auth.uid() = user_id);

drop policy if exists "dishes own update" on public.dishes;
create policy "dishes own update" on public.dishes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "dishes own delete" on public.dishes;
create policy "dishes own delete" on public.dishes
  for delete using (auth.uid() = user_id);

-- upsert 命中已有行时要把 updated_at 推到现在，否则游标不动、别的设备拉不到
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists dishes_touch_updated_at on public.dishes;
create trigger dishes_touch_updated_at
  before update on public.dishes
  for each row execute function public.touch_updated_at();
