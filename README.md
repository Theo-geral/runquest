# RunQuest

Un RPG pixel art qui avance avec tes courses : chaque km te rapproche du prochain boss,
et tout ce que tu as couru sur le chemin te donne des bonus pour le combat (un clicker de 30 s).

**Jouer : https://theo-geral.github.io/runquest/**

C'est une page web statique (HTML/CSS/JS, sans serveur) hébergée par GitHub Pages.
Sur Android : ouvre le lien dans Chrome → menu ⋮ → « Ajouter à l'écran d'accueil ».

## Ajouter des courses

- **Fichiers Coros** : dans l'appli Coros, ouvre une activité → partager → exporter en `.fit`
  (ou depuis Training Hub sur ordinateur). Formats acceptés : `.fit`, `.gpx`, `.tcx`, plusieurs à la fois.
- **Saisie manuelle**, ou **courses de démo** pour tester.

Les courses datées d'avant le début de l'aventure (import d'historique) font monter ton niveau et
tes stats, mais n'avancent pas sur la carte : sinon tout l'historique ferait sauter les zones.

## Sauvegarde

La progression est stockée dans le navigateur (localStorage) : elle reste d'une visite à l'autre,
mais elle est propre à chaque appareil et disparaît si tu effaces les données du site.
Onglet **Courses → Exporter ma sauvegarde** pour en garder une copie ou la transférer sur un autre appareil.

## Règles du jeu

| Ce que tu cours | Ce que ça donne |
|---|---|
| Chaque km | +100 XP, avance sur la carte, 1 potion tous les 5 km (5 max par combat) |
| Chaque mètre de D+ | +2 XP, armure permanente |
| Course plus rapide que ton allure habituelle (−3 %) | Force permanente + **Rage** (+8 % dégâts pour le prochain boss) |
| Sortie longue (≥ 10 km et ≥ 1,4× ta distance habituelle) | PV permanents + **Bouclier** pour le prochain boss |
| Course vallonnée (≥ 15 m D+/km) | Armure bonus pour le prochain boss |
| Course de nuit / à l'aube | Critique bonus pour le prochain boss |
| Semaines consécutives avec ≥ 2 sorties | Critique permanent et charge du coup spécial plus rapide |
| Km au-delà de la distance demandée | **Km bonus** : +2 % dégâts par km (max +50 %), 50 % reportés à la zone suivante |

**Combat** : 30 s pour vaincre le boss en tapant dessus. Il attaque à intervalle régulier et
enrage (dégâts ×2) après 20 s. Potion = +35 % PV. Le coup de grâce se charge en frappant (20× tes dégâts).
Sur PC : espace = frapper, S = coup spécial, P = potion.
Défaite : tu gardes ton butin de route (sauf les potions bues) et tu peux réessayer.

## Structure

- `index.html`, `css/style.css` : interface.
- `js/game.js` : toute la logique (stats, zones, butin, combat) ; les formules d'équilibrage sont là.
- `js/importers.js` : lecture des fichiers FIT (lecteur maison), GPX et TCX.
- `js/sprites.js` : pixel art dessiné en code (palette Sweetie 16).
- `js/app.js` : rendu, carte et combat.

Pour tester en local : `python -m http.server` dans le dossier, puis http://localhost:8000.
