// Simulation des objets Illustrator (sélection, collecte, déplacement, repères) — ne remplace pas un essai réel.
// Simulated Illustrator objects (selection, collection, moves, markers) — not a substitute for a real test.
var fs = require("fs"), vm = require("vm"), path = require("path");
var src = fs.readFileSync(path.join(__dirname, "..", "EspacementOptique.jsx"), "utf8");
var pass = 0, fail = 0;
function ok(n, c, e) { if (c) { pass++; console.log("ok   " + n); } else { fail++; console.log("FAIL " + n + (e !== undefined ? " -> " + e : "")); } }
function near(a, b, t) { return Math.abs(a - b) <= (t || 1e-6); }
function bounds(pts) {
    var xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
    return [Math.min.apply(null, xs), Math.max.apply(null, ys), Math.max.apply(null, xs), Math.min.apply(null, ys)];
}
function mkPath(pts, o) {
    o = o || {};
    var it = { typename: "PathItem", closed: o.closed !== false, filled: o.filled !== false, stroked: !!o.sw, strokeWidth: o.sw || 0,
        guides: false, clipping: !!o.clip, hidden: !!o.hidden, moves: [] };
    it.pathPoints = pts.map(function (p) { return { anchor: p.slice(), leftDirection: p.slice(), rightDirection: p.slice() }; });
    it.translate = function (dx, dy) { it.moves.push([dx, dy]); it.pathPoints.forEach(function (pp) { [pp.anchor, pp.leftDirection, pp.rightDirection].forEach(function (a) { a[0] += dx; a[1] += dy; }); }); };
    Object.defineProperty(it, "geometricBounds", { get: function () { return bounds(it.pathPoints.map(function (p) { return p.anchor; })); } });
    return it;
}
function rect(x, y, w, h) { return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]; }
function mkGroup(children, o) {
    o = o || {};
    var g = { typename: "GroupItem", pageItems: children, clipped: !!o.clipped, hidden: false, moves: [] };
    g.translate = function (dx, dy) { g.moves.push([dx, dy]); children.forEach(function (c) { c.translate(dx, dy); }); };
    return g;
}
var layers = [];
layers.add = function () {
    var L = { name: "", printable: true, locked: false, visible: true, items: [], zOrder: function () {}, remove: function () { layers.splice(layers.indexOf(L), 1); } };
    L.pathItems = { add: function () { var p = { setEntirePath: function (a) { p.pts = a; } }; L.items.push(p); return p; } };
    layers.unshift(L); return L;
};
var doc = { layers: layers, selection: [], documentColorSpace: "RGB" };
var ctx = { Math: Math, String: String, Number: Number, Infinity: Infinity, isNaN: isNaN, parseFloat: parseFloat, EO_NO_MAIN: true,
    $: { locale: "fr_FR" }, app: { locale: "fr_FR" }, DocumentColorSpace: { CMYK: "CMYK" }, ZOrderMethod: { BRINGTOFRONT: 1 },
    RGBColor: function () {}, CMYKColor: function () {} };
vm.createContext(ctx); vm.runInContext(src, ctx);
ok("dialogue en français", ctx.EO_T.apply === "Espacer");

var st = { vertical: false, mode: "keep", target: 0, unit: "pt", anchor: "first", strength: 1, zlo: 0, zhi: 1, depth: 0.15, stroke: true, clr: false, clrv: 0, marks: true };

// Sélection / selection
doc.selection = { typename: "TextRange" };
ok("édition de texte refusée", ctx.EO_targets(doc).error === "textEdit");
doc.selection = [{ typename: "TextFrame" }];
ok("un seul texte : message dédié", ctx.EO_targets(doc).error === "oneText");
doc.selection = [mkPath(rect(0, 0, 10, 10))];
ok("un seul objet : refusé", ctx.EO_targets(doc).error === "noSel");
var letters = [mkPath(rect(0, 0, 10, 100)), mkPath(rect(20, 0, 10, 100)), mkPath(rect(50, 0, 10, 100))];
var word = mkGroup(letters);
doc.selection = [word];
var tg = ctx.EO_targets(doc);
ok("un groupe : ses éléments sont espacés", tg.items && tg.items.length === 3);

// Mesure + application horizontale / horizontal measure + apply
var res = ctx.EO_measure(doc, tg.items, st);
ok("mesure ok", res.ok && res.pairs.length === 2);
var errs = ctx.EO_apply(tg.items, res, st);
ok("aucune erreur de déplacement", errs === 0);
ok("lettre 2 déplacée de +5", letters[1].moves.length === 1 && near(letters[1].moves[0][0], 5) && letters[1].moves[0][1] === 0);
ok("lettres 1 et 3 immobiles", letters[0].moves.length === 0 && letters[2].moves.length === 0);

// Repères / markers
var n = ctx.EO_drawZones(doc, res, st, true);
ok("repères: 2 zones sur calque non imprimable", n === 2 && layers[0].name === ctx.EO_LAYER && layers[0].printable === false);
ok("repères: zone 1 entre x=10 et x=25", layers[0].items[0].pts.every(function (p) { return p[0] >= 10 - 1e-6 && p[0] <= 25 + 1e-6; }));
ctx.EO_drawZones(doc, res, st, true);
ok("repères: remplacés, pas empilés", layers.filter(function (L) { return L.name === ctx.EO_LAYER; }).length === 1);
ok("effacer les repères", ctx.EO_clear(doc) === true && layers.length === 0 && ctx.EO_clear(doc) === false);

// Vertical : objets empilés / vertical: stacked objects
var stack = [mkPath(rect(0, 100, 50, 10)), mkPath(rect(0, 80, 50, 10)), mkPath(rect(0, 40, 50, 10))]; // tops 110, 90, 50
var stV = Object.assign({}, st, { vertical: true });
var rv = ctx.EO_measure(doc, stack, stV);
ok("vertical: ordre de haut en bas", rv.ok && rv.order.join(",") === "0,1,2", rv.order);
ctx.EO_apply(stack, rv, stV);
ok("vertical: objet du milieu descendu de 10", stack[1].moves.length === 1 && stack[1].moves[0][0] === 0 && near(stack[1].moves[0][1], -10), JSON.stringify(stack[1].moves));
var gb = stack.map(function (s) { return s.geometricBounds; });
ok("vertical: espaces égaux (20 et 20)", near(gb[0][3] - gb[1][1], 20) && near(gb[1][3] - gb[2][1], 20));

// Types d'objets / object kinds
var cp = { typename: "CompoundPathItem", hidden: false, pathItems: [mkPath(rect(200, 0, 4, 100)), mkPath(rect(210, 0, 4, 100))] };
var clipG = mkGroup([mkPath(rect(300, 0, 20, 100), { clip: true, filled: false }), mkPath(rect(250, -50, 200, 300))], { clipped: true });
var hiddenG = mkGroup([mkPath(rect(400, 0, 10, 100)), mkPath(rect(0, 0, 900, 100), { hidden: true })]);
var placed = { typename: "PlacedItem", hidden: false, geometricBounds: [500, 100, 520, 0], visibleBounds: [500, 100, 520, 0] };
var removed = [];
var text = { typename: "TextFrame", hidden: false, duplicate: function () {
    var d = { remove: function () { removed.push("dup"); }, createOutline: function () { var g = mkGroup([mkPath(rect(600, 0, 8, 100))]); g.remove = function () { removed.push("outline"); }; return g; } };
    return d; } };
var gl = ctx.EO_glyph(cp, st), b;
ok("tracé composé: deux sous-tracés", gl.edges.length === 8 && !gl.box);
gl = ctx.EO_glyph(clipG, st);
b = gl.edges.reduce(function (m, e) { return [Math.min(m[0], e[0]), Math.max(m[1], e[0])]; }, [Infinity, -Infinity]);
ok("groupe masqué: seul le masque compte (300–320)", near(b[0], 300) && near(b[1], 320), b);
gl = ctx.EO_glyph(hiddenG, st);
b = gl.edges.reduce(function (m, e) { return [Math.min(m[0], e[0]), Math.max(m[1], e[0])]; }, [Infinity, -Infinity]);
ok("objet masqué ignoré", near(b[0], 400) && near(b[1], 410), b);
gl = ctx.EO_glyph(placed, st);
ok("image: mesurée par sa boîte", gl.box && gl.edges.length === 4);
gl = ctx.EO_glyph(text, st);
ok("texte: copie vectorisée mesurée puis supprimée", gl.edges.length === 4 && !gl.box && removed.join(",") === "outline", removed);
var sw = mkPath(rect(700, 0, 10, 100), { sw: 4 });
gl = ctx.EO_glyph(sw, st);
ok("contour: demi-épaisseur 2 ajoutée", gl.edges.every(function (e) { return e[4] === 2; }));
gl = ctx.EO_glyph(sw, Object.assign({}, st, { stroke: false }));
ok("contour ignoré sur demande", gl.edges.every(function (e) { return e[4] === 0; }));
var nopaint = mkPath(rect(0, 0, 5, 5), { filled: false });
ok("tracé sans fond ni contour ignoré", ctx.EO_glyph(nopaint, st).edges.length === 0);

// Rapport / report
var rep = ctx.EO_report(res, st);
ok("rapport: résumé et lignes par espace", rep.indexOf("3 objets, 2 espace(s)") === 0 && rep.indexOf("1–2 : blanc") > 0, rep);
ok("rapport d'erreur: objet vide", ctx.EO_report({ ok: false, error: "empty", index: 1 }, st).indexOf("n° 2") > 0);

// Objet verrouillé : erreur comptée / locked object: error counted
var lockedP = mkPath(rect(800, 0, 10, 100)); lockedP.translate = function () { throw new Error("locked"); };
var two = [mkPath(rect(760, 0, 10, 100)), lockedP];
var r2 = ctx.EO_measure(doc, two, Object.assign({}, st, { mode: "fixed", target: 5, anchor: "first" }));
ok("verrouillé: erreur comptée", ctx.EO_apply(two, r2, st) === 1);

console.log("\n" + pass + " réussis, " + fail + " échoués");
process.exit(fail ? 1 : 0);
