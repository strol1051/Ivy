-- ============================================================
-- Schéma multi-écoles — Gestion Scolaire
-- À exécuter dans Supabase > SQL Editor > New query > Run
-- Une seule base sert plusieurs écoles ; chaque table est
-- rattachée à une école via school_id, et les règles de
-- sécurité (RLS) empêchent une école de voir les données
-- d'une autre.
-- ============================================================

create extension if not exists "pgcrypto";

-- ============================================================
-- ÉCOLES
-- ============================================================
create table if not exists schools (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Mon École',
  code text default '',
  logo text default '',
  academic_year text default '',
  currency text default 'HTG',
  theme_color text default '#1B2A4A',
  theme_style text default 'classique',
  paper_format text default 'A4',
  params_password text default '',
  created_at timestamptz default now()
);

-- ============================================================
-- PROFILS (un profil = un compte lié à un utilisateur Supabase Auth)
-- ============================================================
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  school_id uuid not null references schools(id) on delete cascade,
  name text not null,
  role text not null default 'enseignant' check (role in ('direction', 'secretaire', 'enseignant')),
  classes text[] not null default '{}',
  created_at timestamptz default now()
);

create or replace function my_school_id()
returns uuid
language sql stable
security definer
set search_path = public
as $$
  select school_id from profiles where id = auth.uid()
$$;

create or replace function my_role()
returns text
language sql stable
security definer
set search_path = public
as $$
  select role from profiles where id = auth.uid()
$$;

-- ============================================================
-- ÉLÈVES
-- ============================================================
create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  matricule_num bigserial,
  nom text not null,
  prenom text,
  classe text not null,
  photo text,
  sexe text,
  nisu text,
  date_naissance date,
  lieu_naissance text,
  adresse jsonb default '{}'::jsonb,
  responsable jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  unique (school_id, matricule_num)
);

-- ============================================================
-- MATIÈRES
-- ============================================================
create table if not exists subjects (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  name text not null,
  unique (school_id, name)
);

create table if not exists class_subjects (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  classe text not null,
  subject text not null,
  unique (school_id, classe, subject)
);

-- ============================================================
-- NOTES ET MENTIONS
-- ============================================================
create table if not exists grades (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  student_id uuid references students(id) on delete cascade,
  subject text not null,
  period text not null,
  score numeric not null check (score >= 0),
  unique (student_id, subject, period)
);

create table if not exists mentions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  student_id uuid references students(id) on delete cascade,
  subject text not null,
  period text not null,
  mention text not null,
  unique (student_id, subject, period)
);

-- ============================================================
-- COEFFICIENTS
-- ============================================================
create table if not exists coefficients (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  classe text not null,
  subject text not null,
  coeff numeric not null default 1,
  unique (school_id, classe, subject)
);

-- ============================================================
-- FRAIS ET PAIEMENTS
-- ============================================================
create table if not exists tuition_fees (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  classe text not null,
  inscription numeric not null default 0,
  scolarite numeric not null default 0,
  unique (school_id, classe)
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  student_id uuid references students(id) on delete cascade,
  matricule text,
  amount numeric not null check (amount > 0),
  payment_date date not null default current_date,
  label text,
  note text,
  created_at timestamptz default now()
);

-- ============================================================
-- REMARQUES (bulletin)
-- ============================================================
create table if not exists remarks (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  student_id uuid references students(id) on delete cascade,
  period text not null,
  text text,
  unique (student_id, period)
);

-- ============================================================
-- SÉCURITÉ (RLS)
-- ============================================================
alter table schools enable row level security;
alter table profiles enable row level security;
alter table students enable row level security;
alter table subjects enable row level security;
alter table class_subjects enable row level security;
alter table grades enable row level security;
alter table mentions enable row level security;
alter table coefficients enable row level security;
alter table tuition_fees enable row level security;
alter table payments enable row level security;
alter table remarks enable row level security;

create policy "read own school" on schools for select using (id = my_school_id());
create policy "direction update own school" on schools for update using (id = my_school_id() and my_role() = 'direction');

create policy "read profiles in my school" on profiles for select using (school_id = my_school_id());
create policy "direction insert profiles in my school" on profiles for insert
  with check (school_id = my_school_id() and my_role() = 'direction');
create policy "direction update profiles in my school" on profiles for update
  using (school_id = my_school_id() and my_role() = 'direction');
create policy "direction delete profiles in my school" on profiles for delete
  using (school_id = my_school_id() and my_role() = 'direction');
create policy "self update own profile" on profiles for update using (id = auth.uid());

create policy "school members read students" on students for select using (school_id = my_school_id());
create policy "direction secretaire write students" on students for insert
  with check (school_id = my_school_id() and my_role() in ('direction', 'secretaire'));
create policy "direction secretaire update students" on students for update
  using (school_id = my_school_id() and my_role() in ('direction', 'secretaire'));
create policy "direction secretaire delete students" on students for delete
  using (school_id = my_school_id() and my_role() in ('direction', 'secretaire'));

create policy "school members read subjects" on subjects for select using (school_id = my_school_id());
create policy "direction write subjects" on subjects for all
  using (school_id = my_school_id() and my_role() = 'direction')
  with check (school_id = my_school_id() and my_role() = 'direction');

create policy "school members read class_subjects" on class_subjects for select using (school_id = my_school_id());
create policy "direction write class_subjects" on class_subjects for all
  using (school_id = my_school_id() and my_role() = 'direction')
  with check (school_id = my_school_id() and my_role() = 'direction');

create policy "school members all grades" on grades for all
  using (school_id = my_school_id()) with check (school_id = my_school_id());
create policy "school members all mentions" on mentions for all
  using (school_id = my_school_id()) with check (school_id = my_school_id());

create policy "school members read coefficients" on coefficients for select using (school_id = my_school_id());
create policy "direction write coefficients" on coefficients for all
  using (school_id = my_school_id() and my_role() = 'direction')
  with check (school_id = my_school_id() and my_role() = 'direction');

create policy "direction secretaire read tuition_fees" on tuition_fees for select
  using (school_id = my_school_id() and my_role() in ('direction', 'secretaire'));
create policy "direction write tuition_fees" on tuition_fees for all
  using (school_id = my_school_id() and my_role() = 'direction')
  with check (school_id = my_school_id() and my_role() = 'direction');

create policy "direction secretaire read payments" on payments for select
  using (school_id = my_school_id() and my_role() in ('direction', 'secretaire'));
create policy "direction secretaire insert payments" on payments for insert
  with check (school_id = my_school_id() and my_role() in ('direction', 'secretaire'));
create policy "direction delete payments" on payments for delete
  using (school_id = my_school_id() and my_role() = 'direction');

create policy "school members read remarks" on remarks for select using (school_id = my_school_id());
create policy "direction write remarks" on remarks for all
  using (school_id = my_school_id() and my_role() = 'direction')
  with check (school_id = my_school_id() and my_role() = 'direction');
