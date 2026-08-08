-- ============================================================
-- Migration : index de performance + rattachement des notes,
-- mentions, remarques et paiements à une année scolaire précise.
--
-- Pourquoi : (1) plusieurs colonnes filtrées à chaque requête
-- (school_id, student_id, personnel_id) n'avaient pas d'index, ce qui
-- ralentira l'app à mesure que les écoles accumulent des années de
-- données ; (2) les notes/mentions/remarques étaient jusqu'ici uniques
-- par élève + matière + période SANS tenir compte de l'année scolaire —
-- un même élève sur deux années différentes verrait donc ses notes
-- d'une année écraser celles de l'autre pour la même période
-- (ex: "1er Trimestre" de cette année écrase "1er Trimestre" de l'an
-- dernier). Cette migration corrige les deux.
--
-- À exécuter dans Supabase > SQL Editor > New query > Run,
-- sur ton projet existant "Ivy1.0".
-- ============================================================

-- ---- Index de performance (school_id et clés étrangères) ----
create index if not exists idx_grades_school_id on grades(school_id);
create index if not exists idx_mentions_school_id on mentions(school_id);
create index if not exists idx_remarks_school_id on remarks(school_id);
create index if not exists idx_payments_school_id on payments(school_id);
create index if not exists idx_payments_student_id on payments(student_id);
create index if not exists idx_profiles_school_id on profiles(school_id);
create index if not exists idx_personnel_school_id on personnel(school_id);
create index if not exists idx_salary_payments_school_id on salary_payments(school_id);
create index if not exists idx_salary_payments_personnel_id on salary_payments(personnel_id);

-- ---- Colonne "année scolaire" sur notes, mentions, remarques, paiements ----
alter table grades add column if not exists academic_year text;
alter table mentions add column if not exists academic_year text;
alter table remarks add column if not exists academic_year text;
alter table payments add column if not exists academic_year text;

-- Rattache les données déjà enregistrées à l'année scolaire actuelle de
-- leur école (jusqu'ici il n'y avait qu'une seule année "en cours" par
-- école, donc toutes les données existantes lui appartiennent).
update grades g set academic_year = s.academic_year
  from schools s where g.school_id = s.id and g.academic_year is null;
update mentions m set academic_year = s.academic_year
  from schools s where m.school_id = s.id and m.academic_year is null;
update remarks r set academic_year = s.academic_year
  from schools s where r.school_id = s.id and r.academic_year is null;
update payments p set academic_year = s.academic_year
  from schools s where p.school_id = s.id and p.academic_year is null;

-- ---- Contraintes d'unicité corrigées (ajout de l'année scolaire) ----
alter table grades drop constraint if exists grades_student_id_subject_period_key;
alter table grades add constraint grades_student_subject_period_year_key
  unique (student_id, subject, period, academic_year);

alter table mentions drop constraint if exists mentions_student_id_subject_period_key;
alter table mentions add constraint mentions_student_subject_period_year_key
  unique (student_id, subject, period, academic_year);

alter table remarks drop constraint if exists remarks_student_id_period_key;
alter table remarks add constraint remarks_student_period_year_key
  unique (student_id, period, academic_year);
