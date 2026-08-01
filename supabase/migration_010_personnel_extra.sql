-- ============================================================
-- Migration : ajout de la "Fonction", des heures par matière, et du
-- paiement des salaires pour la Gestion du personnel.
-- À exécuter dans Supabase > SQL Editor > New query > Run,
-- sur ton projet existant "Ivy1.0".
-- ============================================================

alter table personnel add column if not exists fonction text default '';
alter table personnel add column if not exists heures_matieres jsonb not null default '{}'::jsonb;

create table if not exists salary_payments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  personnel_id uuid not null references personnel(id) on delete cascade,
  montant numeric not null check (montant > 0),
  periode text,
  payment_date date not null default current_date,
  note text,
  created_at timestamptz default now()
);

alter table salary_payments enable row level security;

create policy "direction all salary_payments" on salary_payments for all
  using (school_id = my_school_id() and my_role() = 'direction')
  with check (school_id = my_school_id() and my_role() = 'direction');
