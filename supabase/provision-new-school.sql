-- ============================================================
-- Ajouter une nouvelle école cliente
-- À exécuter par TOI SEUL, dans Supabase > SQL Editor.
-- Personne d'autre n'a besoin (ni ne doit avoir) accès à ceci.
-- ============================================================

-- ÉTAPE 1 : Crée l'école. Modifie le nom, puis Run.
-- Note bien l'ID retourné (colonne "id") — tu en as besoin à l'étape 3.
insert into schools (name) values ('Nom de la nouvelle école')
returning id;

-- ÉTAPE 2 : Crée le compte de connexion (email + mot de passe) de la Direction
-- de cette école.
-- Dans le Dashboard Supabase (pas ici en SQL) :
--   Authentication > Users > Add user
--   Renseigne un email et un mot de passe, décoche "Auto Confirm User" si tu
--   veux qu'ils confirment par email, ou coche-le pour l'activer tout de suite.
-- Note bien l'UUID de l'utilisateur créé (colonne "UID") — tu en as besoin
-- à l'étape 3.

-- ÉTAPE 3 : Relie ce compte à l'école en tant que Direction.
-- Remplace SCHOOL_ID_ICI (de l'étape 1) et USER_ID_ICI (de l'étape 2), puis Run.
insert into profiles (id, school_id, name, role, classes)
values ('USER_ID_ICI', 'SCHOOL_ID_ICI', 'Nom de la Direction', 'direction', '{}');

-- C'est tout. Donne à cette école son email et son mot de passe :
-- ils se connectent sur le site avec, et arrivent directement dans LEUR école,
-- sans jamais voir les données des autres écoles clientes.
