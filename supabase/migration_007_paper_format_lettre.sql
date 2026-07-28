-- ============================================================
-- Migration : le format papier "Lettre" devient la valeur par défaut
-- pour toute nouvelle école ajoutée (reste modifiable au cas par cas
-- dans Paramètres > Format du papier).
-- À exécuter dans Supabase > SQL Editor > New query > Run,
-- sur ton projet existant "Ivy1.0" (ou tout projet créé avant ce jour).
-- ============================================================

alter table schools alter column paper_format set default 'Lettre';
