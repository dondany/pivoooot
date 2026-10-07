# PIVOOOOT!

A two-player online co-op game about carrying a couch. Two floppy beans each hold one end; the
couch is rigid, the corners are tight, and somebody is going to yell "PIVOT!".

Plain three.js and ES modules: no build step, no install. Online play is peer to peer (WebRTC via
[PeerJS](https://peerjs.com)), so the game is a static site and needs no server of its own.

## Play

```sh
tools/serve.sh        # http://localhost:8770/   (any static file server works)
```

- **Host a game** gives you a four-letter room code and an invite link. Your friend opens the link
  (or types the code under **Join**) on the same site, and you pick a level.
- **Two players, one keyboard** needs no network.

Both players have to load the game from the same address. For a friend who is not on your network,
put the folder on any static host (GitHub Pages works).

| | Online | Same keyboard, bean one | Same keyboard, bean two |
|---|---|---|---|
| Move | `WASD` or arrows | `WASD` | arrows |
| Jump | `Space` | `Space` | `Enter` |
| Lift the couch | hold `E` (or `Shift`) | hold `E` | hold `.` |
| Lower it and duck | hold `Q` (or `C`) | hold `Q` | hold `,` |
| "PIVOT!" | `F` | `F` | `M` |
| "SHUT UP!" | `G` | `G` | `N` |

`R` goes back to the last checkpoint, `Esc` opens the menu. Touch screens get a stick and buttons.

## How it works

- You are joined by the couch. Walk together and it is light; drag a partner who is standing
  still and you crawl at 40% speed.
- The couch collides with the world along its whole length. Holding it **high** clears railings,
  desks and boxes; holding it **low** (you duck too) gets under pipes. One end high and one low
  tilts it, which makes it shorter on the ground: that is the pivot.
- Yelling "PIVOT!" does nothing useful. Yelling it again within 2.5 seconds makes it longer.
- Fall in a hole and you both go back to the last checkpoint. Cars, the vacuum, the neighbours'
  doors and the wrecking ball send you flying, couch and partner included.

### Levels

1. **The Stairwell** – three flights, two U-turns with a railing in the way, then a pipe and a pile
   of boxes on the way to the rug.
2. **The Hallway From Hell** – a robot vacuum, pipes, a corner you lift the couch over, boxes then
   a pipe straight after, a proper tight corner, and two doors that fly open.
3. **Crosstown Returns** – two lanes of traffic, two trenches to jump, a plank under a wrecking
   ball, and a lift across the last gap.

## Code

`src/config.js` has every tuning number. `src/levels.js` is the levels as data (boxes, zones,
props). `src/physics.js` and `src/game.js` are the simulation, with no rendering in them;
`src/view.js` and `src/models.js` draw it; `src/net.js` is the connection; `src/main.js` ties it
together. `CLAUDE.md` has the map and the testing tools.
