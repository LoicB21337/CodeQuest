# Architecture CodeQuest

## Vue d’ensemble

Le dépôt est un monorepo npm, exécuté avec Node.js 22, contenant deux
workspaces applicatifs :

- `apps/web` : interface React et TypeScript, construite avec Vite.
- `apps/api` : API HTTP TypeScript construite avec NestJS.

Les dossiers `services/runner` et `services/assets` réservent les frontières
des services futurs sans engager leur conception détaillée. `infra` est
également un emplacement réservé. Ils ne sont pas des workspaces npm.

## Persistance

PostgreSQL est le choix de base de données relationnelle et Prisma celui d’ORM.
Ce choix convient au modèle relationnel attendu et fournit un accès aux données
typé. Le premier schéma Prisma et une migration réversible posent les tables
d’identité et d’autorisation. La connexion applicative, l’environnement de
déploiement et les opérations de persistance restent à intégrer ; le scaffold
ne requiert donc pas de base pour compiler ou exécuter ses tests.

## Contrats de frontière

- L’API expose actuellement `GET /health` pour son contrôle de disponibilité.
  Le contrat versionné proposé pour l’identité et les utilisateurs est
  `apps/api/openapi/v1.yaml` ; ses routes ne sont pas encore implémentées.
- Le module NestJS `apps/api/src/auth` fournit les primitives initiales de
  hachage Argon2id, empreintes de jetons et vérification exacte des permissions.
- Le runner devra exécuter du code soumis dans une isolation et avec des limites
  explicites ; aucun mécanisme d’exécution n’est inclus.
- Le service assets devra respecter les autorisations définies par l’API ; ni
  fournisseur de stockage ni protocole de téléversement ne sont choisis.

Les contrats runner/assets sont à préciser avant implémentation. Aucune
confiance, isolation ou autorisation n’est implicitement fournie par ces
placeholders.

## Hypothèses et validations en attente

- Node 22 et npm workspaces forment le socle commun ; les compilations sont
  propres à chaque application afin de ne pas imposer un `tsconfig` partagé
  incompatible entre Vite et NestJS.
- Le déploiement visé et l’hébergement institutionnel ne sont pas techniquement
  validés. Cette décision ne préjuge ni de l’accès à PostgreSQL ni des capacités
  réseau, stockage, conteneurisation ou exploitation.
- Aucun fournisseur d’identité externe ni infrastructure CI/Docker Compose
  n’est établi dans cette phase. Le lancement en production reste bloqué jusqu’à
  validation par l’établissement des règles et procédures applicables aux
  mineurs et aux données de compte ; aucune juridiction n’est présumée.

La décision détaillée et ses conséquences sont consignées dans
[ADR 0001](decisions/0001-stack.md).
