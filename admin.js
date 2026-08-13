/* =====================================================================
   admin.js — Espace propriétaire : gestion des dates réservées
   ---------------------------------------------------------------------
   ATTENTION : la protection par mot de passe est côté navigateur.
   Elle empêche un visiteur curieux d'utiliser la page, mais quelqu'un
   qui lit le code source peut retrouver le mot de passe.
   Pour une vraie sécurité, il faudra passer par Supabase Auth (V2).
   ===================================================================== */

var ADMIN_PASSWORD = 'greveblanche2026';   // <-- à changer

document.addEventListener('DOMContentLoaded', function () {
    'use strict';

    var SESSION_KEY = 'chalet_admin_session';

    var loginScreen = document.getElementById('loginScreen');
    var loginForm = document.getElementById('loginForm');
    var passwordInput = document.getElementById('passwordInput');
    var loginError = document.getElementById('loginError');
    var adminApp = document.getElementById('adminApp');

    /* ---------- Connexion ---------- */

    function ouvrirAdmin() {
        loginScreen.style.display = 'none';
        adminApp.hidden = false;
        demarrer();
    }

    if (sessionStorage.getItem(SESSION_KEY) === 'ok') {
        ouvrirAdmin();
    }

    loginForm.addEventListener('submit', function (e) {
        e.preventDefault();
        if (passwordInput.value === ADMIN_PASSWORD) {
            sessionStorage.setItem(SESSION_KEY, 'ok');
            loginError.textContent = '';
            ouvrirAdmin();
        } else {
            loginError.textContent = 'Mot de passe incorrect.';
            passwordInput.value = '';
            passwordInput.focus();
        }
    });

    document.getElementById('logoutBtn').addEventListener('click', function () {
        sessionStorage.removeItem(SESSION_KEY);
        window.location.reload();
    });

    /* ---------- Application ---------- */

    function demarrer() {
        var B = window.Booking;
        var booked = B.load().booked.slice();

        var periodList = document.getElementById('periodList');
        var periodCount = document.getElementById('periodCount');
        var publishState = document.getElementById('publishState');
        var rangeStart = document.getElementById('rangeStart');
        var rangeEnd = document.getElementById('rangeEnd');
        var rangeMsg = document.getElementById('rangeMsg');

        // Des modifications locales plus récentes que le fichier publié = non publiées
        var dirty = (function () {
            try {
                var local = JSON.parse(localStorage.getItem(B.STORAGE_KEY) || 'null');
                var fichier = window.BOOKINGS_DATA || {};
                return !!(local && new Date(local.updatedAt) > new Date(fichier.updatedAt || 0));
            } catch (e) { return false; }
        })();

        var cal = new B.Calendar({
            grid: document.getElementById('calendarGrid'),
            label: document.getElementById('monthYear'),
            prevBtn: document.getElementById('prevMonth'),
            nextBtn: document.getElementById('nextMonth'),
            editable: true,
            monthsAhead: 24,
            onDayClick: function (iso, estReserve) {
                if (estReserve) {
                    booked = booked.filter(function (d) { return d !== iso; });
                } else {
                    booked.push(iso);
                }
                enregistrer();
            }
        });

        var aujourdhui = B.toISO(B.today());
        rangeStart.min = aujourdhui;
        rangeEnd.min = aujourdhui;

        function enregistrer() {
            booked = booked.filter(function (d, i, a) { return a.indexOf(d) === i; }).sort();
            B.save(booked);
            dirty = true;
            rafraichir();
        }

        function rafraichir() {
            cal.setBooked(booked);
            afficherPeriodes();
            publishState.className = 'admin-msg ' + (dirty ? 'warn' : '');
            publishState.textContent = dirty
                ? "Modifications enregistrées localement — pensez à télécharger le fichier pour les mettre en ligne."
                : '';
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
                var texte = p.start === p.end
                    ? B.formatLong(p.start)
                    : 'Du ' + B.formatLong(p.start) + '<br>au ' + B.formatLong(p.end);
                return '<div class="period-item">' +
                        '<div class="period-dates">' + texte +
                            '<span class="period-nights">' + p.nights + ' nuit' + (p.nights > 1 ? 's' : '') + '</span>' +
                        '</div>' +
                        '<div class="period-buttons">' +
                            '<button type="button" class="icon-btn" data-goto="' + p.start + '" title="Voir dans le calendrier"><i class="fas fa-calendar-day"></i></button>' +
                            '<button type="button" class="icon-btn danger" data-del-start="' + p.start + '" data-del-end="' + p.end + '" title="Libérer cette période"><i class="fas fa-trash"></i></button>' +
                        '</div>' +
                    '</div>';
            }).join('');
        }

        periodList.addEventListener('click', function (e) {
            var voir = e.target.closest('[data-goto]');
            if (voir) { cal.goTo(voir.dataset.goto); return; }

            var suppr = e.target.closest('[data-del-start]');
            if (suppr) {
                var dates = B.range(suppr.dataset.delStart, suppr.dataset.delEnd);
                booked = booked.filter(function (d) { return dates.indexOf(d) === -1; });
                enregistrer();
            }
        });

        /* ---------- Blocage / libération par période ---------- */

        function lirePeriode() {
            if (!rangeStart.value || !rangeEnd.value) {
                message("Renseignez les deux dates.", true);
                return null;
            }
            if (rangeEnd.value < rangeStart.value) {
                message("La date de fin doit être après la date de début.", true);
                return null;
            }
            return B.range(rangeStart.value, rangeEnd.value);
        }

        function message(texte, erreur) {
            rangeMsg.textContent = texte;
            rangeMsg.className = 'admin-msg ' + (erreur ? 'error' : 'ok');
        }

        document.getElementById('blockRange').addEventListener('click', function () {
            var dates = lirePeriode();
            if (!dates) return;
            booked = booked.concat(dates);
            enregistrer();
            cal.goTo(dates[0]);
            message(dates.length + ' jour' + (dates.length > 1 ? 's' : '') + ' marqué' + (dates.length > 1 ? 's' : '') + ' comme réservé' + (dates.length > 1 ? 's' : '') + '.', false);
        });

        document.getElementById('freeRange').addEventListener('click', function () {
            var dates = lirePeriode();
            if (!dates) return;
            var avant = booked.length;
            booked = booked.filter(function (d) { return dates.indexOf(d) === -1; });
            enregistrer();
            cal.goTo(dates[0]);
            message((avant - booked.length) + ' jour(s) libéré(s).', false);
        });

        /* ---------- Publication ---------- */

        document.getElementById('downloadBtn').addEventListener('click', function () {
            var contenu = B.toFileContent(booked);
            var blob = new Blob([contenu], { type: 'application/javascript;charset=utf-8' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'bookings-data.js';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(function () { URL.revokeObjectURL(url); }, 1000);

            dirty = false;
            publishState.className = 'admin-msg ok';
            publishState.textContent = "Fichier téléchargé. Remplacez bookings-data.js sur le site pour publier.";
        });

        document.getElementById('resetBtn').addEventListener('click', function () {
            if (!window.confirm("Annuler toutes les modifications locales et revenir au fichier bookings-data.js publié ?")) return;
            B.clearLocal();
            booked = (window.BOOKINGS_DATA && window.BOOKINGS_DATA.booked ? window.BOOKINGS_DATA.booked : []).slice();
            dirty = false;
            rafraichir();
        });

        rafraichir();
    }
});
