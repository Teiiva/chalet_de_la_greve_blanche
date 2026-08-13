// --- CONFIGURATION SUPABASE ---
// Utilisez une variable différente pour éviter le conflit
const supabaseClient = (() => {
    const supabaseUrl = 'https://etteorrykfeynhloekun.supabase.co';
    const supabaseKey = 'sb_publishable_KF_C-so3JjAgwOGWCD4a3Q_k6wJWlUH';
    
    // Vérifiez si supabase est disponible globalement
    if (typeof window.supabase !== 'undefined') {
        return window.supabase.createClient(supabaseUrl, supabaseKey);
    }
    return null;
})();

document.addEventListener('DOMContentLoaded', () => {
    
    // Supabase sert uniquement au livre d'or : s'il n'est pas disponible,
    // le reste du site (galerie, calendrier, modal) doit continuer à fonctionner.
    if (!supabaseClient) {
        console.warn('Supabase non initialisé — le livre d\'or est désactivé.');
    }

    // --- 1. Gestion du Menu Mobile ---
    const burger = document.querySelector('.burger');
    const nav = document.querySelector('.nav-links');

    if (burger && nav) {
        // Voile sombre derrière le menu ouvert
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

        // Le menu se referme après avoir choisi une destination
        nav.querySelectorAll('a').forEach(lien => {
            lien.addEventListener('click', () => ouvrirFermer(false));
        });

        overlay.addEventListener('click', () => ouvrirFermer(false));

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') ouvrirFermer(false);
        });

        // Si l'écran repasse en grand format, on remet tout à zéro
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

    if(galleryGrid) {
        for (let i = 1; i <= 20; i++) {
            const div = document.createElement('div');
            div.classList.add('gallery-item');
            const img = document.createElement('img');
            // Utilisez un chemin relatif correct
            img.src = `./img/gallery-${i}.jpg`; 
            img.alt = `Photo du chalet ${i}`;
            img.loading = "lazy";
            img.onerror = () => {
                console.log(`Image gallery-${i}.jpg non trouvée`);
                img.src = 'https://via.placeholder.com/250x250/195062/d6b98c?text=Photo+du+Chalet';
            };
            div.appendChild(img);
            galleryGrid.appendChild(div);

            div.addEventListener('click', () => {
                lightboxImg.src = img.src;
                lightboxImg.alt = img.alt;
                lightbox.classList.add('active');
                // Fige la page derrière la photo et masque la barre de nav
                document.body.classList.add('menu-open', 'lightbox-open');
            });
        }
    }

    // Bouton de fermeture visible (l'appui n'importe où fonctionne aussi)
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

    // --- 3. Fonction pour charger les avis ---
    async function chargerAvis() {
        if (!supabaseClient) return;
        try {
            const { data: reviews, error } = await supabaseClient
                .from('reviews')
                .select('*')
                .eq('is_approved', true);

            if (error) throw error;

            const container = document.querySelector('.reviews-container');
            if(container && reviews) {
                container.innerHTML = ''; 
                reviews.forEach(rev => {
                    container.innerHTML += `
                        <div class="review-card">
                            <div class="stars">${"⭐".repeat(rev.rating)}</div>
                            <p>"${rev.content}"</p>
                            <div class="author">- ${rev.author}</div>
                        </div>`;
                });
            }
        } catch (err) {
            console.error("Erreur chargement avis:", err.message);
        }
    }

    // Appeler le chargement après l'initialisation
    chargerAvis();

    // --- 4. Gestion du Formulaire d'Avis ---
    const reviewForm = document.getElementById('reviewForm');
    if(reviewForm && supabaseClient) {
        reviewForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(reviewForm);

            try {
                const { error } = await supabaseClient
                    .from('reviews')
                    .insert([{ 
                        author: formData.get('name'), 
                        content: formData.get('review'), 
                        rating: parseInt(formData.get('rating')), 
                        is_approved: false 
                    }]);

                if (error) throw error;
                alert("Merci ! Votre avis a été envoyé et est en attente de validation.");
                reviewForm.reset();
                // Recharger les avis après envoi
                chargerAvis();
            } catch (error) {
                console.error("Erreur envoi Supabase:", error.message);
                alert("Erreur : " + error.message);
            }
        });
    }

    // --- 5. Calendrier des disponibilités ---
    const calendarGrid = document.getElementById('calendarGrid');
    let bookedDates = [];

    if (calendarGrid && window.Booking) {
        bookedDates = window.Booking.load().booked;

        const cal = new window.Booking.Calendar({
            grid: calendarGrid,
            label: document.getElementById('monthYear'),
            prevBtn: document.getElementById('prevMonth'),
            nextBtn: document.getElementById('nextMonth'),
            editable: false,
            monthsAhead: 24
        });
        cal.setBooked(bookedDates);

        // Rafraîchit le calendrier si l'admin modifie les dates dans un autre onglet
        window.addEventListener('storage', (e) => {
            if (e.key === window.Booking.STORAGE_KEY) {
                bookedDates = window.Booking.load().booked;
                cal.setBooked(bookedDates);
            }
        });
    }

    // --- 5bis. Vérification des dates dans le formulaire de réservation ---
    const bookingForm = document.getElementById('bookingForm');
    const arrivee = document.getElementById('dateArrivee');
    const depart = document.getElementById('dateDepart');
    const dateWarning = document.getElementById('dateWarning');

    function verifierDates() {
        if (!arrivee || !depart || !dateWarning || !window.Booking) return true;
        if (!arrivee.value || !depart.value) { dateWarning.style.display = 'none'; return true; }

        if (depart.value <= arrivee.value) {
            dateWarning.textContent = "La date de départ doit être après la date d'arrivée.";
            dateWarning.style.display = 'block';
            return false;
        }

        // La nuit du départ n'est pas occupée : on teste jusqu'à la veille
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
        bookingForm.addEventListener('submit', (e) => {
            if (!verifierDates()) {
                e.preventDefault();
                dateWarning.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        });
    }

    // --- 5ter. Carte : on évite qu'un glissement de doigt soit capté par
    //           l'iframe au lieu de faire défiler la page ---
    const mapSection = document.querySelector('.map-section');
    if (mapSection) {
        mapSection.classList.add('map-locked');
        mapSection.addEventListener('click', () => {
            mapSection.classList.remove('map-locked');
        });
    }

    // --- 6. Gestion de la Modal des équipements ---
    const openModalBtn = document.getElementById('openModal');
    const closeModalBtn = document.querySelector('.close-modal');
    const amenitiesModal = document.getElementById('amenitiesModal');

    if (openModalBtn && amenitiesModal && closeModalBtn) {
        openModalBtn.addEventListener('click', () => {
            amenitiesModal.style.display = 'flex';
        });

        closeModalBtn.addEventListener('click', () => {
            amenitiesModal.style.display = 'none';
        });

        // Fermer la modal en cliquant en dehors
        window.addEventListener('click', (e) => {
            if (e.target === amenitiesModal) {
                amenitiesModal.style.display = 'none';
            }
        });
    }
});