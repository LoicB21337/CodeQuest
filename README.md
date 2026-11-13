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

## Environnement local conteneurisé

Compose démarre le web, l’API, PostgreSQL, Redis, MinIO et Mailpit. Les
Dockerfiles web/API sont multi-stage et les deux conteneurs applicatifs
s’exécutent sans privilèges root. Les ports hôte sont liés à `127.0.0.1`.

```sh
docker compose --env-file .env.example up --build
docker compose --env-file .env.example ps
docker compose --env-file .env.example down
docker compose --env-file .env.example down -v
```

Le web est disponible sur `http://localhost:8080`, l’API et son healthcheck sur
`http://localhost:3000/health`, la console MinIO sur `http://localhost:9001` et
Mailpit sur `http://localhost:8025`. PostgreSQL, Redis, l’API S3 MinIO et SMTP
écoutent respectivement sur les ports `5432`, `6379`, `9000` et `1025`.
Compose vérifie l’état des conteneurs ; la commande `ps` ci-dessus affiche leur
état de santé. PostgreSQL, Redis, MinIO et Mailpit conservent leurs données dans
des volumes nommés. La dernière commande supprime ces volumes et réinitialise
les données.

`.env.example` ne contient que des valeurs factices locales. Les identifiants
PostgreSQL, Redis et MinIO ne doivent jamais être réutilisés ailleurs. `PORT`
est utilisé par l’API ; `VITE_API_URL` n’est pas encore consommé par le client.
L’API actuelle n’est pas encore intégrée à PostgreSQL, Redis, MinIO ou Mailpit ;
Compose ne prétend donc pas configurer ces connexions. Le Runner isolé n’étant
pas implémenté, aucun service Runner n’est fourni et l’exécution de code soumis
n’est pas disponible.

Compose et ces images sont destinés au développement local, pas une proposition
de topologie de production. L’environnement d’hébergement institutionnel reste
à inventorier.

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
