# RunQuest — v0.1

Un RPG pixel art qui avance avec tes courses : chaque km te rapproche du prochain boss,
et tout ce que tu as couru sur le chemin te donne des bonus pour le combat (un clicker de 30 s).

## Lancer le jeu

```bash
cd runquest
pip install -r requirements.txt
python app.py
```

- Sur le PC : http://localhost:5000
- Sur ton téléphone (même Wi-Fi) : http://<IP-du-PC>:5000 (ex. `ipconfig` / `ip a` pour trouver l'IP).
  Dans Chrome Android : menu ⋮ → « Ajouter à l'écran d'accueil » pour l'avoir comme une appli.

Ta progression est enregistrée dans `data/save.json`.

## Ajouter des courses

1. **Fichiers Coros** : dans l'appli Coros, ouvre une activité → partager → exporter en `.fit`
   (ou depuis Training Hub sur ordinateur). Formats acceptés : `.fit`, `.gpx`, `.tcx`, plusieurs à la fois.
2. **Strava** (Coros peut synchroniser automatiquement vers Strava) :
   - crée une appli sur https://www.strava.com/settings/api
     (« Authorization Callback Domain » : `localhost`) ;
   - copie `config.example.json` dans `data/config.json` et remplis `strava_client_id` et `strava_client_secret` ;
   - relance le serveur, puis onglet **Courses → Connecter Strava** (depuis le PC, via http://localhost:5000).
3. **Saisie manuelle** ou **courses de démo** pour tester.

Les courses datées d'avant le début de l'aventure (import d'historique) font monter ton niveau et
tes stats, mais n'avancent pas sur la carte : sinon tout l'historique ferait sauter les zones.

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

- `game.py` : toute la logique (stats, zones, butin, combat). Les formules sont là pour l'équilibrage.
- `importers.py` : lecture des fichiers FIT / GPX / TCX.
- `strava.py` : OAuth + récupération des activités.
- `app.py` : serveur Flask et API JSON.
- `static/` : interface (pixel art dessiné en code dans `sprites.js`, combat dans `app.js`).
