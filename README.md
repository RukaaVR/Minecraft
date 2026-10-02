# WebCraft

A Minecraft-style game that runs in the browser: survival, creative, adventure and hardcore modes, crafting, mobs, and multiplayer. No build step. Open `index.html` to play.

## Play

| How | Steps |
| --- | --- |
| Singleplayer, offline | Double-click `index.html`. Three.js is bundled in `lib/`. |
| Multiplayer server | `npm install`, then `npm start`. Open http://localhost:25565, or use **Multiplayer → Direct Connect** with `localhost:25565`. Friends on your network use your IP address. |
| Shared claude.ai page | Open the world, then choose **Pause → Open to Friends**. Friends who have the page open see it under **Multiplayer → Friends' worlds**, or can join with the code. |

Server options: `npm start -- --seed=hello --mode=creative --difficulty=hard --port=25565 --name="My Server"`. The server saves the world to `server/world.json`.

## Game modes

- **Survival**: health, hunger, air, fall damage. Mine with the right tool to get drops, craft, smelt, and fight mobs.
- **Hardcore**: survival on hard difficulty with one life. After you die you can spectate.
- **Creative**: fly (double-tap Space), break blocks instantly, and take any item from the creative inventory.
- **Adventure**: survival rules, but you can't break or place blocks.
- **Spectator** (`/gamemode spectator`): fly through walls, invisible to others.

## Features

- Infinite terrain: plains, forests, beaches, oceans, deserts with cacti, snowy mountains, caves, and coal, iron, gold and diamond ores at their usual depths
- Sunlight and torchlight with smooth lighting and ambient occlusion. Caves are dark, and hostile mobs spawn in the dark.
- Mining speeds, tool tiers and durability follow Minecraft. For example, you can't get stone by hand, and iron needs a stone pickaxe.
- Crafting: a 2×2 grid in the inventory and 3×3 at a crafting table. There are 40+ recipes, including planks, sticks, every tool tier, torches, furnaces, chests, TNT and metal blocks.
- Furnaces smelt ores, sand, cobblestone and raw meat, with fuel and progress bars. Chests store 27 slots.
- Mobs: pigs, cows, sheep and chickens drop food and materials. Zombies chase and attack you and burn in daylight. Creepers hiss and explode.
- Hunger, food, eating, natural regeneration, drowning, starving and death messages
- Peaceful, easy, normal and hard difficulty
- Dropped items, item pickup, Q to drop, falling sand and gravel, priming TNT with flint and steel
- Chat and commands: `/gamemode`, `/time set`, `/tp`, `/give`, `/summon`, `/kill`, `/clear`, `/spawnpoint`, `/difficulty`, `/seed`, `/help`
- Third-person view (F5), debug screen (F3), hidden HUD (F1), day/night cycle, clouds, stars, and sounds generated in code
- Several saved worlds, each autosaved in the browser

## Controls

| Key | Action |
| --- | --- |
| WASD | Move |
| Space | Jump / swim up. Double-tap to fly in creative. |
| Shift | Sneak (you won't walk off edges). Fly down when flying. |
| W twice or Ctrl | Sprint |
| Left click (hold) | Mine / attack |
| Right click | Place / use / eat (hold) / open crafting tables, furnaces and chests |
| Middle click | Pick block |
| 1–9 / mouse wheel | Hotbar |
| E | Inventory |
| Q / Ctrl+Q | Drop one item / drop the stack |
| T or / | Chat / command |
| F1 / F3 / F5 | Hide HUD / debug / camera |
| Esc | Pause |

In inventories: left click picks up or places a stack, right click splits a stack or places one item, shift-click moves items quickly, and 1–9 swaps with the hotbar.

## Code layout

| File | Purpose |
| --- | --- |
| `js/blocks.js` | Blocks (hardness, tools, drops, light) and the procedurally drawn texture atlas |
| `js/items.js` | Items, tools, food, crafting recipes, smelting |
| `js/world.js` | Chunks, terrain generation, light flood-fill, meshing, raycasting |
| `js/physics.js` | Box collision shared by players, mobs and items |
| `js/player.js` | Movement, game modes, health, hunger, air |
| `js/inventory.js` | Item stacks and inventories |
| `js/models.js` | Box models and skins for players and mobs |
| `js/entities.js` | Mob AI, dropped items, other players, particles |
| `js/net.js` | Multiplayer protocol over a claude.ai room or a WebSocket server |
| `js/game.js` | Game rules, mining, combat, explosions, furnaces, spawning, commands, rendering |
| `js/ui.js` | Menus, HUD, chat, inventory screens, input |
| `js/sound.js` | Sound effects generated with WebAudio |
| `server/server.js` | Multiplayer server and static file host |

This is a fan-made game and isn't affiliated with Mojang or Microsoft. Three.js is MIT licensed; see `lib/THREE_LICENSE`.
