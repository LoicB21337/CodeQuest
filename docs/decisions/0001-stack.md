# ADR 0001 : socle technique

- **Statut :** accepté pour le scaffold, à confirmer avec les contraintes de
  déploiement.
- **Date :** 2026-11-13.

## Contexte

La phase 0 doit fournir un monorepo compilable sur lequel les lots design
system, authentification et infrastructure pourront s’appuyer, sans présumer
des capacités de l’hébergement cible.

## Décision

- Utiliser Node.js 22 et npm workspaces.
- Créer `apps/web` avec React, TypeScript et Vite.
- Créer `apps/api` avec NestJS et TypeScript.
- Retenir PostgreSQL comme base relationnelle et Prisma comme ORM pour la
  persistance applicative.
- Réserver `services/runner`, `services/assets` et `infra` aux lots ultérieurs,
  sans implémentation prématurée.
- Garder des configurations TypeScript autonomes : `moduleResolution:
  bundler` pour Vite et compilation Node vers `dist` pour NestJS.

## Hypothèses

- La spécification de phase 0 propose le couple client React/Vite et serveur
  NestJS ; Node 22 et npm workspaces en sont le socle commun.
- PostgreSQL/Prisma est le choix retenu pour offrir une persistance relationnelle
  et un accès TypeScript typé. Le premier lot d’identité ajoute un schéma
  Prisma et sa migration réversible ; aucune URL de connexion ni intégration de
  base à l’exécution n’est configurée.
- Le PDF de spécification n’est pas présent dans ce worktree ; les décisions
  concrètes reprises ici sont celles précisées pour ce scaffold.

## Conséquences

- Les deux applications s’installent et se valident depuis la racine.
- L’API fournit `GET /health` et un test unitaire sans dépendance de base.
- Les configurations TypeScript sont séparées pour éviter de confondre
  l’environnement navigateur/bundler avec celui de NestJS/Node.
- La gestion de connexion, les secrets et la stratégie de tests en base restent
  à définir avec le lot qui activera la persistance.

## Validations restantes

Le choix ne valide pas l’hébergement institutionnel. La disponibilité des
versions Node, de PostgreSQL, du réseau, du stockage et des mécanismes de
déploiement doit être confirmée auprès de l’environnement cible avant de figer
les décisions d’exploitation.
