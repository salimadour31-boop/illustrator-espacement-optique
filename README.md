# Espacement optique des objets vectorisés — script Adobe Illustrator

**EspacementOptique.jsx** v1.0.0 — espace les lettres vectorisées d'un logo, des chiffres, des pictogrammes ou les éléments d'un lettrage selon le **blanc que l'œil perçoit** entre eux, et non selon leurs boîtes englobantes.
*Spaces outlined logo letters, figures, icons or lettering parts by the white space the eye perceives between them, not by their bounding boxes (FR/EN dialog).*

## Le problème

Dès qu'un texte est vectorisé (logo, lettrage, chiffres découpés, pictogrammes alignés), le crénage optique d'Illustrator ne s'applique plus. Objet > Répartition, l'espacement « répartir l'espacement » et les repères commentés mesurent les **boîtes englobantes** : un A à côté d'un V, un L avant un T ou un O entre deux I paraissent alors trop éloignés ou trop serrés, et il faut tout corriger à l'œil, lettre par lettre.

## Ce que fait le script

1. Il mesure le **profil réel** de chaque objet (courbes de Bézier comprises) sur des lignes de balayage, dans une **zone de hauteur** choisie (par exemple de la ligne de base à la hauteur d'x).
2. Il **limite la profondeur des creux** pris en compte (15 % de la zone par défaut) : l'œil ne « voit » pas tout l'intérieur d'un C, d'un T ou d'un L comme du blanc entre les lettres.
3. Il calcule la **surface blanche** entre chaque paire de voisins et déplace les objets pour qu'elle soit **la même partout**.

Options :

- direction **horizontale** (côte à côte) ou **verticale** (objets empilés) ;
- **égaliser en gardant la largeur totale** (premier et dernier objets en place), ou viser un **espace optique fixe** en mm, cm, pt, px ou pouces ;
- **point fixe** : premier objet, centre ou dernier objet ;
- **intensité** de 0 à 100 % (100 % = espacement optique complet, 50 % = à mi-chemin entre l'état actuel et l'espacement optique) ;
- zone mesurée en % de la hauteur de la sélection, profondeur des creux, prise en compte de l'épaisseur des contours ;
- **empêcher les contacts** avec une distance minimale (utile pour les paires très imbriquées comme AV, To, LT) ;
- **afficher les zones blanches mesurées** sur un calque non imprimable « Espacement optique (repères) ».

Le bouton **Analyser** affiche, sans rien modifier, l'irrégularité actuelle (écart maximal à la moyenne, en %), l'irrégularité après correction, l'espace visé, le plus grand déplacement et le détail par paire. **Espacer** applique les déplacements. **Effacer les repères** supprime le calque de repères.

Sélection : plusieurs objets, ou **un seul groupe** (par exemple un mot vectorisé) dont les éléments seront espacés. Groupez d'abord ce qui va ensemble (une lettre et son accent, le point du i s'il est séparé). Les groupes avec masque d'écrêtage sont mesurés par leur masque ; les textes vivants sont mesurés à travers une copie vectorisée temporaire, aussitôt supprimée ; les images, symboles et maillages sont mesurés par leur boîte (le rapport l'indique). Les réglages sont mémorisés dans un petit fichier local (dossier des données utilisateur).

## Pourquoi c'est nouveau

Vérifié le 16 octobre 2026 :

- **Illustrator** : le crénage optique ne fonctionne que sur du texte vivant ; après vectorisation, toutes les fonctions de répartition travaillent sur les boîtes englobantes. Aucune fonction native ne mesure le blanc perçu entre des formes.
- **Adobe Community** : les fils « Kerning of optical kerned text changes after converting it to Outlines » et « How to ACCURATELY distribute and align text?! » ne proposent que des solutions manuelles (déplacer chaque lettre à la flèche, garder une copie en texte vivant). Sur **Reddit**, la question « Can I change outlined text back into live text? » revient pour la même raison.
- **Outils d'espacement par surface** : ils existent pour les **éditeurs de fontes** (par exemple HT Letterspacer de Huerta Tipográfica pour Glyphs), pas pour Illustrator. Ce script reprend seulement le principe général (blanc mesuré par surface avec profondeur limitée) ; le code est entièrement original.
- **GitHub** : aucune recherche (« illustrator optical spacing », « letterspacer jsx illustrator ») ne donne de script Illustrator de ce type. Le plus proche, Text Rebuild Tools (Robin Frédéric), règle le crénage de **textes vivants**, pas l'espacement de formes vectorisées.
- Les recherches web et GitHub n'ont fait ressortir aucun script de ce type chez les auteurs connus (creold, Hiroyuki Sato, John Wundes, Alexander Ladygin, wckdtall, Kelso Cartography, vexy-illustrator-scripts) : on y trouve la répartition par boîtes ou par pas fixe, pas d'espacement optique de formes.

## Installation

- **Ponctuelle** : Fichier > Scripts > Autre script…, puis choisir `EspacementOptique.jsx`.
- **Permanente** : copier le fichier dans le dossier `Presets/<langue>/Scripts` d'Illustrator (par exemple `Adobe Illustrator 2026/Presets/fr_FR/Scripts`), puis redémarrer Illustrator. Le script apparaît dans Fichier > Scripts.

## Utilisation

1. Travaillez sur une **copie** de votre document.
2. Sélectionnez les lettres vectorisées (ou le groupe du mot), les chiffres ou les pictogrammes à espacer.
3. Lancez le script. Pour des minuscules, réglez par exemple la zone de 0 à 60-70 % pour mesurer surtout la hauteur d'x.
4. Cliquez sur **Analyser**, ajustez la profondeur (10 à 25 % selon le caractère du dessin) et l'intensité, puis cliquez sur **Espacer**.
5. Ctrl+Z / Cmd+Z annule l'espacement (en principe en une fois ; non vérifié dans Illustrator).

## Version cible et statut des tests

- Cible : Adobe Illustrator CC 2018 et plus récent (ExtendScript, Windows et macOS).
- **Non testé dans Illustrator.**
- Syntaxe vérifiée avec acorn en mode ES3.
- Géométrie vérifiée sur données simulées (`tests/test-core.js`, 38 tests : rectangles, V et A, profondeur comparée au calcul analytique, ré-analyse après application, espace fixe, points fixes, intensité, anti-contact sur A–V imbriqués, cercle de Bézier, épaisseur de contour, zone partielle, polygones des zones, 40 cercles).
- Sélection, collecte, déplacements et repères vérifiés sur objets Illustrator simulés (`tests/test-simulation.js`, 27 tests : groupe, horizontal et vertical, tracé composé, masque d'écrêtage, objet masqué, image, texte vectorisé temporairement, contours, objet verrouillé). Ces simulations ne remplacent pas un essai réel.

Limites : c'est un espacement optique **approché** ; l'œil reste juge, réglez l'intensité et la profondeur au cas par cas. Les effets dynamiques (décalage, contour variable) ne sont pas pris en compte tant qu'ils ne sont pas développés. Les objets sont triés par la position de leur centre ; deux objets presque superposés doivent être groupés.

Aucun appel réseau, aucune collecte de données.

## Licence

MIT © 2026 Amirouche Amwanes — voir [LICENSE](LICENSE).
