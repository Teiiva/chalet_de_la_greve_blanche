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
    // L'URL et la clé "publishable" sont publiques par conception.
    // Ce qui protège la base, c'est la RLS (voir supabase-setup.sql).
    supabaseUrl: 'https://uyxqrhybphjxemapsjhv.supabase.co/rest/v1/',
    supabaseKey: 'sb_publishable_YllIix4nvTZLG6Shv3-oFA_JabDisxD',

    // --- Cloudflare Turnstile (le captcha) ---
    // Clé de site publique, à récupérer sur dash.cloudflare.com > Turnstile.
    // Valeur ci-dessous = clé de TEST officielle Cloudflare : elle valide
    // toujours. À remplacer par la vraie avant la mise en ligne.
    turnstileSiteKey: '0x4AAAAAAEPtTMwsC1shQQ1E',

    // --- Adresse du site en ligne (sert au SEO et aux liens absolus) ---
    siteUrl: 'https://chalet-greve-blanche.fr'
};
