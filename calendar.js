/* =====================================================================
   calendar.js — Logique partagée du calendrier de réservation
   Utilisé par le site public (script.js) et par l'espace admin (admin.js)
   ===================================================================== */

window.Booking = (function () {
    'use strict';

    var STORAGE_KEY = 'chalet_bookings_v1';

    var MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
                  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    var WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

    /* ---------- Utilitaires de dates ---------- */

    function pad(n) { return n < 10 ? '0' + n : '' + n; }

    function toISO(d) {
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }

    function fromISO(s) {
        var p = String(s).split('-');
        return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    }

    function today() {
        var d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
    }

    function formatLong(iso) {
        var d = fromISO(iso);
        return d.getDate() + ' ' + MONTHS[d.getMonth()].toLowerCase() + ' ' + d.getFullYear();
    }

    /* Renvoie toutes les dates ISO entre deux dates incluses */
    function range(startISO, endISO) {
        var out = [];
        var cur = fromISO(startISO);
        var end = fromISO(endISO);
        if (end < cur) { var tmp = cur; cur = end; end = tmp; }
        while (cur <= end) {
            out.push(toISO(cur));
            cur.setDate(cur.getDate() + 1);
        }
        return out;
    }

    /* Regroupe une liste de dates ISO en périodes contiguës
       -> [{ start: '2026-08-17', end: '2026-08-20', nights: 4 }, ...] */
    function groupPeriods(dates) {
        var sorted = dates.slice().sort();
        var periods = [];
        var i;
        for (i = 0; i < sorted.length; i++) {
            var last = periods[periods.length - 1];
            if (last) {
                var next = fromISO(last.end);
                next.setDate(next.getDate() + 1);
                if (toISO(next) === sorted[i]) {
                    last.end = sorted[i];
                    last.nights++;
                    continue;
                }
            }
            periods.push({ start: sorted[i], end: sorted[i], nights: 1 });
        }
        return periods;
    }

    /* ---------- Stockage ---------- */

    function readFile() {
        var d = window.BOOKINGS_DATA || {};
        return {
            booked: (d.booked || []).slice(),
            updatedAt: d.updatedAt || '1970-01-01T00:00:00.000Z'
        };
    }

    function readLocal() {
        try {
            var raw = window.localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            var o = JSON.parse(raw);
            if (!o || !Array.isArray(o.booked)) return null;
            return o;
        } catch (e) {
            return null;
        }
    }

    /* Secours hors ligne : le fichier publié, ou le dernier cache local.
       Sert uniquement si Supabase est injoignable. */
    function loadFallback() {
        var f = readFile();
        var l = readLocal();
        if (l && new Date(l.updatedAt) > new Date(f.updatedAt)) return l.booked;
        return f.booked;
    }

    function cacheLocal(booked) {
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
                booked: booked.slice().sort(),
                updatedAt: new Date().toISOString()
            }));
        } catch (e) { /* navigation privée : sans importance */ }
    }

    /* ---------- Source de vérité : Supabase ---------- */

    /* Lecture publique des nuits réservées (RLS : select autorisé à tous).
       En cas d'échec réseau, on retombe sur le cache local. */
    async function fetchBookings(client) {
        if (!client) return loadFallback();
        try {
            var res = await client
                .from('bookings')
                .select('date')
                .order('date', { ascending: true });

            if (res.error) throw res.error;

            var dates = (res.data || []).map(function (r) { return r.date; });
            cacheLocal(dates);
            return dates;
        } catch (e) {
            console.warn('Calendrier : lecture Supabase impossible, affichage du cache.', e.message || e);
            return loadFallback();
        }
    }

    /* Écriture réservée au propriétaire connecté (RLS : rôle authenticated) */
    async function addDates(client, dates) {
        if (!dates.length) return;
        var rows = dates.map(function (d) { return { date: d }; });
        var res = await client.from('bookings').upsert(rows, { onConflict: 'date' });
        if (res.error) throw res.error;
    }

    async function removeDates(client, dates) {
        if (!dates.length) return;
        var res = await client.from('bookings').delete().in('date', dates);
        if (res.error) throw res.error;
    }

    /* ---------- Rendu du calendrier ---------- */

    /**
     * config = {
     *   grid:      élément .calendar-grid
     *   label:     élément affichant "Août 2026"
     *   prevBtn / nextBtn : boutons de navigation
     *   editable:  true = les jours sont cliquables (admin)
     *   onDayClick(iso, isBooked) : callback en mode editable
     *   monthsAhead : nombre de mois navigables vers le futur (défaut 24)
     * }
     */
    function Calendar(config) {
        this.grid = config.grid;
        this.label = config.label;
        this.prevBtn = config.prevBtn || null;
        this.nextBtn = config.nextBtn || null;
        this.editable = !!config.editable;
        this.onDayClick = config.onDayClick || function () {};
        this.monthsAhead = config.monthsAhead || 24;

        this.booked = {};
        this.selection = {};

        var t = today();
        this.minMonth = new Date(t.getFullYear(), t.getMonth(), 1);
        this.maxMonth = new Date(t.getFullYear(), t.getMonth() + this.monthsAhead, 1);
        this.view = new Date(t.getFullYear(), t.getMonth(), 1);

        var self = this;
        if (this.prevBtn) {
            this.prevBtn.addEventListener('click', function () { self.shift(-1); });
        }
        if (this.nextBtn) {
            this.nextBtn.addEventListener('click', function () { self.shift(1); });
        }
        if (this.editable) {
            this.grid.addEventListener('click', function (e) {
                var cell = e.target.closest('.day');
                if (!cell || cell.classList.contains('past') || !cell.dataset.date) return;
                self.onDayClick(cell.dataset.date, self.booked[cell.dataset.date] === true);
            });
        }
    }

    Calendar.prototype.setBooked = function (list) {
        this.booked = {};
        var i;
        for (i = 0; i < list.length; i++) this.booked[list[i]] = true;
        this.render();
    };

    Calendar.prototype.setSelection = function (list) {
        this.selection = {};
        var i;
        for (i = 0; i < (list || []).length; i++) this.selection[list[i]] = true;
        this.render();
    };

    Calendar.prototype.shift = function (delta) {
        var next = new Date(this.view.getFullYear(), this.view.getMonth() + delta, 1);
        if (next < this.minMonth || next > this.maxMonth) return;
        this.view = next;
        this.render();
    };

    Calendar.prototype.render = function () {
        var year = this.view.getFullYear();
        var month = this.view.getMonth();
        var t = today();
        var todayISO = toISO(t);

        if (this.label) {
            this.label.textContent = MONTHS[month] + ' ' + year;
        }

        if (this.prevBtn) {
            var canPrev = new Date(year, month - 1, 1) >= this.minMonth;
            this.prevBtn.disabled = !canPrev;
            this.prevBtn.classList.toggle('disabled', !canPrev);
        }
        if (this.nextBtn) {
            var canNext = new Date(year, month + 1, 1) <= this.maxMonth;
            this.nextBtn.disabled = !canNext;
            this.nextBtn.classList.toggle('disabled', !canNext);
        }

        var html = '';
        var i;

        for (i = 0; i < WEEKDAYS.length; i++) {
            html += '<div class="day-name">' + WEEKDAYS[i] + '</div>';
        }

        /* getDay() : 0 = dimanche → on décale pour commencer le lundi */
        var firstDay = new Date(year, month, 1).getDay();
        var offset = (firstDay + 6) % 7;
        for (i = 0; i < offset; i++) {
            html += '<div class="day empty"></div>';
        }

        var daysInMonth = new Date(year, month + 1, 0).getDate();
        for (i = 1; i <= daysInMonth; i++) {
            var date = new Date(year, month, i);
            var iso = toISO(date);
            var classes = ['day'];

            if (date < t) {
                classes.push('past');
            } else if (this.booked[iso]) {
                classes.push('booked');
            } else {
                classes.push('available');
            }
            if (this.selection[iso]) classes.push('selected');
            if (iso === todayISO) classes.push('is-today');
            if (this.editable && date >= t) classes.push('clickable');

            var title = this.booked[iso] ? 'Réservé' : (date < t ? '' : 'Libre');
            html += '<div class="' + classes.join(' ') + '" data-date="' + iso + '"' +
                    (title ? ' title="' + formatLong(iso) + ' — ' + title + '"' : '') +
                    '>' + i + '</div>';
        }

        this.grid.innerHTML = html;
    };

    Calendar.prototype.goTo = function (iso) {
        var d = fromISO(iso);
        var target = new Date(d.getFullYear(), d.getMonth(), 1);
        if (target < this.minMonth) target = this.minMonth;
        if (target > this.maxMonth) target = this.maxMonth;
        this.view = target;
        this.render();
    };

    return {
        STORAGE_KEY: STORAGE_KEY,
        MONTHS: MONTHS,
        toISO: toISO,
        fromISO: fromISO,
        today: today,
        formatLong: formatLong,
        range: range,
        groupPeriods: groupPeriods,
        loadFallback: loadFallback,
        fetchBookings: fetchBookings,
        addDates: addDates,
        removeDates: removeDates,
        Calendar: Calendar
    };
})();
