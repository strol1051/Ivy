-- ============================================================
-- Migration : ajout du "Frais d'entrée" par classe, en plus des frais
-- d'inscription et de scolarité déjà existants.
-- À exécuter dans Supabase > SQL Editor > New query > Run,
-- sur ton projet existant "Ivy1.0" (ou tout projet créé avant ce jour).
-- ============================================================

alter table tuition_fees add column if not exists entree numeric not null default 0;
