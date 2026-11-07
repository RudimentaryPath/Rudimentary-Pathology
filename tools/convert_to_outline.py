"""
Convert a Rudimentary Pathology subject page from hand-nested collapsible
HTML into the plain-text outline format read by outline.js.

    python3 tools/convert_to_outline.py subjects/anatomic-pathology/bst.html [...]

Writes the page in place (keep it under git so you can diff) and prints a
report of every tab whose nesting was repaired from its label.

Nesting repair: when tabs labelled like "a.", "i.", "1." sit side by side at
one level, the label styles show the intended outline (a > i > 1), so later
tabs are moved inside the earlier one they belong to.
"""

import json
import re
import sys
from collections import Counter

from bs4 import BeautifulSoup, Comment, NavigableString, Tag

LABEL = re.compile(r'^([A-Z]|[a-z]|[ivxlcdm]+|[IVXLCDM]+|\d+)([.)])\s+')
ROMAN = re.compile(r'^[ivxlcdm]+$')
INLINE_KEEP = {'u', 'sup', 'sub', 'span', 'small', 'mark', 'br'}


# ---------------------------------------------------------------- numbering

def roman(n):
    out = ''
    for v, s in ((1000, 'm'), (900, 'cm'), (500, 'd'), (400, 'cd'), (100, 'c'), (90, 'xc'),
                 (50, 'l'), (40, 'xl'), (10, 'x'), (9, 'ix'), (5, 'v'), (4, 'iv'), (1, 'i')):
        while n >= v:
            out += s
            n -= v
    return out


def letters(n):
    s = ''
    while n > 0:
        n -= 1
        s = chr(97 + n % 26) + s
        n //= 26
    return s


def make_label(style, n):
    return {'A': letters(n).upper(), 'a': letters(n), 'i': roman(n),
            'I': roman(n).upper(), '1': str(n)}.get(style, '')


def label_value(label, style):
    for n in range(1, 301):
        if make_label(style, n) == label:
            return n
    return 0


def candidate_styles(label):
    """Every style a label could be written in (i, v, x... are ambiguous)."""
    out = []
    if label.isdigit():
        return ['1']
    if re.fullmatch(r'[A-Z]', label):
        out.append('A')
    if re.fullmatch(r'[IVXLCDM]+', label) and label_value(label, 'I'):
        out.append('I')
    if re.fullmatch(r'[a-z]', label):
        out.append('a')
    if ROMAN.fullmatch(label) and label_value(label, 'i'):
        out.append('i')
    return out


# ---------------------------------------------------------------- text

def clean(s):
    return re.sub(r'\s+', ' ', s)


def esc_text(s):
    """Escape characters that outline.js would read as formatting."""
    s = s.replace('\\', '\\\\').replace('*', '\\*')
    s = re.sub(r'\[(?=[^\]]*\]\()', r'\\[', s)
    s = re.sub(r'<(?=/?[a-zA-Z!])', r'\\<', s)
    s = re.sub(r'&(?=#?[a-zA-Z0-9]+;)', r'\\&', s)
    return s


def inline(node):
    """Inline HTML -> outline inline text."""
    out = ''
    for c in node.children:
        if isinstance(c, Comment):
            continue
        if isinstance(c, NavigableString):
            out += esc_text(clean(str(c)))
            continue
        inner = inline(c)
        name = c.name
        if name in ('b', 'strong'):
            out += wrap(inner, '**')
        elif name in ('i', 'em'):
            out += wrap(inner, '*')
        elif name == 'a' and c.get('href'):
            out += '[' + inner.strip() + '](' + c['href'] + ')'
        elif name == 'br':
            out += '<br>'
        elif name in INLINE_KEEP:
            out += '<' + name + '>' + inner + '</' + name + '>'
        else:
            out += inner
    return out


def wrap(inner, mark):
    if not inner.strip():
        return inner
    lead = inner[:len(inner) - len(inner.lstrip())]
    trail = inner[len(inner.rstrip()):]
    return lead + mark + inner.strip() + mark + trail


def line_safe(text):
    """Make a paragraph/bullet line that cannot be misread as structure."""
    text = text.strip()
    if re.match(r'^(#|[-*•]\s|\[/?slides\])', text, re.I):
        text = '\\' + text
    return text


# ---------------------------------------------------------------- content blocks

def list_lines(ul, depth=0):
    lines = []
    queue = list(ul.find_all('li', recursive=False))
    while queue:
        li = queue.pop(0)
        # an <li> missing its </li> swallows the next one; browsers show them as two bullets
        swallowed = [c for c in li.children if isinstance(c, Tag) and c.name == 'li']
        for n in swallowed:
            n.extract()
        queue[0:0] = swallowed
        nested = [c for c in li.children if isinstance(c, Tag) and c.name in ('ul', 'ol', 'cl')]
        for n in nested:
            n.extract()
        text = clean(inline(li)).strip()
        if text:                                   # empty <li></li> bullets are dropped
            lines.append('  ' * depth + '- ' + line_safe(text))
        for n in nested:
            lines += list_lines(n, depth + 1)
    # stray text/elements directly inside the list (e.g. a missing <li>)
    return lines


def slides_lines(div):
    raw = div.get('data-images', '[]')
    imgs = json.loads(raw)
    lines = ['[slides]']
    for im in imgs:
        lines.append(im['src'].strip() + ' | ' + clean(im.get('caption', '')).strip())
    lines.append('[/slides]')
    return lines


def block_lines(el):
    """One content element -> list of blocks (each a list of lines)."""
    if isinstance(el, NavigableString):
        t = clean(inline_str(el)).strip()
        return [[line_safe(t)]] if t else []
    name = el.name
    cls = el.get('class') or []
    if 'slideshow-container' in cls:
        return [slides_lines(el)]
    if name in ('ul', 'ol', 'cl'):
        return [list_lines(el)]
    if name == 'p' or name == 'div':
        blocks, para = [], ''
        for c in list(el.children):
            if isinstance(c, Comment):
                continue
            if isinstance(c, Tag) and (c.name in ('ul', 'ol', 'cl', 'p', 'div', 'table')):
                if para.strip():
                    blocks.append([line_safe(clean(para))])
                para = ''
                blocks += block_lines(c)
            else:
                para += inline(wrapper(c))
        para = re.sub(r'(\s*<br>\s*)+$', '', para)
        if para.strip():
            blocks.append([line_safe(clean(para))])
        return blocks
    # anything else (tables etc.) goes through as raw HTML on one line
    return [[re.sub(r'\s*\n\s*', ' ', str(el)).strip()]]


def wrapper(node):
    holder = BeautifulSoup('<x></x>', 'html.parser').x
    holder.append(node.__copy__() if isinstance(node, Tag) else NavigableString(str(node)))
    return holder


def inline_str(s):
    return esc_text(str(s))


# ---------------------------------------------------------------- tree

class Tab:
    def __init__(self, el):
        span = el.find(class_='collapsible-header').find('span')
        self.full = clean(span.get_text(' ')).strip()
        m = LABEL.match(self.full)
        self.label = m.group(1) if m else None
        self.mark = m.group(2) if m else '.'
        self.rest = self.full[m.end():] if m else self.full
        self.cls = [c for c in el['class'] if c != 'collapsible'][0]
        self.items = []          # ('block', lines) or ('tab', Tab), in page order
        self.moved = False
        self.style = None


def read_items(container):
    items = []
    for c in container.children:
        if isinstance(c, Comment):
            continue
        if isinstance(c, Tag) and 'collapsible' in (c.get('class') or []):
            tab = Tab(c)
            content = c.find(class_='collapsible-content', recursive=False)
            tab.items = read_items(content) if content else []
            items.append(('tab', tab))
        elif isinstance(c, Tag) and c.name == 'div' and not c.get('class') and c.find(class_='collapsible'):
            items += read_items(c)
        else:
            for b in block_lines(c):
                items.append(('block', b))
    return items


def resolve_style(tab, stack):
    suffix = ')' if tab.mark == ')' else ''
    cands = [c + suffix for c in candidate_styles(tab.label)]
    if len(cands) == 1:
        return cands[0]
    # prefer an open level that expects exactly this label next
    for style, last in reversed(stack):
        if style in cands and last is not None and last.label and \
                label_value(tab.label, style[0]) == label_value(last.label, style[0]) + 1:
            return style
    # a fresh "i." is roman unless it follows "h." at an open letter level
    if tab.label in ('i', 'I') and all(not s or s[0] not in ('a', 'A') or last.label not in ('h', 'H')
                                        for s, last in stack):
        return ('i' if tab.label == 'i' else 'I') + suffix
    for pref in ('a', 'A', 'i', 'I'):
        if pref + suffix in cands:
            return pref + suffix
    return cands[0]


def repair(items, report, path):
    """Re-nest a run of sibling tabs according to their label styles."""
    out = []
    stack = []   # (style, tab) for each open level of this run; level 0 = direct children
    for kind, obj in items:
        if kind == 'block':
            if len(stack) > 1:
                report.append(f'{path}: NOTE text after nested tab "{stack[-1][1].full}" stays at parent level')
            out.append((kind, obj))
            continue
        tab = obj
        style = resolve_style(tab, stack) if tab.label else None
        tab.style = style
        if style is None:
            level = max(len(stack) - 1, 0)          # unnumbered: sibling of the previous tab
            keep = stack[level][0] if level < len(stack) else None
        else:
            idx = next((k for k, (s, _) in enumerate(stack) if s == style), None)
            if idx is not None:
                level = idx
            elif not stack or label_value(tab.label, style[0]) == 1:
                level = len(stack)                   # "a." / "i." / "1." opens a deeper level
            else:
                level = len(stack) - 1               # e.g. a stray "6." among "a."/"b.": keep as sibling
                report.append(f'{path}: CHECK label "{tab.full}" does not fit the labels around it')
            keep = style
        del stack[level:]
        if level == 0:
            out.append(('tab', tab))
        else:
            parent = stack[level - 1][1]
            parent.items.append(('tab', tab))
            tab.moved = True
            report.append(f'{path}: "{tab.full}" moved inside "{parent.full}"')
        stack.append((keep, tab))
    for kind, obj in out:
        if kind == 'tab':
            fix_children(obj, report, path)
    return out


def fix_children(tab, report, path):
    tab.items = repair(tab.items, report, path + ' > ' + tab.full[:40])


def all_tabs(items, depth=0):
    for kind, obj in items:
        if kind == 'tab':
            yield depth, obj
            yield from all_tabs(obj.items, depth + 1)


def infer_scheme(items):
    styles, classes = {}, {}
    for depth, tab in all_tabs(items):
        st = tab.style if tab.label else '-'
        if st is None:
            st = '-'
        styles.setdefault(depth, Counter())[st] += 1
        classes.setdefault(depth, Counter())[tab.cls] += 1
    n = max(styles) + 1 if styles else 1
    standard = ['A', '1', 'a', 'i', '1', 'a']
    numbering = []
    for d in range(n):
        top = styles[d].most_common(1)[0][0]
        std = standard[d] if d < len(standard) else None
        if std and std != top and styles[d][std] >= 0.4 * sum(styles[d].values()):
            top = std
        numbering.append(top)
    cls = [classes[d].most_common(1)[0][0] for d in range(n)]
    return numbering, cls


# ---------------------------------------------------------------- write outline

def emit(items, depth, numbering, classes, lines, notes):
    count = 0
    for kind, obj in items:
        if kind == 'block':
            if lines and lines[-1] != '':
                lines.append('')
            lines += obj
            lines.append('')
            continue
        tab = obj
        style = numbering[min(depth, len(numbering) - 1)]
        cls = classes[min(depth, len(classes) - 1)]
        if tab.cls != cls:
            notes['class'] += 1
        rest = esc_text(tab.rest)
        if LABEL.match(tab.rest) or rest.startswith('- '):
            rest = '\\' + rest
        if tab.label is None:
            title = rest if style == '-' else '- ' + rest
        else:
            count += 1
            expected = make_label(style[0], count)
            if tab.label == expected and tab.mark == ('.' if len(style) == 1 else ')'):
                title = rest
            else:
                title = tab.label + tab.mark + ' ' + rest
                notes['typed'] += 1
                v = label_value(tab.label, style[0])
                if v:
                    count = v
        if lines and lines[-1] != '':
            lines.append('')
        lines.append('#' * (depth + 1) + ' ' + title)
        emit(tab.items, depth + 1, numbering, classes, lines, notes)


def convert_page(path):
    html = open(path, encoding='utf8').read()
    soup = BeautifulSoup(html, 'html.parser')
    container = soup.find(class_='container')
    tops = [c for c in container.find_all(class_='collapsible')
            if not c.find_parent(class_='collapsible')]
    if not tops:
        return None

    report = []
    items = repair(read_items(container_subset(container, tops)), report, path.split('/')[-1])
    numbering, classes = infer_scheme(items)
    lines, notes = [], Counter()
    emit(items, 0, numbering, classes, lines, notes)
    while lines and lines[-1] == '':
        lines.pop()

    body = '\n'.join(('    ' + l) if l else '' for l in lines)
    block = (
        '<!-- =========================================================\n'
        '         PAGE CONTENT: type your notes below.\n'
        '         # Category  ## Topic  ### Sub-topic  #### Entity  ##### Variant\n'
        '         Numbering is automatic. Instructions are at the top of outline.js.\n'
        '         ========================================================= -->\n\n'
        f'    <script type="text/outline"\n'
        f'        data-numbering="{" ".join(numbering)}"\n'
        f'        data-classes="{" ".join(classes)}">\n\n'
        f'{body}\n\n'
        '    </script>'
    )

    # swap the collapsibles for the outline block, leaving the rest of the page alone
    for k, t in enumerate(tops):
        t.replace_with(Comment(f'OUTLINE-MARK-{k}'))
    out = str(soup)
    last = len(tops) - 1
    pattern = r'<!--OUTLINE-MARK-0-->' + (r'.*<!--OUTLINE-MARK-%d-->' % last if last else '')
    out = re.sub(pattern, lambda m: block, out, count=1, flags=re.S)
    out = re.sub(r'(<!-- =+\s*\n\s*[A-Z]\. [^\n]*\n\s*=+ -->\s*)(?=<!-- =+\s*\n\s*PAGE CONTENT)', '', out)

    # the dark mode button sat between </head> and <body>; move it inside <body>
    btn = re.search(r'\n?<button id="darkModeToggle".*?</button>\s*', out, re.S)
    if btn and out.find('<body') > btn.start():
        out = out[:btn.start()] + '\n' + out[btn.end():]
        out = re.sub(r'(<body[^>]*>)', lambda m: m.group(1) + '\n\n' + btn.group(0).strip(), out, count=1)

    # load outline.js before script.js
    out = re.sub(r'(\s*)(<script src="([./]*)script\.js"></script>)',
                 lambda m: f'{m.group(1)}<script src="{m.group(3)}outline.js"></script>'
                           f'{m.group(1)}<script src="{m.group(3)}search.js"></script>{m.group(1)}{m.group(2)}',
                 out, count=1)

    open(path, 'w', encoding='utf8').write(out)
    return {'report': report, 'numbering': numbering, 'classes': classes, 'notes': notes,
            'tabs': sum(1 for _ in all_tabs(items))}


def container_subset(container, tops):
    holder = BeautifulSoup('<div></div>', 'html.parser').div
    for t in tops:
        holder.append(t.__copy__())
    return holder


if __name__ == '__main__':
    for p in sys.argv[1:]:
        r = convert_page(p)
        if r is None:
            print(p, ': no tabs, skipped')
            continue
        print(f"{p}: {r['tabs']} tabs  numbering={' '.join(r['numbering'])}  "
              f"classes={' '.join(r['classes'])}  typed-labels={r['notes']['typed']}  "
              f"class-changes={r['notes']['class']}  moved={sum('moved inside' in x for x in r['report'])}")
        seen = set()
        for line in r['report']:
            key = line.split(': ', 1)[1]
            if key in seen:
                continue
            seen.add(key)
            print('   ', line)
