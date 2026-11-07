/* =========================================================
   RUDIMENTARY PATHOLOGY
   outline.js — turns a plain-text outline into the site's
   nested collapsible tabs, so pages can be written like notes.
   =========================================================

   WHERE YOU TYPE
   --------------
   Each subject page has one block like this:

       <script type="text/outline">
           ...your notes...
       </script>

   HEADINGS (tabs)
   ---------------
   The number of # signs is the level. That is all you manage;
   nesting, classes and numbering are done for you.

       # Category
       ## Topic
       ### Sub-topic
       #### Entity
       ##### Variant

   Numbering is automatic (A, 1, a, i, 1 ... by default), so you
   can insert or reorder tabs and everything renumbers itself.
       - Type your own label to override it:   ### c. Squamous dysplasia
       - Start with "- " for a tab with no number:   ## - The Esophagus

   TEXT
   ----
       - a bullet
         - a sub-bullet (indent two spaces)
       A plain line is a paragraph. A blank line starts a new one.
       **bold**   *italic*   [link text](page.html)
       Simple HTML tags also work inside text: <u>underline</u>,
       <sup>2</sup>, <sub>2</sub>, <br>
       A line that starts with < is passed through as raw HTML.
       Start a line with \ to show it literally (e.g. \# or \- ).

   IMAGES
   ------
       [slides]
       ../../images/anatomic-pathology/bst/normal01.png | Caption — H&E
       ../../images/anatomic-pathology/bst/normal02.jpg | Another caption
       [/slides]

   PAGE SETTINGS (optional, on the <script> tag)
   ---------------------------------------------
       data-numbering="A 1 a i 1 a"     label style for each level:
                                        A=A,B,C  a=a,b,c  1=1,2,3
                                        i=i,ii,iii  I=I,II,III  -=none
                                        add ) for a) b) c) style, e.g. a)
       data-classes="category pathology info-section info-section variant-section"
                                        CSS class for each level
                                        (the last one repeats for deeper levels)

   Load order at the bottom of each page:
       <script src="../../outline.js"></script>
       <script src="../../script.js"></script>
   ========================================================= */

(function () {

    var DEFAULT_NUMBERING = 'A 1 a i 1 a';
    var DEFAULT_CLASSES = 'category pathology info-section info-section variant-section';

    var LABEL = /^([A-Z]|[a-z]|[ivxlcdm]+|[IVXLCDM]+|\d+)[.)]\s+/;
    var INLINE_TAG = /^<\/?[a-zA-Z][a-zA-Z0-9]*(\s[^<>]*)?\/?>/;
    var BLOCK_TAG = /^<(?!\/?(b|i|u|em|strong|sup|sub|a|br|span|small|mark)\b)[a-zA-Z!]/;
    var ENTITY =/^&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/;


    /* ---------- numbering ---------- */

    function roman(n) {
        var map = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'],
                   [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
        var out = '';
        for (var k = 0; k < map.length; k++) {
            while (n >= map[k][0]) { out += map[k][1]; n -= map[k][0]; }
        }
        return out;
    }

    function letters(n) {
        var s = '';
        while (n > 0) { n--; s = String.fromCharCode(97 + (n % 26)) + s; n = Math.floor(n / 26); }
        return s;
    }

    function makeLabel(style, n) {
        switch (style) {
            case 'A': return letters(n).toUpperCase();
            case 'a': return letters(n);
            case 'i': return roman(n);
            case 'I': return roman(n).toUpperCase();
            case '1': return String(n);
            default: return '';
        }
    }


    /* The number a typed label stands for in a given style, or 0 if it isn't that style. */
    function labelValue(label, style) {
        for (var n = 1; n <= 300; n++) {
            if (makeLabel(style, n) === label) return n;
        }
        return 0;
    }


    /* ---------- text ---------- */

    function esc(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /* Escape text but let simple tags (<u>, <sup>, <br>) and entities through. */
    function safeText(s) {
        var out = '';
        for (var k = 0; k < s.length; k++) {
            var ch = s[k];
            var rest = s.slice(k);
            if (ch === '<') {
                var tag = rest.match(INLINE_TAG);
                if (tag) { out += tag[0]; k += tag[0].length - 1; continue; }
                out += '&lt;';
            } else if (ch === '&') {
                var ent = rest.match(ENTITY);
                if (ent) { out += ent[0]; k += ent[0].length - 1; continue; }
                out += '&amp;';
            } else if (ch === '>') {
                out += '&gt;';
            } else {
                out += ch;
            }
        }
        return out;
    }

    function inline(s) {
        var saved = [];
        var keep = function (html) { saved.push(html); return '\u0000' + (saved.length - 1) + '\u0000'; };

        s = s.replace(/\\([\\*_\[\]()#<>&-])/g, function (m, c) { return keep(esc(c)); });
        s = safeText(s);
        s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, text, url) {
            return keep('<a href="' + url.replace(/"/g, '&quot;') + '">') + text + keep('</a>');
        });
        s = s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
        s = s.replace(/\*(.+?)\*/g, '<i>$1</i>');

        return s.replace(/\u0000(\d+)\u0000/g, function (m, n) { return saved[+n]; });
    }


    /* ---------- blocks ---------- */

    function renderList(items) {
        var html = '';
        var stack = [];
        for (var k = 0; k < items.length; k++) {
            var it = items[k];
            var last = stack.length ? stack[stack.length - 1] : -1;
            var depth = Math.min(it.depth, last + 1);
            if (depth > last) {
                html += '<ul>';
                stack.push(depth);
            } else {
                html += '</li>';
                while (stack.length > 1 && depth < stack[stack.length - 1]) {
                    html += '</ul></li>';
                    stack.pop();
                }
            }
            html += '<li>' + inline(it.text);
        }
        html += '</li>';
        while (stack.length > 1) { html += '</ul></li>'; stack.pop(); }
        return html + '</ul>';
    }

    function renderSlides(lines) {
        var imgs = lines.map(function (l) {
            var parts = l.split('|');
            return { src: parts[0].trim(), caption: parts.slice(1).join('|').trim() };
        });
        if (!imgs.length) return '';
        var json = esc(JSON.stringify(imgs));
        return (
            '<div class="slideshow-container" data-slide="0" data-images="' + json + '">' +
            '<img class="slide-image" src="' + esc(imgs[0].src) + '" alt="' + esc(imgs[0].caption) + '">' +
            '<div class="caption">' + esc(imgs[0].caption) + '</div>' +
            '<div class="slideshow-controls">' +
            '<button type="button" class="previous" onclick="changeSlide(this, -1)">Previous</button>' +
            '<span class="counter">Image 1 of ' + imgs.length + '</span>' +
            '<button type="button" class="next" onclick="changeSlide(this, 1)">Next</button>' +
            '</div></div>'
        );
    }

    function dedent(text) {
        var lines = text.replace(/\r/g, '').replace(/\t/g, '    ').split('\n');
        var min = Infinity;
        lines.forEach(function (l) { if (l.trim()) min = Math.min(min, l.match(/^ */)[0].length); });
        if (min === Infinity) min = 0;
        return lines.map(function (l) { return l.slice(min); });
    }


    /* ---------- parse outline into a tree ---------- */

    function parse(text) {
        var root = { level: 0, children: [] };
        var stack = [root];
        var para = [];
        var list = [];
        var slides = null;

        var current = function () { return stack[stack.length - 1]; };
        var add = function (html) { current().children.push({ html: html }); };
        var flush = function () {
            if (para.length) { add('<p>' + inline(para.join(' ')) + '</p>'); para = []; }
            if (list.length) { add(renderList(list)); list = []; }
        };

        dedent(text).forEach(function (raw) {
            var line = raw.replace(/\s+$/, '');
            var t = line.trim();

            if (slides) {
                if (/^\[\/slides\]$/i.test(t)) { add(renderSlides(slides)); slides = null; }
                else if (t) slides.push(t);
                return;
            }
            if (/^\[slides\]$/i.test(t)) { flush(); slides = []; return; }

            var h = t.match(/^(#{1,9})\s+(.*)$/);
            if (h) {
                flush();
                var node = { level: h[1].length, title: h[2], children: [] };
                while (current().level >= node.level) stack.pop();
                current().children.push(node);
                stack.push(node);
                return;
            }

            var li = line.match(/^(\s*)[-*•]\s+(.*)$/);
            if (li) {
                if (para.length) flush();
                list.push({ depth: Math.floor(li[1].length / 2), text: li[2] });
                return;
            }

            if (!t) { flush(); return; }
            if (BLOCK_TAG.test(t)) { flush(); add(t); return; }

            if (list.length) flush();
            para.push(t);
        });

        if (slides) add(renderSlides(slides));
        flush();
        return root;
    }


    /* ---------- render tree as collapsibles ---------- */

    function render(node, depth, numbering, classes) {
        var html = '';
        var count = 0;
        node.children.forEach(function (child) {
            if (child.html !== undefined) { html += child.html; return; }

            var title = child.title;
            var label;
            var noNumber = /^-\s+/.test(title);
            if (noNumber) {
                title = title.replace(/^-\s+/, '');
            } else {
                count++;
                var style = numbering[Math.min(depth, numbering.length - 1)];
                var base = style.charAt(0);
                var mark = style.charAt(1) === ')' ? ') ' : '. ';
                var typed = title.match(LABEL);
                if (typed) {
                    /* a typed label in this level's style restarts the count from it */
                    var value = labelValue(typed[1], base);
                    if (value) count = value;
                } else {
                    label = makeLabel(base, count);
                    if (label) title = label + mark + title;
                }
            }

            var cls = classes[Math.min(depth, classes.length - 1)];
            html +=
                '<div class="collapsible ' + cls + '">' +
                '<div class="collapsible-header" onclick="toggleCollapsible(this)">' +
                '<span>' + inline(title) + '</span>' +
                '<span class="collapsible-arrow">▼</span>' +
                '</div>' +
                '<div class="collapsible-content">' + render(child, depth + 1, numbering, classes) + '</div>' +
                '</div>';
        });
        return html;
    }

    function convertOutline(text, numbering, classes) {
        numbering = (numbering || DEFAULT_NUMBERING).trim().split(/\s+/);
        classes = (classes || DEFAULT_CLASSES).trim().split(/\s+/);
        return render(parse(text), 0, numbering, classes);
    }


    /* ---------- run on the page ---------- */

    if (typeof document !== 'undefined') {
        var blocks = document.querySelectorAll('script[type="text/outline"]');
        Array.prototype.forEach.call(blocks, function (el) {
            var div = document.createElement('div');
            div.className = 'outline';
            div.innerHTML = convertOutline(el.textContent, el.dataset.numbering, el.dataset.classes);
            el.parentNode.replaceChild(div, el);
        });
    }

    if (typeof module !== 'undefined') module.exports = { convertOutline: convertOutline };

})();
