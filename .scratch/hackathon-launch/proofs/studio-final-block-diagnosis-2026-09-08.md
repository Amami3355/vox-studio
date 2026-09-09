# Diagnostic du blocage final du film éclair et tonnerre

Diagnostic du 8 septembre 2026, à partir du checkpoint persistant relu sur la VM,
du journal fournisseur et des médias téléchargés par l'API authentifiée.
Job : `613ce79f-de42-4116-858f-c314c96f16d1`.
Run : `24c27f73-faff-4f8c-a7b4-e87fe8103f43`.

## Conclusion

L'observateur existe dans l'image acceptée, mais le recadrage du film le coupe.
La revue audiovisuelle constate son absence à l'écran et l'attribue à tort au
contenu de l'image. Elle demande une régénération et nomme à la fois `scene_4`
et `storm-observer`. Le code retire alors l'acceptation de l'image dans Production,
puis tente une recomposition. Cette réponse contient un `assetRequirement.subject`
de **181 caractères**, contre **80** autorisés. L'unique réparation technique a
déjà été utilisée : la tentative s'arrête avant un nouvel appel de réparation.

## Preuves

- Erreur opérateur : `The published validator refused scene_4.`
- Terminal : `blocked`, parent en attente `composition`, sous-étape `plan_repair`.
- Revue du film : rejet entre **36,23 et 43,05 secondes**, sans changement de narration demandé.
- [Image d'origine](../runtime/studio-diagnosis-20260908/storm-observer.png) :
  silhouette visible au premier plan à gauche. SHA-256
  `44929d39184a227b33451453a6427fb3f75b07e7ce765891cffed8ff77dd8bea`.
- [Image extraite du film à 39 secondes](../runtime/studio-diagnosis-20260908/frame-39.png) :
  silhouette exclue du cadre. Le plan utilise `image_context`, `splitLeft`, `cinematic`.
  Le renderer local correspondant remplit sa plaque avec `objectFit: 'cover'`
  dans `packages/video/src/scenes/ImageContextScene/Component.tsx:246`.
- La première revue de cette image avait explicitement reconnu la silhouette et accepté
  l'image. Sa validation humaine est toujours présente dans `humanImageReviews`.
- Le checkpoint conserve deux décisions humaines positives distinctes. Les trois
  générations comprennent une première image de shockwave rejetée par le modèle,
  sa remplaçante acceptée et l'image de l'observateur acceptée puis retirée après revue du film.
- L'appel logique de réparation initial avait corrigé un autre sujet trop long :
  celui de `scene_1`. Son budget reste consommé dans la correction finale.
- Journal : **25 dispatches sur 40**, une recherche, trois générations d'image sur cinq,
  une narration. Tous les dispatches ont une réponse. Trois lignes `PlanRepairAgent`
  correspondent au rôle pendant sa réparation initiale ; le compteur logique de
  réparation vaut un et ne se confond pas avec le nombre de dispatches modèle.

## Reproduction hors ligne

[Le script](../runtime/studio-diagnosis-20260908/replay.py) réassemble la réponse
conservée du SceneAuthor et utilise les schémas qui lui avaient été fournis.
Il reproduit deux fois le refus exact via le véritable code `_refusal` / `_repaired`,
avec le budget consommé et un faux réparateur qui échouerait s'il était appelé.

En remettant uniquement l'ancien sujet de 78 caractères dans une copie en mémoire,
le refus de propriétés disparaît. Aucun checkpoint n'est modifié, aucun fournisseur
n'est invoqué. Ce contrôle ne constitue ni une validation Production complète,
ni une correction du recadrage, ni une acceptation audiovisuelle.

Commande :

```powershell
& services/agents/.venv/Scripts/python.exe .scratch/hackathon-launch/runtime/studio-diagnosis-20260908/replay.py
```

[Résultat de reproduction](../runtime/studio-diagnosis-20260908/replay-result.json).

## État du média

Le MP4 dure **43,051 secondes**, pour une cible de 50 secondes. Ses pistes sont H.264
1920×1080 et AAC 48 kHz. Le checkpoint atteste le décodage et lie la revue au SHA-256
`28414a2d9e651ebae5ad8e32ec39ae2e6b7f15ed354f3e419ceb1e217c19ad62`.

Le téléchargement local a le même digest. FFmpeg a de nouveau décodé intégralement
les deux pistes sans erreur. La lecture humaine complète, l'acceptation finale et
l'export signé final restent ouverts. Un premier téléchargement HTTP complet a été
interrompu ; le transfert par plages a permis de récupérer les octets exacts.

## Prochaine correction à préparer

1. Corriger le cadrage de la dernière SceneInstance en conservant l'image existante
   et la narration. Une nouvelle génération n'est pas justifiée par l'absence alléguée
   de l'observateur dans le bitmap, puisque celui-ci y est visible.
2. Corriger l'aiguillage de la revue : distinguer un élément absent du bitmap d'un
   élément présent mais masqué au rendu, avant de retirer une image acceptée.
3. Préserver un sujet court dans le VideoPlan ; les instructions visuelles détaillées
   ont leur place dans l'Image intention. Ne pas tronquer arbitrairement les descriptions
   ni augmenter la limite ou le budget pour faire passer cette réponse.
4. Préparer une réconciliation spécifique, archivée et vérifiée contre un état Production
   signé : l'acceptation de `storm-observer` a déjà été retirée et les dépendances du
   rendu invalidées. La reprise générique refuse correctement ce terminal. Ne pas
   effacer les marqueurs en attente ou réinitialiser les compteurs pour relancer.
5. Après correction et reprise explicites : rendu, nouvelle revue liée aux octets,
   export signé puis validation humaine.

Le diagnostic n'a modifié ni le code produit, ni l'état distant, ni les autorisations.
Aucun redémarrage, rendu ou appel fournisseur n'a été lancé. Les phases de correction
et de test de non-régression du workflow restent à effectuer ; le périmètre demandé
ici était le diagnostic. Les anciennes attentes d'image du suivi sont périmées.

## Cause profonde : contrat de cadrage incomplet

L'inspection complémentaire des spécifications réellement conservées dans le checkpoint
confirme que `image_context` ne publie aucune information sur le recadrage automatique,
le mode de remplissage, un point focal ou le ratio de la plaque. Son schéma expose
`headline`, `caption` et `assetRequirement`, sans commande de cadrage. Son renderer
local utilise pourtant `objectFit: 'cover'` pour remplir la plaque `splitLeft`.
Le choix sémantique « une image accompagnée de texte » est donc permis sans que
l'agent apprenne qu'un sujet essentiel au bord peut disparaître.

L'Image intention conservée demande expressément un observateur à gauche et l'éclair
à droite, visibles ensemble dans une vue large 16:9. Elle propose également un crop
carré sur l'orage et un crop vertical sur l'observateur : ces intentions textuelles
ne sont pas des instructions exécutées par `image_context`. `compile_intent` les
ajoute au prompt de génération ; il ne configure pas la géométrie du renderer.

La même intention énumère des flèches, ondes et une échelle de distance absentes
des événements de la scène. Le prompt demande déjà de ne pas inventer ces éléments,
mais ce décalage n'est pas empêché par le contrat. Ce constat est une autre preuve
de séparation entre intention et rendu, pas la raison enregistrée du rejet final.

`image_detail` existe déjà : son schéma local publie explicitement une vue initiale
de l'image entière sans recadrage, et son renderer utilise `ImageViewport`. Il constitue
une alternative à vérifier pour cette composition nécessitant les deux bords ; aucun
essai de remplacement ou nouveau rendu n'a été effectué pendant le diagnostic.

La correction durable doit donc rendre le comportement de cadrage explicite dans la
surface publiée du catalogue et faire vérifier les usages réels avant génération/rendu.
Le dépassement de 80 caractères est un échec secondaire de récupération, et la revue
finale intervient trop tard pour prévenir le coût du premier rendu.
