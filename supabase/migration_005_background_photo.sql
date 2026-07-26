-- ============================================================
-- Migration : photo de fond du tableau de bord, propre à chaque école
-- (choisie par la Direction dans Paramètres, stockée comme le logo).
-- À exécuter dans Supabase > SQL Editor > New query > Run,
-- sur ton projet existant "Ivy1.0" (ou tout projet créé avant ce jour).
-- ============================================================

alter table schools add column if not exists background_photo text default '';
