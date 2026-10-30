-- AI School Assistant. Review before applying to the active Supabase project.
create extension if not exists vector with schema extensions;

create table if not exists public.subjects (
 id text primary key, name text not null, icon text, description text, created_at timestamptz not null default now()
);
insert into public.subjects(id,name,icon,description) values
('english','Английский язык','🇬🇧','Грамматика, времена, перевод'),
('algebra','Алгебра','∑','Уравнения, функции, вычисления'),
('geometry','Геометрия','△','Теоремы, доказательства, чертежи'),
('ukrainian','Украинский язык','А','Орфография, морфология, синтаксис'),
('physics','Физика','⚛','Законы, величины, формулы'),
('chemistry','Химия','🧪','Элементы, реакции, расчёты')
on conflict(id) do nothing;

create table if not exists public.profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 grade smallint check(grade between 5 and 11),
 preferred_language text not null default 'ru',
 created_at timestamptz not null default now()
);
create table if not exists public.topics (
 id uuid primary key default gen_random_uuid(),
 subject_id text not null references public.subjects(id) on delete cascade,
 grade smallint not null check(grade between 5 and 11),
 title text not null, description text, language text not null default 'ru',
 source_title text, source_url text, verified boolean not null default false,
 status text not null default 'draft' check(status in ('draft','review','published','archived')),
 created_at timestamptz not null default now()
);
create table if not exists public.knowledge_items (
 id uuid primary key default gen_random_uuid(),
 topic_id uuid not null references public.topics(id) on delete cascade,
 item_type text not null check(item_type in ('theory','definition','rule','theorem','algorithm','example','common_mistake','table')),
 title text not null, content text not null, metadata jsonb not null default '{}'::jsonb,
 embedding extensions.vector(1536),
 status text not null default 'draft' check(status in ('draft','review','published','archived')),
 created_at timestamptz not null default now()
);
create table if not exists public.formulas (
 id uuid primary key default gen_random_uuid(), topic_id uuid not null references public.topics(id) on delete cascade,
 title text not null, expression text not null, explanation text not null,
 variables jsonb not null default '{}'::jsonb, units jsonb not null default '{}'::jsonb,
 example jsonb not null default '{}'::jsonb,
 status text not null default 'draft' check(status in ('draft','review','published','archived')),
 created_at timestamptz not null default now()
);
create table if not exists public.solutions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 subject_id text not null references public.subjects(id), grade smallint not null check(grade between 5 and 11),
 task_text text not null, mode text not null default 'detailed', result jsonb not null, created_at timestamptz not null default now()
);
create table if not exists public.conversations (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 subject_id text references public.subjects(id), title text not null default 'Новое занятие',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.messages (
 id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.conversations(id) on delete cascade,
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 role text not null check(role in ('user','assistant')), content text not null,
 metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table if not exists public.progress (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 topic_id uuid not null references public.topics(id) on delete cascade,
 status text not null default 'learning' check(status in ('not_started','learning','mastered')),
 attempts integer not null default 0 check(attempts>=0), correct_attempts integer not null default 0 check(correct_attempts>=0),
 updated_at timestamptz not null default now(), unique(user_id,topic_id)
);
create table if not exists public.bookmarks (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 knowledge_item_id uuid references public.knowledge_items(id) on delete cascade,
 formula_id uuid references public.formulas(id) on delete cascade,
 created_at timestamptz not null default now(), check(num_nonnulls(knowledge_item_id,formula_id)=1)
);

create index if not exists topics_subject_grade_idx on public.topics(subject_id,grade);
create index if not exists knowledge_topic_status_idx on public.knowledge_items(topic_id,status);
create index if not exists solutions_user_created_idx on public.solutions(user_id,created_at desc);
create index if not exists knowledge_embedding_hnsw_idx on public.knowledge_items using hnsw(embedding extensions.vector_cosine_ops) where embedding is not null;

alter table public.subjects enable row level security;
alter table public.profiles enable row level security;
alter table public.topics enable row level security;
alter table public.knowledge_items enable row level security;
alter table public.formulas enable row level security;
alter table public.solutions enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.progress enable row level security;
alter table public.bookmarks enable row level security;

create policy "Subjects readable" on public.subjects for select to anon,authenticated using(true);
create policy "Published topics readable" on public.topics for select to anon,authenticated using(status='published' or (select auth.jwt()->'app_metadata'->>'role')='admin');
create policy "Admin manages topics" on public.topics for all to authenticated using((select auth.jwt()->'app_metadata'->>'role')='admin') with check((select auth.jwt()->'app_metadata'->>'role')='admin');
create policy "Published knowledge readable" on public.knowledge_items for select to anon,authenticated using(status='published' or (select auth.jwt()->'app_metadata'->>'role')='admin');
create policy "Admin manages knowledge" on public.knowledge_items for all to authenticated using((select auth.jwt()->'app_metadata'->>'role')='admin') with check((select auth.jwt()->'app_metadata'->>'role')='admin');
create policy "Published formulas readable" on public.formulas for select to anon,authenticated using(status='published' or (select auth.jwt()->'app_metadata'->>'role')='admin');
create policy "Admin manages formulas" on public.formulas for all to authenticated using((select auth.jwt()->'app_metadata'->>'role')='admin') with check((select auth.jwt()->'app_metadata'->>'role')='admin');
create policy "Own profile select" on public.profiles for select to authenticated using((select auth.uid())=user_id);
create policy "Own profile insert" on public.profiles for insert to authenticated with check((select auth.uid())=user_id);
create policy "Own profile update" on public.profiles for update to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy "Own solutions" on public.solutions for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy "Own conversations" on public.conversations for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy "Own messages" on public.messages for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy "Own progress" on public.progress for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy "Own bookmarks" on public.bookmarks for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
