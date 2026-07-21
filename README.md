# Gestion Scolaire — Guide de démarrage (A à Z, version multi-écoles)

Cette version sert **plusieurs écoles clientes** depuis une seule application :
une école ne voit jamais les données d'une autre. Toi seul (l'éditeur du
logiciel) as accès à Supabase/Vercel/GitHub — chaque école n'a besoin que d'un
compte Direction dans l'application elle-même.

Outils nécessaires : **Node.js**, un compte **GitHub**, un compte **Supabase**,
un compte **Vercel**, et la **CLI Supabase** (pour l'Edge Function — voir Étape 4).

---

## Étape 1 — Installer Node.js

https://nodejs.org → version LTS. Vérifie avec :
```
node -v
npm -v
```

## Étape 2 — Créer le projet Supabase

1. https://supabase.com → **New project** → nom, mot de passe de base, région
   proche d'Haïti (US East).
2. **SQL Editor** → **New query** → colle tout le contenu de
   `supabase/schema.sql` → **Run**. Ça crée toutes les tables, y compris la
   table `schools` qui sépare les données de chaque école cliente.
3. **Project Settings** → **API** → note l'**URL** et la clé **anon public**
   (onglet *Legacy anon, service_role API keys* si tu vois la nouvelle interface).
4. **Authentication** → **Providers** → vérifie que **Email** est activé.
   **Authentication** → **Settings** → tu peux décocher "Confirm email" pour
   la phase pilote (les comptes créés par la Direction sont de toute façon
   déjà confirmés automatiquement par l'Edge Function).

## Étape 3 — Configurer et lancer en local

```
npm install
copy .env.example .env      (Mac/Linux : cp .env.example .env)
```
Remplis `.env` avec ton URL et ta clé anon Supabase. Puis :
```
npm run dev
```

À ce stade, si tu vas sur l'adresse locale, tu verras l'écran de connexion —
mais aucun compte n'existe encore. Passe à l'étape 4 avant de pouvoir te
connecter.

## Étape 4 — Déployer l'Edge Function (permet à la Direction de créer des comptes)

Cette fonction tourne sur les serveurs de Supabase, jamais dans le navigateur
— c'est ce qui permet de créer des comptes Enseignant/Secrétaire de façon
sécurisée sans jamais exposer de clé secrète.

1. Installe la CLI Supabase (une seule fois) :
   ```
   npm install -g supabase
   ```
2. Connecte-toi :
   ```
   supabase login
   ```
   (ouvre une page dans ton navigateur pour autoriser l'accès)
3. Relie ce dossier à ton projet Supabase — remplace `TON_PROJECT_REF` par
   l'identifiant visible dans l'URL de ton dashboard Supabase
   (`https://supabase.com/dashboard/project/TON_PROJECT_REF`) :
   ```
   supabase link --project-ref TON_PROJECT_REF
   ```
4. Déploie la fonction :
   ```
   supabase functions deploy create-user
   ```

C'est fait une seule fois par projet Supabase (donc une seule fois, même si
tu ajoutes des écoles ensuite sur ce même projet).

## Étape 5 — Ajouter ta première école cliente

Ouvre `supabase/provision-new-school.sql` dans ce dossier — il contient les
3 étapes précises (créer l'école, créer le compte de connexion de la
Direction dans **Authentication → Users**, relier les deux). C'est **toi
seul** qui fais ça, à chaque nouvelle école signée.

Une fois fait, donne à cette école son email et son mot de passe : ils se
connectent sur ton site et arrivent directement dans leur propre espace.

## Étape 6 — GitHub

```
git init
git add .
git commit -m "Premier commit"
git branch -M main
git remote add origin https://github.com/TON-NOM-UTILISATEUR/NOM-DU-REPO.git
git push -u origin main
```

## Étape 7 — Déployer sur Vercel

1. https://vercel.com → **Continue with GitHub** → **Add New Project** →
   sélectionne ton repo.
2. **Environment Variables** → ajoute `VITE_SUPABASE_URL` et
   `VITE_SUPABASE_ANON_KEY` (les mêmes que dans ton `.env`).
3. **Deploy**.

Chaque nouveau `git push` redéploie automatiquement.

---

## Fonctionnalités incluses

- **Multi-écoles** : une seule base de données, chaque école cliente
  totalement isolée des autres (sécurité appliquée au niveau de la base,
  pas seulement de l'interface).
- Trois rôles par école : **Direction** (accès complet), **Secrétaire**
  (élèves, notes, paiements — modification nécessite l'autorisation de la
  Direction), **Enseignant** (notes uniquement, ses classes seulement).
- Élèves : fiche complète, matricule automatique (3 lettres du nom + 2 du
  prénom + numéro), modification, fiche imprimable au format A4/Lettre.
- Notes par trimestre, avec mentions pour les classes Kind et notes
  chiffrées + coefficients pour les autres.
- Bulletins avec moyenne pondérée, place dans la classe, remarque de la
  Direction.
- Paiements : frais d'inscription et de scolarité séparés, état imprimable
  par élève ou par classe.
- Décision de fin d'année, Statistiques, apparence personnalisable par école.

## Sécurité — comment ça se répartit

- **Toi** : seul à avoir accès à Supabase, Vercel, GitHub. Active la
  double authentification (2FA) sur ces trois comptes.
- **Chaque Direction cliente** : n'a besoin que d'un email/mot de passe pour
  l'application — jamais d'accès à l'infrastructure technique.
- **Isolation entre écoles** : appliquée par les règles de sécurité (RLS)
  directement dans la base de données — même en cas de bug dans l'interface,
  une école ne peut techniquement pas lire les données d'une autre.
- Le **service_role key** (la clé la plus sensible de Supabase) n'existe que
  côté serveur, dans l'Edge Function — jamais dans le code du site, jamais
  visible du navigateur.

## En cas de blocage

- Erreur `VITE_SUPABASE_URL` manquante → vérifie `.env`, relance `npm run dev`.
- La Direction n'arrive pas à créer un compte → vérifie que l'Edge Function
  a bien été déployée (Étape 4) et que tu es connecté en tant que Direction.
- Un nouveau compte ne peut pas se connecter → vérifie dans **Authentication
  → Users** sur Supabase que le compte existe et n'attend pas de
  confirmation par email.
