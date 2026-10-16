//@target illustrator
/*
 * EspacementOptique.jsx — v1.0.0
 * Espacement optique d'objets vectorisés / Optical spacing for outlined shapes
 *
 * FR : Espace les objets sélectionnés (lettres vectorisées d'un logo, chiffres,
 *      pictogrammes alignés, éléments d'un lettrage) selon le blanc qu'on PERÇOIT
 *      entre eux, et non selon leurs boîtes englobantes. Le script mesure le profil
 *      réel de chaque forme (courbes de Bézier comprises) sur une zone de hauteur
 *      choisie, limite la profondeur des creux (comme l'œil, qui ne « voit » pas
 *      tout l'intérieur d'un C ou d'un T), puis déplace les objets pour que la
 *      surface blanche entre deux voisins soit la même partout.
 * EN : Spaces the selected objects (outlined logo letters, figures, icons in a row,
 *      lettering parts) by the white space you PERCEIVE between them instead of
 *      their bounding boxes. The script measures each shape's real profile (Bézier
 *      curves included) over a chosen height band, caps how deep open counters
 *      count (the eye does not "see" the whole inside of a C or a T), then moves the
 *      objects so the white area between neighbours is the same everywhere.
 *
 * Principe inspiré de la méthode par surface des outils d'espacement de fontes
 * (ex. HT Letterspacer, Huerta Tipográfica, pour Glyphs). Code entièrement original.
 * Principle inspired by area-based font-spacing tools (e.g. HT Letterspacer for
 * Glyphs). Entirely original code.
 *
 * Auteur / Author : Amirouche Amwanes — Licence MIT / MIT License
 * Cible / Target : Adobe Illustrator CC 2018+ (ExtendScript ES3). Non testé dans Illustrator.
 * Aucun appel réseau, aucune collecte de données. / No network calls, no data collection.
 */

/* ===================================================================== */
/*  1. CŒUR GÉOMÉTRIQUE (pur, sans Illustrator) / PURE GEOMETRY CORE      */
/* ===================================================================== */

var EO_CORE = (function () {

    function bez(p0, p1, p2, p3, t) {
        var u = 1 - t;
        return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
    }
    function dist(ax, ay, bx, by) { var dx = bx - ax, dy = by - ay; return Math.sqrt(dx * dx + dy * dy); }

    /*
     * Aplatit un contour (coordonnées déjà locales) en polyligne.
     * Flattens a contour (already in local coordinates) into a polyline.
     * pts : [[ax, ay, lx, ly, rx, ry], ...] (ancre, poignée gauche, poignée droite)
     * Retour / returns : [[x, y], ...]
     */
    function flatten(pts, closed, tol) {
        var out = [], n = pts.length, i, segs, j;
        if (n < 1) return out;
        out.push([pts[0][0], pts[0][1]]);
        if (n < 2) return out;
        segs = closed ? n : n - 1;
        for (i = 0; i < segs; i++) {
            var A = pts[i], B = pts[(i + 1) % n];
            var x0 = A[0], y0 = A[1], x1 = A[4], y1 = A[5], x2 = B[2], y2 = B[3], x3 = B[0], y3 = B[1];
            var straight = dist(x0, y0, x1, y1) < 1e-9 && dist(x2, y2, x3, y3) < 1e-9;
            if (straight) { out.push([x3, y3]); continue; }
            var poly = dist(x0, y0, x1, y1) + dist(x1, y1, x2, y2) + dist(x2, y2, x3, y3);
            var steps = Math.ceil(poly / Math.max(tol, 1e-3));
            if (steps < 4) steps = 4; if (steps > 96) steps = 96;
            for (j = 1; j <= steps; j++) {
                var t = j / steps;
                out.push([bez(x0, x1, x2, x3, t), bez(y0, y1, y2, y3, t)]);
            }
        }
        // Contour fermé : le dernier point répète le premier / closed: last point repeats the first
        if (closed && out.length > 2) {
            var f = out[0], z = out[out.length - 1];
            if (Math.abs(f[0] - z[0]) < 1e-9 && Math.abs(f[1] - z[1]) < 1e-9) out.pop();
        }
        return out;
    }

    /* Ajoute les arêtes d'une polyligne / adds polyline edges.
       h = demi-épaisseur de contour à ajouter (0 si sans contour) / half stroke width */
    function addEdges(edges, poly, closed, h) {
        var n = poly.length, i;
        if (n === 1) { edges.push([poly[0][0], poly[0][1], poly[0][0], poly[0][1], h]); return; }
        for (i = 0; i < n - 1; i++) edges.push([poly[i][0], poly[i][1], poly[i + 1][0], poly[i + 1][1], h]);
        if (closed && n > 2) edges.push([poly[n - 1][0], poly[n - 1][1], poly[0][0], poly[0][1], h]);
    }

    function edgesBox(edges) {
        var b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity }, i, e;
        for (i = 0; i < edges.length; i++) {
            e = edges[i];
            b.x0 = Math.min(b.x0, e[0] - e[4], e[2] - e[4]); b.x1 = Math.max(b.x1, e[0] + e[4], e[2] + e[4]);
            b.y0 = Math.min(b.y0, e[1] - e[4], e[3] - e[4]); b.y1 = Math.max(b.y1, e[1] + e[4], e[3] + e[4]);
        }
        return b;
    }

    /*
     * Profil gauche / droite d'une forme sur des lignes de balayage horizontales.
     * Left / right profile of a shape on horizontal scanlines.
     * L[k] = x le plus à gauche de l'encre à la hauteur ys[k] (null si aucune encre)
     */
    function profile(edges, y0, dy, N) {
        var L = [], R = [], k, i;
        for (k = 0; k < N; k++) { L.push(null); R.push(null); }
        for (i = 0; i < edges.length; i++) {
            var e = edges[i], xa = e[0], ya = e[1], xb = e[2], yb = e[3], h = e[4];
            var lo = Math.min(ya, yb), hi = Math.max(ya, yb);
            var k0 = Math.ceil((lo - h - y0) / dy - 0.5), k1 = Math.floor((hi + h - y0) / dy - 0.5);
            if (k0 < 0) k0 = 0; if (k1 > N - 1) k1 = N - 1;
            for (k = k0; k <= k1; k++) {
                var y = y0 + (k + 0.5) * dy, xl, xr;
                if (Math.abs(yb - ya) < 1e-9) { xl = Math.min(xa, xb); xr = Math.max(xa, xb); }
                else if (y >= lo && y <= hi) { xl = xr = xa + (y - ya) * (xb - xa) / (yb - ya); }
                else if (y < lo) { xl = xr = (ya < yb) ? xa : xb; }
                else { xl = xr = (ya > yb) ? xa : xb; }
                xl -= h; xr += h;
                if (L[k] === null || xl < L[k]) L[k] = xl;
                if (R[k] === null || xr > R[k]) R[k] = xr;
            }
        }
        return { L: L, R: R };
    }

    /*
     * Analyse et calcule les déplacements. / Analyzes and computes the shifts.
     * glyphs : [{ edges: [[x1,y1,x2,y2,h], ...] }, ...] en coordonnées locales
     *          (x = axe d'espacement, y = axe de mesure) / local coords
     * opt : { scan, zoneLo, zoneHi (0..1), depth (0..1 de la zone), mode "keep"|"fixed",
     *         target (pt), strength (0..1), anchor "first"|"center"|"last", clearance (pt, <0 = off) }
     */
    function analyze(glyphs, opt) {
        var n = glyphs.length, i, k, res = { ok: false, error: "" };
        if (n < 2) { res.error = "few"; return res; }
        var N = Math.max(20, Math.min(2000, Math.round(opt.scan || 240)));
        var y0 = Infinity, y1 = -Infinity, boxes = [];
        for (i = 0; i < n; i++) {
            if (!glyphs[i].edges.length) { res.error = "empty"; res.index = i; return res; }
            var b = edgesBox(glyphs[i].edges); boxes.push(b);
            y0 = Math.min(y0, b.y0); y1 = Math.max(y1, b.y1);
        }
        var H = y1 - y0;
        if (!(H > 1e-6)) { res.error = "flat"; return res; }
        var dy = H / N;
        var zLo = y0 + Math.max(0, Math.min(1, opt.zoneLo)) * H, zHi = y0 + Math.max(0, Math.min(1, opt.zoneHi)) * H;
        var zone = [];
        for (k = 0; k < N; k++) { var yk = y0 + (k + 0.5) * dy; if (yk >= zLo && yk <= zHi) zone.push(k); }
        if (zone.length < 2) { res.error = "zone"; return res; }
        var Z = zHi - zLo, D = Math.max(0, opt.depth) * Z;

        // Ordre le long de l'axe / order along the axis
        var order = [];
        for (i = 0; i < n; i++) order.push(i);
        order.sort(function (a, c) {
            var ca = (boxes[a].x0 + boxes[a].x1) / 2, cc = (boxes[c].x0 + boxes[c].x1) / 2;
            return ca === cc ? a - c : ca - cc;
        });

        var G = [];
        for (i = 0; i < n; i++) {
            var p = profile(glyphs[i].edges, y0, dy, N), g = { L: p.L, R: p.R, minL: null, maxR: null, flat: false };
            var j;
            for (j = 0; j < zone.length; j++) {
                k = zone[j];
                if (p.L[k] !== null && (g.minL === null || p.L[k] < g.minL)) g.minL = p.L[k];
                if (p.R[k] !== null && (g.maxR === null || p.R[k] > g.maxR)) g.maxR = p.R[k];
            }
            g.dl = []; g.dr = [];
            if (g.minL === null) {
                // Aucune encre dans la zone : mesuré à plat sur toute la hauteur
                // No ink in the band: measured flat over the whole height
                g.flat = true; g.minL = boxes[i].x0; g.maxR = boxes[i].x1;
                for (j = 0; j < zone.length; j++) { g.dl.push(0); g.dr.push(0); }
            } else {
                for (j = 0; j < zone.length; j++) {
                    k = zone[j];
                    g.dl.push(p.L[k] === null ? D : Math.min(p.L[k] - g.minL, D));
                    g.dr.push(p.R[k] === null ? D : Math.min(g.maxR - p.R[k], D));
                }
            }
            g.meanL = mean(g.dl); g.meanR = mean(g.dr);
            G.push(g);
        }

        var pairs = [], sumE = 0;
        for (i = 0; i < n - 1; i++) {
            var A = G[order[i]], B = G[order[i + 1]];
            var gap = B.minL - A.maxR, d = A.meanR + B.meanL;
            var pr = { a: order[i], b: order[i + 1], gap: gap, depth: d, white: gap + d, minClear: null };
            // Plus petite distance réelle (toute la hauteur) à écart nul / smallest real distance at zero gap
            for (k = 0; k < N; k++) {
                if (A.R[k] !== null && B.L[k] !== null) {
                    var c = (B.L[k] - B.minL) + (A.maxR - A.R[k]);
                    if (pr.minClear === null || c < pr.minClear) pr.minClear = c;
                }
            }
            sumE += pr.white;
            pairs.push(pr);
        }
        var W = opt.mode === "fixed" ? opt.target : sumE / pairs.length;
        var s = Math.max(0, Math.min(1, opt.strength === undefined ? 1 : opt.strength));
        var collisions = 0;
        for (i = 0; i < pairs.length; i++) {
            var q = pairs[i];
            q.newGap = q.gap + s * ((W - q.depth) - q.gap);
            q.limited = false;
            if (opt.clearance !== undefined && opt.clearance >= 0 && q.minClear !== null) {
                var gMin = opt.clearance - q.minClear;
                if (q.newGap < gMin - 1e-9) { q.newGap = gMin; q.limited = true; collisions++; }
            }
            q.newWhite = q.newGap + q.depth;
        }

        // Nouvelles positions / new positions
        var rel = [], pos = 0;
        rel[order[0]] = 0;
        for (i = 0; i < n - 1; i++) {
            var Aa = G[order[i]];
            pos = rel[order[i]] + (Aa.maxR - Aa.minL) + pairs[i].newGap;
            rel[order[i + 1]] = pos;
        }
        var first = G[order[0]], last = G[order[n - 1]];
        var span = rel[order[n - 1]] + (last.maxR - last.minL), off;
        if (opt.anchor === "last") off = last.maxR - span;
        else if (opt.anchor === "center") off = (first.minL + last.maxR) / 2 - span / 2;
        else off = first.minL;
        var shifts = [], maxShift = 0;
        for (i = 0; i < n; i++) {
            shifts[i] = off + rel[i] - G[i].minL;
            if (Math.abs(shifts[i]) > maxShift) maxShift = Math.abs(shifts[i]);
        }

        res.ok = true; res.order = order; res.pairs = pairs; res.W = W; res.shifts = shifts; res.maxShift = maxShift;
        res.collisions = collisions; res.G = G; res.zone = zone; res.y0 = y0; res.dy = dy; res.D = D;
        res.devBefore = deviation(pairs, "white"); res.devAfter = deviation(pairs, "newWhite");
        res.flat = 0; for (i = 0; i < n; i++) if (G[i].flat) res.flat++;
        res.spanBefore = last.maxR - first.minL; res.spanAfter = span;
        return res;
    }

    function mean(a) { var s = 0, i; for (i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : 0; }

    /* Écart relatif max à la moyenne / max relative deviation from the mean */
    function deviation(pairs, key) {
        var m = 0, i, d = 0;
        for (i = 0; i < pairs.length; i++) m += pairs[i][key];
        m /= pairs.length;
        if (Math.abs(m) < 1e-9) return 0;
        for (i = 0; i < pairs.length; i++) d = Math.max(d, Math.abs(pairs[i][key] - m) / Math.abs(m));
        return d;
    }

    /*
     * Polygones des zones blanches mesurées (coordonnées locales).
     * Polygons of the measured white zones (local coordinates). after = positions finales.
     */
    function whitePolys(res, after) {
        var out = [], i, j;
        for (i = 0; i < res.pairs.length; i++) {
            var q = res.pairs[i], A = res.G[q.a], B = res.G[q.b];
            var sa = after ? res.shifts[q.a] : 0, sb = after ? res.shifts[q.b] : 0;
            var left = [], right = [];
            for (j = 0; j < res.zone.length; j++) {
                var y = res.y0 + (res.zone[j] + 0.5) * res.dy;
                left.push([A.maxR - A.dr[j] + sa, y]);
                right.push([B.minL + B.dl[j] + sb, y]);
            }
            var poly = left.slice(0);
            for (j = right.length - 1; j >= 0; j--) poly.push(right[j]);
            out.push(poly);
        }
        return out;
    }

    var UNITS = { mm: 72 / 25.4, cm: 72 / 2.54, pt: 1, px: 1, "in": 72 };
    function toPt(v, u) { return v * (UNITS[u] || 1); }
    function fromPt(v, u) { return v / (UNITS[u] || 1); }
    function fmt(v, u) {
        var x = fromPt(v, u), d = (u === "pt" || u === "px") ? 2 : 3;
        var s = x.toFixed(d);
        if (s.indexOf(".") >= 0) s = s.replace(/0+$/, "").replace(/\.$/, "");
        if (s === "-0") s = "0";
        return s + " " + u;
    }

    return { flatten: flatten, addEdges: addEdges, profile: profile, analyze: analyze, whitePolys: whitePolys,
             toPt: toPt, fromPt: fromPt, fmt: fmt };
})();

/* ===================================================================== */
/*  2. PARTIE ILLUSTRATOR / ILLUSTRATOR PART                             */
/* ===================================================================== */

var EO_LAYER = "Espacement optique (repères)";

function EO_isFr() {
    var loc = "";
    try { loc = String(app.locale || $.locale || ""); } catch (e) { loc = ""; }
    return loc.toLowerCase().indexOf("fr") === 0;
}

var EO_T = EO_isFr() ? {
    title: "Espacement optique v1.0.0",
    noDoc: "Aucun document ouvert. Ouvrez un document puis relancez le script.",
    noSel: "Sélectionnez au moins deux objets à espacer (lettres vectorisées, chiffres, pictogrammes…), ou un seul groupe qui les contient.",
    textEdit: "Quittez d'abord l'édition de texte (Échap), puis sélectionnez les objets.",
    oneText: "Un seul texte est sélectionné. Pour ses lettres, utilisez le crénage optique natif, ou vectorisez une copie (Texte > Vectoriser) et lancez le script sur le groupe obtenu.",
    dir: "Direction", dH: "Horizontale (côte à côte)", dV: "Verticale (empilés)",
    target: "Espace visé", mKeep: "Égaliser en gardant la largeur totale", mFixed: "Espace optique fixe :",
    anchor: "Point fixe :", aFirst: "premier objet", aCenter: "centre", aLast: "dernier objet",
    strength: "Intensité :", meas: "Mesure",
    zone: "Zone mesurée, en % de la hauteur de la sélection : de", zoneTo: "à",
    depth: "Profondeur prise en compte des creux (% de la zone) :",
    stroke: "Tenir compte de l'épaisseur des contours",
    clear: "Empêcher les contacts, distance minimale :",
    marks: "Afficher les zones blanches mesurées (calque non imprimable)",
    analyze: "Analyser", apply: "Espacer", erase: "Effacer les repères", cancel: "Annuler",
    tip: "Conseil : travaillez sur une copie. Ctrl+Z / Cmd+Z annule l'espacement. Groupez d'abord les éléments qui vont ensemble (lettre + accent).",
    ready: "Réglez les options puis cliquez sur Analyser.",
    bad: "Valeur incorrecte : {f}.",
    errFew: "Il faut au moins deux objets mesurables.",
    errEmpty: "L'objet n° {i} n'a aucun contour mesurable (masqué, vide ou sans fond ni contour).",
    errFlat: "Les objets n'ont pas de hauteur mesurable.",
    errZone: "La zone mesurée est trop étroite : élargissez-la.",
    summary: "{n} objets, {p} espace(s). Espace optique moyen actuel : {m}.\nIrrégularité actuelle : {b} %  →  après : {a} %.\nEspace visé : {w}. Plus grand déplacement : {s}. Largeur totale : {l0} → {l1}.",
    pairLine: "{i}–{j} : blanc {e0} → {e1} (écart des bords {g0} → {g1}){x}",
    limited: " — limité (contact)",
    flat: "Objets sans encre dans la zone, mesurés par leur boîte : {n}.",
    fallback: "Objets mesurés par leur boîte (images, symboles, maillages…) : {n}.",
    coll: "Espaces agrandis pour éviter un contact : {n}.",
    more: "… et {n} autre(s).",
    done: "Espacement appliqué à {n} objets.\n\n",
    moveErr: "Objets impossibles à déplacer (verrouillés ?) : {n}.",
    erased: "Calque de repères supprimé.", noLayer: "Aucun calque de repères à supprimer.",
    working: "Mesure en cours…"
} : {
    title: "Optical spacing v1.0.0",
    noDoc: "No document is open. Open a document and run the script again.",
    noSel: "Select at least two objects to space (outlined letters, figures, icons…), or a single group containing them.",
    textEdit: "Leave text editing first (Esc), then select the objects.",
    oneText: "A single text object is selected. For its letters, use native Optical kerning, or outline a copy (Type > Create Outlines) and run the script on the resulting group.",
    dir: "Direction", dH: "Horizontal (side by side)", dV: "Vertical (stacked)",
    target: "Target spacing", mKeep: "Equalize, keeping the total width", mFixed: "Fixed optical space:",
    anchor: "Fixed point:", aFirst: "first object", aCenter: "center", aLast: "last object",
    strength: "Strength:", meas: "Measurement",
    zone: "Measured band, in % of the selection height: from", zoneTo: "to",
    depth: "Depth of open counters taken into account (% of band):",
    stroke: "Account for stroke width",
    clear: "Prevent contacts, minimum distance:",
    marks: "Show the measured white zones (non-printing layer)",
    analyze: "Analyze", apply: "Space", erase: "Clear markers", cancel: "Cancel",
    tip: "Tip: work on a copy. Ctrl+Z / Cmd+Z undoes the spacing. Group parts that belong together first (letter + accent).",
    ready: "Set the options, then click Analyze.",
    bad: "Invalid value: {f}.",
    errFew: "At least two measurable objects are needed.",
    errEmpty: "Object #{i} has no measurable outline (hidden, empty, or without fill or stroke).",
    errFlat: "The objects have no measurable height.",
    errZone: "The measured band is too narrow: widen it.",
    summary: "{n} objects, {p} space(s). Current mean optical space: {m}.\nCurrent unevenness: {b} %  →  after: {a} %.\nTarget space: {w}. Largest move: {s}. Total width: {l0} → {l1}.",
    pairLine: "{i}–{j}: white {e0} → {e1} (edge gap {g0} → {g1}){x}",
    limited: " — limited (contact)",
    flat: "Objects with no ink in the band, measured by their box: {n}.",
    fallback: "Objects measured by their box (images, symbols, meshes…): {n}.",
    coll: "Spaces widened to avoid a contact: {n}.",
    more: "… and {n} more.",
    done: "Spacing applied to {n} objects.\n\n",
    moveErr: "Objects that could not be moved (locked?): {n}.",
    erased: "Marker layer removed.", noLayer: "No marker layer to remove.",
    working: "Measuring…"
};

function EO_fill(s, o) { var k; for (k in o) s = s.split("{" + k + "}").join(o[k]); return s; }

/* Réglages mémorisés (fichier local) / remembered settings (local file) */
function EO_cfgFile() { return new File(Folder.userData + "/EspacementOptique.cfg"); }
function EO_loadCfg() {
    var c = { dir: "h", mode: "keep", target: "3", unit: "mm", anchor: "first", strength: "100",
              zlo: "0", zhi: "100", depth: "15", stroke: "1", clr: "1", clrv: "0", marks: "0" };
    try {
        var f = EO_cfgFile();
        if (f.exists && f.open("r")) {
            while (!f.eof) { var ln = f.readln(), p = ln.indexOf("="); if (p > 0) c[ln.substring(0, p)] = ln.substring(p + 1); }
            f.close();
        }
    } catch (e) {}
    return c;
}
function EO_saveCfg(c) {
    try { var f = EO_cfgFile(), k; if (f.open("w")) { for (k in c) f.writeln(k + "=" + c[k]); f.close(); } } catch (e) {}
}

/* Objets à espacer d'après la sélection / objects to space from the selection */
function EO_targets(doc) {
    var sel = doc.selection, out = [], i;
    if (!sel || sel.typename === "TextRange" || sel.length === undefined) return { error: sel && sel.typename === "TextRange" ? "textEdit" : "noSel" };
    if (sel.length === 1) {
        var it = sel[0];
        if (it.typename === "GroupItem" && !it.clipped) {
            for (i = 0; i < it.pageItems.length; i++) if (!it.pageItems[i].hidden) out.push(it.pageItems[i]);
            if (out.length >= 2) return { items: out };
        }
        if (it.typename === "TextFrame") return { error: "oneText" };
        return { error: "noSel" };
    }
    for (i = 0; i < sel.length; i++) out.push(sel[i]);
    return { items: out };
}

/* Conversion vers l'espace local / to local space */
function EO_local(x, y, vertical) { return vertical ? [-y, x] : [x, y]; }
function EO_doc(u, v, vertical) { return vertical ? [v, -u] : [u, v]; }

/* Collecte les arêtes d'un objet / collects an object's edges */
function EO_glyph(item, st) {
    var g = { edges: [], box: false };
    var tol = 0.25;
    function pathPts(p) {
        var pts = [], i, pp = p.pathPoints;
        for (i = 0; i < pp.length; i++) {
            var a = EO_local(pp[i].anchor[0], pp[i].anchor[1], st.vertical);
            var l = EO_local(pp[i].leftDirection[0], pp[i].leftDirection[1], st.vertical);
            var r = EO_local(pp[i].rightDirection[0], pp[i].rightDirection[1], st.vertical);
            pts.push([a[0], a[1], l[0], l[1], r[0], r[1]]);
        }
        return pts;
    }
    function addBox(it) {
        var b = st.stroke ? it.visibleBounds : it.geometricBounds;
        var c = [EO_local(b[0], b[1], st.vertical), EO_local(b[2], b[1], st.vertical), EO_local(b[2], b[3], st.vertical), EO_local(b[0], b[3], st.vertical)];
        EO_CORE.addEdges(g.edges, c, true, 0);
        g.box = true;
    }
    function addPath(p, forceClip) {
        if (p.guides) return;
        var isClip = forceClip || p.clipping;
        if (!isClip && !p.filled && !p.stroked) return;
        if (p.pathPoints.length < 1) return;
        var h = (!isClip && st.stroke && p.stroked) ? p.strokeWidth / 2 : 0;
        var poly = EO_CORE.flatten(pathPts(p), p.closed, tol);
        EO_CORE.addEdges(g.edges, poly, p.closed || p.filled || isClip, h);
    }
    function isClipping(it) {
        try {
            if (it.typename === "PathItem") return it.clipping;
            if (it.typename === "CompoundPathItem") return it.pathItems.length > 0 && it.pathItems[0].clipping;
        } catch (e) {}
        return false;
    }
    function visit(it) {
        if (it.hidden) return;
        var t = it.typename, i;
        if (t === "PathItem") addPath(it, false);
        else if (t === "CompoundPathItem") { for (i = 0; i < it.pathItems.length; i++) addPath(it.pathItems[i], false); }
        else if (t === "GroupItem") {
            if (it.clipped) {
                for (i = 0; i < it.pageItems.length; i++) {
                    var c = it.pageItems[i];
                    if (isClipping(c)) {
                        if (c.typename === "PathItem") addPath(c, true);
                        else { var j; for (j = 0; j < c.pathItems.length; j++) addPath(c.pathItems[j], true); }
                    }
                }
            } else {
                for (i = 0; i < it.pageItems.length; i++) visit(it.pageItems[i]);
            }
        } else if (t === "TextFrame") {
            // Copie vectorisée temporaire, supprimée aussitôt / temporary outlined copy, removed at once
            var dup = null, outl = null;
            try { dup = it.duplicate(); outl = dup.createOutline(); dup = null; visit(outl); }
            catch (e) { addBox(it); }
            finally { try { if (outl) outl.remove(); } catch (e2) {} try { if (dup) dup.remove(); } catch (e3) {} }
        } else addBox(it);
    }
    visit(item);
    return g;
}

function EO_findLayer(doc) {
    var i; for (i = 0; i < doc.layers.length; i++) if (doc.layers[i].name === EO_LAYER) return doc.layers[i];
    return null;
}
function EO_clear(doc) {
    var L = EO_findLayer(doc);
    if (!L) return false;
    L.locked = false; L.visible = true; L.remove();
    return true;
}

function EO_markColor(doc) {
    if (doc.documentColorSpace === DocumentColorSpace.CMYK) {
        var c = new CMYKColor(); c.cyan = 70; c.magenta = 0; c.yellow = 10; c.black = 0; return c;
    }
    var r = new RGBColor(); r.red = 0; r.green = 190; r.blue = 230; return r;
}

function EO_drawZones(doc, res, st, after) {
    EO_clear(doc);
    var L = doc.layers.add();
    L.name = EO_LAYER;
    L.zOrder(ZOrderMethod.BRINGTOFRONT);
    var col = EO_markColor(doc), polys = EO_CORE.whitePolys(res, after), i, j, n = 0;
    for (i = 0; i < polys.length; i++) {
        var pts = [];
        for (j = 0; j < polys[i].length; j++) pts.push(EO_doc(polys[i][j][0], polys[i][j][1], st.vertical));
        var p = L.pathItems.add();
        p.setEntirePath(pts);
        p.closed = true; p.filled = true; p.fillColor = col; p.stroked = false;
        try { p.opacity = 45; } catch (e) {}
        p.name = (i + 1) + "–" + (i + 2) + " : " + EO_CORE.fmt(after ? res.pairs[i].newWhite : res.pairs[i].white, st.unit);
        n++;
    }
    L.printable = false;
    return n;
}

function EO_measure(doc, items, st) {
    var glyphs = [], boxes = 0, i;
    for (i = 0; i < items.length; i++) { var g = EO_glyph(items[i], st); glyphs.push(g); if (g.box) boxes++; }
    var res = EO_CORE.analyze(glyphs, { scan: 240, zoneLo: st.zlo, zoneHi: st.zhi, depth: st.depth, mode: st.mode,
        target: st.target, strength: st.strength, anchor: st.anchor, clearance: st.clr ? st.clrv : -1 });
    res.boxes = boxes;
    return res;
}

function EO_report(res, st) {
    if (!res.ok) {
        if (res.error === "empty") return EO_fill(EO_T.errEmpty, { i: res.index + 1 });
        return EO_T[{ few: "errFew", flat: "errFlat", zone: "errZone" }[res.error] || "errFew"];
    }
    var u = st.unit, i, mW = 0;
    for (i = 0; i < res.pairs.length; i++) mW += res.pairs[i].white;
    mW /= res.pairs.length;
    var s = EO_fill(EO_T.summary, { n: res.G.length, p: res.pairs.length, m: EO_CORE.fmt(mW, u),
        b: Math.round(res.devBefore * 100), a: Math.round(res.devAfter * 100), w: EO_CORE.fmt(res.W, u),
        s: EO_CORE.fmt(res.maxShift, u), l0: EO_CORE.fmt(res.spanBefore, u), l1: EO_CORE.fmt(res.spanAfter, u) });
    var MAXL = 8;
    for (i = 0; i < res.pairs.length && i < MAXL; i++) {
        var q = res.pairs[i];
        s += "\n" + EO_fill(EO_T.pairLine, { i: i + 1, j: i + 2, e0: EO_CORE.fmt(q.white, u), e1: EO_CORE.fmt(q.newWhite, u),
            g0: EO_CORE.fmt(q.gap, u), g1: EO_CORE.fmt(q.newGap, u), x: q.limited ? EO_T.limited : "" });
    }
    if (res.pairs.length > MAXL) s += "\n" + EO_fill(EO_T.more, { n: res.pairs.length - MAXL });
    if (res.collisions) s += "\n" + EO_fill(EO_T.coll, { n: res.collisions });
    if (res.boxes) s += "\n" + EO_fill(EO_T.fallback, { n: res.boxes });
    if (res.flat) s += "\n" + EO_fill(EO_T.flat, { n: res.flat });
    return s;
}

/* Applique les déplacements / applies the shifts */
function EO_apply(items, res, st) {
    var i, errs = 0;
    for (i = 0; i < items.length; i++) {
        var d = res.shifts[i];
        if (Math.abs(d) < 1e-6) continue;
        try {
            if (st.vertical) items[i].translate(0, -d, true, true, true, true);
            else items[i].translate(d, 0, true, true, true, true);
        } catch (e) { errs++; }
    }
    return errs;
}

function EO_main() {
    if (app.documents.length === 0) { alert(EO_T.noDoc); return; }
    var doc = app.activeDocument;
    var tg = EO_targets(doc);
    if (tg.error) { alert(EO_T[tg.error]); return; }
    var items = tg.items, cfg = EO_loadCfg();

    var w = new Window("dialog", EO_T.title);
    w.orientation = "column"; w.alignChildren = "fill";

    var pD = w.add("panel", undefined, EO_T.dir); pD.orientation = "row";
    var rbH = pD.add("radiobutton", undefined, EO_T.dH), rbV = pD.add("radiobutton", undefined, EO_T.dV);
    if (cfg.dir === "v") rbV.value = true; else rbH.value = true;

    var pT = w.add("panel", undefined, EO_T.target); pT.alignChildren = "left";
    var rbK = pT.add("radiobutton", undefined, EO_T.mKeep);
    var gF = pT.add("group"), rbF = gF.add("radiobutton", undefined, EO_T.mFixed);
    var eT = gF.add("edittext", undefined, cfg.target); eT.characters = 6;
    var units = ["mm", "cm", "pt", "px", "in"], dU = gF.add("dropdownlist", undefined, units), u;
    dU.selection = 0; for (u = 0; u < units.length; u++) if (units[u] === cfg.unit) dU.selection = u;
    if (cfg.mode === "fixed") rbF.value = true; else rbK.value = true;
    // Boutons radio dans des groupes différents : exclusion manuelle / radios in different groups: manual exclusivity
    rbK.onClick = function () { rbF.value = false; }; rbF.onClick = function () { rbK.value = false; };
    var gA = pT.add("group"); gA.add("statictext", undefined, EO_T.anchor);
    var dA = gA.add("dropdownlist", undefined, [EO_T.aFirst, EO_T.aCenter, EO_T.aLast]);
    dA.selection = cfg.anchor === "center" ? 1 : (cfg.anchor === "last" ? 2 : 0);
    gA.add("statictext", undefined, "   " + EO_T.strength);
    var eS = gA.add("edittext", undefined, cfg.strength); eS.characters = 4; gA.add("statictext", undefined, "%");

    var pM = w.add("panel", undefined, EO_T.meas); pM.alignChildren = "left";
    var gZ = pM.add("group"); gZ.add("statictext", undefined, EO_T.zone);
    var eZ0 = gZ.add("edittext", undefined, cfg.zlo); eZ0.characters = 4;
    gZ.add("statictext", undefined, EO_T.zoneTo);
    var eZ1 = gZ.add("edittext", undefined, cfg.zhi); eZ1.characters = 4; gZ.add("statictext", undefined, "%");
    var gP = pM.add("group"); gP.add("statictext", undefined, EO_T.depth);
    var eP = gP.add("edittext", undefined, cfg.depth); eP.characters = 4; gP.add("statictext", undefined, "%");
    var cbW = pM.add("checkbox", undefined, EO_T.stroke); cbW.value = cfg.stroke === "1";
    var gC = pM.add("group"), cbC = gC.add("checkbox", undefined, EO_T.clear); cbC.value = cfg.clr === "1";
    var eC = gC.add("edittext", undefined, cfg.clrv); eC.characters = 5;
    var uLbl = gC.add("statictext", undefined, "mm"); uLbl.characters = 3;
    var cbM = pM.add("checkbox", undefined, EO_T.marks); cbM.value = cfg.marks === "1";
    dU.onChange = function () { uLbl.text = dU.selection ? dU.selection.text : "mm"; };
    dU.onChange();

    var info = w.add("statictext", undefined, EO_T.ready, { multiline: true }); info.preferredSize = [520, 170];
    var tip = w.add("statictext", undefined, EO_T.tip, { multiline: true }); tip.preferredSize = [520, 34];

    var bg = w.add("group"); bg.alignment = "right";
    var bA = bg.add("button", undefined, EO_T.analyze), bO = bg.add("button", undefined, EO_T.apply, { name: "ok" });
    var bX = bg.add("button", undefined, EO_T.erase), bC = bg.add("button", undefined, EO_T.cancel, { name: "cancel" });

    function num(e, label, lo, hi) {
        var v = parseFloat(String(e.text).replace(",", "."));
        if (isNaN(v) || v < lo || v > hi) { info.text = EO_fill(EO_T.bad, { f: label }); return null; }
        return v;
    }
    function readSt() {
        var unit = dU.selection ? dU.selection.text : "mm";
        var tgt = num(eT, EO_T.mFixed, -1e6, 1e6); if (tgt === null) return null;
        var str = num(eS, EO_T.strength, 0, 100); if (str === null) return null;
        var z0 = num(eZ0, EO_T.zone, 0, 100); if (z0 === null) return null;
        var z1 = num(eZ1, EO_T.zoneTo, 0, 100); if (z1 === null) return null;
        if (z1 <= z0) { info.text = EO_T.errZone; return null; }
        var dp = num(eP, EO_T.depth, 0, 100); if (dp === null) return null;
        var cv = num(eC, EO_T.clear, 0, 1e6); if (cv === null) return null;
        var st = { vertical: rbV.value, mode: rbF.value ? "fixed" : "keep", target: EO_CORE.toPt(tgt, unit), unit: unit,
            anchor: ["first", "center", "last"][dA.selection ? dA.selection.index : 0], strength: str / 100,
            zlo: z0 / 100, zhi: z1 / 100, depth: dp / 100, stroke: cbW.value, clr: cbC.value, clrv: EO_CORE.toPt(cv, unit), marks: cbM.value };
        st.cfg = { dir: st.vertical ? "v" : "h", mode: st.mode, target: String(tgt), unit: unit, anchor: st.anchor, strength: String(str),
            zlo: String(z0), zhi: String(z1), depth: String(dp), stroke: cbW.value ? "1" : "0", clr: cbC.value ? "1" : "0", clrv: String(cv), marks: cbM.value ? "1" : "0" };
        return st;
    }
    var chosen = null;
    bA.onClick = function () {
        var st = readSt(); if (!st) return;
        info.text = EO_T.working; w.update();
        try { info.text = EO_report(EO_measure(doc, items, st), st); } catch (e) { info.text = String(e); }
    };
    bO.onClick = function () { var st = readSt(); if (!st) return; chosen = st; w.close(1); };
    bX.onClick = function () { w.close(3); };
    var rc = w.show();

    if (rc === 3) { alert(EO_clear(doc) ? EO_T.erased : EO_T.noLayer); return; }
    if (rc !== 1 || !chosen) return;
    EO_saveCfg(chosen.cfg);
    var res = EO_measure(doc, items, chosen);
    if (!res.ok) { alert(EO_report(res, chosen)); return; }
    var errs = EO_apply(items, res, chosen);
    if (chosen.marks) EO_drawZones(doc, res, chosen, true);
    try { doc.selection = null; var i; for (i = 0; i < items.length; i++) items[i].selected = true; } catch (e) {}
    app.redraw();
    var msg = EO_fill(EO_T.done, { n: items.length }) + EO_report(res, chosen);
    if (errs) msg += "\n" + EO_fill(EO_T.moveErr, { n: errs });
    alert(msg);
}

if (typeof app !== "undefined" && typeof EO_NO_MAIN === "undefined") {
    try { EO_main(); } catch (err) { alert("EspacementOptique : " + err + (err.line ? " (ligne " + err.line + ")" : "")); }
}
