# Phase 0 — identité, API et exploitation

L’API versionnée est décrite dans `apps/api/openapi/v1.yaml`, sous
`/api/v1`. Les tests comparent chaque opération OpenAPI aux routes NestJS
déclarées et exercent ces routes par HTTP. La spécification fonctionnelle
Phase 0 (compte, sécurité et session) est mise en œuvre pour les parcours
authentification ci-dessous.

## Parcours servis

- **Inscription et vérification** : e-mail normalisé, pseudo unique (3–20),
  mot de passe Argon2id (12 caractères minimum), rôle `player` initial,
  jeton de vérification à usage unique (24 h). Réponse d’inscription uniforme
  et clé `Idempotency-Key` UUID v4, fingerprintée et conservée 24 h. Les
  requêtes répétées ne renvoient pas un second message.
- **Connexion** : identifiant e-mail ou pseudo. Identifiant inconnu, mauvais
  mot de passe, compte non vérifié/suspendu et verrouillage répondent par le
  même 401. Verrouillage après cinq échecs, exponentiel jusqu’à 15 minutes.
- **Mot de passe oublié** : message neutre envoyé que le compte existe ou non,
  réponse 202 uniforme, jeton à usage unique valable une heure, limites par
  adresse et réseau approximatif. La réinitialisation invalide toutes les
  sessions.
- **Session** : JWT HS256 de 15 minutes et refresh opaque de 30 jours, tous deux
  en cookies `HttpOnly; Secure; SameSite=Lax; Path=/`, host-only `__Host-`.
  Chaque rotation consomme l’ancien refresh; sa réutilisation révoque la
  session/famille concernée. L’activité authentifiée fait glisser l’expiration.
  Déconnexion courante, déconnexion globale, liste d’appareils et révocation
  individuelle sont servies; la révocation de la session courante expire aussi
  les cookies du navigateur.
- **CSRF/RBAC** : requêtes cookie non sûres exigent un cookie CSRF, son en-tête
  constant-time et un `Origin` correspondant exactement à `APP_ORIGIN`.
  `GET /admin/users` vérifie la permission `user:read`; les rôles/permissions
  sont rechargés depuis PostgreSQL.
- **Profil, export et effacement** : `GET/PATCH/DELETE /me`, export JSON des
  données actuellement représentées (identité, rôles, sessions), export des
  sessions et révocation. DELETE exige le mot de passe, rend immédiatement le
  compte inaccessible, révoque les sessions, puis un worker supprime les
  enregistrements d’identité après 30 jours.

Les migrations Prisma sont dans `apps/api/prisma/migrations/`; chaque lot
possède un `rollback.sql`. Les `down` SQL ne sont pas exécutés par Prisma
Migrate : lire le fichier et sauvegarder les données avant retour arrière.
Le worker nettoie aussi les clés d’idempotence expirées et les fingerprints
anciens de limitation de débit.

## Configuration requise

Aucune valeur secrète n’est fournie par défaut. Les parcours refusent
l’opération (503) si leur prérequis n’est pas configuré; ils ne simulent ni
la livraison ni la vérification.

| Variable | Usage |
| --- | --- |
| `DATABASE_URL` | PostgreSQL utilisé par Prisma et les migrations. |
| `ACCESS_TOKEN_SECRET` | Clé aléatoire d’au moins 32 octets pour signer les JWT. |
| `AUTH_FINGERPRINT_SECRET` | Clé aléatoire d’au moins 32 octets pour HMAC des identifiants de limitation et clés/idempotence. |
| `APP_ORIGIN` | Origine exacte autorisée pour CORS et les contrôles CSRF. |
| `COMPROMISED_PASSWORDS_FILE` | Fichier local contenant un fingerprint SHA-1 hexadécimal complet (40 caractères) par ligne, sans compte ni autre texte. Aucun fichier/liste n’est inclus. |
| `MAIL_MODE` | Doit être `smtp`. Aucun transport mémoire ou succès fictif n’existe. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM` | Serveur et expéditeur SMTP explicites. `SMTP_USER` et `SMTP_PASSWORD` doivent être fournis ensemble si l’auth SMTP est utilisée. |
| `SMTP_SECURE` | Doit valoir `true` en production. En développement, un serveur SMTP local de test (par ex. Mailpit) peut utiliser le mode non TLS. |
| `PUBLIC_API_URL` | Origine publique de l’API utilisée dans les liens e-mail; HTTPS en production. Les jetons restent dans le fragment URL et ne sont donc pas envoyés dans la requête GET ou le referrer. |
| `HTTPS_CERT_FILE`, `HTTPS_KEY_FILE` | Paire facultative de fichiers TLS pour le serveur local; en production, TLS peut terminer au proxy approuvé de l’établissement. |

Exemple de configuration de **développement** (valeurs sans secret, service
SMTP à lancer explicitement) :

```dotenv
MAIL_MODE=smtp
SMTP_HOST=127.0.0.1
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_FROM=CodeQuest <no-reply@localhost>
PUBLIC_API_URL=https://localhost:3000
APP_ORIGIN=https://localhost:3000
```

Le navigateur local doit faire confiance au certificat TLS utilisé pour
`localhost` (ou à un proxy HTTPS local). Ne désactivez pas `Secure` pour faire
fonctionner un cookie de session en HTTP. Générez les deux clés avec un
générateur cryptographique et injectez-les par environnement; ne les copiez
pas dans Git. Fournissez également `DATABASE_URL` et une vraie liste locale de
mots de passe compromis avant d’essayer l’inscription ou la réinitialisation.

Les emails sont du texte brut, jamais journalisés. Les échecs SMTP sont
remplacés par une réponse générique sans détails de transport. Les contrôleurs,
le filtre d’erreur et le worker ne journalisent ni e-mail, mot de passe, cookie,
jeton, contenu du message ni exception SQL.

## Blocages explicites avant activation/lancement

- **Services non fournis ici** : aucun PostgreSQL, serveur SMTP de
  développement, secrets d’application, liste de mots de passe compromis,
  certificat TLS ou compte d’administration n’est livré/configuré. Les
  migrations ont été validées côté schéma mais pas appliquées sur un serveur
  PostgreSQL; les opérations dépendantes restent bloquées sans configuration.
- **Provisionnement RBAC** : les migrations créent `player`, `administrator`,
  `user:read` et l’association permission-administrateur; aucun utilisateur
  administrateur n’est créé. `GET /admin/users` reste interdit jusqu’à
  provisionnement contrôlé d’un rôle, qui doit être audité par l’établissement.
  L’affectation du rôle contextuel `capitaine` attend le modèle d’équipes.
- **Effacement lié au domaine** : aucune table de scores/messages n’existe dans
  ce lot. Le worker efface les données d’identité après 30 jours, mais ne peut
  pas préserver/anonymiser « Joueur supprimé » dans les futurs scores/messages.
  L’effacement ne peut pas être considéré complet en production avant
  l’intégration transactionnelle de ces entités et de leurs règles de
  conservation.
- **Données exportées** : l’export ne contient que les données actuellement
  modélisées par l’API (compte, rôles, sessions). Profil étendu, équipes,
  scores, messages, badges et historique produit seront à ajouter à l’export
  quand ces schémas existeront.
- **Temps réel** : aucun service WebSocket n’est présent. Authentification à
  l’ouverture et fermeture immédiate des connexions à la révocation ne peuvent
  pas être réalisées avant le lot temps réel.
- **Règles pour les mineurs** : **mise en service bloquée** jusqu’à validation
  par l’établissement des exigences applicables, des politiques de compte, de
  conservation et des procédures. Aucune juridiction, limite d’âge ou règle de
  consentement n’est présumée ici.

Les routes hors périmètre restent absentes de cette spécification; leur
absence n’est pas présentée comme une implémentation.
