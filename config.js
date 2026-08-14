/* =====================================================================
   config.js — Réglages publics du site
   ---------------------------------------------------------------------
   Tout ce qui est ici est visible par les visiteurs : c'est normal.
   Aucune clé secrète ne doit figurer dans ce fichier.

   Les vrais secrets (clé service_role Supabase, clé secrète Turnstile,
   clé Resend) se configurent dans Cloudflare Pages > Settings >
   Variables and Secrets. Voir GUIDE-MISE-EN-LIGNE.md.
   ===================================================================== */

window.SITE_CONFIG = {

    // --- Supabase ---
    // ATTENTION : uniquement l'adresse du projet, SANS "/rest/v1/" à la fin.
    // La bibliothèque Supabase ajoute elle-même /rest/v1/ pour les données
    // et /auth/v1/ pour la connexion. Avec /rest/v1/ ici, la connexion à
    // l'espace propriétaire échoue systématiquement.
    supabaseUrl: 'https://uyxqrhybphjxemapsjhv.supabase.co',

    // Clé "publishable" : publique par conception.
    // Ce qui protège la base, c'est la RLS (voir supabase-setup.sql).
    supabaseKey: 'sb_publishable_YllIix4nvTZLG6Shv3-oFA_JabDisxD',

    // --- Cloudflare Turnstile (le captcha) ---
    // Clé de site publique. Le domaine du site doit figurer dans les
    // "Hostnames" du widget, sinon le captcha affiche une erreur.
    turnstileSiteKey: '0x4AAAAAAEPtTMwsC1shQQ1E',

    // --- Adresse du site en ligne (sert au SEO et aux liens absolus) ---
    siteUrl: 'https://chalet-greve-blanche.fr'
};
