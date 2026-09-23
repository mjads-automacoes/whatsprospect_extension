-- WhatsProspect — schema do Supabase
--
-- Rode este script no SQL Editor do projeto Supabase da empresa (o fluxo
-- de "Conectar com Supabase" das Opções já faz isso automaticamente).
--
-- Cada empresa tem o próprio projeto Supabase isolado — por isso a tabela
-- não depende de login de usuário final (auth.users): a chave anônima do
-- projeto já é, por si só, o segredo que separa uma empresa da outra.

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
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
  atualizado_em timestamptz not null default now()
);

alter table public.leads enable row level security;

-- Qualquer requisição autenticada com a chave anônima deste projeto pode
-- ler/escrever — o isolamento entre empresas já é feito pelo projeto em
-- si (cada uma tem sua própria URL + chave), não por linha.
drop policy if exists "leads_all_anon" on public.leads;
create policy "leads_all_anon"
  on public.leads for all
  to anon, authenticated
  using (true)
  with check (true);
