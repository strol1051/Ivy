-- ============================================================
-- Migration : Gestion du personnel (fiches employés — réservé à la
-- Direction, inclut le salaire mensuel).
-- À exécuter dans Supabase > SQL Editor > New query > Run,
-- sur ton projet existant "Ivy1.0" (ou tout projet créé avant ce jour).
-- ============================================================

create table if not exists personnel (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  nom text not null,
  prenom text,
  date_naissance date,
  lieu_naissance text,
  classes text[] not null default '{}',
  matieres text[] not null default '{}',
  salaire_mensuel numeric not null default 0,
  created_at timestamptz default now()
);

alter table personnel enable row level security;

create policy "direction all personnel" on personnel for all
  using (school_id = my_school_id() and my_role() = 'direction')
  with check (school_id = my_school_id() and my_role() = 'direction');
