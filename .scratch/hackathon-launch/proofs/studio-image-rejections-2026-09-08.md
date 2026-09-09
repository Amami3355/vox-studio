# Trois rejets de propagation_light — diagnostic du run de répétition

Job `b68869a4-e436-43b2-8985-a57ca8f7455f`, Run `68871fb6-927a-4549-b194-ae72261d4c97`.
État distant relu : terminal `blocked`, raison « Image remains rejected after two corrections
for this identity. ». 23 appels comptabilisés, une recherche, quatre générations d’image,
une narration, aucun appel fournisseur sans réponse. Aucun rendu n’a été effectué.

La première image, `simultaneous_strike`, a passé les revues modèle et humaine. Les trois
rejets automatiques concernent les trois versions de la deuxième identité `propagation_light`.
Ils ne proviennent ni du crash de répétition, ni d’une revue finale du film.

## Verdicts conservés et inspection des images

| Version | Motifs enregistrés par le reviewer | Observation directe |
| --- | --- | --- |
| 1 | Courbure des ondes sonores à droite inversée ; valeurs numériques des vitesses manquantes | Le dessin contient deux groupes d’arcs opposés et les libellés Speed of Light / Speed of Sound sans valeurs. |
| 2 | Texte intégré interdit ; arcs sur le trajet lumineux au lieu du faisceau continu demandé | Les deux pistes portent du texte et se terminent par des arcs. |
| 3 | Représentation pratiquement identique des deux pistes : ligne droite suivie d’arcs | Le texte a disparu, mais les deux pistes gardent cette géométrie similaire. |

La qualification « scientifiquement inexact » appartient aux verdicts modèle. Le constat
établi ici est le défaut de différenciation visuelle demandé par ce storyboard ; représenter
la lumière par des ondes n’est pas, à lui seul, une impossibilité physique.

## Transmission réellement vérifiée

Le replay `../runtime/studio-rehearsal-20260908/image-rejections/audit.py` compare les entrées
persistées de chaque étape `image_intent` à l’historique exact des candidats :

- Version 1 : aucun candidat précédent.
- Version 2 : candidat 1 avec son verdict complet, observations `problem` et `expected` incluses.
- Version 3 : candidats 1 et 2 avec leurs deux verdicts complets.

Les trois intentions correspondent aux résultats sauvegardés, et les trois requêtes exactes
correspondent aux commandes `production.image_start`. Les trois digests de requête diffèrent.
Le créateur d’intention reçoit donc les retours complets. Le fournisseur d’image reçoit leur
reformulation dans un nouveau prompt d’intention, sans transmission directe des verdicts bruts
ou des pixels du candidat précédent. La version 2 précise la courbure vers la droite et déplace
les valeurs numériques dans `rendererElements`. La version 3 renforce le faisceau continu.
Cette transmission ne garantit pas l’application de toutes les corrections dans le bitmap.

## Causes établies

1. **Contradiction dans l’intention initiale.** `visibleDetails` demande des textes chiffrés,
   alors que le prompt impose « include no text » et « No lettering ». Le reviewer réclame
   ensuite ces chiffres absents. Ils sont pourtant déjà prévus dans le film : annotation
   « Nearly 300,000 kilometers per second » et SceneInstance `stat_counter` affichant 343 m/s.
2. **Responsabilités image/renderer mélangées.** L’intention place les arcs et lignes à la fois
   dans les détails visibles et dans les éléments à ajouter par le renderer. Le plan actuel
   contient des annotations et un focus, mais pas les flèches, arcs ou ligne de cote annoncés
   par l’intention. Le prompt sérialise aussi les textes réservés au renderer tout en interdisant
   de les dessiner. La règle textuelle existante n’empêche pas cette incohérence sémantique.
3. **Correction partielle du générateur.** Après reformulation, la troisième image élimine
   effectivement le texte, mais conserve les arcs sur les deux pistes. Les requêtes différentes
   excluent une simple répétition de la même requête mise en cache.

Le reviewer change également son exigence sur le texte entre les versions 1 et 2. On ne peut
donc pas attribuer toute cette dépense à une mauvaise exécution du seul générateur d’images.

## Conservation et limites

Le checkpoint conserve `images.propagation_light[*]` (intention, requête exacte, candidat,
verdict complet, acceptation), les entrées/sorties des étapes dans `steps`, et les décisions
humaines dans `humanImageReviews`. Le journal `provider-calls.jsonl` conserve les appels,
leurs réponses et leurs compteurs ; les verdicts complets sont dans le checkpoint.
Le Studio ne projette actuellement que le résumé `assessment`, pas les observations détaillées.

Archive binaire récupérée sans mutation : `image-rejections.tar.gz`, SHA-256
`34655928c1420fce062726dda96583a030e03eb2e73a11a61b5099bcc7307434`.
Checkpoint : `c6d50ed328ae5add2ab3a16b6620423d8d63d258c91998df3648f72930d502a2`.
Les trois PNG téléchargés sont vérifiés par leurs empreintes. Résultat du replay :
`../runtime/studio-rehearsal-20260908/image-rejections/feedback-proof.json`.
Les fonctions d’intention et de compilation du prompt ont aussi été relues dans le worker déployé.

Ce diagnostic ne modifie aucun verdict, compteur, autorisation ou état distant. La correction
doit rendre cohérente l’attribution des éléments au bitmap ou au plan avant un nouvel appel,
et conserver des consignes de correction explicites. Une quatrième tentative aveugle ne résout
pas cette incohérence ; la limite par identité a correctement arrêté le run.
