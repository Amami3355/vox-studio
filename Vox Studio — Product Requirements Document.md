# Vox Studio — Product Requirements Document

**Version :** V1 — Hackathon  
**Statut :** PRD de référence pour le développement  
**Objectif :** construire la version de Vox Studio destinée à remporter *Agentic Cinema: The Blockbuster Hackathon*  
**Date :** août 2026

---

# 1. Résumé exécutif

**Vox Studio** est un studio vidéo agentique capable de transformer un sujet en une **vidéo explicative/documentaire courte, sourcée, narrée et visuellement premium**, avec un niveau de finition proche des formats éditoriaux modernes de type Vox.

L'utilisateur ne monte pas manuellement la vidéo.

Il donne une intention :

> “Explique pourquoi les loyers ont explosé dans les grandes villes.”

Vox Studio prend ensuite en charge une chaîne de production complète :

```text
Sujet
  ↓
Recherche web
  ↓
Sélection et vérification des sources
  ↓
Construction de l'angle narratif
  ↓
Beat plan (chaque beat porte son texte)
  ↓
Visual planning
  ↓
Sélection des SceneCapabilities
  ↓
Recherche / génération des assets
  ↓
Voice-over
  ↓
Compilation temporelle
  ↓
Rendu Remotion
  ↓
Vidéo éditable
```

Le résultat n'est pas une succession de vidéos générées par IA.

Il s'agit d'un **document vidéo structuré**, constitué de scènes Remotion déterministes, de graphiques, d'images contextuelles, de cartes, de typographie, de personnages, d'annotations et d'éléments persistants.

L'IA agit comme une **équipe de production éditoriale autonome**.

Remotion agit comme le moteur graphique et de rendu.

---

# 2. Hackathon ciblé

## Agentic Cinema: The Blockbuster Hackathon

Lien officiel :

https://agentic-cinema.devpost.com/

Organisateurs :

- Google Cloud
- Devpost
- partenaires technologiques du concours

Deadline :

**7 septembre 2026 à 14:00 PDT.**

Le hackathon demande de construire un **agent fonctionnel ou un réseau multi-agent**, propulsé par Gemini et Google Cloud Agent Builder, qui utilise également le produit ou le MCP d'un partenaire pour résoudre un problème réel dans l'industrie des médias et du divertissement.

Vox Studio cible directement cette définition : il automatise une partie complexe du workflow de production vidéo éditoriale.

---

# 3. Partner Track

## Track choisi : Parallel

La V1 sera soumise dans le **Parallel Track**.

Parallel intervient dans la phase de recherche éditoriale.

Le Research Agent doit pouvoir :

- rechercher des informations sur le web ;
- trouver des sources pertinentes ;
- récupérer les éléments factuels nécessaires au documentaire ;
- comparer plusieurs sources ;
- produire des informations structurées ;
- conserver la provenance des faits utilisés dans le script.

Parallel ne doit pas être une intégration cosmétique.

Il doit être appelé **réellement au runtime** par le workflow agentique.

Cela permet de démontrer clairement :

```text
User topic
    ↓
Research Agent
    ↓
Parallel
    ↓
Sources + evidence
    ↓
Narrative Agent
    ↓
Beat plan
```

La recherche sourcée constitue donc une caractéristique fondamentale du produit.

---

# 4. Pourquoi Vox Studio correspond au hackathon

Le hackathon ne demande pas simplement un outil utilisant un LLM.

Il demande une solution agentique appliquée à un véritable workflow Media & Entertainment.

Vox Studio automatise précisément un workflow de production :

```text
Researcher
Writer
Data journalist
Art director
Storyboard artist
Voice-over producer
Motion designer
Video editor
```

deviennent :

```text
Research Agent
Narrative Agent
Visual Planner
Asset Resolver
Audio pipeline
Scene Compiler
Remotion Runtime
```

Le système ne repose donc pas sur :

> Prompt → vidéo

mais sur :

> **objectif → recherche → décisions → outils → artefacts intermédiaires → validation → exécution**

Cette différence doit être extrêmement visible dans la démonstration.

---

# 5. Proposition de valeur

## Pour l'utilisateur

Transformer une idée en documentaire vidéo premium sans devoir maîtriser :

- le montage vidéo ;
- le motion design ;
- After Effects ;
- la visualisation de données ;
- la recherche documentaire ;
- la génération d'assets ;
- le timing audio ;
- Remotion.

## Proposition de valeur centrale

> **From idea to researched, narrated and editable visual story.**

ou :

> **An autonomous production crew for visual explainers.**

---

# 6. Utilisateur cible V1

La V1 cible principalement :

### Créateurs de contenu

Créateurs YouTube produisant :

- explainers ;
- documentaires ;
- vidéos éducatives ;
- analyses économiques ;
- contenus historiques ;
- contenus scientifiques.

### Journalistes et médias indépendants

Pour transformer rapidement une recherche en contenu vidéo éditorial.

### Équipes marketing / knowledge teams

Pour transformer :

- rapports ;
- données ;
- études ;
- sujets complexes

en contenu explicatif visuel.

---

# 7. Job To Be Done principal

> Lorsque j'ai une idée ou une question complexe, je veux que Vox Studio effectue les recherches nécessaires et construise automatiquement une vidéo explicative claire, sourcée, narrée et visuellement professionnelle, afin que je puisse publier une vidéo de qualité sans effectuer moi-même tout le travail de recherche, de storyboard et de motion design.

---

# 8. Principe produit fondamental

Vox Studio ne génère pas directement la vidéo finale à partir d'un prompt.

Il construit un **Video Plan structuré**.

```text
Intent
 ↓
Research
 ↓
Narrative
 ↓
Beat Plan
 ↓
Visual Plan
 ↓
SceneInstances
 ↓
Compiled Video Document
 ↓
Remotion
```

Cette séparation est essentielle.

Elle permet :

- la fiabilité ;
- l'édition ;
- la validation ;
- la reproductibilité ;
- la synchronisation audio ;
- la cohérence graphique ;
- la réparation automatique ;
- l'inspection du raisonnement opérationnel des agents.

---

# 9. Architecture produit figée

L'architecture de la bibliothèque de scènes est considérée comme **FIGÉE pour le hackathon**.

Elle comprend quatre niveaux conceptuels.

```text
L0 — Design System
      ↓
L1 — Visual Primitives
      ↓
L2 — SceneCapabilities
      ↓
L3 — Section Runtime
```

Avec un Asset Resolver transversal.

---

# 10. SceneCapability vs SceneInstance

Cette distinction doit être reflétée dans le code, les agents et l'interface utilisateur.

## SceneCapability

Type de scène disponible dans le catalogue.

Exemples :

```text
bar_chart
image_context
character_explainer
typographic_statement
map
comparison
timeline
diagram
```

Il existe environ **8 à 12 SceneCapabilities** dans la V1.

## SceneInstance

Utilisation particulière d'une capability dans une vidéo.

Exemple :

```json
{
  "id": "scene_17",
  "component": "bar_chart",
  "layout": "horizontal",
  "motionProfile": "energetic",
  "props": {
    "title": "Housing prices since 2010"
  }
}
```

Une vidéo peut contenir des dizaines de SceneInstances.

Le Studio édite les **instances**, jamais les capabilities.

---

# 11. Catalogue V1

La stratégie V1 est :

```text
❌ 40 composants moyens

✅ 8–12 SceneCapabilities extrêmement solides
```

Chaque capability peut posséder :

- plusieurs layouts ;
- plusieurs motion profiles ;
- plusieurs actions ;
- différentes props ;
- plusieurs compositions ;
- différents assets.

Cela permet beaucoup de variété sans rendre le catalogue incompréhensible pour l'agent.

---

# 12. SceneCapabilities prioritaires

## P0 — indispensables

### 1. ImageContextScene

Utilisation :

- photo éditoriale ;
- image documentaire ;
- contexte géographique ;
- illustration ;
- personnage détouré ;
- image + texte ;
- image + statistique ;
- image + annotation.

Layouts possibles :

```text
fullBleed
splitLeft
cutoutOnColor
imageWithStat
imageAnnotated
evidence
```

---

### 2. BarChartScene

Pour :

- comparaisons ;
- classements ;
- évolutions discrètes ;
- mise en évidence d'une valeur.

Actions possibles :

```text
showBaseline
revealAll
highlightBar
annotate
```

---

### 3. TypographicStatementScene

Pour :

- chiffres forts ;
- citations ;
- changements de chapitre ;
- punchlines ;
- conclusions.

---

### 4. CharacterExplainerScene

Personnage ou figure détourée permettant :

- explication ;
- réaction ;
- narration ;
- incarnation d'un concept ;
- continuité entre plusieurs scènes.

---

### 5. MapScene

Pour :

- localiser ;
- comparer des régions ;
- expliquer une dynamique géographique ;
- suivre une trajectoire.

---

### 6. ComparisonScene

Pour :

```text
before / after
A vs B
old vs new
problem vs solution
```

---

## P1 — si temps disponible

### TimelineScene

Pour présenter une succession d'événements.

### DiagramScene

Pour expliquer :

- systèmes ;
- processus ;
- flux ;
- architecture ;
- causalité.

---

# 13. Design system

L'agent ne contrôle jamais directement :

- les couleurs RGB/HEX ;
- les tailles en pixels ;
- les marges ;
- les polices ;
- les easings ;
- les durées d'animation ;
- les positions arbitraires.

Il choisit des notions sémantiques.

Exemple :

```text
theme = editorialCold
motionProfile = energetic
emphasis = negative
layout = withCallout
```

Le design system transforme ces choix en paramètres graphiques cohérents.

---

# 14. Motion Profiles

La V1 comprend au minimum :

```text
editorialStatic
subtleDrift
pushIn
energetic
impact
cinematic
```

Le Visual Planner choisit le profil selon l'intention narrative.

Exemples :

### editorialStatic

Pour une déclaration importante.

### energetic

Pour une séquence rapide de données.

### impact

Pour une révélation.

### cinematic

Pour une ouverture ou une conclusion.

Le système doit éviter qu'une vidéo entière utilise le même mouvement.

---

# 15. Système de beats

Le **beat** est l'unité narrative utilisée par les agents.

Exemple :

```text
Beat 1 — contexte
Beat 2 — problème
Beat 3 — première donnée
Beat 4 — révélation
Beat 5 — conséquence
```

L'agent ne produit jamais directement :

```text
frame 427
duration 182 frames
```

Il produit :

```text
b4.start
b5.end
pace = measured
hold = short
```

Le compilateur transforme ensuite ces intentions temporelles en frames Remotion.

---

# 16. Audio-first timing

Le timing réel provient du voice-over.

Pipeline :

```text
Beats (chacun porte son texte)
 ↓
TTS, un mark SSML par frontière de beat
 ↓
Timepoints
 ↓
Beats timestampés
 ↓
Scene Compiler
 ↓
Frames
```

Il n'y a pas d'aligneur forcé : les marks donnent les frontières exactement, là où un
aligneur les estimerait. Voir ADR-0002.

Ainsi :

- une animation peut commencer exactement sur une frontière de beat, donc sur un mot
  choisi par l'agent rédacteur en découpant ses beats à cet endroit ;
- une statistique peut apparaître au moment où elle est prononcée ;
- une annotation peut apparaître après la révélation verbale ;
- une scène ne coupe pas une phrase au milieu, parce que le dernier beat de chaque scène
  doit terminer une phrase.

Nuance à ne pas perdre : une ancre `.mid` ou décalée (`b4.start+short`) se résout
arithmétiquement et ne tombe sur aucun mot particulier. La précision au mot s'achète en
découpant les beats, pas en décalant les ancres — tant que la règle d'aimantation sur
l'attaque de mot n'est pas tranchée.

---

# 17. Agents V1

Le système doit paraître comme une véritable **équipe de production autonome**.

La V1 doit utiliser une orchestration agentique construite avec les technologies Google requises par le hackathon.

Le guide officiel recommande notamment l'utilisation native d'ADK pour les workflows nécessitant état, logique, appels d'outils et hébergement agentique.

## 17.1 Director / Orchestrator Agent

Responsable de l'ensemble du workflow.

Il :

- interprète la demande ;
- déclenche les autres agents ;
- conserve l'état du projet ;
- orchestre les phases ;
- récupère les erreurs ;
- décide quand poursuivre.

---

## 17.2 Research Agent

Utilise **Parallel**.

Responsabilités :

- recherche web ;
- collecte des sources ;
- extraction de faits ;
- récupération de statistiques ;
- construction d'un dossier de recherche.

Sortie :

```json
{
  "claims": [],
  "sources": [],
  "statistics": [],
  "quotes": [],
  "visualOpportunities": []
}
```

---

## 17.3 Narrative Agent

Transforme la recherche en histoire.

Produit :

- angle ;
- hook ;
- structure ;
- beats narratifs, chacun portant son texte de voice-over verbatim.

Il ne produit **pas** de script séparé : le script parlé est la concaténation ordonnée
des textes de beats. Écrire les deux les laisserait diverger sans qu'aucun mécanisme ne
le détecte. Voir ADR-0002.

Il ne choisit pas encore les composants Remotion.

---

## 17.4 Visual Planner

Transforme les beats en intentions visuelles.

Il utilise quatre tools seulement :

```text
searchScenes()
getSceneSpec()
validateScene()
validateVideoPlan()
```

L'agent ne lit jamais le code des composants.

Il ne voit que le catalogue généré.

---

## 17.5 Asset Resolver

Ce n'est pas nécessairement un agent LLM autonome.

Il résout les demandes d'assets :

```text
assetRequirement
      ↓
cache
      ↓
library
      ↓
licensed search
      ↓
image generation
      ↓
processing
```

Il peut notamment produire :

- photos ;
- illustrations ;
- personnages ;
- cutouts ;
- textures ;
- fonds ;
- éléments graphiques.

---

# 18. Gemini dans Vox Studio

Gemini doit être central et visible.

Il intervient notamment dans :

### Orchestration

Raisonnement et décisions multi-étapes.

### Narrative intelligence

Analyse du dossier de recherche et construction de la narration.

### Visual planning

Transformation des beats en composition vidéo.

### Multimodal intelligence

Compréhension d'images et autres assets.

### Asset generation

Génération ou transformation d'assets visuels via les modèles Google appropriés lorsque nécessaire.

### Audio

TTS Google/Gemini lorsque retenu dans le pipeline.

Le hackathon met explicitement à disposition des ressources pour traitement documentaire, compréhension vidéo, génération d'images/VFX, musique et TTS, ce qui rend cette architecture particulièrement alignée avec le challenge.

---

# 19. Asset Resolver

Un asset peut être :

```text
ready
placeholder
failed
```

La génération d'un asset ne doit pas empêcher le preview.

Exemple :

```text
Image demandée
       ↓
placeholder immédiat
       ↓
preview disponible
       ↓
génération terminée
       ↓
asset remplacé
```

La démo doit donner une impression de progression continue.

---

# 20. Expérience utilisateur V1

Le produit doit être extrêmement simple en surface.

## Écran principal

L'utilisateur voit :

```text
┌────────────────────────────────────────┐
│ Vox Studio                             │
│                                        │
│ What should we explain?                │
│                                        │
│ [__________________________________]   │
│                                        │
│        Generate documentary            │
└────────────────────────────────────────┘
```

Exemple :

> Why are young people struggling to buy homes?

---

# 21. Génération visible

Après soumission, le Studio affiche la progression.

Exemple :

```text
✓ Researching the topic
✓ 18 sources analyzed
✓ Narrative angle selected
✓ Narrative beats written
● Designing visual story
○ Generating assets
○ Rendering preview
```

Cette vue est importante pour le hackathon.

Elle rend immédiatement visible que nous avons construit un **workflow agentique**, pas un appel LLM caché derrière un spinner.

---

# 22. Research View

Une section facultativement ouverte montre :

```text
Research

18 sources analyzed

Key evidence
────────────────────────

Housing prices
+63% since ...

Source:
...

Mortgage rates
...
```

Les URLs des sources peuvent être consultées.

La provenance doit rester attachée aux claims.

---

# 23. Studio

Une fois la génération terminée :

```text
┌────────────────────────────────────────────────────┐
│ Vox Studio                                         │
├───────────────────┬────────────────────────────────┤
│ Scenes            │                                │
│                   │                                │
│ 01 Hook           │                                │
│ 02 Context        │        VIDEO PLAYER            │
│ 03 Chart          │                                │
│ 04 Character      │                                │
│ 05 Map            │                                │
│ 06 Conclusion     │                                │
│                   │                                │
├───────────────────┴────────────────────────────────┤
│ Ask Vox Studio to change the video...              │
└────────────────────────────────────────────────────┘
```

---

# 24. Timeline V1

La timeline ne doit pas tenter de reproduire Premiere Pro.

Elle montre simplement les **SceneInstances**.

```text
[scene 1][scene 2][scene 3][scene 4][scene 5]
```

L'utilisateur peut :

- sélectionner ;
- supprimer ;
- dupliquer ;
- réordonner.

---

# 25. Scene Inspector

Lorsqu'une scène est sélectionnée, seules les props autorisées par sa capability sont éditables.

Exemple :

```text
Bar Chart

Title
[ Housing prices ]

Layout
[ horizontal ]

Highlight
[ Paris ]

Motion
[ energetic ]
```

L'interface est donc générée en partie depuis le schéma de la capability.

---

# 26. Édition par prompt

Une fonctionnalité particulièrement forte pour la démo.

Exemple :

> Make scene 4 more dramatic.

Le système peut modifier :

```text
motionProfile
layout
emphasis
props
```

Autre exemple :

> Replace the bar chart with a line chart.

Pipeline :

```text
Prompt
 ↓
SceneInstance actuelle
 ↓
Target SceneCapability
 ↓
Prop migration
 ↓
Validation
 ↓
Partial recompilation
 ↓
Preview updated
```

---

# 27. Personnages persistants

Une caractéristique visuelle différenciante de Vox Studio.

Un personnage peut apparaître dans une scène puis rester visible pendant la suivante.

Exemple :

```text
ImageContextScene
    economist on right
          ↓
BarChartScene
    economist moves to corner
          ↓
BarChartScene
    economist still visible
          ↓
Conclusion
    economist returns center
```

La gestion appartient au **Section Runtime** et non à l'imbrication de scènes.

---

# 28. Assets générés

La V1 doit pouvoir générer certains assets à la volée.

Priorité :

- illustrations éditoriales ;
- personnages simples ;
- cutouts ;
- objets ;
- fonds contextuels.

Objectif :

combiner :

```text
AI-generated assets
+
deterministic Remotion motion design
```

plutôt que de demander à un modèle vidéo de générer toute la séquence.

Cela augmente :

- le contrôle ;
- la cohérence ;
- l'éditabilité ;
- la reproductibilité.

---

# 29. Qualité visuelle

La qualité est un requirement produit, pas un bonus.

Chaque SceneCapability doit respecter :

### Hiérarchie

Un élément dominant identifiable en moins de 200 ms.

### Respiration

Marges importantes.

### Typography

Contraste fort entre :

- headline ;
- secondary text ;
- annotation.

### Motion

Animations motivées par l'intention.

### Palette

Aucune couleur hors design tokens.

### Composition

L'image doit ressembler à une composition éditoriale, pas à une slide PowerPoint animée.

---

# 30. Component Studio

Outil interne obligatoire.

Il permet de visualiser :

```text
toutes les SceneCapabilities
×
tous les layouts
×
tous les exemples
×
tous les motion profiles
```

Le Component Studio doit être créé au début du développement.

Il ne fait pas nécessairement partie du produit public présenté aux utilisateurs.

---

# 31. Compiler

Le compiler est déterministe.

Entrées :

```text
Beat plan
SceneInstances
Audio timings
Assets
Theme
```

Sortie :

```text
CompiledVideoDocument
```

Il résout :

- durations ;
- frames ;
- semantic anchors ;
- events ;
- safe areas ;
- scene positions ;
- persistent elements ;
- transitions.

---

# 32. Validation

La compilation échoue pour :

```text
Unknown SceneCapability
Invalid props
Unknown action
Unknown layout
Missing beat
Missing asset reference
Scene below hard minimum duration
```

Elle génère seulement un warning pour :

```text
soft limit exceeded
asset placeholder
motion repetition
title density
persistent element relocation
```

Une passe de réparation automatique par l'agent est autorisée.

---

# 33. Ce que la V1 ne doit PAS construire

Pour maximiser les chances de terminer un produit extrêmement convaincant avant le hackathon, les fonctionnalités suivantes sont explicitement hors scope.

## Pas de clone de Premiere / After Effects

Pas de :

- keyframes manuels ;
- graph editor ;
- tracks complexes ;
- masques avancés ;
- animation frame-by-frame.

---

## Pas de génération vidéo complète systématique

Veo ou autres modèles vidéo ne constituent pas la base du moteur.

Ils pourront éventuellement être utilisés ponctuellement plus tard.

---

## Pas de 40 SceneCapabilities

8 à 12 excellentes scènes valent mieux qu'un catalogue gigantesque.

---

## Pas de marketplace

---

## Pas de collaboration temps réel

---

## Pas de multi-user avancé

---

## Pas de billing

---

## Pas de système SaaS complet

---

## Pas de Quality Agent autonome

Le contrat de warnings doit exister.

Le Quality Agent est réservé à une version future.

---

## Pas de MCP pour le catalogue Remotion

Les SceneCapabilities sont exposées directement aux agents via les quatre tools internes :

```text
searchScenes
getSceneSpec
validateScene
validateVideoPlan
```

---

# 34. Workflow end-to-end V1

```text
1. User enters topic
        ↓
2. Director starts project
        ↓
3. Research Agent → Parallel
        ↓
4. Research dossier generated
        ↓
5. Narrative Agent creates angle
        ↓
6. Beat plan generated, each beat carrying its voice-over text
        ↓
7. Voice-over synthesised, one SSML mark per beat boundary
        ↓
8. Timepoints folded into TimedBeats
        ↓
9. Visual Planner selects capabilities
        ↓
10. SceneInstances generated
        ↓
11. Asset Resolver resolves assets
        ↓
12. Compiler validates plan
        ↓
13. Repair if needed
        ↓
14. Remotion preview rendered
        ↓
15. User opens Studio
        ↓
16. User edits one scene by prompt
        ↓
17. Scene recompiles
        ↓
18. User exports video
```

---

# 35. Vertical Slice obligatoire

Avant de construire l'orchestration complète, le système doit produire **20 à 30 secondes de véritable vidéo premium**.

Plan :

```text
Beat 1
ImageContextScene

        ↓

Beat 2
BarChartScene
+ persistent character

        ↓

Beat 3
BarChartScene
+ highlight
+ annotation
+ persistent character

        ↓

Beat 4
ImageContextScene
+ character relocation
```

Avec :

- véritable voice-over ;
- alignement temporel ;
- assets réels ;
- transitions ;
- SceneInstances JSON ;
- aucune logique spécifique codée pour cette vidéo.

Ce vertical slice valide le pari technique central de Vox Studio.

---

# 36. Critères de réussite du vertical slice

La séquence doit :

- être visuellement impressionnante ;
- être fluide ;
- synchroniser les événements avec la voix ;
- conserver le personnage entre les scènes ;
- ne présenter aucun chevauchement ;
- être construite uniquement depuis le JSON ;
- pouvoir être modifiée par changement de props ;
- fonctionner sans code spécifique à la vidéo.

Si cela fonctionne, le moteur principal est validé.

---

# 37. Démo hackathon cible

Le règlement impose une **vidéo de démonstration de trois minutes maximum**, montrant réellement le projet fonctionner ; le hackathon précise qu'il ne doit pas s'agir simplement d'un trailer cinématique. La vidéo doit être publique sur YouTube ou Vimeo et être en anglais ou sous-titrée en anglais.

La démonstration de Vox Studio doit donc raconter une histoire extrêmement simple.

## 0:00–0:15 — Le problème

> Producing a polished explainer requires research, writing, art direction, motion design and editing.

Montrer brièvement la complexité.

---

## 0:15–0:25 — La promesse

> Vox Studio turns an idea into a researched visual story.

Afficher le produit.

---

## 0:25–0:40 — Le prompt

Entrer :

> Why are young people struggling to buy homes?

Cliquer sur :

**Create documentary**

---

## 0:40–1:00 — Agentic workflow

Afficher en direct :

```text
Research Agent
↓
Parallel
↓
18 sources

Narrative Agent
↓
7 beats

Visual Planner
↓
6 scenes

Asset Resolver
↓
9 assets
```

---

## 1:00–1:35 — Résultat

Afficher immédiatement la vidéo générée.

Le spectateur doit voir successivement :

- photo contextuelle ;
- typography ;
- graphique animé ;
- personnage persistant ;
- carte ;
- annotation ;
- transition ;
- conclusion.

C'est le moment **wow**.

---

## 1:35–1:55 — Recherche sourcée

Ouvrir brièvement le Research panel.

Montrer :

```text
claim
source
URL
```

Puis montrer la statistique correspondante dans la vidéo.

La relation :

```text
Parallel research
→ evidence
→ script
→ visual
```

doit être évidente.

---

## 1:55–2:20 — Édition agentique

Sélectionner une scène.

Écrire :

> Make this section more dramatic and focus on London.

Le système modifie :

- contenu ;
- emphasis ;
- animation ;
- éventuellement asset.

Le preview change.

---

## 2:20–2:40 — Architecture

Afficher très brièvement :

```text
Gemini + Google Cloud Agent Builder
          ↓
Multi-Agent Production Crew
          ↓
Parallel Research
          ↓
Structured Video Plan
          ↓
Remotion Rendering
```

---

## 2:40–3:00 — Conclusion

Afficher la vidéo finale.

Message :

> From question to researched visual story — with an autonomous AI production crew.

Logo Vox Studio.

---

# 38. Alignement avec les critères de jugement

Le hackathon évalue quatre dimensions officielles : **Technological Implementation, Design, Potential Impact et Quality of the Idea**.

Notre V1 doit explicitement maximiser chacune.

---

## Technological Implementation

À démontrer :

- Gemini au cœur du workflow ;
- Google Cloud Agent Builder ;
- agents spécialisés ;
- appels d'outils ;
- état intermédiaire ;
- workflow multi-étapes ;
- Parallel réellement appelé ;
- structured outputs ;
- validation ;
- compiler ;
- Remotion ;
- génération d'assets ;
- traitement audio.

Objectif :

le jury doit comprendre que Vox Studio est une **architecture agentique réelle**.

---

## Design

À démontrer :

- interface cohérente ;
- expérience complète ;
- résultat premium ;
- animations professionnelles ;
- transitions ;
- édition intuitive.

Le hackathon demande explicitement si le projet constitue une expérience produit cohérente et complète plutôt qu'un simple proof of concept.

C'est donc une priorité P0.

---

## Potential Impact

Problème :

produire des explainers professionnels demande une équipe et plusieurs compétences.

Solution :

un producteur autonome capable de transformer une idée en contenu prêt à publier.

Audience :

- creators ;
- journalists ;
- educators ;
- marketing teams ;
- independent media.

---

## Quality of the Idea

Différenciation fondamentale :

```text
Other AI video systems
Prompt → generated clips

Vox Studio
Research
→ reasoning
→ narrative
→ art direction
→ structured scenes
→ deterministic rendering
→ editable video
```

Le produit combine :

**agentic intelligence + research + generative assets + programmatic motion design.**

---

# 39. Requirements techniques hackathon

Le projet soumis doit réellement utiliser :

- Google Cloud ;
- Gemini ;
- Google Cloud Agent Builder ;
- Parallel pour notre track.

L'utilisation doit exister dans le runtime du produit et pas uniquement dans la documentation.

La soumission doit également comprendre notamment :

- URL du projet hébergé ;
- repository open source public ;
- code et instructions permettant de lancer le projet ;
- licence open source ;
- vidéo de démonstration ≤ 3 minutes ;
- choix du Partner Track.

Le produit doit fonctionner au minimum sur le Web, Android ou iOS ; Vox Studio V1 sera une **application Web**.

---

# 40. Stack cible

## Frontend

```text
React
Vite
TypeScript
```

Application Studio Web.

---

## Video

```text
Remotion
React
SVG
HTML/CSS
Canvas / WebGL lorsque nécessaire
```

---

## Agent orchestration

```text
Gemini
Google Agent Development Kit / Agent Builder stack
Google Cloud
```

L'implémentation exacte doit rester compatible avec les exigences du hackathon.

---

## Research

```text
Parallel
```

---

## Visual assets

Google image-generation capabilities lorsque nécessaire.

---

## Audio

Google/Gemini TTS ou infrastructure Google appropriée retenue pour la V1.

---

# 41. Modèle de données principal

```text
Project
 ├── ResearchDossier
 ├── NarrativePlan
 ├── Beats[]           ← chaque Beat porte son texte ; le script en est la projection
 ├── Sections[]
 │    ├── PersistentElements[]
 │    └── SceneInstances[]
 ├── Assets[]
 ├── Audio
 ├── CompileReport
 └── Render
```

---

# 42. Project states

```text
draft
researching
writing
planning
resolving_assets
compiling
rendering
ready
failed
```

L'interface doit pouvoir montrer l'état courant.

---

# 43. Performance perçue

Le système doit donner un résultat visible le plus rapidement possible.

Il ne faut pas attendre que toutes les images soient générées avant d'afficher quelque chose.

Pipeline :

```text
Research
 ↓
Plan
 ↓
Placeholder video
 ↓
Assets progressively resolved
 ↓
Final preview
```

Le système doit privilégier la **progressivité** plutôt qu'un spinner de plusieurs minutes.

---

# 44. Reliability requirements

### Rendu déterministe

Même :

```text
props + frame
```

doit produire le même résultat.

### Aucun état React interne dépendant du temps

Pas de :

```text
useState
Math.random()
Date.now()
```

sans mécanisme déterministe.

### Validation avant rendu

Les erreurs du Visual Planner ne doivent pas atteindre Remotion silencieusement.

---

# 45. Non-functional requirements

## UX

Une personne découvrant l'application doit comprendre le workflow en moins de 30 secondes.

## Visual

Aucune scène montrée pendant la démo ne doit ressembler à un prototype développeur.

## Stability

Le parcours utilisé dans la vidéo Devpost doit pouvoir être reproduit.

## Observability

Les appels principaux des agents doivent être journalisés.

## Traceability

Chaque claim important doit pouvoir rester associé à sa source.

---

# 46. Métriques V1

Les métriques ne servent pas encore à optimiser un SaaS.

Elles servent à savoir si le système est suffisamment fiable pour la démo.

### Agent reliability

```text
% SceneInstances validées au premier essai
```

Cible :

**> 90 %**

### Compilation

```text
% plans compilés après maximum une réparation
```

Cible :

**≈ 100 % sur les scénarios de démo**

### Scene selection

Inspection humaine de la pertinence des capabilities choisies.

### Visual quality

Toutes les scènes utilisées dans la démo doivent passer la grille de qualité.

### End-to-end

Le scénario de démonstration doit être exécutable plusieurs fois sans intervention dans le code.

---

# 47. Définition de Done — V1

Vox Studio V1 est considéré comme prêt lorsque :

- [ ] un utilisateur peut entrer un sujet ;
- [ ] un workflow agentique démarre ;
- [ ] Parallel est appelé réellement ;
- [ ] un dossier de recherche sourcé est créé ;
- [ ] des beats portant leur texte de voice-over sont produits ;
- [ ] un Visual Planner produit des SceneInstances ;
- [ ] les scènes sont choisies via le catalogue ;
- [ ] les assets nécessaires sont résolus ;
- [ ] un voice-over est généré ;
- [ ] le voice-over produit un timing exploitable ;
- [ ] le compiler transforme le plan en frames ;
- [ ] Remotion produit la vidéo ;
- [ ] la vidéo est premium visuellement ;
- [ ] plusieurs types de scènes sont visibles ;
- [ ] un élément persistant traverse plusieurs scènes ;
- [ ] l'utilisateur peut sélectionner une SceneInstance ;
- [ ] l'utilisateur peut éditer quelques paramètres ;
- [ ] l'utilisateur peut demander une modification par prompt ;
- [ ] seule la partie affectée est recompilée ;
- [ ] la vidéo peut être exportée ;
- [ ] le projet est hébergé ;
- [ ] le repository public est prêt ;
- [ ] la vidéo Devpost de trois minutes est prête.

---

# 48. Priorisation

## P0 — gagner le hackathon

```text
Premium scene library
Vertical slice
Parallel research
Gemini agents
Narrative generation
Visual planning
Asset Resolver
TTS + timing
Compiler
Remotion runtime
Studio UI
Scene selection
Prompt editing
Final video export
3-minute demo
```

---

## P1 — seulement après stabilité P0

```text
More SceneCapabilities
More themes
More layouts
More sophisticated asset processing
Advanced data charts
Advanced map animations
More character behaviors
```

---

## P2 — post-hackathon

```text
Veo clips
Advanced parallax
Full timeline editor
Collaboration
Version history
Quality Agent
Automatic visual critic
Marketplace
Billing
Teams
SaaS infrastructure
MCP scene server
Plugin ecosystem
```

---

# 49. Principe de décision pendant le développement

Lorsqu'une nouvelle idée apparaît, la question n'est pas :

> Est-ce que cette fonctionnalité serait cool ?

La question est :

> **Est-ce que cette fonctionnalité augmente les chances que le jury comprenne, en moins de trois minutes, que Vox Studio est technologiquement profond, réellement agentique, visuellement impressionnant et utile ?**

Si la réponse est non :

**post-hackathon.**

---

# 50. North Star de la V1

La V1 ne cherche pas à construire le meilleur éditeur vidéo du marché.

Elle cherche à produire un moment très précis :

```text
User writes one sentence
        ↓
an autonomous production crew starts working
        ↓
research appears
        ↓
sources appear
        ↓
story appears
        ↓
visual plan appears
        ↓
assets appear
        ↓
a polished documentary starts playing
```

Puis l'utilisateur modifie une scène avec une phrase, et la vidéo change.

**C'est cette expérience que nous devons rendre extraordinaire.**

---

# 51. Pitch final

> **Vox Studio is an autonomous AI production crew for visual explainers.**
>
> Give it a question. Its agents research the web with Parallel, build a sourced narrative with Gemini, direct the visual story, generate the required assets, synchronize everything to voice-over, and compile the result into an editable motion-designed documentary.
>
> Instead of generating disconnected AI clips, Vox Studio produces a structured video document — combining agentic reasoning, factual research, generative media and deterministic Remotion rendering.

---

# 52. Vision après le hackathon

La V1 prouve le moteur.

La vision complète est beaucoup plus large :

> Un environnement dans lequel une personne peut produire et éditer des contenus audiovisuels sophistiqués en discutant avec une équipe virtuelle de chercheurs, scénaristes, directeurs artistiques, animateurs et monteurs.

Le hackathon ne nécessite pas de construire toute cette vision.

Il doit simplement rendre évident que **le moteur permettant de l'atteindre existe déjà**.

---

**Référence architecture :** `vox-studio-architecture-figee.md`

**Référence hackathon :**

https://agentic-cinema.devpost.com/

**Deadline : 7 septembre 2026 — 2:00 PM PDT**

**Partner Track : Parallel**

**Mission V1 :**

> **Construire le meilleur exemple possible d'un studio documentaire réellement agentique, sourcé, éditable et visuellement premium.**