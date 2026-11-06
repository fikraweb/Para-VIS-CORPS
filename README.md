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

## Catalogue et éléments restant à fournir

**Aucun prix BeautyMarket n'a été inventé.** L'accès réseau à `beautymarket.ma` était refusé lors de la réalisation. Trois fiches de travail non publiées et sans prix sont disponibles ; ajouter les véritables références, photos autorisées et prix vérifiés depuis le dashboard. Il n'y a ni import complet ni synchronisation automatique de ce site.

Le logo officiel fourni est intégré sans retouche dans `public/logo-para-vis-corps.jpeg`, utilisé dans l’en-tête, le visuel principal, le pied de page et l’icône du navigateur.

Avant ouverture commerciale, compléter le téléphone et l'identité de l'exploitant, les frais/délais de livraison, les conditions de vente, la politique de retour et les modalités de conservation/contact de la page confidentialité. Actuellement, la boutique indique clairement que les frais de livraison seront précisés lors de l'appel de confirmation, avant expédition. Renforcer l'antispam avec Cloudflare WAF/Turnstile selon le trafic. Les connexions administrateur sont limitées à 10 tentatives par IP sur 15 minutes ; les cookies sont HttpOnly, Secure et SameSite=Strict. Conserver des sauvegardes D1 et réserver l'accès au compte Cloudflare aux personnes autorisées.

## Validation

```sh
npm ci
# Si Chromium système n'est pas disponible :
npx playwright install --with-deps chromium
npm test
```

Le test Chromium utilise une **base isolée** sous `/tmp/pvc-e2e-state` et des identifiants de test sans rapport avec la production. Il vérifie le catalogue, une commande via le navigateur, sa présence dans l'administration, les changements de statut, les prix recalculés, le stock, les commandes concurrentes, les rejets non authentifiés, la protection d'origine, les coordonnées invalides et l'affichage mobile sans débordement. Il ne valide pas un déploiement distant. CI GitHub incluse.
