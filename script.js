/* =====================================================================
   script.js — Le Chalet de la Grève Blanche (site public)
   ---------------------------------------------------------------------
   Aucune écriture directe en base depuis le navigateur : les deux
   formulaires passent par /api/submit, qui vérifie le captcha côté
   serveur avant d'enregistrer quoi que ce soit.
   ===================================================================== */

var CFG = window.SITE_CONFIG || {};

/* Client Supabase en lecture seule (avis validés + calendrier).
   La RLS de la base interdit toute écriture avec cette clé. */
var supabaseClient = (function () {
    if (typeof window.supabase === 'undefined' || !CFG.supabaseUrl) return null;
    try {
        return window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey);
    } catch (e) {
        console.warn('Supabase indisponible :', e.message);
        return null;
    }
})();

/* ---------------------------------------------------------------------
   Captcha Turnstile — rendu explicite, pour pouvoir en placer deux
   sur la page et les réinitialiser après chaque envoi.
   --------------------------------------------------------------------- */
var widgets = {};

window.onloadTurnstileCallback = function () {
    function rendre() {
        ['turnstileBooking', 'turnstileReview'].forEach(function (id) {
            var el = document.getElementById(id);
            if (!el || widgets[id] !== undefined) return;
            widgets[id] = window.turnstile.render('#' + id, {
                sitekey: CFG.turnstileSiteKey,
                language: 'fr',
                theme: 'light'
            });
        });
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', rendre);
    } else {
        rendre();
    }
};

function jetonCaptcha(id) {
    if (!window.turnstile || widgets[id] === undefined) return '';
    return window.turnstile.getResponse(widgets[id]) || '';
}

function reinitCaptcha(id) {
    if (window.turnstile && widgets[id] !== undefined) window.turnstile.reset(widgets[id]);
}

/* Envoi vers la fonction serveur */
async function envoyer(charge) {
    var r = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(charge)
    });
    var data = {};
    try { data = await r.json(); } catch (e) { /* réponse non JSON */ }
    if (!r.ok) throw new Error(data.erreur || 'Erreur ' + r.status);
    return data;
}


document.addEventListener('DOMContentLoaded', () => {

    var ouvertureFormulaire = Date.now();

    // --- 1. Gestion du Menu Mobile ---
    const burger = document.querySelector('.burger');
    const nav = document.querySelector('.nav-links');

    if (burger && nav) {
        const overlay = document.createElement('div');
        overlay.className = 'nav-overlay';
        document.body.appendChild(overlay);

        const ouvrirFermer = (ouvrir) => {
            nav.classList.toggle('nav-active', ouvrir);
            burger.classList.toggle('open', ouvrir);
            overlay.classList.toggle('active', ouvrir);
            document.body.classList.toggle('menu-open', ouvrir);
            burger.setAttribute('aria-expanded', ouvrir ? 'true' : 'false');
        };

        burger.addEventListener('click', () => {
            ouvrirFermer(!nav.classList.contains('nav-active'));
        });

        nav.querySelectorAll('a').forEach(lien => {
            lien.addEventListener('click', () => ouvrirFermer(false));
        });

        overlay.addEventListener('click', () => ouvrirFermer(false));

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') ouvrirFermer(false);
        });

        window.addEventListener('resize', () => {
            if (window.innerWidth > 768 && nav.classList.contains('nav-active')) {
                ouvrirFermer(false);
            }
        });
    }

    // --- 2. Galerie & Lightbox ---
    const galleryGrid = document.getElementById('gallery-grid');
    const lightbox = document.createElement('div');
    lightbox.id = 'lightbox';
    const lightboxImg = document.createElement('img');
    lightboxImg.alt = '';
    lightbox.appendChild(lightboxImg);
    document.body.appendChild(lightbox);

    if (galleryGrid) {
        for (let i = 1; i <= 20; i++) {
            const div = document.createElement('div');
            div.classList.add('gallery-item');
            const img = document.createElement('img');
            img.src = `./img/gallery-${i}.jpg`;
            img.alt = `Le Chalet de la Grève Blanche au Guilvinec — photo ${i}`;
            img.loading = "lazy";
            img.decoding = "async";
            img.onerror = () => { div.remove(); };
            div.appendChild(img);
            galleryGrid.appendChild(div);

            div.addEventListener('click', () => {
                lightboxImg.src = img.src;
                lightboxImg.alt = img.alt;
                lightbox.classList.add('active');
                document.body.classList.add('menu-open', 'lightbox-open');
            });
        }
    }

    const lightboxClose = document.createElement('button');
    lightboxClose.className = 'lightbox-close';
    lightboxClose.type = 'button';
    lightboxClose.setAttribute('aria-label', 'Fermer la photo');
    lightboxClose.innerHTML = '&times;';
    lightbox.appendChild(lightboxClose);

    function fermerLightbox() {
        lightbox.classList.remove('active');
        document.body.classList.remove('menu-open', 'lightbox-open');
    }

    lightbox.addEventListener('click', fermerLightbox);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') fermerLightbox();
    });

    // --- 3. Livre d'or : lecture des avis validés ---
    async function chargerAvis() {
        if (!supabaseClient) return;
        try {
            const { data: reviews, error } = await supabaseClient
                .from('reviews')
                .select('author, content, rating, created_at')
                .eq('is_approved', true)
                .order('created_at', { ascending: false })
                .limit(12);

            if (error) throw error;

            const container = document.querySelector('.reviews-container');
            if (container && reviews && reviews.length) {
                container.innerHTML = '';
                reviews.forEach(rev => {
                    const carte = document.createElement('div');
                    carte.className = 'review-card';

                    const etoiles = document.createElement('div');
                    etoiles.className = 'stars';
                    etoiles.textContent = '⭐'.repeat(Math.max(1, Math.min(5, rev.rating || 5)));

                    const texte = document.createElement('p');
                    texte.textContent = '« ' + rev.content + ' »';

                    const auteur = document.createElement('div');
                    auteur.className = 'author';
                    auteur.textContent = '— ' + rev.author;

                    carte.append(etoiles, texte, auteur);
                    container.appendChild(carte);
                });
            }
        } catch (err) {
            console.warn("Livre d'or indisponible :", err.message);
        }
    }
    chargerAvis();

    // --- 4. Formulaire d'avis (via la fonction serveur) ---
    const reviewForm = document.getElementById('reviewForm');
    const reviewMsg = document.getElementById('reviewMsg');

    if (reviewForm) {
        reviewForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const bouton = reviewForm.querySelector('button[type=submit]');
            const donnees = new FormData(reviewForm);

            const jeton = jetonCaptcha('turnstileReview');
            if (!jeton) {
                afficher(reviewMsg, "Merci de valider le contrôle anti-robot.", 'error');
                return;
            }

            bouton.disabled = true;
            bouton.textContent = 'Envoi…';

            try {
                await envoyer({
                    type: 'avis',
                    auteur: donnees.get('name'),
                    contenu: donnees.get('review'),
                    note: donnees.get('rating'),
                    captcha: jeton,
                    site_web: donnees.get('site_web'),
                    duree_saisie: Date.now() - ouvertureFormulaire
                });
                reviewForm.reset();
                afficher(reviewMsg, "Merci ! Votre avis sera publié après validation.", 'ok');
            } catch (err) {
                afficher(reviewMsg, err.message, 'error');
            } finally {
                reinitCaptcha('turnstileReview');
                bouton.disabled = false;
                bouton.textContent = 'Envoyer mon avis';
            }
        });
    }

    function afficher(el, texte, type) {
        if (!el) { alert(texte); return; }
        el.textContent = texte;
        el.className = 'form-msg ' + (type || '');
        el.style.display = 'block';
    }

    // --- 5. Calendrier des disponibilités ---
    const calendarGrid = document.getElementById('calendarGrid');
    let bookedDates = [];
    let cal = null;

    if (calendarGrid && window.Booking) {
        cal = new window.Booking.Calendar({
            grid: calendarGrid,
            label: document.getElementById('monthYear'),
            prevBtn: document.getElementById('prevMonth'),
            nextBtn: document.getElementById('nextMonth'),
            editable: false,
            monthsAhead: 24
        });

        // Affichage immédiat depuis le cache, puis mise à jour depuis la base
        bookedDates = window.Booking.loadFallback();
        cal.setBooked(bookedDates);

        window.Booking.fetchBookings(supabaseClient).then((dates) => {
            bookedDates = dates;
            cal.setBooked(bookedDates);
            verifierDates();
        });
    }

    // --- 6. Formulaire de réservation ---
    const bookingForm = document.getElementById('bookingForm');
    const arrivee = document.getElementById('dateArrivee');
    const depart = document.getElementById('dateDepart');
    const dateWarning = document.getElementById('dateWarning');
    const bookingMsg = document.getElementById('bookingMsg');

    function verifierDates() {
        if (!arrivee || !depart || !dateWarning || !window.Booking) return true;
        if (!arrivee.value || !depart.value) { dateWarning.style.display = 'none'; return true; }

        if (depart.value <= arrivee.value) {
            dateWarning.textContent = "La date de départ doit être après la date d'arrivée.";
            dateWarning.style.display = 'block';
            return false;
        }

        const veille = window.Booking.fromISO(depart.value);
        veille.setDate(veille.getDate() - 1);
        const nuits = window.Booking.range(arrivee.value, window.Booking.toISO(veille));
        const conflits = nuits.filter(d => bookedDates.indexOf(d) !== -1);

        if (conflits.length) {
            dateWarning.textContent = "Ces dates ne sont pas disponibles (" +
                window.Booking.formatLong(conflits[0]) + "). Consultez le calendrier ci-dessus.";
            dateWarning.style.display = 'block';
            return false;
        }

        dateWarning.style.display = 'none';
        return true;
    }

    if (arrivee && depart && window.Booking) {
        const aujourdhui = window.Booking.toISO(window.Booking.today());
        arrivee.min = aujourdhui;
        depart.min = aujourdhui;
        arrivee.addEventListener('change', () => {
            if (arrivee.value) depart.min = arrivee.value;
            verifierDates();
        });
        depart.addEventListener('change', verifierDates);
    }

    if (bookingForm) {
        bookingForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (!verifierDates()) {
                dateWarning.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }

            const jeton = jetonCaptcha('turnstileBooking');
            if (!jeton) {
                afficher(bookingMsg, "Merci de valider le contrôle anti-robot.", 'error');
                return;
            }

            const bouton = bookingForm.querySelector('button[type=submit]');
            const donnees = new FormData(bookingForm);
            bouton.disabled = true;
            bouton.textContent = 'Envoi en cours…';

            try {
                await envoyer({
                    type: 'reservation',
                    nom: donnees.get('nom'),
                    email: donnees.get('email'),
                    telephone: donnees.get('telephone'),
                    animal: donnees.get('animal'),
                    arrivee: donnees.get('arrivee'),
                    depart: donnees.get('depart'),
                    adultes: donnees.get('adultes'),
                    enfants: donnees.get('enfants'),
                    message: donnees.get('message'),
                    captcha: jeton,
                    site_web: donnees.get('site_web'),
                    duree_saisie: Date.now() - ouvertureFormulaire
                });
                bookingForm.reset();
                afficher(bookingMsg, "Demande envoyée ! Nous vous répondons sous 48 h.", 'ok');
            } catch (err) {
                afficher(bookingMsg, err.message + " — vous pouvez aussi nous écrire directement par email.", 'error');
            } finally {
                reinitCaptcha('turnstileBooking');
                bouton.disabled = false;
                bouton.textContent = 'Envoyer ma demande';
            }
        });
    }

    // --- 7. Carte : évite que le doigt soit capté par l'iframe ---
    const mapSection = document.querySelector('.map-section');
    if (mapSection) {
        mapSection.classList.add('map-locked');
        mapSection.addEventListener('click', () => mapSection.classList.remove('map-locked'));
    }

    // --- 8. Modal des équipements ---
    const openModalBtn = document.getElementById('openModal');
    const closeModalBtn = document.querySelector('.close-modal');
    const amenitiesModal = document.getElementById('amenitiesModal');

    if (openModalBtn && amenitiesModal && closeModalBtn) {
        openModalBtn.addEventListener('click', () => {
            amenitiesModal.style.display = 'flex';
            document.body.classList.add('menu-open');
        });

        const fermer = () => {
            amenitiesModal.style.display = 'none';
            document.body.classList.remove('menu-open');
        };

        closeModalBtn.addEventListener('click', fermer);
        window.addEventListener('click', (e) => { if (e.target === amenitiesModal) fermer(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fermer(); });
    }
});
