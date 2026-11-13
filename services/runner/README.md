# Service runner

Responsabilité prévue : exécuter des soumissions de code dans un environnement
isolé, avec limites de ressources et sans accès implicite aux secrets ou aux
services internes.

Contrat à préciser avant implémentation : requête d’exécution authentifiée par
l’API, langage/version et source explicites, réponse structurée (résultat,
sortie et statut), limites et délai d’exécution. Ce dossier ne contient pas
encore de moteur d’exécution.
