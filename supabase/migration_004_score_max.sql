-- ============================================================
-- Migration : les notes peuvent désormais dépasser 100
-- (le coefficient définit maintenant la note maximale d'une matière,
-- ex: coefficient 300 → notes de 0 à 300)
-- À exécuter dans Supabase > SQL Editor > New query > Run,
-- sur ton projet existant "Ivy1.0" (ou tout projet créé avant ce jour).
-- ============================================================

alter table grades drop constraint if exists grades_score_check;
alter table grades add constraint grades_score_check check (score >= 0);
