-- ============================================================
-- Migration : adresse et téléphone de l'école, affichés sur les
-- documents imprimables (bulletin, fiche technique, état de paiement,
-- décision de fin d'année). Renseignés par la Direction dans Paramètres.
-- À exécuter dans Supabase > SQL Editor > New query > Run,
-- sur ton projet existant "Ivy1.0" (ou tout projet créé avant ce jour).
-- ============================================================

alter table schools add column if not exists address text default '';
alter table schools add column if not exists phone text default '';
