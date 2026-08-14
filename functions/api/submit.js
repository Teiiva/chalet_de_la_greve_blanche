/* =====================================================================
   functions/api/submit.js — Fonction serveur Cloudflare Pages
   ---------------------------------------------------------------------
   Point d'entrée unique pour les deux formulaires publics :
   demande de réservation et avis du livre d'or.

   Elle fait ce qu'un navigateur ne peut pas faire de façon sûre :
     1. vérifier le captcha Turnstile auprès de Cloudflare (clé secrète)
     2. écrire dans Supabase avec la clé service_role (jamais exposée)
     3. envoyer l'email de notification au propriétaire

   Variables à définir dans Cloudflare Pages > Settings > Variables :
     SUPABASE_URL          (variable)
     SUPABASE_SERVICE_KEY  (SECRET — clé service_role de Supabase)
     TURNSTILE_SECRET      (SECRET — clé secrète du widget Turnstile)
     RESEND_API_KEY        (SECRET — facultatif, pour l'email)
     OWNER_EMAIL           (variable — où arrivent les notifications)
     MAIL_FROM             (variable — ex. "Chalet <site@votredomaine.fr>")
   ===================================================================== */

const LIMITES = {
    nom: 100,
    email: 150,
    telephone: 30,
    message: 2000,
    auteur: 80,
    avis: 1500
};

/* ---------- Utilitaires ---------- */

function reponse(statut, corps) {
    return new Response(JSON.stringify(corps), {
        status: statut,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store'
        }
    });
}

function texte(valeur, maxi) {
    if (typeof valeur !== 'string') return '';
    return valeur.trim().slice(0, maxi);
}

function emailValide(valeur) {
    return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(valeur);
}

function dateValide(valeur) {
    return /^\d{4}-\d{2}-\d{2}$/.test(valeur) && !isNaN(Date.parse(valeur));
}

function entier(valeur, mini, maxi) {
    const n = parseInt(valeur, 10);
    if (isNaN(n)) return null;
    return Math.min(Math.max(n, mini), maxi);
}

/* Empreinte non réversible de l'IP : permet de repérer un envoi en rafale
   sans conserver de donnée personnelle identifiante (RGPD). */
async function hachageIp(ip) {
    if (!ip) return null;
    const data = new TextEncoder().encode('chalet-' + ip);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).slice(0, 8)
        .map(b => b.toString(16).padStart(2, '0')).join('');
}

/* ---------- Vérification du captcha ---------- */

async function captchaValide(token, secret, ip) {
    if (!token || !secret) return false;

    const form = new FormData();
    form.append('secret', secret);
    form.append('response', token);
    if (ip) form.append('remoteip', ip);

    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body: form
    });

    const data = await r.json();
    if (!data.success) {
        console.log('Turnstile refusé :', JSON.stringify(data['error-codes'] || []));
    }
    return data.success === true;
}

/* ---------- Écriture Supabase (clé service_role) ---------- */

async function inserer(env, table, lignes) {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}`, {
        method: 'POST',
        headers: {
            'apikey': env.SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
        },
        body: JSON.stringify(lignes)
    });

    if (!r.ok) {
        const detail = await r.text();
        throw new Error(`Supabase ${r.status} : ${detail.slice(0, 200)}`);
    }
}

/* ---------- Email de notification (facultatif) ---------- */

async function notifier(env, sujet, corpsHtml, repondreA) {
    if (!env.RESEND_API_KEY || !env.OWNER_EMAIL) return;

    try {
        const r = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${env.RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: env.MAIL_FROM || 'Chalet de la Grève Blanche <onboarding@resend.dev>',
                to: [env.OWNER_EMAIL],
                subject: sujet,
                html: corpsHtml,
                reply_to: repondreA || undefined
            })
        });
        if (!r.ok) console.log('Resend :', r.status, (await r.text()).slice(0, 200));
    } catch (e) {
        // Un email qui ne part pas ne doit jamais faire échouer l'envoi :
        // la demande est déjà enregistrée en base.
        console.log('Resend indisponible :', e.message);
    }
}

function echapper(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
}

/* =====================================================================
   Point d'entrée
   ===================================================================== */

export async function onRequestPost(context) {
    const { request, env } = context;
    const ip = request.headers.get('CF-Connecting-IP');

    // -- Corps de la requête --
    let body;
    try {
        body = await request.json();
    } catch (e) {
        return reponse(400, { erreur: 'Requête invalide.' });
    }

    // -- Piège à robots : un champ invisible que seul un bot remplit --
    if (body.site_web) {
        // On répond "ok" pour ne pas renseigner le spammeur sur le piège.
        return reponse(200, { ok: true });
    }

    // -- Formulaire rempli trop vite = robot (moins de 2 secondes) --
    //    Seuil volontairement bas : un humain, même avec la saisie
    //    automatique du navigateur, met plus de 2 secondes.
    const duree = Number(body.duree_saisie);
    if (!isNaN(duree) && duree > 0 && duree < 2000) {
        return reponse(429, { erreur: 'Formulaire envoyé trop vite. Réessayez.' });
    }

    // -- Captcha --
    if (!await captchaValide(body.captcha, env.TURNSTILE_SECRET, ip)) {
        return reponse(403, { erreur: "Vérification anti-robot échouée. Rechargez la page et réessayez." });
    }

    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
        return reponse(500, { erreur: 'Serveur mal configuré (Supabase).' });
    }

    const empreinte = await hachageIp(ip);
    const navigateur = texte(request.headers.get('User-Agent'), 200);

    /* ---------------- Demande de réservation ---------------- */
    if (body.type === 'reservation') {
        const nom = texte(body.nom, LIMITES.nom);
        const email = texte(body.email, LIMITES.email);

        if (nom.length < 2) return reponse(400, { erreur: 'Merci d\'indiquer votre nom.' });
        if (!emailValide(email)) return reponse(400, { erreur: 'Adresse email invalide.' });

        const arrivee = dateValide(body.arrivee) ? body.arrivee : null;
        const depart = dateValide(body.depart) ? body.depart : null;
        if (arrivee && depart && depart <= arrivee) {
            return reponse(400, { erreur: 'La date de départ doit être après la date d\'arrivée.' });
        }

        const ligne = {
            nom: nom,
            email: email,
            telephone: texte(body.telephone, LIMITES.telephone),
            animal: texte(body.animal, 10),
            arrivee: arrivee,
            depart: depart,
            adultes: entier(body.adultes, 1, 8),
            enfants: entier(body.enfants, 0, 8),
            message: texte(body.message, LIMITES.message),
            ip_hash: empreinte,
            user_agent: navigateur
        };

        try {
            await inserer(env, 'booking_requests', [ligne]);
        } catch (e) {
            console.log(e.message);
            return reponse(500, { erreur: "Enregistrement impossible. Écrivez-nous directement par email." });
        }

        await notifier(
            env,
            `Demande de réservation — ${nom}`,
            `<h2>Nouvelle demande de réservation</h2>
             <p><strong>${echapper(nom)}</strong><br>
             Email : ${echapper(email)}<br>
             Téléphone : ${echapper(ligne.telephone) || '—'}</p>
             <p>Séjour : <strong>${echapper(arrivee) || '?'}</strong> → <strong>${echapper(depart) || '?'}</strong><br>
             ${ligne.adultes || '?'} adulte(s), ${ligne.enfants === null ? '?' : ligne.enfants} enfant(s)<br>
             Animal : ${echapper(ligne.animal) || 'non précisé'}</p>
             <p>Message :<br>${echapper(ligne.message).replace(/\n/g, '<br>') || '—'}</p>
             <hr><p style="color:#888;font-size:13px">Demande également consultable dans votre espace propriétaire.</p>`,
            email
        );

        return reponse(200, { ok: true });
    }

    /* ---------------- Avis du livre d'or ---------------- */
    if (body.type === 'avis') {
        const auteur = texte(body.auteur, LIMITES.auteur);
        const contenu = texte(body.contenu, LIMITES.avis);
        const note = entier(body.note, 1, 5) || 5;

        if (auteur.length < 2) return reponse(400, { erreur: 'Merci d\'indiquer votre nom.' });
        if (contenu.length < 10) return reponse(400, { erreur: 'Votre message est un peu court.' });

        // Filtre anti-spam simple : les liens sont le marqueur n°1
        if (/https?:\/\/|www\.|\[url|<a\s/i.test(contenu)) {
            return reponse(400, { erreur: 'Les liens ne sont pas acceptés dans les avis.' });
        }

        try {
            await inserer(env, 'reviews', [{
                author: auteur,
                content: contenu,
                rating: note,
                is_approved: false   // toujours modéré avant publication
            }]);
        } catch (e) {
            console.log(e.message);
            return reponse(500, { erreur: 'Envoi impossible pour le moment.' });
        }

        await notifier(
            env,
            `Nouvel avis à valider — ${auteur}`,
            `<h2>Nouvel avis en attente</h2>
             <p><strong>${echapper(auteur)}</strong> — ${note}/5</p>
             <p>${echapper(contenu).replace(/\n/g, '<br>')}</p>
             <hr><p style="color:#888;font-size:13px">À valider dans Supabase (table reviews, colonne is_approved).</p>`
        );

        return reponse(200, { ok: true });
    }

    return reponse(400, { erreur: 'Type de demande inconnu.' });
}

/* Seul onRequestPost est exporté : Cloudflare répond automatiquement
   405 Method Not Allowed pour GET, PUT, DELETE, etc. */
