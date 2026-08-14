# Mise en ligne du Chalet de la Grève Blanche

Guide complet : sécurité, anti-spam, hébergement, référencement.
Compter **1 à 2 heures** pour tout faire la première fois.

---

## Ce que ça coûte

| Poste | Fournisseur | Coût |
|---|---|---|
| Hébergement du site | Cloudflare Pages | **0 €** — trafic illimité, HTTPS inclus |
| Fonction serveur (formulaires) | Cloudflare Pages Functions | **0 €** — 100 000 requêtes/jour incluses |
| Captcha | Cloudflare Turnstile | **0 €** |
| Base de données + comptes | Supabase (plan gratuit) | **0 €** — 500 Mo, 50 000 connexions/mois |
| Emails de notification | Resend (plan gratuit) | **0 €** — 3 000 emails/mois, 100/jour |
| Certificat HTTPS | Cloudflare | **0 €** |
| Référencement Google | Search Console + fiche Google Business | **0 €** |
| **Nom de domaine** | OVHcloud (`.fr`) | **≈ 6 € la 1re année, puis ≈ 9 € TTC/an** |

**Total : environ 9 € par an**, uniquement le nom de domaine.

### « Qu'apporte un domaine payant ? »

Techniquement, rien : le site fonctionne à l'identique sur l'adresse gratuite
`chalet-greve-blanche.pages.dev`. Ce que le domaine apporte est ailleurs.

- **La crédibilité.** Un vacancier qui s'apprête à virer 600 € d'arrhes regarde
  l'adresse. `chalet-greve-blanche.fr` rassure ; `xxx.pages.dev` ressemble à un
  brouillon.
- **Une adresse email professionnelle.** `contact@chalet-greve-blanche.fr` au lieu
  d'une adresse Gmail. Impossible sans domaine.
- **Le référencement.** Google indexe les sous-domaines gratuits, mais le `.fr`
  envoie un signal géographique fort pour des recherches comme « location
  Guilvinec ». Et un domaine que vous possédez capitalise dans le temps.
- **L'indépendance.** Si vous quittez Cloudflare un jour, vous emportez votre
  adresse. Avec un sous-domaine gratuit, vous repartez de zéro et perdez tout le
  référencement accumulé.

**Où l'acheter.** OVHcloud pour un `.fr` (≈ 4,99 € HT la première année, ≈ 7,79 € HT
au renouvellement). Cloudflare Registrar vend au prix coûtant et serait le plus
simple, mais ne propose pas l'extension `.fr` — pour un `.com`, comptez ≈ 10 $/an
chez eux. **Vérifiez toujours le prix de renouvellement**, pas celui de la première
année : c'est le piège classique, certains registrars affichent 1 € la première
année puis 25 € ensuite.

Suggestions de noms : `chalet-greve-blanche.fr`, `greveblanche-guilvinec.fr`,
`location-guilvinec.fr`. Court, sans tiret superflu, facile à dicter au téléphone.

---

## Étape 1 — Base de données Supabase (15 min)

### 1.1 Créer les tables et verrouiller les accès

1. Ouvrir [supabase.com](https://supabase.com) → votre projet → **SQL Editor** → **New query**
2. Coller **tout** le contenu de `supabase-setup.sql`, cliquer **Run**
3. Vérifier : Table Editor → les tables `bookings`, `booking_requests` et `reviews`
   doivent afficher le cadenas **RLS enabled**

Ce script fait le plus important : la **Row Level Security**. Concrètement, même si
quelqu'un récupère la clé publique du site (elle est visible dans le code source,
c'est normal), il ne peut que *lire* les dates du calendrier et les avis validés.
Toute écriture est refusée par le serveur Supabase lui-même.

### 1.2 Créer votre compte propriétaire

1. **Authentication** → **Users** → **Add user** → **Create new user**
2. Votre email + un mot de passe long (au moins 12 caractères, unique)
3. Cocher **Auto Confirm User**

C'est ce compte qui ouvre `admin.html`. Il n'y a plus aucun mot de passe écrit dans
le code du site.

### 1.3 Empêcher les inscriptions sauvages

**Authentication** → **Sign In / Providers** → désactiver **Allow new users to sign up**.
Sans ça, n'importe qui pourrait se créer un compte et donc modifier votre calendrier.
**Cette étape est indispensable.**

### 1.4 Récupérer les clés

**Project Settings** → **API keys** :

- la clé **publishable / anon** → déjà dans `config.js`, elle est publique
- la clé **service_role** → **SECRÈTE**. Elle contourne toutes les protections.
  Elle ne va que dans Cloudflare (étape 3), jamais dans un fichier du site.

### 1.5 Le piège du plan gratuit

Un projet Supabase gratuit est **mis en pause après 1 semaine sans aucune requête**.
Un site qui reçoit des visiteurs reste actif tout seul. En basse saison, connectez-vous
à votre espace propriétaire une fois par semaine — ça suffit à le réveiller.

---

## Étape 2 — Le captcha Turnstile (5 min)

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **Turnstile** → **Add widget**
2. Nom : `chalet`, Domaine : votre domaine (ajoutez aussi `localhost` pour vos tests)
3. Mode : **Managed** (Cloudflare décide seul s'il faut afficher une case à cocher —
   la plupart des visiteurs ne voient rien du tout)
4. Récupérer les deux clés :
   - **Site Key** → à coller dans `config.js`, ligne `turnstileSiteKey`
   - **Secret Key** → **SECRÈTE**, elle va dans Cloudflare (étape 3)

> Tant que vous n'avez pas fait ça, `config.js` contient la clé de test officielle
> `1x00000000000000000000AA`, qui valide tout le monde. **À remplacer avant la mise
> en ligne**, sinon le captcha ne protège rien.

---

## Étape 3 — Publier sur Cloudflare Pages (20 min)

### 3.1 Envoyer le site

Deux méthodes, au choix.

**Le plus simple — glisser-déposer :**
Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → **Upload assets**.
Déposez le dossier complet. À refaire à chaque modification.

**Le plus confortable — via GitHub :**
Créez un dépôt, poussez le dossier, puis **Connect to Git**. Chaque `git push`
republie le site automatiquement. Aucun réglage de build : laissez les champs
« Build command » et « Output directory » vides.

### 3.2 Configurer les secrets

**Settings** → **Variables and Secrets** → ajouter (type **Secret** pour les trois premiers) :

| Nom | Type | Valeur |
|---|---|---|
| `SUPABASE_SERVICE_KEY` | Secret | la clé service_role de Supabase |
| `TURNSTILE_SECRET` | Secret | la clé secrète Turnstile |
| `RESEND_API_KEY` | Secret | votre clé Resend (étape 4) |
| `SUPABASE_URL` | Variable | `https://etteorrykfeynhloekun.supabase.co` |
| `OWNER_EMAIL` | Variable | l'email où recevoir les demandes |
| `MAIL_FROM` | Variable | `Chalet <contact@votredomaine.fr>` |

Puis **redéployez** : les variables ne sont prises en compte qu'au déploiement suivant.

### 3.3 Brancher le domaine

**Custom domains** → **Set up a domain** → saisir votre domaine. Cloudflare affiche
deux serveurs DNS (`xxx.ns.cloudflare.com`). Chez OVH : **Domaine** → **Serveurs DNS**
→ remplacer par ceux de Cloudflare. Comptez de 1 à 24 h de propagation.

Le HTTPS s'active tout seul, sans rien faire ni payer.

### 3.4 Une protection en plus, gratuite

**Security** → **WAF** → **Rate limiting rules** → créer une règle :
si le chemin est `/api/submit`, limiter à **5 requêtes par minute et par IP**.
Un formulaire de contact légitime n'est jamais envoyé 5 fois par minute ; un robot, si.

---

## Étape 4 — Les emails de notification (10 min, facultatif)

Sans cette étape, les demandes arrivent quand même dans votre espace propriétaire —
vous n'êtes simplement pas prévenu par email.

1. Créer un compte sur [resend.com](https://resend.com) (gratuit)
2. **Domains** → **Add domain** → votre domaine → Resend affiche 3 enregistrements DNS
   (SPF, DKIM, DMARC) à ajouter dans Cloudflare → **DNS** → **Add record**
3. **API Keys** → **Create** → copier la clé dans Cloudflare (`RESEND_API_KEY`)

Ces enregistrements DNS ne sont pas une formalité : sans eux, vos emails partent
directement en spam.

---

## Étape 5 — Référencement (20 min)

### 5.1 Ce qui est déjà fait dans le code

- Titre et description optimisés pour « location Guilvinec » et « à 100 m de la plage »
- Données structurées **Schema.org LodgingBusiness** : adresse, coordonnées GPS,
  équipements, capacité. C'est ce qui permet à Google d'afficher une fiche enrichie.
- `sitemap.xml` et `robots.txt` (l'espace propriétaire est exclu de l'indexation)
- Balises Open Graph : un lien partagé sur Facebook ou WhatsApp affiche une belle
  vignette avec photo
- Images en chargement différé, texte alternatif sur chaque photo

**À faire avant de publier :** remplacer `chalet-greve-blanche.fr` par votre vrai
domaine dans `index.html` (7 occurrences), `config.js`, `robots.txt` et `sitemap.xml`.

### 5.2 Google Search Console

[search.google.com/search-console](https://search.google.com/search-console) →
ajouter votre domaine → validation par enregistrement DNS (Cloudflare → DNS → Add record).
Puis **Sitemaps** → soumettre `sitemap.xml`. Comptez quelques jours avant
l'apparition dans les résultats.

### 5.3 La fiche Google Business — le plus rentable

[business.google.com](https://business.google.com) → créer une fiche « Hébergement ».
C'est **gratuit** et c'est ce qui apporte le plus de visibilité en local : votre
chalet apparaît sur Google Maps et dans l'encadré à droite des résultats. Ajoutez
vos photos et le lien vers le site. Demandez à vos anciens locataires d'y laisser
un avis : c'est le premier critère de classement local.

### 5.4 Le poids des photos

Vos photos font environ 1 Mo chacune, pour 20 photos en galerie. Sur un téléphone
en 4G au camping, c'est lent — et Google pénalise les pages lentes. Passez-les dans
[squoosh.app](https://squoosh.app) (gratuit, dans le navigateur) : format **WebP**,
qualité 75, largeur 1600 px. Vous passerez de 1 Mo à environ 150 Ko par photo, sans
différence visible à l'œil.

### 5.5 Annuaires gratuits

Inscrivez le chalet sur Gîtes de France, Clévacances, l'office de tourisme du Pays
Bigouden, Abritel. Chaque lien vers votre site renforce sa position dans Google.

---

## Ce qui a changé côté sécurité

| Avant | Maintenant |
|---|---|
| Mot de passe admin écrit en clair dans `admin.js` | Supabase Auth : identité vérifiée par le serveur |
| N'importe qui pouvait insérer un avis depuis la console | Écriture impossible sans passer par la fonction serveur |
| Aucun captcha | Turnstile vérifié côté serveur + champ piège + contrôle du temps de saisie |
| Base ouverte en écriture | Row Level Security : lecture publique, écriture réservée au propriétaire |
| Aucun en-tête de sécurité | CSP, HSTS, anti-clickjacking, anti-sniffing (`_headers`) |
| Formulaire qui n'envoyait rien | Enregistré en base + email + visible dans l'admin |

Trois points de vigilance qui restent de votre côté :

1. **La clé service_role ne doit jamais figurer dans un fichier du site.** Elle
   contourne toutes les protections. Uniquement dans les secrets Cloudflare.
2. **Désactivez les inscriptions dans Supabase** (étape 1.3). C'est l'erreur la plus
   fréquente et la plus lourde de conséquences.
3. **Mot de passe long et unique** pour le compte propriétaire, et activez la
   double authentification sur vos comptes Cloudflare et Supabase.

---

## Vérifications après la mise en ligne

- [ ] `https://votredomaine.fr` s'ouvre en HTTPS, cadenas affiché
- [ ] Le calendrier affiche les dates saisies dans l'admin
- [ ] Un envoi de formulaire arrive dans l'espace propriétaire **et** par email
- [ ] `admin.html` refuse un mauvais mot de passe
- [ ] `https://votredomaine.fr/robots.txt` et `/sitemap.xml` répondent
- [ ] La page passe le test [PageSpeed Insights](https://pagespeed.web.dev)
- [ ] Les données structurées passent le [test des résultats enrichis](https://search.google.com/test/rich-results)
- [ ] Les en-têtes de sécurité obtiennent au moins un B sur [securityheaders.com](https://securityheaders.com)
