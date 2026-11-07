/* =========================================================
   RUDIMENTARY PATHOLOGY
   search.js — "Search this page" box with autocomplete.

   Adds a search box above the tabs on any page that has
   collapsible sections. Typing shows matching tab titles;
   choosing one opens every tab above it, scrolls to it and
   gives it a brief highlight.

   Nothing to maintain: it reads the tab titles from the page,
   so new entities are searchable as soon as you add them.

   Extras:
     - Press "/" anywhere on the page to jump to the search box.
     - The address bar updates (e.g. bst.html#ewing-sarcoma), so a
       copied link opens the page straight to that tab.

   Load it after outline.js:
       <script src="../../outline.js"></script>
       <script src="../../search.js"></script>
       <script src="../../script.js"></script>
   ========================================================= */

(function () {

    var MAX_RESULTS = 8;
    var LABEL = /^([A-Z]|[a-z]|[ivxlcdm]+|[IVXLCDM]+|\d+)[.)]\s+/;

    var tabs = document.querySelectorAll('.collapsible');
    var container = document.querySelector('.container');
    if (!tabs.length || !container) return;


    /* ---------- build the index ---------- */

    function fold(s) {
        return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
                .replace(/[’‘]/g, "'").toLowerCase();
    }

    function titleOf(tab) {
        var span = tab.querySelector(':scope > .collapsible-header > span');
        return span ? span.textContent.replace(/\s+/g, ' ').trim() : '';
    }

    function slug(s) {
        return fold(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    }

    var index = [];
    var usedIds = {};

    Array.prototype.forEach.call(tabs, function (tab) {
        var title = titleOf(tab).replace(LABEL, '');
        if (!title) return;

        var path = [];
        var parent = tab.parentElement.closest('.collapsible');
        while (parent) {
            path.unshift(titleOf(parent).replace(LABEL, ''));
            parent = parent.parentElement.closest('.collapsible');
        }

        /* a stable id for links; parent names are added only to tell duplicates apart */
        if (!tab.id) {
            var id = slug(title) || 'section';
            for (var k = path.length - 1; usedIds[id] && k >= 0; k--) {
                id = slug(path[k]) + '--' + id;
            }
            var n = 2;
            var base = id;
            while (usedIds[id]) id = base + '-' + n++;
            tab.id = id;
        }
        usedIds[tab.id] = true;

        index.push({
            tab: tab,
            title: title,
            folded: fold(title),
            path: path.join(' › '),
            depth: path.length
        });
    });


    /* ---------- the search box ---------- */

    var box = document.createElement('div');
    box.className = 'page-search';
    box.innerHTML =
        '<label class="page-search-label" for="pageSearchInput">Search this page</label>' +
        '<input id="pageSearchInput" class="page-search-input" type="search" autocomplete="off" ' +
            'spellcheck="false" placeholder="Search this page… (press / to focus)" ' +
            'role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="pageSearchList">' +
        '<ul id="pageSearchList" class="page-search-results" role="listbox" hidden></ul>';

    var firstTab = Array.prototype.find.call(tabs, function (t) {
        return !t.parentElement.closest('.collapsible');
    });
    var anchor = firstTab.closest('.outline') || firstTab;
    anchor.parentNode.insertBefore(box, anchor);

    var input = box.querySelector('input');
    var list = box.querySelector('ul');
    var results = [];
    var active = -1;
    var closeTimer = null;


    /* ---------- matching ---------- */

    function score(entry, q, words) {
        var t = entry.folded;
        if (t === q) return 0;
        if (t.indexOf(q) === 0) return 1;

        var titleWords = t.split(/[^a-z0-9']+/).filter(Boolean);
        var startsWord = function (w) {
            return titleWords.some(function (tw) { return tw.indexOf(w) === 0; });
        };
        if (t.indexOf(' ' + q) !== -1 || t.indexOf('(' + q) !== -1 || t.indexOf('-' + q) !== -1) return 2;
        if (words.every(startsWord)) return 3;
        if (t.indexOf(q) !== -1) return 4;
        /* every typed piece appears somewhere, e.g. "angio lipo" -> Angiolipoma */
        if (words.every(function (w) { return t.indexOf(w) !== -1; })) return 5;
        return -1;
    }

    function search(text) {
        var q = fold(text).replace(/\s+/g, ' ').trim();
        if (!q) return [];
        var words = q.split(' ');
        var found = [];
        index.forEach(function (entry) {
            var s = score(entry, q, words);
            if (s >= 0) found.push({ entry: entry, score: s });
        });
        found.sort(function (a, b) {
            return a.score - b.score ||
                   a.entry.title.length - b.entry.title.length ||
                   b.entry.depth - a.entry.depth;
        });
        return found.slice(0, MAX_RESULTS).map(function (f) { return f.entry; });
    }


    /* ---------- showing results ---------- */

    function esc(s) {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    /* Bold the parts of the title that match what was typed. */
    function highlight(entry, text) {
        var words = fold(text).trim().split(/\s+/).filter(Boolean);
        var marks = new Array(entry.title.length).fill(false);
        words.forEach(function (w) {
            var from = 0;
            var at;
            while ((at = entry.folded.indexOf(w, from)) !== -1) {
                var startOfWord = at === 0 || !/[a-z0-9]/.test(entry.folded[at - 1]);
                if (startOfWord || entry.folded.indexOf(w, at + 1) === -1) {
                    for (var k = at; k < at + w.length; k++) marks[k] = true;
                    break;
                }
                from = at + 1;
            }
        });
        var html = '';
        var open = false;
        for (var k = 0; k < entry.title.length; k++) {
            if (marks[k] && !open) { html += '<mark>'; open = true; }
            if (!marks[k] && open) { html += '</mark>'; open = false; }
            html += esc(entry.title[k]);
        }
        return html + (open ? '</mark>' : '');
    }

    function show() {
        clearTimeout(closeTimer);
        results = search(input.value);
        active = results.length ? 0 : -1;

        if (!input.value.trim()) {
            close();
            return;
        }

        if (!results.length) {
            list.innerHTML = '<li class="page-search-empty">No matching sections</li>';
        } else {
            list.innerHTML = results.map(function (entry, k) {
                return '<li role="option" id="pageSearchOption' + k + '" data-index="' + k + '">' +
                       '<span class="page-search-title">' + highlight(entry, input.value) + '</span>' +
                       (entry.path ? '<span class="page-search-path">' + esc(entry.path) + '</span>' : '') +
                       '</li>';
            }).join('');
        }
        list.hidden = false;
        input.setAttribute('aria-expanded', 'true');
        mark();
    }

    function mark() {
        Array.prototype.forEach.call(list.children, function (li, k) {
            var on = k === active;
            li.classList.toggle('active', on);
            li.setAttribute('aria-selected', on ? 'true' : 'false');
            if (on) li.scrollIntoView({ block: 'nearest' });
        });
        if (active >= 0) input.setAttribute('aria-activedescendant', 'pageSearchOption' + active);
        else input.removeAttribute('aria-activedescendant');
    }

    function close() {
        list.hidden = true;
        list.innerHTML = '';
        input.setAttribute('aria-expanded', 'false');
        input.removeAttribute('aria-activedescendant');
    }


    /* ---------- jumping to a tab ---------- */

    function reveal(tab, smooth) {
        var el = tab;
        while (el) {
            if (el.classList.contains('collapsible')) el.classList.add('open');
            el = el.parentElement && el.parentElement.closest('.collapsible');
        }
        var header = tab.querySelector(':scope > .collapsible-header');
        (header || tab).scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });

        tab.classList.remove('search-flash');
        void tab.offsetWidth;   /* restart the animation if it is already running */
        tab.classList.add('search-flash');
        setTimeout(function () { tab.classList.remove('search-flash'); }, 2200);
    }

    function choose(entry) {
        if (!entry) return;
        input.value = entry.title;
        close();
        input.blur();
        if (history.replaceState) history.replaceState(null, '', '#' + entry.tab.id);
        reveal(entry.tab, true);
    }


    /* ---------- events ---------- */

    input.addEventListener('input', show);
    input.addEventListener('focus', function () { if (input.value.trim()) show(); });

    input.addEventListener('keydown', function (e) {
        /* keep arrow keys here so they don't also change slideshow images */
        e.stopPropagation();

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (list.hidden) { show(); return; }
            if (results.length) { active = (active + 1) % results.length; mark(); }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (results.length) { active = (active - 1 + results.length) % results.length; mark(); }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            choose(results[active >= 0 ? active : 0]);
        } else if (e.key === 'Escape') {
            if (!list.hidden) close();
            else { input.value = ''; input.blur(); }
        }
    });

    /* mousedown (not click) so the choice lands before the box loses focus */
    list.addEventListener('mousedown', function (e) {
        var li = e.target.closest('li[data-index]');
        if (!li) return;
        e.preventDefault();
        choose(results[+li.dataset.index]);
    });

    list.addEventListener('mousemove', function (e) {
        var li = e.target.closest('li[data-index]');
        if (li && +li.dataset.index !== active) { active = +li.dataset.index; mark(); }
    });

    input.addEventListener('blur', function () { closeTimer = setTimeout(close, 100); });

    document.addEventListener('keydown', function (e) {
        var typing = e.target.closest && e.target.closest('input, textarea, select, [contenteditable]');
        if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            input.focus();
            input.select();
        }
    });


    /* ---------- open the tab named in the link, if any ---------- */

    function fromHash() {
        var id = decodeURIComponent(location.hash.slice(1));
        var tab = id && document.getElementById(id);
        if (tab && tab.classList.contains('collapsible')) reveal(tab, false);
    }
    window.addEventListener('hashchange', fromHash);
    if (location.hash) {
        if (document.readyState === 'complete') fromHash();
        else window.addEventListener('load', fromHash);
    }

})();
