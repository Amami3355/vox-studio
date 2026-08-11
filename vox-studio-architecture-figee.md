# Vox Studio — Architecture de la bibliothèque de scènes

**Statut : FIGÉ pour le hackathon.** Ce document est la spécification de référence. Il ne doit plus être modifié pendant le développement, sauf si le code démontre qu'une décision est infaisable. Les propositions d'évolution s'accumulent dans un fichier séparé et sont traitées après la démo.

> Comment construire un catalogue de composants Remotion qu'un agent peut utiliser sans jamais lire le code, et qui produit un rendu de qualité motion design.

---

## 0. Les six règles d'or

1. **Le schéma est la source unique de vérité.** Props, manifeste, validation et documentation sont générés depuis un seul objet. Rien n'est écrit deux fois.
2. **L'agent ne voit jamais le code.** Il voit un manifeste JSON. Si le manifeste ne suffit pas à utiliser le composant, c'est le manifeste qu'il faut corriger.
3. **L'agent exprime du temps sémantique ; le compilateur produit du temps physique.** Ancres de beat, `pace`, `hold`. Jamais de frames, jamais d'arithmétique.
4. **Le rendu est une fonction pure de `(props, frame)`.** Aucun `useState`, aucun aléa non seedé, aucun `Date.now()`.
5. **Contrainte dure → échec bruyant. Contrainte souple → dégradation silencieuse.** Les deux régimes sont distincts et ne se recouvrent jamais.
6. **La cohérence premium vient du design system ; la richesse premium vient des scènes et de leur mise en scène.** Les tokens garantissent que rien ne jure. Ils ne produisent pas à eux seuls une image forte.

Deux scènes partageant couleurs, typographie et easing peuvent avoir des niveaux de qualité radicalement différents : l'une affiche trois barres et un titre, l'autre orchestre une entrée de caméra, une hiérarchie narrative, une annotation contextuelle et un personnage qui réagit. Le design system empêche la seconde d'être laide. Il ne la produit pas. **Budgétez du temps sur les deux.**

---

## 1. Architecture

```
┌─────────────────────────────────────────────┐
│  L0 — DESIGN SYSTEM                         │
│  tokens couleur / type / espace / motion    │
│  Aucun JSX. Des constantes.                 │
└─────────────────────┬───────────────────────┘
                      │
┌─────────────────────▼───────────────────────┐
│  L1 — PRIMITIVES VISUELLES                  │
│  AnimatedText, Reveal, CameraRig, Bar,      │
│  ImagePlate, Callout, Grid, SlotFrame       │
│  Non exposées à l'agent.                    │
└─────────────────────┬───────────────────────┘
                      │
┌─────────────────────▼───────────────────────┐
│  L2 — ARCHÉTYPES DE SCÈNE                   │
│  L'unité du catalogue.                      │
│  Schéma + manifeste + actions + layouts.    │
└─────────────────────┬───────────────────────┘
                      │
┌─────────────────────▼───────────────────────┐
│  L3 — SECTION RUNTIME                       │
│  Composition narrative : orchestration,     │
│  éléments persistants, transitions.         │
│  Générique : une seule implémentation.      │
└─────────────────────────────────────────────┘

        ┌──────────────────────────────┐
        │  ASSET RESOLVER (transverse) │
        │  s'intercale entre le plan   │
        │  et le compilateur           │
        └──────────────────────────────┘
```

**L3 n'est pas un composant par section.** Il n'existe pas de `HousingCrisisSection` écrit à la main. Il existe un `<Section />` générique qui consomme un plan JSON. Sinon chaque vidéo demande du code neuf, exactement ce qu'on veut éviter.

**L'Asset Resolver n'est pas une couche empilée mais une étape de pipeline.** Il s'exécute entre la production du plan sémantique et la compilation.

### 1.1 Trois niveaux à ne plus confondre

| Niveau | Nom | Visible par l'agent | Exemples |
|---|---|---|---|
| L1 | Primitives visuelles | Non | `AnimatedText`, `Bar`, `Callout`, `CameraRig` |
| L2 | Archétypes de scène | **Oui — c'est le catalogue** | `BarChartScene`, `ImageContextScene` |
| L3 | Composition narrative | Oui, indirectement | `Section` + éléments persistants |

Le mot « scène » désigne exclusivement le niveau 2.

### 1.2 SceneCapability vs SceneInstance

Distinction fondatrice, à respecter dans tout le code et toute l'UI.

**Une `SceneCapability`** est ce qui existe dans le catalogue. Il y en a 8 à 12. Elles sont définies par le code, générées au build, immuables au runtime.

```ts
type SceneCapability = {
  id: string;                      // "bar_chart" — identifiant du type
  name: string;                    // "BarChartScene"
  family: "data" | "context" | "character" | "typography" | "geo" | "diagram";
  summary: string;
  useWhen: string[];
  avoidWhen: string[];

  schema: ZodSchema;               // contraintes dures
  softConstraints: SoftConstraints;
  actions: Record<string, ActionDef>;
  layouts: Record<string, LayoutDef>;

  supportsEvents: boolean;
  requiresAssets: boolean;
  occupiesRegions: Slot[];
  supportedCompositions: Slot[];
  minDurationFrames: number;
  recommendedDurationFrames: number;

  examples: SceneInstance[];       // au moins 3
};
```

**Une `SceneInstance`** est ce qui existe dans une vidéo donnée. Il y en a des dizaines par projet. Elles sont créées par l'agent, éditées par l'utilisateur, sérialisées dans le document vidéo.

```ts
type SceneInstance = {
  id: string;                      // "scene_17" — identifiant unique dans CE projet
  component: string;               // référence vers une SceneCapability.id
  props: Record<string, unknown>;
  layout: string;
  motionProfile: MotionProfileId;
  events: SemanticEvent[];
  spansBeats: string[];
  pace?: "quick" | "measured" | "slow";
};
```

Conséquences à tenir :

| Opération | Porte sur | Jamais sur |
|---|---|---|
| `duplicate`, `delete`, `reorder` | `SceneInstance` | Capability |
| `changeLayout`, `editProps` | `SceneInstance` | Capability |
| `replaceComponent` | `SceneInstance`, avec migration vers une nouvelle capability | — |
| `searchScenes`, `getSceneSpec` | `SceneCapability` | Instance |
| `validateScene` | Une instance **contre** sa capability | — |

L'agent sélectionne des capabilities et produit des instances. Le studio manipule exclusivement des instances. Aucun code ne doit rendre cette frontière floue — c'est ce qui garde l'édition par prompt et le versionnage tractables.

---

## 2. L0 — Le design system

### 2.1 Ce que l'agent n'a pas le droit de choisir

| Interdit à l'agent | Pourquoi |
|---|---|
| Codes couleur bruts | Palettes incohérentes de scène en scène |
| Tailles de police en px | Casse l'échelle typographique |
| Valeurs d'easing, durées en frames | Chaque scène animerait à un rythme différent |
| Polices | Un seul couple display/texte par vidéo |
| Marges, padding, pourcentages de position | La grille et les slots sont fixes |

L'agent choisit un **thème** au niveau vidéo, un **motion profile** et un **rôle sémantique** (`accent`, `positive`, `negative`, `neutral`) au niveau scène. Rien de plus.

### 2.2 Tokens

```ts
export type Theme = {
  id: string;
  color: {
    bg: string; surface: string; ink: string; inkMuted: string;
    accent: string; accentAlt: string; positive: string; negative: string;
    dataSeries: string[];        // ordonné, 6 entrées minimum
  };
  type: {
    display: string; body: string; mono: string;
    scale: number[];             // ex. [28, 36, 48, 64, 88, 120, 168]
    tracking: { tight: number; normal: number; wide: number };
    weight: { regular: number; medium: number; bold: number };
  };
  space: number[];               // ex. [0, 8, 16, 24, 40, 64, 96, 144]
  grid: { columns: number; margin: number; gutter: number };
  radius: number[];
};
```

```ts
export const motion = {
  spring: {
    settle: { damping: 30,  mass: 1,   stiffness: 80  },
    snap:   { damping: 12,  mass: 0.4, stiffness: 200 },
    soft:   { damping: 200, mass: 0.6, stiffness: 120 },
  },
  duration: { instant: 6, quick: 12, base: 20, slow: 34 },   // frames @30fps
  stagger:  { tight: 2, base: 4, loose: 7 },
} as const;
```

### 2.3 Motion profiles

Le mouvement est exposé comme un **rôle**, choisi par l'agent selon l'intention du beat. Pas de drift universel : un zoom lent appliqué partout devient, au bout de deux minutes, la signature reconnaissable d'un système automatique. L'immobilité est un outil de motion design au même titre que le mouvement.

```ts
export const motionProfiles = {
  editorialStatic: {
    camera: { type: "none" },
    entrance: "stagger", spring: "settle", stagger: "base",
    intent: "Déclaration, citation, chiffre isolé. Le texte doit tenir seul.",
  },
  subtleDrift: {
    camera: { type: "drift", amount: 0.04 },
    entrance: "stagger", spring: "settle", stagger: "base",
    intent: "Contexte, image de fond, narration continue. Profil par défaut.",
  },
  pushIn: {
    camera: { type: "pushIn", amount: 0.12 },
    entrance: "stagger", spring: "settle", stagger: "loose",
    intent: "Montée de tension, révélation progressive.",
  },
  energetic: {
    camera: { type: "pushIn", amount: 0.06 },
    entrance: "stagger", spring: "snap", stagger: "tight",
    intent: "Données rapides, énumération, rythme soutenu.",
  },
  impact: {
    camera: { type: "none" },
    entrance: "unison", spring: "snap", stagger: "tight",
    intent: "Révélation brutale. Le tableau complet ou la composition typographique apparaît d'un bloc. À réserver aux beats d'impact ou de bascule.",
  },
  cinematic: {
    camera: { type: "panDrift", amount: 0.08 },
    entrance: "stagger", spring: "settle", stagger: "loose",
    intent: "Ouverture, conclusion, plan large sur un asset fort.",
  },
} as const;
```

**Le token `entrance`.** Le stagger est le défaut, l'entrée simultanée est un choix. Elle existe comme valeur (`unison`) parce qu'une règle « motivée par l'intention » sans moyen de l'exprimer est inapplicable — l'agent retomberait sur du stagger partout. `unison` n'est atteignable qu'en sélectionnant `impact`, ce qui force la motivation à passer par le choix de profil plutôt que par un réglage isolé.

**Règle d'usage imposée au Visual Planner :** deux scènes consécutives ne partagent pas le même profil si elles couvrent des beats d'intention différente. Le contraste entre une scène qui bouge et une scène immobile fait plus pour le rythme que n'importe quel effet.

`editorialStatic` doit être motivé par un beat de déclaration — jamais la valeur de repli quand l'agent hésite. `subtleDrift` est le défaut du schéma.

---

## 3. Layout : slots exposés, safeArea calculé

Deux couches distinctes, pas deux options concurrentes.

```
Agent                    Compilateur              Composant
─────                    ───────────              ─────────
slot: "cornerBR"    →    résolution des      →    safeArea: {
composition: "left"      occupations               bottom: 18,
                         concurrentes              right: 22, ... }
```

```ts
export type Slot =
  | "full" | "left" | "right" | "top" | "bottom" | "center"
  | "cornerTL" | "cornerTR" | "cornerBL" | "cornerBR";

export type SafeArea = { top: number; right: number; bottom: number; left: number }; // %
```

Résolution par le compilateur, frame par frame :

- **Aucun conflit** → `safeArea` nul, la scène occupe tout.
- **Conflit résoluble** → l'élément persistant est déplacé vers un slot libre, ou la scène bascule sur une composition compatible. Warning `SLOT_RELOCATED`.
- **Conflit irréductible** → l'élément persistant est masqué pendant cette scène plutôt que de produire un chevauchement. Warning `PERSISTENT_ELEMENT_HIDDEN`.

La scène applique le `safeArea` via `<SlotFrame>`, qui ajuste padding, grille et échelle typographique. Le composant ne voit jamais de slot ; l'agent ne voit jamais de pourcentage.

---

## 4. L2 — Le contrat de scène

```
src/scenes/BarChartScene/
├── schema.ts        # Zod : contraintes DURES, defaults
├── constraints.ts   # contraintes SOUPLES, publiées au manifeste
├── actions.ts       # vocabulaire d'événements fermé
├── layouts.ts       # variantes de composition interne
├── meta.ts          # sélection : useWhen / avoidWhen / régions
├── Component.tsx    # rendu
├── examples.ts      # 3+ SceneInstance, dont cas limites
└── index.ts
```

### 4.1 Contraintes dures et souples

Un schéma en `.max(8)` rend inatteignable toute dégradation à 12 éléments, et un `.min(2)` rend inatteignable l'état vide. Deux bornes distinctes sont nécessaires.

```ts
// schema.ts — contraintes DURES uniquement
export const barChartSchema = z.object({
  title: z.string().max(120)
    .describe("Titre affiché en haut. Optimal sous 40 caractères ; au-delà, la taille est réduite automatiquement."),

  data: z.array(z.object({
    label: z.string().max(40),
    value: z.number(),
  })).max(20)
    .describe("Séries à comparer. Optimal entre 2 et 8. De 9 à 20, les plus faibles sont regroupées en 'Autres'. Tableau vide : état vide typographié."),

  unit: z.string().max(8).default(""),

  highlight: z.string().optional()
    .describe("Le `label` de la barre à mettre en avant. Les autres sont désaturées."),

  emphasis: z.enum(["neutral", "positive", "negative"]).default("neutral"),

  motionProfile: z.enum([
    "editorialStatic", "subtleDrift", "pushIn", "energetic", "impact", "cinematic",
  ]).default("subtleDrift"),

  layout: z.enum(["standard", "horizontal", "withCallout"]).default("standard"),
});
```

```ts
// constraints.ts — contraintes SOUPLES
export const barChartConstraints = {
  data: {
    recommendedMin: 2,
    recommendedMax: 8,
    absoluteMax: 20,
    onExceed: "Les valeurs au-delà du rang 8 sont agrégées en une barre 'Autres'.",
    onEmpty: "État vide typographié affichant le titre seul.",
  },
  title: { recommendedMax: 40, onExceed: "Réduction d'un cran d'échelle typographique." },
};
```

Régime résultant :

```
0 élément     → état vide (dégradation)
1 élément     → rendu + warning
2–8           → zone optimale
9–20          → agrégation automatique + warning
> 20          → erreur de validation, rejet
```

Les bornes recommandées **apparaissent dans le manifeste**, pas seulement dans la validation. Un agent qui ne voit que la borne dure de 20 produira systématiquement des graphiques illisibles.

### 4.2 Vocabulaire d'actions fermé

Mode d'échec le plus dangereux du système : l'agent produit `emphasizeBar` au lieu de `highlightBar`, la scène rend parfaitement, et rien ne s'anime. Aucune erreur, aucune trace, une vidéo morte.

```ts
export const barChartActions = {
  showBaseline: { description: "Fait apparaître la première barre seule.", payload: null },
  revealAll:    { description: "Fait apparaître les barres restantes en cascade.", payload: null },
  highlightBar: { description: "Met une barre en avant et désature les autres.",
                  payload: z.object({ label: z.string() }) },
  annotate:     { description: "Affiche une annotation textuelle pointant une barre.",
                  payload: z.object({ label: z.string(), text: z.string().max(50) }) },
} as const;
```

Toute action hors vocabulaire est une erreur de compilation, jamais un silence.

### 4.3 Scènes composites : variantes, pas arbre

Une scène composite est **un composant avec plusieurs layouts internes et des slots typés**, pas un composant qui en contient d'autres. L'imbrication libre rendrait le calcul du `safeArea` récursif et l'unité d'édition du studio ambiguë.

```ts
export const imageContextLayouts = {
  fullBleed:      { slots: ["image"] },
  splitLeft:      { slots: ["image", "text"] },
  cutoutOnColor:  { slots: ["image", "headline"] },
  imageWithStat:  { slots: ["image", "stat", "caption"] },
  imageAnnotated: { slots: ["image", "annotation"] },
  evidence:       { slots: ["image", "stat", "quote", "annotation"] },
};
```

Les slots internes acceptent des **primitives typées** (texte, valeur, annotation, asset), pas des scènes.

Coût réel à ne pas sous-estimer : neuf layouts, ce sont neuf variantes à passer dans la boucle d'évaluation visuelle. Le gain est la cohérence et la lisibilité du catalogue, pas le temps de travail.

### 4.4 Métadonnées de sélection

```ts
export const barChartMeta = {
  id: "bar_chart",
  name: "BarChartScene",
  family: "data",
  summary: "Comparaison de valeurs discrètes entre catégories.",
  useWhen: [
    "comparer des quantités entre catégories nommées",
    "montrer un classement",
    "opposer deux à huit valeurs",
  ],
  avoidWhen: [
    "évolution continue dans le temps → line_chart",
    "part d'un tout → stat_donut",
    "une seule valeur → stat_counter",
  ],
  supportsEvents: true,
  requiresAssets: false,
  occupiesRegions: ["bottom", "left"],
  supportedCompositions: ["full", "left", "right"],
  minDurationFrames: 90,
  recommendedDurationFrames: 210,
};
```

`avoidWhen` avec redirection explicite vaut plus que trois paragraphes de description.

### 4.5 Le composant

```tsx
export const BarChartScene: React.FC<SceneProps<BarChartProps>> = ({
  props, events, safeArea, theme, profile,
}) => {
  const frame = useCurrentFrame();

  const state = resolveEvents(events, frame, {
    visibleBars: profile.entrance === "unison" ? Infinity : 1,
    highlighted: props.highlight ?? null,
    annotation: null,
  });

  const data = aggregateBeyond(props.data, barChartConstraints.data.recommendedMax);

  return (
    <CameraRig profile={profile}>
      <SlotFrame safeArea={safeArea} layout={props.layout}>
        <SceneTitle>{props.title}</SceneTitle>
        {data.length === 0
          ? <EmptyState title={props.title} />
          : <BarGroup
              data={data}
              visibleCount={state.visibleBars}
              highlighted={state.highlighted}
              seriesColors={theme.color.dataSeries}
              entrance={profile.entrance}
              stagger={profile.stagger}
            />}
        {state.annotation && <Callout {...state.annotation} />}
      </SlotFrame>
    </CameraRig>
  );
};
```

`resolveEvents` replie la liste d'événements déjà passés sur un état initial. C'est ce qui rend le composant pur et rejouable à n'importe quelle frame — indispensable au rendu distribué de Remotion.

---

## 5. L'Asset Resolver

### 5.1 États d'un asset

Le compilateur refuse toute **référence manquante**, mais accepte un **placeholder résolu**. Ce sont deux choses différentes, et l'union discriminée l'exprime sans ambiguïté.

```ts
export type AssetRef =
  | { status: "ready";       uri: string }
  | { status: "placeholder"; uri: string; pendingRequirementId: string }
  | { status: "failed";      uri: string; requirementId: string; reason: string };
```

| État | Compilation | Rendu |
|---|---|---|
| Référence absente ou requirement non traité | **ERROR** | — |
| `placeholder` | Warning `ASSET_PLACEHOLDER` | Aplat de thème + label du sujet |
| `failed` | Warning `ASSET_PLACEHOLDER`, severity `important` | Aplat de thème + label du sujet |
| `ready` | OK | Asset final |

`failed` est distingué de `placeholder` parce qu'une génération définitivement échouée et une génération en attente demandent des décisions opposées : la première exige une intervention, la seconde exige seulement d'attendre. La démo doit savoir laquelle elle affiche.

### 5.2 Position dans le pipeline

```
Plan sémantique (assetRequirements non traités)
        │
        ▼
   ASSET RESOLVER  ──────► placeholders immédiats
        │                  (preview rendable tout de suite)
        │
        ▼
Plan avec AssetRef en status ready | placeholder | failed
        │
        ▼
   COMPILATEUR  (refuse toute référence absente)
        │
        ▼
     REMOTION
```

**Le plan doit rester rendable avec des placeholders.** La génération d'images est l'étape la plus lente du pipeline ; si elle bloque le preview, la démo perd son effet de rapidité.

### 5.3 Déclaration côté scène

```ts
assetRequirement: z.object({
  type: z.enum(["image", "character", "map", "document"]),
  subject: z.string().max(80)
    .describe("Sujet visuel en langage naturel. Ex. 'skyline de Tokyo au crépuscule'."),
  treatment: z.enum(["photo", "cutout", "illustration", "duotone"]).default("photo"),
  orientation: z.enum(["landscape", "portrait", "square"]).default("landscape"),
  identityKey: z.string().optional()
    .describe("Pour un personnage récurrent. Deux requirements de même identityKey renvoient le même asset."),
}),
```

### 5.4 Chaîne de résolution

```
assetRequirement
      │
      ├─ 1. cache d'identité (identityKey déjà résolu ?)
      ├─ 2. cache projet (sujet normalisé déjà généré ?)
      ├─ 3. bibliothèque locale (personnages, icônes, fonds)
      ├─ 4. recherche d'image sous licence
      └─ 5. génération (Gemini Image)
                  │
                  ▼
         traitement : détourage / recadrage / duotone
                  │
                  ▼
         normalisation : dimensions, format, nommage
                  │
                  ▼
              AssetRef { status: "ready" }
```

Trois exigences non négociables :

- **Cohérence de style.** Un préfixe de style verrouillé, dérivé du thème, est concaténé à tout prompt de génération. Sans cela, douze images produisent douze styles.
- **Cache d'identité.** Un personnage apparaissant cinq fois doit être généré une fois. C'est `identityKey` qui le garantit — pas la similarité du prompt.
- **Échec gracieux.** Une génération ratée produit un `AssetRef` en `failed` et laisse le placeholder au rendu. Elle ne fait jamais échouer la compilation.

---

## 6. Découvrabilité : manifeste et tools

### 6.1 Génération

```ts
// scripts/build-catalog.ts
const catalog = registry.map(scene => ({
  ...scene.meta,
  propsSchema: zodToJsonSchema(scene.schema, { target: "openApi3" }),
  softConstraints: scene.constraints,
  layouts: Object.keys(scene.layouts),
  actions: Object.entries(scene.actions).map(([id, a]) => ({
    id, description: a.description,
    payloadSchema: a.payload ? zodToJsonSchema(a.payload) : null,
  })),
  examples: scene.examples,
}));
```

Généré au build. **Jamais édité à la main.** Un manifeste manuel diverge du code en trois jours, et l'agent produit alors des props invalides sans qu'on comprenne pourquoi.

### 6.2 Quatre tools, pas de MCP en V1

```
searchScenes(intent: string)      → index compact des SceneCapability candidates
getSceneSpec(capabilityId)        → fiche complète : schéma, contraintes, actions, layouts, exemples
validateScene(instance)           → erreurs + warnings, sans rendu
validateVideoPlan(plan)           → validation globale : ancres, durées, slots, assets
```

Deux niveaux de lecture : l'agent choisit d'abord sur l'intention (index compact, toujours en contexte), puis remplit les paramètres avec la fiche complète. Un serveur MCP n'apporte rien tant que le catalogue reste interne.

### 6.3 Les exemples valent mieux que les descriptions

Trois `SceneInstance` minimum par capability, dont un cas limite (20 entrées, texte long) et un cas vide. Un modèle imite un exemple beaucoup plus fidèlement qu'il ne suit une description. Levier le moins coûteux pour améliorer le taux de succès.

---

## 7. Le temps

### 7.1 Ce que l'agent produit

```json
{
  "id": "scene_17",
  "component": "bar_chart",
  "spansBeats": ["b4", "b5", "b6"],
  "pace": "measured",
  "layout": "standard",
  "motionProfile": "energetic",
  "props": { "title": "Le prix du logement" },
  "events": [
    { "at": "b4.start", "action": "showBaseline" },
    { "at": "b5.start", "action": "revealAll" },
    { "at": "b6.start", "action": "highlightBar", "payload": { "label": "2025" } }
  ]
}
```

Deux registres temporels, tous deux symboliques :

- **Ancres** — `b4.start`, `b4.end`, `b4.mid`, `b4.start+short`, `scene.end-short`
- **Tokens de rythme** — `pace: "quick" | "measured" | "slow"`, `hold: "none" | "short" | "long"`

Les tokens de rythme influencent la répartition interne des événements et le temps de respiration en fin de scène. Ils ne fixent aucune durée : la durée d'une scène reste la somme des beats couverts.

### 7.2 Le compilateur

```
Beat plan (sans timing)
        │
        ▼
   TTS + alignement forcé          ← timings réels par mot
        │
        ▼
 Beats horodatés
        │
        ▼
   COMPILATEUR (déterministe)
        │  résout ancres et tokens de rythme → frames
        │  calcule durées = somme des beats couverts
        │  vérifie minDurationFrames
        │  résout slots → safeArea par frame
        │  génère le SectionTimeline des éléments persistants
        │  vérifie que toute AssetRef existe
        ▼
   Document vidéo compilé (frames absolues)
        │
        ▼
      Remotion
```

Le `SectionTimeline` des éléments persistants est une **sortie générée**, jamais un objet écrit par un agent. Tout est ancré sur les beats ; les scènes en découlent.

---

## 8. Validation, warnings, dégradation

### 8.1 Erreurs — échec bruyant avant rendu

| Cas | Traitement |
|---|---|
| Capability inconnue | Erreur + liste des ids valides |
| Props invalides (contrainte dure) | Erreur + chemin du champ + attendu |
| Action hors vocabulaire | Erreur + actions disponibles |
| Layout inconnu pour cette capability | Erreur + layouts disponibles |
| Ancre vers un beat inexistant | Erreur |
| Scène sous `minDurationFrames` | Erreur + suggestion de fusion |
| Référence d'asset absente | Erreur |

Ces messages sont réinjectés à l'agent pour une passe de correction. Une boucle de réparation à une itération récupère la grande majorité des échecs.

### 8.2 Le contrat de warning

Le rapport de compilation est un livrable, pas un log. Il a donc un schéma.

```ts
export type CompilerWarning = {
  code:
    | "SOFT_LIMIT_EXCEEDED"
    | "SLOT_RELOCATED"
    | "PERSISTENT_ELEMENT_HIDDEN"
    | "ASSET_PLACEHOLDER"
    | "MOTION_PROFILE_REPETITION"
    | "TITLE_DENSITY"
    | "SCENE_BELOW_RECOMMENDED_DURATION";

  severity: "info" | "quality" | "important";

  sceneId?: string;        // SceneInstance.id
  sectionId?: string;
  field?: string;          // chemin dans les props, si applicable

  message: string;         // description factuelle
  suggestion?: string;     // action corrective, formulée pour être exécutable
};

export type CompileReport = {
  ok: boolean;
  errors: CompilerError[];
  warnings: CompilerWarning[];
};
```

Ce format ouvre à terme la boucle qualité :

```
Compiler → warnings structurés → Quality Agent → JSON patches → Compiler
```

**Réserve d'implémentation pour le hackathon :** écrivez le contrat, ne construisez pas le Quality Agent. Une boucle compilateur → agent → patch peut osciller, et déboguer une oscillation la veille d'une démo est un mauvais moment. Le rapport sert d'abord de diagnostic humain.

### 8.3 Dégradation silencieuse — pendant le rendu

- Titre trop long → réduction de l'échelle typographique, jamais de débordement
- 12 barres → agrégation en « Autres »
- Tableau vide → état vide typographié, pas un écran noir
- Asset `placeholder` ou `failed` → aplat de thème avec le label du sujet
- Valeurs négatives sur un axe supposé positif → axe recalculé

Ces cas sont dans `examples.ts` et testés.

---

## 9. Atteindre le rendu premium

La qualité visuelle ne vient pas de l'architecture. Elle vient de l'itération. L'architecture rend seulement l'itération possible.

### 9.1 Component Studio

Une page qui rend **toutes les capabilities, tous leurs layouts, tous leurs exemples**, en grille, dans le `<Player>` Remotion. Doit exister au jour 1.

### 9.2 Boucle par variante

```
Rendre les exemples de la variante
        ↓
Capturer 6 frames (0 %, 20 %, 40 %, 60 %, 80 %, 100 %)
        ↓
Critique sur la grille de notation
        ↓
Corriger → répéter
```

Grille :

1. **Hiérarchie** — un seul élément dominant, identifiable en 200 ms
2. **Respiration** — marges généreuses, rien qui touche les bords
3. **Timing** — décalages cohérents, rien de figé sans raison
4. **Contraste typographique** — rapport 3:1 minimum entre display et texte secondaire
5. **Cohérence de palette** — aucune couleur hors tokens

### 9.3 Test de continuité — dès la deuxième scène

Deux scènes correctes suffisent pour enchaîner dans une Section avec un élément persistant. La majorité des vrais problèmes n'apparaissent qu'ici : collisions de slots, transitions brutales, personnage qui saute, uniformité de rythme.

Polir six scènes isolément avant ce test, c'est découvrir tard des défauts qui obligent à toutes les reprendre.

### 9.4 Non-régression

Snapshots d'images sur les frames clés de chaque exemple. Une modification de token qui casse trois scènes doit être visible immédiatement.

---

## 10. Le document vidéo compilé

```json
{
  "meta": { "fps": 30, "width": 1920, "height": 1080, "themeId": "editorial-cold" },
  "audio": { "voiceover": "asset://vo.mp3", "music": "asset://bed.mp3" },
  "report": { "ok": true, "errors": [], "warnings": [] },
  "sections": [
    {
      "id": "sec1",
      "from": 0,
      "durationInFrames": 750,
      "persistent": [
        {
          "id": "char1",
          "element": "character",
          "asset": { "status": "ready", "uri": "asset://economist-cutout" },
          "layoutStates": [
            { "from": 0,   "to": 240, "slot": "right" },
            { "from": 240, "to": 630, "slot": "cornerBR" },
            { "from": 630, "to": 750, "slot": "center" }
          ]
        }
      ],
      "scenes": [
        {
          "id": "scene_17",
          "component": "bar_chart",
          "from": 240,
          "durationInFrames": 210,
          "layout": "standard",
          "motionProfile": "energetic",
          "safeArea": { "top": 0, "right": 22, "bottom": 18, "left": 0 },
          "props": { "title": "Le prix du logement", "data": [] },
          "events": [
            { "frame": 240, "action": "showBaseline" },
            { "frame": 312, "action": "revealAll" },
            { "frame": 384, "action": "highlightBar", "payload": { "label": "2025" } }
          ],
          "transitionIn": { "type": "wipe", "durationInFrames": 12 }
        }
      ]
    }
  ]
}
```

Runtime générique :

```tsx
export const Section: React.FC<{ section: CompiledSection }> = ({ section }) => (
  <AbsoluteFill>
    <PersistentLayer elements={section.persistent} layer="background" />
    {section.scenes.map(s => (
      <Sequence key={s.id} from={s.from - section.from} durationInFrames={s.durationInFrames}>
        <SceneRenderer scene={s} />
      </Sequence>
    ))}
    <PersistentLayer elements={section.persistent} layer="foreground" />
  </AbsoluteFill>
);
```

---

## 11. Édition par prompt : native, pas gratuite

L'architecture rend l'édition en langage naturel **native** — aucune infrastructure conceptuelle supplémentaire. Elle a néanmoins un coût d'implémentation réel.

```
"Mets le graphique de la scène 4 en courbe"
        ↓
contexte : props actuelles de scene_17 + spec de la capability line_chart
        ↓
patch sur la SceneInstance
        ↓
migration de props     ← champs incompatibles abandonnés explicitement
        ↓
résolution d'assets    ← si le patch en introduit
        ↓
validation contre la nouvelle capability
        ↓
recompilation partielle + invalidation ciblée du preview
```

Points non triviaux :

- **Migration de props.** Validation contre le schéma *cible*. Les champs incompatibles sont abandonnés et signalés, jamais transférés en silence.
- **Effet sur les scènes suivantes.** Les durées venant des beats, un changement de capability n'en produit normalement pas — sauf si la nouvelle a un `minDurationFrames` supérieur. Ce cas doit être détecté.
- **Invalidation ciblée.** Seule l'instance modifiée est recompilée.

---

## 12. Le vertical slice — premier objectif de développement

Avant toute question d'agent, d'ADK ou de studio : produire **20 à 30 secondes de vraie vidéo** à partir d'un plan JSON écrit à la main.

```
Beat 1  ImageContextScene — "Les loyers explosent dans les grandes villes"
            ↓ transition
Beat 2  BarChartScene — animation des valeurs
            + personnage persistant en cornerBR
            ↓
Beat 3  BarChartScene — highlight + annotation, personnage toujours présent
            ↓
Beat 4  ImageContextScene — personnage se déplace vers left
```

**Contrainte impérative : un vrai voice-over TTS avec alignement forcé, même sur un script écrit à la main.** Des timings de beats inventés en secondes rondes masquent toute la classe de bugs de synchronisation — ancres mal résolues, scènes qui coupent au milieu d'une phrase, événements décalés d'une demi-seconde. C'est précisément ce que ces 30 secondes doivent valider.

Critères de réussite :

- [ ] La séquence est visuellement premium et fluide
- [ ] Les transitions ne cassent pas la continuité
- [ ] Le personnage persistant survit aux changements de scène sans collision ni saut
- [ ] Les événements tombent sur les mots attendus du voice-over
- [ ] Tout est produit à partir du plan JSON, sans code spécifique à cette vidéo
- [ ] Modifier une prop dans le JSON change la vidéo sans rien casser d'autre

Si ces trente secondes tiennent, l'essentiel du pari technique est validé. Si elles ne tiennent pas, le problème sera dans les primitives, les scènes, les layouts ou le motion design — pas dans le manifeste ni dans ADK.

---

## 13. Ordre de construction

| # | Étape | Pourquoi ici |
|---|---|---|
| 1 | Design system + primitives + motion profiles | Tout en dépend, rien n'est visible en démo |
| 2 | Component Studio | Sans lui, aucune boucle d'évaluation |
| 3 | **BarChartScene**, complète et polie | Le patron que copieront toutes les autres |
| 4 | Catalogue généré + 4 tools de validation | Testables sans agent |
| 5 | **ImageContextScene** + Asset Resolver (placeholders) | Première scène à dépendance d'asset |
| 6 | **Section Runtime + compilateur minimal** | Deux scènes suffisent à révéler collisions et continuité |
| 7 | TTS + alignement + beat compiler | Complète le vertical slice du §12 |
| 8 | CharacterExplainer, TypographicStatement, Map, Comparison | Sur une base déjà validée en séquence |
| 9 | Test au harnais généraliste | Catalogue + beat plan, sans accès au code |
| 10 | Agents ADK | Seulement maintenant |
| 11 | Studio UI | En dernier |

L'étape 9 est une mesure : taux de props valides du premier coup, actions inventées, pertinence de sélection, rendu final présentable. Ce qu'elle révèle porte sur le catalogue, pas sur l'agent.

---

## 14. Stratégie de catalogue

```
❌  40 scènes moyennes

✅  8–12 capabilities robustes
    × plusieurs layouts
    × plusieurs motion profiles
    × plusieurs actions
    × assets dynamiques
    × éléments persistants
```

Une seule `ImageContextScene` couvre le full bleed, le split, le détourage sur aplat, l'image avec titre, avec statistique, avec personnage, avec annotation, avec push de caméra, avec recadrage contextuel — sans neuf capabilities distinctes.

Gain : cohérence visuelle, catalogue lisible par l'agent, maintenance concentrée.
Coût : chaque variante passe individuellement dans la boucle d'évaluation. Économie de surface, pas de temps.

---

## 15. Checklist d'entrée au catalogue

Ce qu'une `SceneCapability` doit fournir :

- [ ] Schéma Zod avec `.describe()` sur chaque champ, **contraintes dures uniquement**
- [ ] Fichier de contraintes souples publié au manifeste
- [ ] `useWhen` / `avoidWhen` avec redirection vers les alternatives
- [ ] Vocabulaire d'actions fermé, avec schéma de payload
- [ ] Layouts déclarés, chacun avec ses slots internes typés
- [ ] `occupiesRegions` et `supportedCompositions` renseignés
- [ ] Consommation du `safeArea` via `SlotFrame`
- [ ] `motionProfile` en prop, aucune valeur de caméra en dur, `entrance` respecté
- [ ] `assetRequirement` sémantique si besoin d'un visuel, avec `identityKey` pour les personnages
- [ ] Trois `SceneInstance` d'exemple minimum, dont un cas limite et un cas vide
- [ ] Rendu pur : aucun état, aucun aléa non seedé
- [ ] Zéro couleur, taille ou durée écrite en dur
- [ ] Dégradation testée sur données vides, longues, extrêmes
- [ ] Grille de notation passée sur six frames, pour chaque layout

---

> **L'agent choisit une intention et remplit des paramètres. Le design system garantit la cohérence. Les scènes portent la richesse. Le resolver fournit la matière. Le compilateur décide du temps et de l'espace. Remotion exécute.**

**Document figé. Prochaine action : §12, le vertical slice.**
