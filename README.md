# Para-VIS-CORPS

Boutique de parapharmacie en français, adaptée au mobile, aux couleurs crème, olive et dorées. Application Cloudflare Workers + D1 avec catalogue, recherche, catégories, fiches produit, panier, paiement à la livraison et administration à `/admin`.

## Développement

Node.js 24 et npm. Utiliser le checkout existant ; aucun worktree supplémentaire nécessaire.

```sh
npm ci
cp .dev.vars.example .dev.vars
# Modifier .dev.vars : mot de passe administrateur (16 caractères minimum)
# et SESSION_SECRET aléatoire de 32 caractères minimum.
npm run build
npm run db:local
npm run catalogue:local
npm run dev
```

Ouvrir l'adresse indiquée par Wrangler. La base locale et les secrets locaux sont ignorés par Git. Après modification du frontend, relancer `npm run build`. Les données locales persistent sous `.wrangler/` ; elles ne sont jamais transférées automatiquement à la base distante.

## Cloudflare : première mise en ligne

Ce projet utilise **Workers**, et non un simple hébergement statique Pages : les commandes nécessitent une base et une API.

1. Connecter le compte Cloudflare avec son mécanisme habituel, ou utiliser un token Cloudflare sécurisé dans les paramètres du service. Ne jamais mettre les secrets dans GitHub ou dans le code.
2. Créer D1 : `npx wrangler d1 create para-vis-corps`.
3. Le `database_id` de la base créée est configuré dans `wrangler.jsonc` ; conserver le binding `DB`. Pour un autre compte Cloudflare, le remplacer par celui de sa propre base.
4. Appliquer le schéma : `npx wrangler d1 migrations apply para-vis-corps --remote`.
5. Configurer `npx wrangler secret put ADMIN_PASSWORD` (minimum 16 caractères) et `npx wrangler secret put SESSION_SECRET` (aléatoire, minimum 32 caractères).
6. Déployer : `npm run deploy`. Dans Cloudflare, associer ensuite le domaine personnalisé au Worker et activer HTTPS.
7. Facultatif : connecter ce dépôt dans Workers Builds, avec `npm run build` comme commande de construction et `npm run deploy` comme commande de déploiement (installation npm automatique par Workers Builds). Le script de déploiement applique les migrations D1 avant de publier le Worker. Le token de build doit pouvoir modifier la base D1 et déployer le Worker. Configurer D1 et les secrets avant l'ouverture.

Les secrets sont fournis directement à Workers (pas à un proxy de secrets HTTP). Aucune donnée Cloudflare ni aucun identifiant de déploiement n'est inclus dans ce dépôt. Une page GitHub Pages seule ne fera pas fonctionner les commandes.

## Gestion quotidienne

- Se connecter à `/admin` avec le mot de passe administrateur.
- Ajouter/modifier les produits : nom, marque, catégorie, description, prix en DH, stock, photo HTTPS et publication. Décocher « Publier » pour retirer un produit de la boutique.
- Les commandes apparaissent avec leurs articles, les coordonnées et l'adresse. Les états disponibles sont nouvelle, confirmée, expédiée, livrée et annulée. Le tableau affiche les 500 dernières commandes.
- Le stock est réservé à la confirmation de la commande en boutique. Une annulation ne restitue pas automatiquement le stock : vérifier puis ajuster manuellement pour éviter une remise en vente incorrecte.
- Le chiffre affiché est le sous-total des articles livrés, hors frais de livraison.
- Le serveur recalcule les prix depuis D1, ignore les montants envoyés par le client et réserve les stocks de manière atomique. Aucun paiement par carte n'est collecté.

## Catalogue intégré

Le catalogue public BeautyMarket a été extrait et vérifié le 6 novembre 2026 : **13 036 produits, 13 238 références/formats et 691 collections**, avec 52 939 relations produit–collection. Les 97 produits comportant plusieurs variantes sont proposés sous des lignes distinctes, chacune avec son propre prix et son stock. Les noms de formats sont ajoutés aux titres. Le manifeste est dans `catalogue-manifest.json`.

**À la demande du propriétaire, chaque référence importée démarre à 10 unités**, indépendamment de la disponibilité annoncée par BeautyMarket. Modifier les quantités dans `/admin` selon le stock réel de la boutique. Le stock est décrémenté par les commandes et n’est pas réinitialisé lors des déploiements suivants.

Les prix en MAD sont conservés au centime : il s’agit d’un instantané, sans synchronisation automatique. Les 691 collections source restent conservées dans la base et dans l’API. Le sélecteur public de collections a été retiré ; la barre de catégories reste visible pendant le défilement du catalogue et présente une seule rangée de bulles sur tous les écrans, navigable par glissement, flèches et clavier. Les onglets et le hero utilisent les 13 rubriques demandées, définies dans `src/categories.js`. Les filtres reposent sur les relations source des collections, y compris les regroupements de la page K-beauty, les quatre familles de la page Sport et le filtre de tag de Minceur. Les nombres de référence sont dans `navigation-category-counts.json`. Le hero présente les 13 catégories dans une seule rangée de bulles photographiques défilantes, avec flèches, glissement à la souris, navigation tactile et clavier. Les catégories hors champ restent accessibles horizontalement. Les photos transparentes gardent un effet de relief et une animation légère respectant la réduction des mouvements. Les résultats de recherche et l’administration sont paginés à 24 références. Le panier récupère ses références par identifiant pour rester correct lorsqu’on change de page ou de filtre.

Les photos sont chargées depuis leurs URL HTTPS `cdn.shopify.com`. Une fiche source n’avait pas de photo : un visuel de remplacement est affiché. Les galeries conservent les autres photos source. Les paragraphes promotionnels nommant le vendeur source sont exclus de la description destinée à la boutique. Le logo original et sa version transparente sont conservés dans `public/`.

### Import D1 et déploiement

Les migrations ne modifient que le schéma. `scripts/import-catalogue.mjs` charge les fichiers de `catalogue-import/` via **l’import SQL par fichier de D1**, adapté au volume, puis contrôle les quatre comptages du manifeste. La première importation peut prendre quelques minutes. Une empreinte mémorisée dans `catalogue_imports` évite de rejouer l’import. Les insertions sont également protégées contre les doublons par les identifiants de variantes source et n’écrasent pas les fiches existantes.

`npm run deploy` exécute la construction, les migrations distantes, l’import vérifié, puis le déploiement du Worker. Conserver cette commande dans Cloudflare Builds. Le token doit disposer de l’accès D1 et Workers. L’import s’arrête en cas d’erreur et empêche la publication d’un Worker nécessitant un catalogue incomplet. Les fichiers SQL ne sont pas exposés dans les assets publics.

Pour reconstruire les fichiers à partir du snapshot original : `python scripts/prepare-catalogue.py /chemin/du/snapshot`. Ce script prépare les données ; il ne remplace pas un processus de synchronisation des prix ou des stocks.

Avant ouverture commerciale, compléter les coordonnées de l’exploitant, les frais/délais de livraison, les conditions de vente et de retour, et la politique de conservation des données. Les frais sont actuellement précisés lors de l’appel de confirmation, avant expédition.

## Validation

```sh
npm ci
# Si Chromium système n'est pas disponible :
npx playwright install --with-deps chromium
npm test
```

Les tests Chromium utilisent une **base isolée** sous `/tmp/pvc-e2e-state` et des identifiants de test sans rapport avec la production. Ils vérifient l’import complet, les collections, la pagination, la recherche, l’édition des stocks, le panier après changement de page, une commande via le navigateur, sa présence dans l'administration, les changements de statut, les prix recalculés, le stock, les commandes concurrentes, les rejets non authentifiés, la protection d'origine, les coordonnées invalides et l'affichage mobile sans débordement. Il ne valide pas un déploiement distant. CI GitHub incluse.
