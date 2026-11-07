# Disgrâce

**Au salon de la Duchesse, six Maisons se disputent sa faveur. Pousse tes alliées à la lumière, jette tes rivales dans l'ombre.**

👉 **Jouer : pas encore en ligne** (adresse à venir)

Jeu de cartes multijoueur en ligne, de 2 à 5 joueurs (bots possibles), à jouer entre amis depuis un navigateur, sur téléphone ou ordinateur, sans compte ni installation.
Inspiré d'un jeu de cartes de cour (création de fans, non officielle) : le nom, les six Maisons, les rôles, les desseins secrets, les dessins et tout l'univers visuel sont propres à ce jeu.

## Règles en bref

- **90 cartes** : six Maisons (Parfumeurs, Verriers, Horlogers, Soyeux, Confiseurs, Cartographes), 15 cartes chacune.
  Dans chaque Maison : 4 Membres, 4 Éminences (comptent double), 2 Incognitos (se posent face cachée), 2 Vipères (chassent une carte), 3 Intouchables (une Vipère ne peut pas les chasser).
- Avant la partie, des cartes sont retirées sans être vues : 30 à deux, 18 à trois, 6 à quatre, aucune à cinq.
- Chacun a **3 cartes en main**. À son tour, on les pose toutes les trois, dans l'ordre qu'on veut :
  - **une au salon**, dans la colonne de sa Maison : **à la lumière** (la Maison gagne en estime) ou **dans l'ombre** (elle en perd) ;
  - **une chez soi**, dans son domaine ;
  - **une chez un rival**, dans son domaine.
  Puis on reprend trois cartes de la pioche.
- Un **Incognito** se pose face cachée : au salon, il va dans la loge de la Duchesse, sans dire sa Maison ; dans un domaine, il reste caché. Tout se dévoile à la fin.
- Une **Vipère** peut chasser n'importe quelle carte de l'endroit où on la pose (salon ou domaine), sauf un Intouchable. La carte chassée quitte la partie.
- **Fin** : quand la pioche et les mains sont vides. La Duchesse juge chaque Maison : plus de poids à la lumière qu'à l'ombre, elle est **en grâce** ; l'inverse, **en disgrâce** ; à égalité, **neutre**. Une Éminence pèse deux.
- **Points** : chaque carte de son domaine rapporte son poids si sa Maison est en grâce, le retire si elle est en disgrâce, rien si elle est neutre.
- **Desseins secrets** (réglage de l'hôte : deux, un ou aucun) : un petit dessein (+3) et un grand (+5), gardés secrets jusqu'à la fin.
  Ils sont de notre cru, pas ceux du jeu édité, qu'on n'a pas recopiés : faire tomber une Maison, en porter une en grâce, avoir cinq Maisons chez soi, trois Éminences, deux Intouchables (petits) ; une Maison en grâce et une autre en disgrâce, trois Maisons en grâce chez soi, aucune carte en disgrâce chez soi, le plus grand domaine, deux Maisons neutres, cinq cartes d'une même Maison (grands).
- Le meilleur score gagne ; à égalité, la victoire est partagée.

Pas d'aide au calcul : on voit le salon, les domaines et le nombre de cartes de la pioche, comme autour d'une vraie table, mais jamais l'état d'une Maison ni un score avant le dévoilement.

## Les bots

Ils ne voient que ce qu'un joueur voit : leur main, leurs desseins, le salon et les domaines, Incognitos compris (face cachée). Ils se souviennent des Incognitos qu'ils ont posés eux-mêmes, et en oublient parfois. À chaque carte, un bot envisage tous ses plans pour les cartes qu'il lui reste (ordre, endroit, côté, rival, proie de la Vipère), estime où va chaque Maison et ce que valent les domaines et les desseins, et choisit ce qui l'avance le plus face au meilleur de ses rivaux. Trois niveaux, novice, habile et retors, qui se trompent plus ou moins souvent.

Mesures sur 300 parties par ligne (`npx tsx test/sim.ts 300`) :

- contre un joueur qui pose au hasard, à deux, chaque niveau gagne de 99 à 100 % des parties, avec 17 à 25 points d'écart ;
- entre niveaux, à deux : habile bat novice 68 % des fois, retors bat habile 58 %, retors bat novice 77 % ;
- tables mêlées : le gagnant finit autour de 9 points à deux et de 12 à cinq ; un peu plus de la moitié des desseins sont remplis ; un bot réfléchit 2 à 6 ms par carte.

## Fonctionnalités

- Tables privées avec code à 4 lettres, lien d'invitation, partage natif et QR code
- Partie contre 1 à 4 bots en un clic
- Deux touches par carte : une carte de sa main, puis l'endroit qui s'allume (le haut ou le bas de sa colonne, son domaine, celui d'un rival) ; une Vipère propose ensuite ses proies
- Le salon en un coup d'œil : la lumière du lustre au-dessus de la table dorée, l'ombre bleue en dessous, la loge de la Duchesse au centre
- La chronique dit chaque carte posée et chaque carte chassée ; les trois endroits du tour se cochent dans la barre du haut
- Fin en scène : les Incognitos se retournent, le cachet de cire tombe sur chaque Maison, puis le décompte de chacun, desseins dévoilés, et le tampon du gagnant
- Chronos réglables (45, 75, 120 secondes ou sans limite) ; au bout du temps, les cartes partent d'office
- Victoires de la soirée, revanche en un clic
- Réactions, règles consultables en jeu
- Reprise automatique après une coupure, pilote automatique après 20 s d'absence, spectateurs, l'hôte qui part passe la main
- Sons synthétisés et vibrations, animations réduites si le système le demande

## Développement

```bash
npm install
npm run dev:server   # serveur temps réel sur http://localhost:3310
npm run dev:client   # interface sur http://localhost:5210
npm test             # paquet, retraits, pose, Vipère, Incognito, points, desseins, bots
npm run build && npm run e2e   # parties complètes avec de vrais clients connectés
npx tsx test/sim.ts 300        # force des bots
```

`DG_FAST=1` accélère les bots et les chronos (tests locaux uniquement).

## Architecture

- `shared/` : contrat client/serveur et constantes
- `server/` : Express + Socket.IO, moteur de partie (`game.ts`), bots (`bots.ts`), table et minuteries (`room.ts`). Le serveur fait autorité : chacun ne reçoit que sa main et ses desseins, jamais la pioche ni la Maison d'un Incognito posé, et les numéros de cartes changent à chaque partie
- `client/` : React + Vite + Framer Motion. Le salon et les domaines sont dans `components/Salon.tsx`, les cartes dans `components/Ui.tsx`, la table dans `screens/Table.tsx`, le dévoilement dans `screens/Final.tsx`
- Déploiement : un seul service Node (`npm ci && npm run build`, puis `npm start`)
