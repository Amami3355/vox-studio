# Analyse visuelle et éditoriale de la vidéo du jalon 2

Le résultat démontre une chaîne de production fonctionnelle et une synchronisation exploitable,
mais il manque l'explication visuelle animée attendue. Le caractère statique vient à la fois
du brief limité à une image, du découpage de la narration, de la sélection des scènes et du
vocabulaire d'animation disponible. Augmenter seulement le nombre de capabilities ne suffira pas.

Analyse du 8 septembre 2026, après le commit `864144f`. La validation technique de l'utilisateur
est acquise ; l'acceptation artistique et éditoriale reste ouverte. Ce rapport ne modifie ni la
vidéo, ni son Run, ni les autorisations consommées.

**Méthode et périmètre.** Inspection de 25 images extraites du MP4 toutes les deux secondes,
de frames de livraison en plus grande taille, du plan final, de la narration, du document
compilé, des horodatages de la Take et du code des scènes. Le SHA-256 du MP4 local correspond
à la preuve de livraison : `50d1ddbc973ff54a8c7ee4b00147cec1d27b7f3abec3a6b533960e916d2b9de9`.
Les observations de mouvement reposent sur ces images, les événements et leur implémentation ;
elles ne constituent pas une nouvelle appréciation auditive de l'interprétation de la voix.
Ce rapport n'effectue pas une nouvelle vérification scientifique des sources.

La [planche de lecture locale](../runtime/editorial-review/contact-sheet.jpg) se lit de gauche
à droite puis de haut en bas : 0, 2, 4… 48 secondes. Elle reste en stockage runtime ignoré.

**1. Le temps d'écran confirme le problème.**

Les limites ci-dessous viennent du document compilé à 30 fps. Sa durée est de 49,23 secondes ;
le conteneur MP4 mesure 49,28 secondes. Les pourcentages utilisent la durée de la composition.

| Intervalle | Scène | Durée | Observation |
| --- | --- | ---: | --- |
| 0–14,63 s | `typographic_statement` : « gravity isn't enough » | 14,63 s | Trois mots occupent tout le premier paragraphe. Le dernier événement arrive à 2,77 s ; après sa brève transition, le carton tient encore plus de 11 secondes. |
| 14,63–27,90 s | `typographic_statement` : « restartable engines » | 13,27 s | Même composition sur fond vert. Les mots sont soulignés vers 22,53 et 23,23 s, après presque huit secondes dans ce carton. |
| 27,90–39,67 s | `stat_counter` : « Up to three engine burns » | 11,77 s | Le chiffre apparaît sur « three », à 30,30 s. La narration aborde ensuite les grid fins et le freinage, mais le tableau reste le même. |
| 39,67–49,23 s | `image_context` : illustration d'atterrissage | 9,57 s | Première et seule image. Apparition, léger mouvement de caméra, puis deux étiquettes sur « soft » et « controlled ». |

Les deux cartons occupent **27,90 secondes, soit 56,7 % du film**. Pendant **80,6 % du film**,
aucune illustration du sujet n'est montrée. Quatre scènes ne donnent ici que trois compositions
distinctes, puisque les deux premières utilisent le même template. Le sentiment de diaporama
est donc fondé, même si des animations d'entrée et des événements existent.

**2. Les visuels portent trop peu de l'explication.**

Le premier carton pose une idée claire. Sa durée dilue cet effet : la narration passe de la
chute à la comparaison avec un spaceplane, puis aux moteurs, sans que l'image accompagne
ces changements. Une illustration de la trajectoire et une mise en évidence du freinage
pourraient faire comprendre ce que le titre se contente d'annoncer.

Le deuxième carton affiche les moteurs et les ergols alors que la narration commence par
les parachutes, l'échauffement et la destruction des boosters. Le titre anticipe une autre
partie du paragraphe ; le spectateur doit construire seul les images intermédiaires.
Le détour historique consomme environ sept secondes avant « Today ». Pour une prochaine
version centrée sur le mécanisme, je privilégierais une explication plus directe.

Le troisième tableau transforme un processus en chiffre. « Jusqu'à trois » est utile,
mais ne montre ni la succession des phases, ni les organes qui interviennent. Le même
tableau demeure quand la voix dit « grid fins », « steer », « entry burn » et « slows ».
Ce sont précisément des occasions d'animation explicative.

L'illustration finale apporte enfin un sujet reconnaissable, mais reste une image de contexte.
Le booster est déjà présenté avec ses jambes déployées ; le mot « deploy » ne produit aucun
changement de configuration. Le mouvement de caméra déplace l'ensemble image/texte, sans
animer le booster ou ses éléments. Le cadrage coupe le haut de l'objet, et l'illustration
paysage est recadrée dans une zone presque carrée avec `objectFit: cover`.

La direction graphique est lisible mais fragmentée : deux aplats orange/vert, un tableau
clair, puis une illustration stylisée. Les motifs annoncés dans la VisualBible
(`vector-grid`, `spacecraft-telemetry`, `propulsion-flame`) ne constituent pas une progression
visuelle perceptible à travers le film. La mention générique « VISUAL CONTEXT » relève du
template et n'aide pas à comprendre l'atterrissage. L'illustration est explicitement
conceptuelle ; elle ne doit pas devenir, par le seul ajout de flèches, un dessin technique
présenté comme exact.

Le texte parlé compte 120 tokens de mots dans le document compilé. Le problème principal
observé n'est donc pas une quantité exceptionnelle de narration, mais la faible quantité
d'informations visuelles qui l'accompagne. La formule « fight physics » reste abstraite,
et la conclusion « controlled landing » répète l'objectif plutôt que d'apporter une dernière
démonstration visuelle. La question du champ `hook` n'est pas prononcée telle quelle dans les Beats.

**3. Ce qui relève du catalogue, et ce qui relève de la planification.**

Le [registre](../../../packages/video/src/scenes/registry.ts) contient huit capabilities :
`bar_chart`, `line_chart`, `stat_counter`, `quote`, `timeline`, `typographic_statement`,
`image_context` et `character_explainer`. Il est bien équipé pour des tableaux éditoriaux,
des chiffres et des citations. Il est peu équipé pour montrer un objet, ses pièces et les
étapes d'un mécanisme. Il n'existe dans ce registre ni séquence d'images dédiée, ni vue
illustrée plein cadre dédiée, ni diagramme de processus générique.

`image_context` possède un seul layout, `splitLeft`, et trois actions : révéler l'image,
révéler le texte, afficher un mot sur l'image. Il ne sait pas actuellement enchaîner plusieurs
assets, désigner une région précise, changer de cadrage sur un word anchor ou faire évoluer
un objet. `character_explainer` peut animer un personnage détouré, mais sa vocation ne couvre
pas automatiquement une démonstration mécanique. `timeline` décrit des événements datés ;
son propre catalogue renvoie les étapes sans dates vers un diagramme absent du registre.
Le choix de ne pas inventer des dates était correct, mais le chiffre seul remplace mal le processus.

Cependant, les premières causes de ce résultat sont aussi dans les décisions de production :

- Le [brief opérateur](../../../deploy/crew/milestone-2/request.json) impose explicitement
  **exactement une image générée**. Il demande malgré cela quatre ou cinq moments visuels
  distincts et des animations significatives sur les mots. La première contrainte a été
  respectée ; les deux autres n'ont été satisfaites que faiblement. Ce choix délégué ne
  correspond pas suffisamment à l'objectif d'un film porté par les images.
- Le [prompt de narration](../../../services/agents/src/vox_crew/adk_roles.py) demande quatre
  ou cinq Beats. Ici, chaque Beat est un paragraphe de plusieurs phrases. Dans le
  [contrat actuel](../../../packages/video/src/core/types.ts), une scène couvre des Beats
  entiers, et leur partage entre plusieurs scènes est refusé. Quatre Beats donnent donc
  au plus quatre scènes séquentielles. Une scène riche pourrait évoluer intérieurement,
  mais les trois premières choisies ici ne le font presque pas.
- La capability typographique publie un minimum de 2 secondes et une durée recommandée
  de 4 secondes. Son propre commentaire avertit qu'un carton tenu au-delà de sa phrase
  devient un temps mort. Pourtant, le [contrôle de durée](../../../packages/video/src/compile/index.ts)
  signale uniquement les durées inférieures au minimum ou à la recommandation. Un carton
  de 14 secondes reste vert. Le rapport de compilation sans avertissement ne mesure pas
  cette faiblesse éditoriale.
- L'auteur de scènes remplit une structure déjà choisie. Le rôle de réparation ne peut
  ni ajouter des scènes ni changer leur capability. Il ne peut donc pas transformer à lui
  seul ce montage en film illustré. La structure doit être revue en amont ou par une étape
  éditoriale autorisée à la remettre en question.

Plusieurs instances d'`image_context` pourraient déjà montrer plusieurs images dans un futur
plan avec davantage de Beats et les autorisations correspondantes. Cela améliorerait la
couverture visuelle, mais répéterait le même layout. La priorité est de combiner un meilleur
découpage avec quelques capabilities visuelles bien choisies.

**4. Les word anchors sont le point fort à développer.**

Le plan comporte douze événements, dont huit liés à des mots : cinq avances typographiques,
une apparition du chiffre, deux étiquettes sur l'image. J'ai comparé les huit événements
compilés aux horodatages enregistrés : l'écart maximal est de **16,67 ms**, soit une demi-image
à 30 fps. Cela valide leur placement par rapport à l'alignement enregistré, sans constituer
une nouvelle mesure indépendante de l'exactitude acoustique de cet alignement.

Le bénéfice doit devenir visible dans le sujet représenté. Les exemples ci-dessous sont des
intentions pour de futures capabilities, pas des actions déjà disponibles dans le catalogue.

| Mot ou expression de la Take actuelle | Instant enregistré, arrondi | Évolution visuelle proposée |
| --- | ---: | --- |
| « falls » | 0,72 s | Commencer une trajectoire descendante sur un schéma illustré. |
| « engines » du premier Beat | 11,95 s | Révéler une vue rapprochée et son annotation de propulsion. |
| « three » | 30,31 s | Faire apparaître trois étapes visuelles distinctes. |
| « grid fins » | 33,18 s | Désigner les éléments concernés sur une illustration préparée et vérifiée. |
| « slows » | 36,70 s | Ralentir un déplacement schématique, sans inventer de valeurs physiques. |
| « deploy » | 41,76 s | Montrer un changement d'état des jambes ou passer à une vue qui l'explique. |
| « firing » | 44,28 s | Déclencher un état graphique de propulsion. |
| « controlled landing » | 47,94 s | Résoudre le mouvement en position finale et conclure visuellement. |

Les images générées peuvent fournir les vues et les éléments graphiques ; l'animation
déterministe peut orchestrer leur apparition et leur transformation sur les mots. Il faut
des assets compatibles avec ces opérations : une image aplatie ne permet pas à elle seule
d'articuler des jambes. L'enjeu est d'animer chaque changement d'idée utile, avec des pauses
de lecture, plutôt que de multiplier mécaniquement les effets sur tous les mots.

**5. Direction recommandée pour la prochaine version.**

Je propose une cible éditoriale à éprouver sur ce format, et non une norme universelle :
première image dans les premières secondes ; cartons de 2 à 3 secondes, avec examen explicite
au-delà de 4 secondes ; images ou schémas explicatifs présents pendant environ 70–85 % du
film ; de l'ordre de 8 à 12 évolutions visuelles significatives sur 50 secondes. Ces évolutions
peuvent avoir lieu dans une scène. Elles ne nécessitent pas chacune une nouvelle génération.

Une même direction artistique devrait relier quelques vues cohérentes : booster en descente,
propulsion, contrôle aérodynamique, approche et atterrissage. Les plans larges établissent
le sujet ; les détails expliquent ; les annotations synchronisées relient ce que l'on entend
à ce que l'on regarde. Un titre court peut servir de ponctuation au milieu de cette séquence.

L'ordre de travail recommandé est :

1. **Corriger le découpage et les critères éditoriaux.** Écrire les Beats avec un objectif
   visuel et une durée plausibles ; revoir les longues phrases ; inspecter la couverture
   image/explication, la répétition des layouts et les longues périodes sans évolution.
   Faire remonter ces problèmes à un rôle capable de revoir la structure. Une image nouvelle
   toutes les quelques secondes ne suffit pas si elle ne suit pas le propos.
2. **Donner plus de place aux images.** Étendre la scène d'image ou créer une capability
   adaptée au plein cadre, avec texte bref et cadrage pensé pour le sujet. Ajouter une
   séquence de vues cohérentes, dont les changements sont pilotables par anchors.
3. **Ajouter une illustration annotée et un processus par étapes.** Points d'intérêt préparés
   sur l'image, cadrages ciblés, flèches et annotations ; progression entre états illustrés
   pour expliquer un mécanisme. Ce sont les manques les plus utiles pour ce film. Le choix
   entre extensions et nouvelles capabilities mérite ensuite un design précis.
4. **Évaluer le film avec la voix et dans sa continuité.** Chaque phrase explicative doit
   trouver un support visuel pertinent ; chaque événement doit se voir ; les images doivent
   garder une cohérence d'objet, d'échelle et de style. Les tests techniques restent
   nécessaires, mais cette revue doit pouvoir refuser un rendu techniquement valide.

Pour le film déjà livré, conserver la Take tout en changeant les visuels à l'intérieur de
ses Beats reste une piste. En revanche, découper librement ses quatre Beats en nouveaux
Beats n'est pas une modification neutre : [verifyRunTake](../../../packages/voice/src/run-take.ts)
vérifie aussi l'identité de la segmentation. Une réutilisation avec redécoupage nécessiterait
une évolution explicite de ce contrat ; je ne la présente pas comme disponible aujourd'hui.
Une future nouvelle narration peut partir directement d'un découpage mieux adapté.

La base à conserver est la synchronisation sur la parole enregistrée. Le prochain progrès
doit la rendre perceptible à travers des images qui expliquent, évoluent et se répondent.

**Pièces consultées.** [Preuve de livraison](milestone-2-delivery-2026-09-08.md),
[plan final](milestone-2-delivery-2026-09-08/videoPlan.json),
[narration](milestone-2-delivery-2026-09-08/narrative.json),
[direction artistique](milestone-2-delivery-2026-09-08/visualBible.json),
[index et digests des exports](milestone-2-delivery-2026-09-08/index.json).
Les timings exacts ont été lus dans le document compilé et le timed-beat fold de l'export
local `runtime/vox-final-export/`, identifiés par cet index. Aucun appel fournisseur,
nouvel enregistrement ou rendu de production n'a été lancé pour cette analyse.
