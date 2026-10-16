// Tests du cœur géométrique sur données simulées — ne remplace pas un essai dans Illustrator.
// Geometry core tests on simulated data — not a substitute for a real Illustrator test.
var fs = require("fs"), vm = require("vm"), path = require("path");
var src = fs.readFileSync(path.join(__dirname, "..", "EspacementOptique.jsx"), "utf8");
var ctx = { Math: Math, String: String, Number: Number, Infinity: Infinity, isNaN: isNaN, parseFloat: parseFloat, EO_NO_MAIN: true };
vm.createContext(ctx); vm.runInContext(src, ctx);
var C = ctx.EO_CORE, pass = 0, fail = 0;
function ok(n, c, e) { if (c) { pass++; console.log("ok   " + n); } else { fail++; console.log("FAIL " + n + (e !== undefined ? " -> " + e : "")); } }
function near(a, b, t) { return Math.abs(a - b) <= (t || 1e-6); }
function P(pts) { return pts.map(function (p) { return [p[0], p[1], p[0], p[1], p[0], p[1]]; }); }
function glyph(polys, h) {
    var e = [];
    polys.forEach(function (pl) { C.addEdges(e, C.flatten(P(pl), true, 0.25), true, h || 0); });
    return { edges: e };
}
function rect(x, y, w, h) { return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]; }
function V(x, w, h) { return [[x, h], [x + w, h], [x + w / 2, 0]]; }          // triangle pointe en bas
function A(x, w, h) { return [[x, 0], [x + w, 0], [x + w / 2, h]]; }          // triangle pointe en haut
function shifted(g, d) { return { edges: g.edges.map(function (e) { return [e[0] + d, e[1], e[2] + d, e[3], e[4]]; }) }; }
function applyAll(gs, res) { return gs.map(function (g, i) { return shifted(g, res.shifts[i]); }); }
var base = { scan: 400, zoneLo: 0, zoneHi: 1, depth: 0.15, mode: "keep", strength: 1, anchor: "first", clearance: -1 };
function o(x) { var r = {}, k; for (k in base) r[k] = base[k]; for (k in x) r[k] = x[k]; return r; }

// 1. Rectangles : blanc = écart des bords / rectangles: white = edge gap
var g3 = [glyph([rect(0, 0, 10, 100)]), glyph([rect(20, 0, 10, 100)]), glyph([rect(50, 0, 10, 100)])];
var r = C.analyze(g3, o({}));
ok("rects: 2 espaces", r.ok && r.pairs.length === 2);
ok("rects: blanc = écart (10 et 20)", near(r.pairs[0].white, 10, 1e-6) && near(r.pairs[1].white, 20, 1e-6), r.pairs.map(function (p) { return p.white; }));
ok("rects: égalisés à 15", near(r.pairs[0].newGap, 15) && near(r.pairs[1].newGap, 15));
ok("rects: premier fixe", near(r.shifts[0], 0));
ok("rects: largeur totale conservée", near(r.shifts[2], 0) && near(r.spanAfter, r.spanBefore));
ok("rects: irrégularité avant 33 %, après 0", near(r.devBefore, 1 / 3, 1e-6) && near(r.devAfter, 0, 1e-9));

// 2. Ordre indépendant de la sélection / order independent of selection order
var rs = C.analyze([g3[2], g3[0], g3[1]], o({}));
ok("ordre: trié par position", rs.order.join(",") === "1,2,0" && near(rs.shifts[2], 5), rs.order + " " + rs.shifts);

// 3. Profondeur d'un V (calcul analytique 9,375 pour D = 15 %) / V depth vs analytic value
var gv = [glyph([rect(0, 0, 10, 100)]), glyph([V(20, 40, 100)])];
var rv = C.analyze(gv, o({}));
ok("V: profondeur gauche moyenne ≈ 9,375", near(rv.G[1].meanL, 9.375, 0.05), rv.G[1].meanL);
ok("V: profondeur droite du rectangle = 0", near(rv.G[0].meanR, 0));
ok("V: blanc = 10 + 9,375", near(rv.pairs[0].white, 19.375, 0.05), rv.pairs[0].white);

// 4. Profondeur 0 = boîtes ; 100 % = surface complète / depth 0 = boxes, 100% = whole area
var rv0 = C.analyze(gv, o({ depth: 0 }));
ok("profondeur 0 : blanc = écart des boîtes", near(rv0.pairs[0].white, 10, 0.05), rv0.pairs[0].white);
var rv1 = C.analyze(gv, o({ depth: 1 }));
ok("profondeur 100 % : creux complet du V (10 de moyenne)", near(rv1.G[1].meanL, 10, 0.05), rv1.G[1].meanL);

// 5. Après application, ré-analyse : tous les blancs égaux / re-analysis after applying: all whites equal
var gm = [glyph([rect(0, 0, 10, 100)]), glyph([V(25, 40, 100)]), glyph([A(70, 40, 100)]), glyph([rect(130, 0, 12, 100)]), glyph([V(150, 30, 100)])];
var rm = C.analyze(gm, o({}));
var rm2 = C.analyze(applyAll(gm, rm), o({}));
var whites = rm2.pairs.map(function (p) { return p.white; });
ok("mélange: blancs égaux après application", rm2.devAfter < 1e-6 && rm2.devBefore < 0.01, whites);
ok("mélange: blanc moyen conservé", near(rm2.W, rm.W, 0.01), rm2.W + " / " + rm.W);
ok("mélange: largeur totale conservée", near(rm2.spanBefore, rm.spanBefore, 0.01));
ok("mélange: idempotent (2e passe ≈ 0)", rm2.maxShift < 0.01, rm2.maxShift);

// 6. Espace fixe / fixed space
var rf = C.analyze(gm, o({ mode: "fixed", target: 12 }));
var rf2 = C.analyze(applyAll(gm, rf), o({}));
ok("fixe: chaque blanc = 12", rf2.pairs.every(function (p) { return near(p.white, 12, 0.02); }), rf2.pairs.map(function (p) { return p.white; }));
ok("fixe: premier objet immobile", near(rf.shifts[0], 0));

// 7. Point fixe dernier / centre / last and center anchors
var rl = C.analyze(gm, o({ mode: "fixed", target: 12, anchor: "last" }));
ok("ancre dernier: dernier immobile", near(rl.shifts[4], 0, 1e-9));
var rc = C.analyze(gm, o({ mode: "fixed", target: 12, anchor: "center" }));
var gc = applyAll(gm, rc), b0 = C.analyze(gm, o({})), b1 = C.analyze(gc, o({}));
var c0 = (b0.G[b0.order[0]].minL + b0.G[b0.order[4]].maxR) / 2, c1 = (b1.G[b1.order[0]].minL + b1.G[b1.order[4]].maxR) / 2;
ok("ancre centre: centre conservé", near(c0, c1, 1e-6), c0 + " / " + c1);

// 8. Intensité 50 % / strength 50%
var rh = C.analyze(g3, o({ strength: 0.5 }));
ok("intensité 50 %: à mi-chemin (12,5 et 17,5)", near(rh.pairs[0].newGap, 12.5) && near(rh.pairs[1].newGap, 17.5));
var rz = C.analyze(g3, o({ strength: 0 }));
ok("intensité 0 : rien ne bouge", rz.maxShift < 1e-9);

// 9. Anti-contact : A et V imbriqués / contact prevention with interlocking A and V
var av = [glyph([A(0, 40, 100)]), glyph([V(45, 40, 100)])];
var rav = C.analyze(av, o({ mode: "fixed", target: -30, clearance: 2 }));
ok("contact: espace limité signalé", rav.collisions === 1 && rav.pairs[0].limited);
var gav = applyAll(av, rav), pa = C.profile(gav[0].edges, -1, 102 / 2000, 2000), pb = C.profile(gav[1].edges, -1, 102 / 2000, 2000), mind = Infinity, k;
for (k = 0; k < 2000; k++) if (pa.R[k] !== null && pb.L[k] !== null) mind = Math.min(mind, pb.L[k] - pa.R[k]);
ok("contact: distance réelle ≥ 2 (à la précision du balayage)", mind >= 2 - 0.3, mind);
var rav2 = C.analyze(av, o({ mode: "fixed", target: -30, clearance: -1 }));
ok("contact désactivé: chevauchement possible", rav2.collisions === 0 && rav2.pairs[0].newGap < -20);

// 10. Courbes de Bézier : cercle de rayon 50 / Bézier circle radius 50
var K = 0.5522847498 * 50;
var circ = [[0, 50, -K, 50, K, 50], [50, 0, 50, K, 50, -K], [0, -50, K, -50, -K, -50], [-50, 0, -50, -K, -50, K]];
// sens horaire : poignée gauche = côté précédent / clockwise order
var ce = []; C.addEdges(ce, C.flatten(circ, true, 0.25), true, 0);
var pc = C.profile(ce, -50, 1, 100);
ok("cercle: extrêmes ±50", near(Math.min.apply(null, pc.L.filter(function (x) { return x !== null; })), -50, 0.05) &&
   near(Math.max.apply(null, pc.R.filter(function (x) { return x !== null; })), 50, 0.05));
var y = -50 + 80.5, exp = Math.sqrt(2500 - 30.5 * 30.5);
ok("cercle: profil à y=30,5 ≈ ±39,6", near(pc.R[80], exp, 0.05) && near(pc.L[80], -exp, 0.05), pc.R[80] + " vs " + exp);

// 11. Épaisseur de contour / stroke width
var gs = [glyph([rect(0, 0, 10, 100)], 2), glyph([rect(20, 0, 10, 100)], 2)];
var rst = C.analyze(gs, o({}));
ok("contour 4 pt: écart réduit de 4", near(rst.pairs[0].gap, 6, 1e-6), rst.pairs[0].gap);

// 12. Zone partielle : point hors zone mesuré à plat / band subset, object outside band measured flat
var gz = [glyph([rect(0, 0, 10, 100)]), glyph([rect(20, 90, 5, 10)]), glyph([rect(40, 0, 10, 100)])];
var rzn = C.analyze(gz, o({ zoneLo: 0, zoneHi: 0.5 }));
ok("zone: objet sans encre dans la zone compté à plat", rzn.ok && rzn.flat === 1 && rzn.G[1].flat);
var bad = C.analyze(gz, o({ zoneLo: 0.5, zoneHi: 0.5 }));
ok("zone vide: erreur", !bad.ok && bad.error === "zone");

// 13. Erreurs / errors
ok("un seul objet: erreur", !C.analyze([g3[0]], o({})).ok);
ok("objet vide: erreur avec index", C.analyze([g3[0], { edges: [] }], o({})).index === 1);

// 14. Polygones des zones blanches / white zone polygons
var poly = C.whitePolys(rv, false);
ok("zones: un polygone par espace", poly.length === 1 && poly[0].length === 2 * rv.zone.length);
var inside = poly[0].every(function (p) { return p[0] >= 10 - 1e-6 && p[0] <= 20 + 15 + 0.1; });
ok("zones: bornées par les formes et la profondeur", inside);
var polyA = C.whitePolys(rm, true);
ok("zones après: décalées avec les objets", near(polyA[0][0][0], rm.G[rm.pairs[0].a].maxR - rm.G[rm.pairs[0].a].dr[0] + rm.shifts[rm.pairs[0].a]));

// 15. Unités / units
ok("unités: 1 mm", near(C.toPt(1, "mm"), 2.834645669, 1e-6) && C.fmt(C.toPt(2.5, "mm"), "mm") === "2.5 mm");
ok("unités: négatif conservé", C.fmt(-3, "pt") === "-3 pt");

// 16. Performance : 40 cercles / performance: 40 circles
var many = [], t0 = Date.now(), i;
for (i = 0; i < 40; i++) { var e = []; C.addEdges(e, C.flatten(circ.map(function (p) { return [p[0] + i * 120, p[1], p[2] + i * 120, p[3], p[4] + i * 120, p[5]]; }), true, 0.25), true, 0); many.push({ edges: e }); }
var rp = C.analyze(many, o({ scan: 240 }));
ok("performance: 40 cercles analysés", rp.ok && rp.pairs.length === 39 && (Date.now() - t0) < 3000, (Date.now() - t0) + " ms");

console.log("\n" + pass + " réussis, " + fail + " échoués");
process.exit(fail ? 1 : 0);
