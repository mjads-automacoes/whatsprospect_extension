-- WhatsProspect — schema do Supabase
--
-- Rode este script no SQL Editor do seu projeto Supabase
-- (https://app.supabase.com/project/_/sql) antes de usar a extensão com
-- login habilitado. Cria a tabela de leads com Row Level Security, de
-- forma que cada usuário autenticado só vê/edita os próprios leads.

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  dedupe_key text not null,
  nome text,
  telefone text,
  cidade text,
  estado text,
  categoria text,
  endereco text,
  site text,
  origem_link text,
  palavra_chave text,
  prospectado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

alter table public.leads enable row level security;

drop policy if exists "leads_select_own" on public.leads;
create policy "leads_select_own"
  on public.leads for select
  using (auth.uid() = user_id);

drop policy if exists "leads_insert_own" on public.leads;
create policy "leads_insert_own"
  on public.leads for insert
  with check (auth.uid() = user_id);

drop policy if exists "leads_update_own" on public.leads;
create policy "leads_update_own"
  on public.leads for update
  using (auth.uid() = user_id);

drop policy if exists "leads_delete_own" on public.leads;
create policy "leads_delete_own"
  on public.leads for delete
  using (auth.uid() = user_id);

create index if not exists leads_user_id_idx on public.leads (user_id);
