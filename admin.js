/* =====================================================================
   admin.js — Espace propriétaire
   ---------------------------------------------------------------------
   Authentification réelle par Supabase Auth (email + mot de passe).
   Il n'y a plus aucun mot de passe dans ce fichier : c'est le serveur
   Supabase qui vérifie l'identité, et la RLS de la base qui refuse
   toute écriture à un visiteur non connecté. Même en trafiquant ce
   fichier depuis son navigateur, personne ne peut modifier le calendrier.
   ===================================================================== */

document.addEventListener('DOMContentLoaded', function () {
    'use strict';

    var cfg = window.SITE_CONFIG || {};
    var B = window.Booking;

    var client = (typeof window.supabase !== 'undefined')
        ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey)
        : null;

    var loginScreen = document.getElementById('loginScreen');
    var loginForm = document.getElementById('loginForm');
    var emailInput = document.getElementById('emailInput');
    var passwordInput = document.getElementById('passwordInput');
    var loginError = document.getElementById('loginError');
    var adminApp = document.getElementById('adminApp');
    var demarre = false;

    if (!client) {
        loginError.textContent = "Connexion à Supabase impossible. Vérifiez votre accès internet.";
        return;
    }

    /* ---------- Connexion ---------- */

    function ouvrirAdmin(session) {
        loginScreen.style.display = 'none';
        adminApp.hidden = false;
        var badge = document.getElementById('userEmail');
        if (badge && session && session.user) badge.textContent = session.user.email;
        if (!demarre) { demarre = true; demarrer(); }
    }

    // Session déjà active ? (Supabase la conserve dans le navigateur)
    client.auth.getSession().then(function (res) {
        if (res.data && res.data.session) ouvrirAdmin(res.data.session);
    });

    loginForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        loginError.textContent = '';
        var bouton = loginForm.querySelector('button[type=submit]');
        bouton.disabled = true;
        bouton.textContent = 'Connexion…';

        var res = await client.auth.signInWithPassword({
            email: emailInput.value.trim(),
            password: passwordInput.value
        });

        bouton.disabled = false;
        bouton.textContent = 'Se connecter';

        if (res.error) {
            var brut = res.error.message || '';
            console.error('Échec de connexion Supabase :', res.error);

            // On reste vague sur les identifiants (ne jamais indiquer si
            // c'est l'email ou le mot de passe qui est faux), mais on
            // nomme les problèmes de configuration : sinon impossible
            // de comprendre pourquoi rien ne marche.
            if (/email not confirmed/i.test(brut)) {
                loginError.textContent = "Ce compte n'a pas été confirmé. Dans Supabase : Authentication → Users → votre compte → Confirm email.";
            } else if (/failed to fetch|networkerror|load failed/i.test(brut)) {
                loginError.textContent = "Serveur injoignable. Vérifiez supabaseUrl dans config.js : ce doit être https://xxxx.supabase.co, sans /rest/v1/ à la fin.";
            } else if (/invalid api key|jwt|apikey/i.test(brut)) {
                loginError.textContent = "Clé Supabase invalide (supabaseKey dans config.js).";
            } else if (/invalid login credentials/i.test(brut)) {
                loginError.textContent = 'Identifiants incorrects.';
            } else {
                loginError.textContent = 'Connexion impossible : ' + brut;
            }

            passwordInput.value = '';
            passwordInput.focus();
            return;
        }
        ouvrirAdmin(res.data.session);
    });

    document.getElementById('logoutBtn').addEventListener('click', async function () {
        await client.auth.signOut();
        window.location.reload();
    });

    /* ---------- Application ---------- */

    function demarrer() {
        var booked = [];

        var periodList = document.getElementById('periodList');
        var periodCount = document.getElementById('periodCount');
        var etat = document.getElementById('publishState');
        var rangeStart = document.getElementById('rangeStart');
        var rangeEnd = document.getElementById('rangeEnd');
        var rangeMsg = document.getElementById('rangeMsg');
        var demandeList = document.getElementById('requestList');
        var demandeCount = document.getElementById('requestCount');

        var aujourdhui = B.toISO(B.today());

        var cal = new B.Calendar({
            grid: document.getElementById('calendarGrid'),
            label: document.getElementById('monthYear'),
            prevBtn: document.getElementById('prevMonth'),
            nextBtn: document.getElementById('nextMonth'),
            editable: true,
            monthsAhead: 24,
            onDayClick: function (iso, estReserve) {
                basculer(iso, estReserve);
            }
        });

        rangeStart.min = aujourdhui;
        rangeEnd.min = aujourdhui;

        function statut(message, type) {
            etat.textContent = message;
            etat.className = 'admin-msg ' + (type || '');
        }

        function message(texte, type) {
            rangeMsg.textContent = texte;
            rangeMsg.className = 'admin-msg ' + (type || '');
        }

        /* --- Lecture --- */
        async function recharger() {
            statut('Chargement…');
            booked = await B.fetchBookings(client);
            cal.setBooked(booked);
            afficherPeriodes();
            statut('Calendrier à jour.', 'ok');
        }

        /* --- Écriture : une action = un aller-retour vers la base --- */
        async function basculer(iso, estReserve) {
            try {
                statut('Enregistrement…');
                if (estReserve) {
                    await B.removeDates(client, [iso]);
                    booked = booked.filter(function (d) { return d !== iso; });
                } else {
                    await B.addDates(client, [iso]);
                    booked = booked.concat([iso]);
                }
                cal.setBooked(booked);
                afficherPeriodes();
                statut(B.formatLong(iso) + (estReserve ? ' : libérée.' : ' : réservée.'), 'ok');
            } catch (e) {
                statut('Échec : ' + (e.message || e), 'error');
                recharger();
            }
        }

        function afficherPeriodes() {
            var futur = booked.filter(function (d) { return d >= aujourdhui; });
            var periodes = B.groupPeriods(futur);
            periodCount.textContent = periodes.length;

            if (!periodes.length) {
                periodList.innerHTML = '<p class="admin-empty">Aucune période réservée à venir.</p>';
                return;
            }

            periodList.innerHTML = periodes.map(function (p) {
                var libelle = p.start === p.end
                    ? B.formatLong(p.start)
                    : 'Du ' + B.formatLong(p.start) + '<br>au ' + B.formatLong(p.end);
                return '<div class="period-item">' +
                        '<div class="period-dates">' + libelle +
                            '<span class="period-nights">' + p.nights + ' nuit' + (p.nights > 1 ? 's' : '') + '</span>' +
                        '</div>' +
                        '<div class="period-buttons">' +
                            '<button type="button" class="icon-btn" data-goto="' + p.start + '" title="Voir dans le calendrier"><i class="fas fa-calendar-day"></i></button>' +
                            '<button type="button" class="icon-btn danger" data-del-start="' + p.start + '" data-del-end="' + p.end + '" title="Libérer cette période"><i class="fas fa-trash"></i></button>' +
                        '</div>' +
                    '</div>';
            }).join('');
        }

        periodList.addEventListener('click', async function (e) {
            var voir = e.target.closest('[data-goto]');
            if (voir) { cal.goTo(voir.dataset.goto); return; }

            var suppr = e.target.closest('[data-del-start]');
            if (!suppr) return;

            var dates = B.range(suppr.dataset.delStart, suppr.dataset.delEnd);
            try {
                statut('Suppression…');
                await B.removeDates(client, dates);
                booked = booked.filter(function (d) { return dates.indexOf(d) === -1; });
                cal.setBooked(booked);
                afficherPeriodes();
                statut('Période libérée.', 'ok');
            } catch (err) {
                statut('Échec : ' + (err.message || err), 'error');
            }
        });

        /* --- Blocage / libération par période --- */

        function lirePeriode() {
            if (!rangeStart.value || !rangeEnd.value) {
                message('Renseignez les deux dates.', 'error');
                return null;
            }
            if (rangeEnd.value < rangeStart.value) {
                message('La date de fin doit être après la date de début.', 'error');
                return null;
            }
            var dates = B.range(rangeStart.value, rangeEnd.value);
            if (dates.length > 400) {
                message('Période trop longue (400 nuits maximum).', 'error');
                return null;
            }
            return dates;
        }

        document.getElementById('blockRange').addEventListener('click', async function () {
            var dates = lirePeriode();
            if (!dates) return;
            try {
                await B.addDates(client, dates);
                booked = booked.concat(dates).filter(function (d, i, a) { return a.indexOf(d) === i; });
                cal.setBooked(booked);
                cal.goTo(dates[0]);
                afficherPeriodes();
                message(dates.length + ' nuit(s) marquée(s) comme réservée(s).', 'ok');
            } catch (e) {
                message('Échec : ' + (e.message || e), 'error');
            }
        });

        document.getElementById('freeRange').addEventListener('click', async function () {
            var dates = lirePeriode();
            if (!dates) return;
            try {
                var avant = booked.length;
                await B.removeDates(client, dates);
                booked = booked.filter(function (d) { return dates.indexOf(d) === -1; });
                cal.setBooked(booked);
                cal.goTo(dates[0]);
                afficherPeriodes();
                message((avant - booked.length) + ' nuit(s) libérée(s).', 'ok');
            } catch (e) {
                message('Échec : ' + (e.message || e), 'error');
            }
        });

        document.getElementById('refreshBtn').addEventListener('click', recharger);

        /* --- Demandes de réservation --- */

        async function chargerDemandes() {
            if (!demandeList) return;
            var res = await client
                .from('booking_requests')
                .select('*')
                .neq('statut', 'archive')
                .order('created_at', { ascending: false })
                .limit(50);

            if (res.error) {
                demandeList.innerHTML = '<p class="admin-empty">Lecture impossible : ' + res.error.message + '</p>';
                return;
            }

            var demandes = res.data || [];
            demandeCount.textContent = demandes.filter(function (d) { return d.statut === 'nouveau'; }).length;

            if (!demandes.length) {
                demandeList.innerHTML = '<p class="admin-empty">Aucune demande pour le moment.</p>';
                return;
            }

            demandeList.innerHTML = demandes.map(function (d) {
                var sejour = (d.arrivee && d.depart)
                    ? B.formatLong(d.arrivee) + ' → ' + B.formatLong(d.depart)
                    : 'Dates non précisées';
                return '<div class="request-item' + (d.statut === 'nouveau' ? ' is-new' : '') + '">' +
                    '<div class="request-head">' +
                        '<strong>' + echapper(d.nom) + '</strong>' +
                        (d.statut === 'nouveau' ? '<span class="tag">nouveau</span>' : '') +
                    '</div>' +
                    '<div class="request-meta">' + sejour +
                        ' · ' + (d.adultes || '?') + ' adulte(s)' +
                        (d.enfants ? ', ' + d.enfants + ' enfant(s)' : '') +
                        (d.animal ? ' · animal : ' + echapper(d.animal) : '') +
                    '</div>' +
                    '<div class="request-contact">' +
                        '<a href="mailto:' + echapper(d.email) + '">' + echapper(d.email) + '</a>' +
                        (d.telephone ? ' · <a href="tel:' + echapper(d.telephone) + '">' + echapper(d.telephone) + '</a>' : '') +
                    '</div>' +
                    (d.message ? '<p class="request-message">' + echapper(d.message) + '</p>' : '') +
                    '<div class="request-actions">' +
                        (d.statut === 'nouveau'
                            ? '<button type="button" class="btn-ghost" data-traite="' + d.id + '">Marquer traitée</button>'
                            : '') +
                        '<button type="button" class="btn-ghost danger" data-archive="' + d.id + '">Archiver</button>' +
                    '</div>' +
                '</div>';
            }).join('');
        }

        if (demandeList) {
            demandeList.addEventListener('click', async function (e) {
                var traite = e.target.closest('[data-traite]');
                var archive = e.target.closest('[data-archive]');
                var cible = traite || archive;
                if (!cible) return;

                var id = traite ? traite.dataset.traite : archive.dataset.archive;
                var nouveauStatut = traite ? 'traite' : 'archive';
                cible.disabled = true;

                var res = await client.from('booking_requests')
                    .update({ statut: nouveauStatut }).eq('id', id);

                if (res.error) { cible.disabled = false; alert('Échec : ' + res.error.message); return; }
                chargerDemandes();
            });
        }

        function echapper(s) {
            return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
                return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
            });
        }

        recharger();
        chargerDemandes();
    }
});
