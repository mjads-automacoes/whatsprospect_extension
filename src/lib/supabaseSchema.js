// Mesmo conteúdo de supabase/schema.sql, embutido como string para que o
// fluxo de provisionamento automático (Opções → Conectar com Supabase)
// possa executá-lo via Management API sem precisar buscar um arquivo
// externo. Se editar um dos dois, edite o outro também.

export const SCHEMA_SQL = `
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

drop policy if exists "leads_all_anon" on public.leads;
create policy "leads_all_anon"
  on public.leads for all
  to anon, authenticated
  using (true)
  with check (true);
`;
