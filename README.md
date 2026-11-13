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
```

PostgreSQL et Prisma sont les choix d’architecture retenus pour la persistance,
mais aucune base de données n’est requise pour compiler ou tester ce scaffold.
L’hébergement institutionnel reste à valider techniquement.

## Structure

| Chemin | Responsabilité |
| --- | --- |
| `apps/web` | Interface React, TypeScript et Vite |
| `apps/api` | API NestJS et test unitaire |
| `services/runner` | Contrat de responsabilité du futur service d’exécution isolée |
| `services/assets` | Contrat de responsabilité du futur service de ressources |
| `infra` | Emplacement des futurs éléments d’infrastructure |
| `docs` | Architecture et décisions techniques |

Voir [l’architecture](docs/architecture.md) et la
[décision de stack 0001](docs/decisions/0001-stack.md).
