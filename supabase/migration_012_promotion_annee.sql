-- ============================================================
-- Migration : statut de l'élève (actif / diplômé / inactif), pour
-- le "Passage à l'année supérieure" — un élève diplômé ou retiré
-- disparaît des listes actives (élèves, notes, bulletins, paiements,
-- statistiques) sans jamais être supprimé : son dossier reste
-- consultable en base.
--
-- À exécuter dans Supabase > SQL Editor > New query > Run,
-- sur ton projet existant "Ivy1.0".
-- ============================================================

alter table students add column if not exists statut text not null default 'actif';
alter table students drop constraint if exists students_statut_check;
alter table students add constraint students_statut_check check (statut in ('actif', 'diplome', 'inactif'));

create index if not exists idx_students_school_statut on students(school_id, statut);
