# CodeQuest

Socle de la plateforme de défis informatiques.

## Prérequis

- Node.js 22 (version fixée dans `.nvmrc`)
- npm fourni avec Node.js 22

## Installation et commandes

Depuis la racine du dépôt :

```sh
npm install
npm run dev --workspace @codequest/web
npm run start:dev --workspace @codequest/api
```

Le client Vite est disponible sur `http://localhost:5173`, l’API NestJS sur
`http://localhost:3000` et son contrôle de santé sur `/health`.

```sh
npm run build       # compile les deux workspaces
npm test            # exécute les tests des workspaces
npm run lint        # vérifie le code des workspaces
npm run typecheck   # vérifie les types des deux workspaces
npm run format      # formate les configurations et documents avec Prettier
npm run format:check
```

Le formatage automatique exclut volontairement les sources applicatives, hors
du périmètre de cette phase.

PostgreSQL et Prisma sont les choix d’architecture retenus pour la persistance,
mais aucune base de données n’est requise pour compiler ou tester ce scaffold.
L’hébergement institutionnel reste à valider techniquement.

## Conteneurs locaux

Les images se construisent depuis la racine du dépôt (contexte nécessaire aux
workspaces npm) et utilisent des étapes de construction distinctes des étapes
d’exécution :

```sh
docker build -f apps/api/Dockerfile -t codequest-api:local .
docker run --rm -p 3000:3000 --env-file .env.example codequest-api:local

docker build -f apps/web/Dockerfile -t codequest-web:local .
docker run --rm -p 8080:8080 codequest-web:local
```

Le fichier `.env.example` ne contient que des valeurs factices. `PORT=3000` est
utilisé par l’API ; `VITE_API_URL=http://localhost:3000` est un exemple réservé
au client et n’est pas encore consommé par l’application. Ne placez aucune
valeur secrète dans ce fichier. Ces images sont des outils de développement,
pas une proposition de topologie de production. L’environnement
d’hébergement institutionnel reste à inventorier.

La CI exécute formatage, lint, vérification de types, build, tests, audit des
dépendances de production et détection de secrets. Dependabot propose les mises
à jour des dépendances npm et des actions GitHub.

## Structure

| Chemin            | Responsabilité                                                |
| ----------------- | ------------------------------------------------------------- |
| `apps/web`        | Interface React, TypeScript et Vite                           |
| `apps/api`        | API NestJS et test unitaire                                   |
| `services/runner` | Contrat de responsabilité du futur service d’exécution isolée |
| `services/assets` | Contrat de responsabilité du futur service de ressources      |
| `infra`           | Emplacement des futurs éléments d’infrastructure              |
| `docs`            | Architecture et décisions techniques                          |

Voir [l’architecture](docs/architecture.md) et la
[décision de stack 0001](docs/decisions/0001-stack.md).
