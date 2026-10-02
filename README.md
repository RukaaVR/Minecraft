# WebCraft

A Minecraft-style game that runs in the browser: survival, creative, adventure and hardcore modes, the Nether, villages, crafting, mobs, multiplayer, and a WebGL2 port of the Halcyon shader pack. No build step. Open `index.html` to play.

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

## Shaders (Halcyon)

`js/halcyon_glsl.js` and `js/halcyon.js` port the Halcyon Iris shader pack (the uploaded `Halcyon_Shaders.zip`) to WebGL2. The pack's sky, clouds, night sky, lighting, shadows, wind, water and colour grading code is carried over nearly line for line. Iris's render pipeline is rebuilt as browser render passes:

sky LUT → sky and volumetric clouds → sun shadow map → lit terrain → water (refraction, absorption, reflections, sun glints) → god rays and underwater fog → bloom → ACES tone mapping and grading.

Choose **Options → Shaders** to pick Low, Medium (the default), High (adds screen-space reflections) or Ultra, or turn them off for the plain look. If the frame rate stays below 24 fps, the game lowers the preset automatically. Not ported: SSAO, contact shadows and coloured (stained-glass) shadows.

## Features

- Infinite terrain: plains, forests, beaches, oceans, deserts with cacti, snowy mountains, caves, and coal, iron, gold, diamond and emerald ores at their usual depths
- **Villages** in plains and deserts. Each has a well, dirt-path roads, houses with doors, beds, chests of loot, furnaces and crafting tables, wheat farms, and lamp posts. Villagers wander the village, and right-clicking one opens trades by profession (farmer, librarian, toolsmith, butcher, cleric, armorer) using emeralds.
- **The Nether**: build a 4×5 obsidian frame and light it with flint and steel. The Nether has netherrack caverns, a lava sea, soul sand, glowstone, quartz ore, zombified piglins that fight back when attacked, and ghasts that shoot exploding fireballs. Coordinates scale 1:8, and portals are linked or built on arrival.
- Flowing water and lava with source blocks, flow levels and falling fluids. Lava meeting water makes obsidian, cobblestone or stone. Buckets pick up and place both.
- Farming: till dirt with a hoe, plant seeds, and wheat grows through 8 stages. Bone meal speeds growth. Saplings grow into trees.
- Doors that open and close, beds that set your spawn and let you sleep through the night (beds explode in the Nether), and paths you can step up onto
- Bows and arrows, skeletons that shoot back, spiders, and four tiers of armor (leather, iron, gold, diamond) that reduce damage by Minecraft's formula
- Sunlight and torchlight with smooth lighting and ambient occlusion. Caves are dark, and hostile mobs spawn in the dark.
- Mining speeds, tool tiers and durability follow Minecraft. For example, you can't get stone by hand, and iron needs a stone pickaxe.
- Crafting: a 2×2 grid in the inventory and 3×3 at a crafting table. There are 40+ recipes, including planks, sticks, every tool tier, torches, furnaces, chests, TNT and metal blocks.
- Furnaces smelt ores, sand, cobblestone and raw meat, with fuel and progress bars. Chests store 27 slots.
- Mobs: pigs, cows, sheep and chickens drop food and materials. Zombies chase and attack you and burn in daylight. Creepers hiss and explode.
- Hunger, food, eating, natural regeneration, drowning, starving and death messages
- Peaceful, easy, normal and hard difficulty
- Dropped items, item pickup, Q to drop, falling sand and gravel, priming TNT with flint and steel
- Chat and commands: `/gamemode`, `/time set`, `/tp`, `/give`, `/summon`, `/locate village`, `/kill`, `/clear`, `/spawnpoint`, `/difficulty`, `/seed`, `/help`
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
| `js/textures2.js` | Textures for Nether, fluid, farming and village blocks, and newer items |
| `js/villages.js` | Village layout and generation |
| `js/halcyon_glsl.js` | The Halcyon shader pack's GLSL, ported to WebGL2 |
| `js/halcyon.js` | The Halcyon render passes and per-frame light colours |
| `js/gameplay.js` | Portals and dimensions, fluids, farming, doors, beds, bows, armor, trading |
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

## Not in this version

This is a large slice of Minecraft, not an exact copy. Missing pieces include redstone, the End and the Ender Dragon, enchanting and XP, potions, boats and minecarts, weather, biomes beyond plains/desert/snowy mountains, Nether fortresses and bastions, and Mojang's original textures and sounds (everything here is drawn and synthesized in code). In multiplayer, only the host simulates mobs, and only in the host's dimension. Players in the other dimension see no mobs.

This is a fan-made game and isn't affiliated with Mojang or Microsoft. Three.js is MIT licensed; see `lib/THREE_LICENSE`.
