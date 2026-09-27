# Pocket Delve: changes from 26 Sep 2026

Snapshot of the code and your save from tonight: `snapshots\2026-09-26_late-game\`
(copy `web\` back over `pocketdelve\web\` to return to this exact version; the save is `save_2026-09-26.json`).
Full numbers for everything: the Codex, https://claude.ai/artifact/MPt6Bc3Ns4hePnj4MrRdv3

---

## ⭐ Newest (27 Sep): depth pass, more out of what's already there (no new tabs)

### 🌀 Skills: ranks 6–10 and evolutions (💎 → Skills)
- Ranks 6–10 give +10% each (ranks 1–5 still +15%), costing 250 / 350 / 500 / 700 / 1,000 gems.
- At rank 10 a skill **evolves**: Rending Cleave (bleeds), Hemorrhage (bleed spreads), Earthshaker (stuns bosses), Guillotine (execute under 45%), Chain Lightning (+3 jumps), Rallying Cry (+25% damage), Cyclone (10 spins), Aftershock (second slam), Bloodlust (Fury +100%).

### 👹 Monsters
- 6 new traits: 🦇 Vampiric, 🪨 Armored (crits pierce it), 💨 Swift, 👻 Ghostly (25% of hits pass through), ☣ Toxic (poison cloud on death), ⛰ Colossal (2.5× rewards).
- 🏅 **Champions** from lap 2: 15% of trait monsters roll a second trait (both icons shown), tougher, ×2 rewards.
- **Bosses gain abilities per lap**: a second one on lap 2, a third on lap 3+. New ones: 🩸 Drain, ⚡ Frenzy, 🔷 Barrier (briefly immune), ☄ Meteor (telegraphed hit + stun).
- Storm Peaks and Clockwork Vault got a 7th monster (Thunder Gargoyle, Clockwork Eye).
- Bestiary: a 4th tier (100K kills / 1,000 for bosses, +30%, more gems).

### 🛡 Gear sets
- 12 sets (was 5): Bloodmoon, Nightstalker, Titanguard, Sage, Gilded, Stormcaller, Ironclad are new.
- Every set now has a **3-piece bonus**.
- Every zone is home to 1–2 sets: half the set items you find there are the zone's sets. The zone line in 🛡 Hero shows which, and 🎲 Drops lists every set with its home zones.

### ✨ Special stages, 🍪 cookies, 🌍 events
- 5 new special stages: 📦 Mimic Hoard, ⛩ Forgotten Shrine (×1.5 damage for 2 min + a cookie), 📚 Lost Library (×5 XP), 🏟 Champion Arena (one huge Champion, 3 boss items), 🔩 Scrap Heap.
- 8 new cookies: ☘ Clover (×3 modifiers), 👹 Giant (×3 boss damage), 🪨 Iron skin (half damage taken), Double cookie, scrap, pet treat, Stardust sprinkles, and a rare amulet cookie.
- 4 new world events: 🐜 The Swarm, 🌑 Eclipse (tougher bosses, double items, ×3 amulets), 🔩 Scrap Harvest, 🍪 Cookie Festival.

### More in the existing panels
- 🏁 5 new challenges: 🤐 Silence (no skills), 🔨 Blunt (no crits), 🐜 Horde (×2 monsters), ⏬ Backslide (falling sends you back 10 floors), 🥀 Famine (×0.1 drops).
- ✧ Every constellation has 3 more stars (54 in total).
- ⚜ 3 new Oaths: 🎲 Gambler, 🕯 Pilgrim (×2 Stardust & Insight), 👑 Tyrant.
- 🧪 7 new research projects: Sugar Chemistry, Monster Studies, Anatomy, Cartography, Battle Tactics, Gemcutting, Set Theory.
- 🐾 2 new expeditions (💰 Treasure Hunt 4h, ⛰ Pilgrimage 24h); pets now level to 30.
- 25 new achievements (299 total) and 8 new cosmetics.

### 🏁 Challenges playtested and retuned
Simulated every challenge 4+ times from a fresh start. The old goals had drifted out of reach after the balance passes, and a luck-based wall at the floor-20 boss could stall any run for an hour.
- 💪 **Grit** (challenge runs only): stuck 2+ minutes without a new floor → +10% damage & health per extra minute (max +200%), gone on your next new floor. Shown next to the goal in the title bar.
- New goals (sims now reach them in ~25–45 min): Glass Cannon 100 → 70, Drought 100 → 70, Pauper 100 → 55, Rags 60 → 50, Colossi 60 → 55 (and ×2 health / ×1.25 damage, was ×3 / ×1.5: it never got past floor 20), Speedrun 15 → 25 minutes, Silence 55 → 60, Blunt 65 → 75, Horde 100 → 90, Backslide 80 → 95, Famine 55 → 60. Bare Bones unchanged.

### 📦 Scrap chests
- Prices unchanged. Celestial and Cosmic chests have no top rarity any more: better tiers roll at their normal odds, and Ethereal and up ×0.2 on top.
- Chest items roll like boss drops (best of two rarity rolls, ×2 modifier chance), times the chest's own modifier bonus: Bronze ×1.5, Silver ×2, Gold ×2.5, Platinum ×3.5, Diamond ×4.5, Celestial ×10, Cosmic ×15.
- Any modifier a chest item gets is always one of the 5 best of its kind (Radiant or better, Nimble or better). Celestial picks twice and Cosmic three times, keeping the rarest.
- **Attuned chests:** a Celestial chest rolls 3 items and a Cosmic chest 5, and gives you the one that improves your current gear the most (as if tempered). In a sim, at the moment each became affordable: Celestial beat the gear 96% of the time (+60% on average), Cosmic 95% (+64%).
- 💡 Every chest shows its estimated chance to beat your gear right now.
- Items bought from chests are never auto-sold: worn if better, otherwise kept in the stash.
- 🔷 **Essence Chest** (lap 5+): 500K scrap plus 10% of your Essence. The Essence you sacrifice sets the rarity: 10× more Essence = one tier higher (1K Ethereal, 10K Ascended, 100K Transcendent, 1M Eternal, 10M Infinite, 100M Absolute; in between, a chance of the next tier). Attuned like the Cosmic chest.
- Items found on replayed floors (below your best) give only 25% of their scrap when sold, so rebirthing isn't a scrap farm.
- Scrap per sold item: Rare 1, Epic 2, Legendary 3, Mythic 5, Divine 8, Celestial 12, Cosmic 20, Primordial 30, Ethereal 60, Ascended 100, Transcendent 175, Eternal 300, Infinite 500, Absolute 1,000 (+1 per modifier). Rare items give scrap now too.

### 🌅 Awakening gives less Essence
- Souls are now counted **without your Essence's own soul bonus** when working out Essence (still ∛(souls ÷ 1B)). That bonus used to feed straight into the next Awakening, so Essence snowballed (your next Awakening would have paid 30M). Early Awakenings are unchanged.
- Existing Essence was recalculated to what your lifetime souls give under the new rule (your save: 798,507 → 35,269).

### ⏩ 3× speed only on replays
- The ⏩ button only shows (and only works) on floors below your best. Reaching new ground drops back to normal speed; your choice is remembered, so the next replay (e.g. after a rebirth) runs at 3× again.

- [ ] Train a skill to rank 10 and watch it evolve
- [ ] Fight a lap-3 boss and look for its 3 abilities
- [ ] Spot a Champion (two trait icons over its head)

---

## Late-game round 2 (26 Sep, please give your opinion on these)

### 🐾 Expeditions (🏁 → Expeditions, from floor 200)
- Send a pet away for real time: 🧭 Scouting Trip 30 min · ⛏ Deep Delve 2 h · 🗺 Long Voyage 8 h (keeps running while the game is closed).
- Brings back gems, scrap, 🧪 Insight, ✧ Stardust and boss-quality items (a Long Voyage in the test: 💎10, 🔩1,500, 🧪30, ✧160, 3 items).
- Pets now level up (max 20): each level = +10% to its worn bonus, +5% to its trips. A pet that's away can't be worn.
- 1 slot to start; research adds 2 more.
- [ ] Send a pet, collect it, check the pet's level goes up

### 🧪 Laboratory (🏁 → Lab, from floor 250)
- New currency 🧪 **Insight**: first-time boss floor clears (1 + laps done), new Boss Rush records (2), expeditions. You got 222 to start.
- 17 research projects, real time (30 min – 12 h), permanent, one at a time (two with Parallel Lab). ✕ cancels and refunds.
- Highlights: Rush Drill (auto Boss Rush), Homing Pigeons (expeditions collect themselves and go again), Pack Mules / Caravan (+1 expedition slot each), Deep Pockets (+250 stash), Tempering Flux (tempering −50%), Metallurgy (reinforce ×1.06/level), Astral Lens (Fate +50% faster), Event Beacon (events twice as often), Grand Theory (×1.5 damage & health).
- [ ] Start Field Notes (10 🧪, 30 min) and check it finishes, also after closing the game

### ⚜ Oaths (✦ Rebirth → ⚜ Oath, from floor 300)
- One per run, big upside + downside: 🪓 Berserker (×2 dmg, ×0.6 hp) · 🛡 Warden (×2.2 hp, ×1.5 healing, ×0.7 dmg) · 💰 Merchant (×4 gold, ×0.5 XP) · 📘 Scholar (×3 XP, ×1.5 souls, ×0.5 gold) · 🏹 Hunter (×2.5 loot, ×1.3 modifiers, ×0.8 dmg) · 💀 Reaper (×3 boss dmg, ×0.8 hp).
- Swear one any time you have none; changing only at floor ≤ 20 (right after a rebirth). Stays sworn through rebirths.
- Mastery: every floor fought and beaten under it; each level (max 20) = +5% to the upside.
- [ ] Swear one now, then try switching after your next rebirth

### 🌍 World events (from floor 150)
- Every 45–90 min of play, a random 10-minute event (badge next to the floor number):
  🌕 Blood Moon (monsters ×2, loot ×3) · 💰 Golden Hour (×5 gold) · ☄ Meteor Shower (×3 Stardust, even replays drop some) · 📦 Treasure Rain (chests every few seconds) · 🍀 Lucky Streak (×3 modifiers) · 💡 Eureka (×3 Insight, research ×2 speed).
- The first one comes ~20 min after starting.
- [ ] Wait for one and check the badge + popup

### 9 new achievements, 3 new cosmetics (Traveller's Cloak, Goggles, Oathbound aura)

### Things I changed on my own (tell me what you think)
1. The 🏁 panel is now **Adventures** (Challenges · Boss Rush · Expeditions · Lab); the button glows when an expedition is back.
2. Time spent in challenge runs now counts toward your 📊 playtime.
3. Auto Boss Rush is a research reward (Rush Drill), not a free setting.
4. Oaths are deliberately strong (Berserker ≈ ×1.5 overall at mastery 0). Too much for lap 3?
5. Expedition gems: 3 Long Voyages a day on 3 slots ≈ 90 gems/day. Too generous?

---

## Earlier today (already live)

### Late game, round 1
- **✧ Constellations** (✦ Rebirth → ✧ Stars, from floor 401): Stardust from every first-time floor clear on lap 2+ (lap 2: 1/floor, lap 3: 2, boss floors ×5) and Boss Rush records; 6 constellations × 6 stars.
- **🌅 Awakening** (✦ Rebirth → 🌅 Awaken, from floor 801): trade souls for Essence = ∛(souls ÷ 1B); resets souls, perks and run. Each Essence: +50% souls, +10% damage & health, higher caps for 7 perks.
- **⏩ 3× speed** button next to Farm (from lap 3); turns itself off when the hero dies.

### Modes
- **🏁 Challenge runs** (after the first rebirth): fresh game with one rule, your save waits; beat the goal for a permanent bonus. Bare Bones, Glass Cannon, Drought, Pauper, Rags, Colossi, Speedrun.
- **☠ Boss Rush** (floor 60, every 30 min): all 40 bosses in a row, only item drops. Starts at the toughest boss you've beaten in a rush (first one: this run's deepest floor).

### Loot & items
- **🌠 Fate** (Hero → Drops): guaranteed jackpots: Ethereal every 300K items without one … Absolute every 100M. (Replaced Forge ascension, removed.)
- Loot on replayed floors: ×0.05 on Blitzed floors, ×0.4 on fought replays.
- Boss floors can be cleared 3× per run; farming after that moves you on.

### Stash (Forge → 🎒)
- Holds 500. When full, a better find replaces the worst unlocked item.
- Better gear is always put on, also from the stash; what it replaces is kept only if it meets your keep rules.
- Keep rules: rarities, modifiers, sets, "…only if once tempered it's ≥ X", "always keep anything rarer than 1 in N".
- ▲/▼ compares items at the same item level (how good the item itself is). "Rarest first" sorts by drop odds.
- 🔒 lock items (can't be sold); selling anything rarer than 1 in 100K asks first.
- 🔨 Auto-temper: stashed items that would beat your gear once tempered get tempered and equipped. Tempering now goes to your **best** floor's item level.

### Forge
- 🎲 Reforge shows the chance a reforge improves the item; **Auto** reforge once a second, only while the Reforge tab is open, each item spends at most 5% of your scrap.
- Reinforcement now **resets on rebirth** (lifetime count kept for the Smith achievements).

### Perks, upgrades & balance
- Perk caps: Bountiful 30, Sweet Tooth 25, Chest Magnet 25, Dream Walker 20 (+2.5% offline each, max 90%), Head Start 12.
- Perks tab has ×1 / ×10 / Max buy buttons.
- Auto-buy starts off with every upgrade excluded when it unlocks (new saves and challenge runs).
- Lap damage ramp doubled: +0.4% monster damage per floor per lap.
- The lap wake-up cutscene plays once per save; later laps just show the stats popup.

### Fixes
- Chests/cookies right after a rebirth or Awakening paid out your old income (one chest ≈ 76Qa): income now resets too.
- The 3× speed and Auto-reforge checkboxes stay in place; the Daily bounty tab is hidden in challenge runs.
