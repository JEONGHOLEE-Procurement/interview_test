-- 실시간 면접 스터디 (결재-007) — Supabase SQL Editor 또는 Supabase MCP로 1회 실행
-- 적용 후 app/config.js 의 privateChannels 를 true 로 바꾸면 로그인한 사용자만 방 채널에 들어올 수 있다.

-- 1) 프로필: 로그인 계정(auth.users)과 1:1, 표시 이름
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 20),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "profiles: 로그인 사용자는 모두 조회" on public.profiles for select to authenticated using (true);
create policy "profiles: 본인만 수정" on public.profiles for update to authenticated using (id = auth.uid());

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'name', ''), split_part(new.email, '@', 1)));
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- 2) 스터디 방
create table if not exists public.study_rooms (
  code text primary key check (code ~ '^[A-Z0-9]{5}-[0-9]{2}$'),
  scenario_id text not null,
  host_id uuid not null references auth.users(id),
  status text not null default 'waiting' check (status in ('waiting', 'running', 'done')),
  created_at timestamptz not null default now()
);
alter table public.study_rooms enable row level security;
create policy "rooms: 로그인 사용자 조회" on public.study_rooms for select to authenticated using (true);
create policy "rooms: 본인이 방장으로 생성" on public.study_rooms for insert to authenticated with check (host_id = auth.uid());
create policy "rooms: 방장만 상태 변경" on public.study_rooms for update to authenticated using (host_id = auth.uid());

-- 3) 방 참가자
create table if not exists public.room_members (
  room_code text not null references public.study_rooms(code) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  team_id text,
  joined_at timestamptz not null default now(),
  primary key (room_code, user_id)
);
alter table public.room_members enable row level security;
create policy "members: 로그인 사용자 조회" on public.room_members for select to authenticated using (true);
create policy "members: 본인만 참가" on public.room_members for insert to authenticated with check (user_id = auth.uid());
create policy "members: 본인만 수정" on public.room_members for update to authenticated using (user_id = auth.uid());

-- 4) 방 기록 (채팅·발표·반박·질문). 참가자만 쓰고 읽는다
create table if not exists public.room_events (
  id bigint generated always as identity primary key,
  room_code text not null references public.study_rooms(code) on delete cascade,
  user_id uuid not null references auth.users(id),
  kind text not null check (kind in ('chat', 'speech', 'rebuttal', 'question', 'phase')),
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.room_events enable row level security;
create policy "events: 참가자만 조회" on public.room_events for select to authenticated
  using (exists (select 1 from public.room_members m where m.room_code = room_events.room_code and m.user_id = auth.uid()));
create policy "events: 참가자 본인 명의로만 기록" on public.room_events for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.room_members m where m.room_code = room_events.room_code and m.user_id = auth.uid()));

-- 5) 상호 평가 (2단계)
create table if not exists public.peer_reviews (
  id bigint generated always as identity primary key,
  room_code text not null references public.study_rooms(code) on delete cascade,
  reviewer_id uuid not null references auth.users(id),
  presenter_id uuid not null references auth.users(id),
  scores jsonb not null,
  comment text check (char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  unique (room_code, reviewer_id, presenter_id)
);
alter table public.peer_reviews enable row level security;
create policy "reviews: 참가자만 조회" on public.peer_reviews for select to authenticated
  using (exists (select 1 from public.room_members m where m.room_code = peer_reviews.room_code and m.user_id = auth.uid()));
create policy "reviews: 본인 명의로만 작성" on public.peer_reviews for insert to authenticated with check (reviewer_id = auth.uid());

-- 6) 실시간 비공개 채널 권한: 로그인한 사용자만 room:* 채널에서 송수신
create policy "realtime: 로그인 사용자 방 채널 수신" on realtime.messages for select to authenticated
  using (realtime.topic() like 'room:%');
create policy "realtime: 로그인 사용자 방 채널 송신" on realtime.messages for insert to authenticated
  with check (realtime.topic() like 'room:%');
