# Studio sans plafonds applicatifs — livraison du 9 septembre 2026

Les décisions du grilling ont été confirmées par l’utilisateur (« oui pour tout »). Les changements sont déployés sur [Vox Studio](https://vox-studio-164544259455.europe-west1.run.app). Les quatre films existants sont conservés et restent en pause jusqu’à une reprise explicite.

## Problème confirmé et correction

Pour le film `9cdaa4c5-08d1-4651-8189-1498ee97de56`, les quatre demandes de correction de `booster-grid-fins` avaient chacune consommé leur unique appel supplémentaire en préparation textuelle. Le plafond global refusait ensuite la génération. Une seule version de cette image existait ; il ne s’agissait pas de quatre images successivement rejetées.

Le cache incluait également l’identifiant de la décision utilisateur : quatre autorisations d’une même correction devenaient quatre préparations distinctes. La clé repose désormais sur l’intention de travail, tout en conservant les identifiants dans l’historique. Le rejeu local du checkpoint réel retrouve une seule intention pour les quatre préparations, sans appel fournisseur ni modification du checkpoint : [preuve](../runtime/studio-unlimited-20260909/historical-replay.json).

## Comportement livré

- Aucun plafond Studio de dépenses ou de tentatives, pour les nouveaux films comme pour les films existants. Les limites effectives sont nulles ; les compteurs de consommation restent conservés. La reprise migre l’autorisation signée d’un ancien film sans effacer son historique.
- Corrections et vérifications automatiques des images, puis contrôle du film décodé. Le film validé peut être regardé et téléchargé ; la publication externe reste une action explicite.
- Poursuite lorsqu’une amélioration concrète différente est disponible ; suspension en cas de répétition sans progrès, de demandes contradictoires ou d’ambiguïté.
- Arrêt demandé par l’utilisateur après l’opération en cours, avec sauvegarde du résultat et reprise ultérieure.
- Réessais des erreurs temporaires confirmées avec attente progressive visible et annulable. Un résultat inconnu est recherché avant toute réémission ; une incertitude non résolue suspend le travail.
- Progression distinguant préparation, génération et vérification. L’historique des corrections indique notamment lorsqu’aucune nouvelle image n’a été générée.

Les quotas réels des fournisseurs et les garanties contre les appels dupliqués demeurent. Les anciens contrats à limites numériques restent lisibles pour compatibilité ; Studio ne les utilise plus comme plafonds effectifs.

## Vérifications

Les dix nouveaux tests de régression passent : migration des limites, réutilisation de préparation, dépassement des anciens plafonds, génération puis vérification, arrêt/reprise, critiques contradictoires, erreurs temporaires, distinction réponse confirmée/transport incertain et observation d’une génération dont la réponse a été perdue.

La suite Python complète initiale a relevé deux attentes devenues obsolètes, corrigées puis validées dans une suite ciblée de 79 tests. Après régénération des fixtures de contrats, les consommateurs Python ont révélé une autre attente de glossaire obsolète ; sa correction a été vérifiée individuellement. Les tests Studio, de continuation et de récupération concernés ont également été vérifiés. La suite complète n’a pas été relancée après ces corrections de tests.

La suite Production initiale comptait 369 succès sur 371 tests : fixtures à régénérer et un dépassement de délai sous charge. Après régénération, les deux suites concernées passent, soit 12 tests. Les tests d’autorisation illimitée et du cycle des images passent également. Contrats générés, vérifications de types Production/Studio, formatage ciblé et contrôle des espaces Git passent.

Les huit tests navigateur locaux passent. La vérification du site déployé, sur ordinateur et mobile, confirme : quatre films aux limites nulles, absence des contrôles de budget, bouton de reprise disponible, quatre corrections historiques explicitement sans nouvelle image, absence d’erreurs JavaScript et conservation des projets après rechargement. [Résultats et captures](../runtime/studio-unlimited-20260909/browser-verification.json).

## Déploiement et conservation

API, worker et Production exécutent les images immuables consignées dans [images.json](../runtime/studio-unlimited-20260909/images.json). Les sources ont été comparées aux images construites : 47 modules Python dans chaque image Studio et 54 fichiers Production. Les 47 modules ont également été vérifiés dans chacun des conteneurs Studio réellement démarrés. Les métadonnées de démarrage des deux VM correspondent aux nouvelles configurations.

Les trois services sont actifs ; le worker atteint le service Production signé et lit le statut du Run concerné ainsi que le contrat publié. [Vérification des services et des données](../runtime/studio-unlimited-20260909/live-verification.json).

Les anciennes unités système, la configuration Studio et la base SQLite ont été sauvegardées. Les tables `jobs` (4 lignes), `decisions` (6) et `continuations` (13) sont identiques à la sauvegarde. Les empreintes des checkpoints et journaux fournisseur sont inchangées après redémarrage. Aucun travail actif, aucune reprise automatique et aucune nouvelle génération fournisseur pendant le déploiement.

La limite Windows de longueur de commande a empêché la première invocation de mise à jour Studio avant son exécution ; le script a ensuite été transféré par SCP et exécuté avec succès. Sauvegardes : `/mnt/disks/vox-crew/studio-operator/before-unlimited-20260909` et `/mnt/disks/vox-runs/operator/before-unlimited-20260909` sur leurs VM respectives.

La génération d’une nouvelle image réelle et la production complète d’un nouveau film n’ont pas été exécutées pour cette livraison. Le prochain geste utilisateur est **Continue production** sur le film à reprendre.

Documentation consultée via Context7 pour la classification des erreurs reçues : [SDK officiel Google Gen AI Python, gestion APIError et code HTTP](https://github.com/googleapis/python-genai/blob/main/README.md).
