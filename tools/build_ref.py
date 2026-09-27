import json, math, html, os

HERE = os.path.dirname(os.path.abspath(__file__))
raw = open(os.path.join(HERE, 'game_data.json'), encoding='utf-8-sig').read().strip()
D = json.loads(raw)
E = html.escape
SUF = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc']


def fmt(n):
    n = float(n)
    if 0 < abs(n) < 0.01:
        return f'{n:.0e}'.replace('e-0', 'e-')
    if abs(n) < 1000:
        return f'{n:.1f}'.rstrip('0').rstrip('.') if n % 1 else f'{int(n)}'
    e = int(math.floor(math.log10(abs(n)) / 3))
    if e >= len(SUF):
        return f'{n:.2e}'.replace('e+', 'e')
    v = n / 1000 ** e
    return (f'{v:.2f}' if v < 10 else f'{v:.1f}' if v < 100 else f'{int(v)}') + SUF[e]


def odds(p):
    if not p:
        return '—'
    pct = p * 100
    ps = f'{pct:.1f}%' if pct >= 1 else f'{pct:.{min(12, int(math.ceil(-math.log10(pct))) + 1)}f}%'
    return ps if p >= 0.5 else f'1 in {fmt(round(1 / p))} <span class="dim">({ps})</span>'


def mult(m, d=2):
    return f'×{m:.{d}f}'


def table(head, rows, cls=''):
    h = ''.join(f'<th>{c}</th>' for c in head)
    b = ''.join('<tr>' + ''.join(f'<td>{c}</td>' for c in r) + '</tr>' for r in rows)
    return f'<div class="tw"><table class="{cls}"><thead><tr>{h}</tr></thead><tbody>{b}</tbody></table></div>'


def fxs(d):
    return ', '.join(f'+{v} {k}' for k, v in (d or {}).items())


AFF = {'atkP': '% attack', 'hpP': '% health', 'crit': '% crit chance', 'critD': '% crit damage', 'spd': '% attack speed', 'gold': '% gold',
       'xp': '% XP', 'loot': '% loot', 'leech': '% lifesteal', 'dodge': '% dodge', 'armor': '% armor', 'regen': '% regen/s', 'multi': '% multistrike',
       'splash': '% splash', 'bossDmg': '% boss damage', 'soulFind': '% soul find'}


def statfx(d):
    return ', '.join(f'+{v}{AFF.get(k, " " + k)}' for k, v in (d or {}).items())


rc = {r['name']: r['color'] for r in D['rarity']}
def rname(n):
    return f'<b style="color:{rc.get(n, "inherit")}">{E(n)}</b>'


S = []  # (id, title, html)
en, ec = D['enemy'], D['economy']

# ---------- loot ----------
S.append(('rarity', 'Rarity', f'''
<p>Every item rolls a rarity. <b>Per item</b> is a normal drop with no loot bonuses; <b>boss item</b> takes the better of two rolls and is at least Uncommon.
Loot bonuses multiply every weight except Common's, so they push drops up the table; Refined Taste removes tiers from the bottom.
Rarity multiplies an item's main stats; <b>floors</b> is how many floors deeper a Common item would have to drop to match it.</p>
''' + table(['Rarity', 'Weight', 'Per item', 'Boss item', 'Stats', 'Floors', 'Bonus stats', 'Bonus strength', 'Scrap when sold'],
            [[rname(r['name']), fmt(r['weight']), odds(r['pNormal']), odds(r['pBoss']), mult(r['mult']), f"+{r['floors']}", r['affixes'], mult(r['affixStrength'], 2), r['scrap'] or '—'] for r in D['rarity']])
  + '<h3>🌠 Fate</h3><p>Every item that drops (not scrap chests) counts toward each jackpot rarity below. After that many items without one of that rarity or better, your next drop is guaranteed to be it; '
    'if several are due, the rarest wins. Getting a rarity, by luck or by fate, resets its count and every lower one. Counts are kept through rebirths, offline items count too, and progress shows in 🛡 Hero → 🎲 Drops.</p>'
  + table(['Rarity', 'Guaranteed after'], [[rname(f['name']), f"{fmt(f['every'])} items"] for f in D['fate']])))

mods = D['modifiers']
S.append(('modifiers', 'Modifiers', f'''
<p>Every item also rolls one <b>power</b> and one <b>flavour</b> modifier on its own, so it can have both (e.g. "Prismatic Keen").
Within a kind the rarest is checked first. Loot bonuses raise modifier odds only a little (logarithmically); boss items and chests double them; Keen Eye adds +2% per level.</p>
''' + '<h3>Power</h3>' + table(['Modifier', 'Chance', 'Boss item', 'Stats', 'Floors', 'Extra bonus stats'],
      [[f"{m['icon']} <b>{E(m['name'])}</b>", f"1 in {fmt(m['oneIn'])}", odds(m['pBoss']), mult(m['mult']), f"+{m['floors']}", m['extra'] or '—'] for m in mods if m['kind'] == 'power'])
  + '<h3>Flavour</h3>' + table(['Modifier', 'Chance', 'Boss item', 'Stats', 'Floors', 'Fixed bonus'],
      [[f"{m['icon']} <b>{E(m['name'])}</b>", f"1 in {fmt(m['oneIn'])}", odds(m['pBoss']), mult(m['mult']), f"+{m['floors']}", statfx(m['aff'])] for m in mods if m['kind'] == 'flavour'])))

it = D['item']
S.append(('items', 'Items & gear', f'''
<div class="facts">
<div><span>Drop chance per kill</span><b>{it['dropChance'] * 100:.0f}%</b><i>× loot bonus, ×{it['earlyLoot'][0][1]:g} on floor 1 fading to ×1 by floor 60</i></div>
<div><span>Item stats per floor</span><b>{mult(it['floorGrowth'], 4)}</b><i>deeper drops are stronger</i></div>
<div><span>Auto-equip threshold</span><b>+{it['equipMinGain'] * 100:.2f}%</b><i>overall rating needed to swap</i></div>
<div><span>Items per drop</span><b>1 · boss 3</b><i>+20% chance per Bountiful level, +1 boss item with Hunter's Mark</i></div>
<div><span>Set chance</span><b>{it['setChance'] * 100:.0f}%</b><i>of Epic-or-better items</i></div>
<div><span>Rare finds catalogue</span><b>1 in {fmt(1 / it['findOdds'])}</b><i>or Ascended+</i></div>
</div>
<h3>Gear slots (item level 1, before rarity)</h3>''' + table(['Slot', 'Main stats', 'Names'], [[f"{s['icon']} {s['slot']}", ', '.join(f"{v} {k}" for k, v in s['base'].items()), E(', '.join(s['names']))] for s in D['slots']])
  + '<h3>Bonus stats (per roll, before rarity strength)</h3>' + table(['Stat', 'Min', 'Max', 'Cap on your total'], [[E(a['name']), a['min'], a['max'], f"{a['cap']}%" if a['cap'] else '—'] for a in D['affixes']])
  + f"<h3>Gear sets</h3><p>{it['setChance'] * 100:.0f}% of Epic-or-better items belong to a set. {D['setHome'] * 100:.0f}% of those are one of the home sets of the zone you're in, so farm where a set lives to finish it. Set Theory research makes every set bonus ×1.5.</p>"
  + table(['Set', '2 pieces', '3 pieces', '4 pieces', 'Home zones'], [[f"<b style=\"color:{s['color']}\">{E(s['name'])}</b>", statfx(s['two']), statfx(s['three']), statfx(s['four']), E(', '.join(s['zones']))] for s in D['sets']])))

S.append(('amulets', 'Amulets', f'''
<p>Bosses drop an amulet {D['amulet']['chance'] * 100:.0f}% of the time (Trophy Hunter +25% per level, Hunter's Mark ×1.5). You wear the best one (two with Twin Chains); they're kept through rebirths.
Each bonus is ×(1 + per-point × tier power); charms are extra bonuses at half strength.</p>
''' + table(['Tier', 'Chance', 'Power', 'Charms'], [[f"<b style=\"color:{t['color']}\">{E(t['name'])}</b>", odds(t['p']), t['power'], t['charms']] for t in D['amuletTiers']])
  + table(['Bonus', 'Boosts', 'Per point of power', 'Chipped', 'Godheart'], [[E(s['name']), E(s['desc']), f"+{s['per'] * 100:.0f}%", mult(1 + s['per']), mult(1 + s['per'] * 13)] for s in D['amuletStats']])))

# ---------- hero ----------
h = D['hero']
S.append(('hero', 'Hero & skills', f'''
<div class="facts">
<div><span>Starting attack</span><b>{h['atk']}</b></div><div><span>Starting health</span><b>{h['hp']}</b></div>
<div><span>Attack speed</span><b>{h['spd']}/s</b><i>capped at {h['speedCap']}/s; extra speed becomes health and damage</i></div>
<div><span>Crit chance</span><b>{h['crit']}%</b><i>past 100% it adds to crit damage</i></div>
<div><span>Base crit damage</span><b>+{h['critBase']}%</b><i>a crit hits ×{1 + h['critBase'] / 100:g}</i></div>
<div><span>Achievement bonus</span><b>+{ec['achBonus'] * 100:.0f}% each</b><i>damage, health and gold</i></div>
</div>
<h3>Skills (learned by hero level, relearned after each rebirth)</h3>''' + table(['Level', 'Skill', 'Cooldown', 'What it does'], [[s['lvl'], f"{s['icon']} <b>{E(s['name'])}</b>", f"{s['cd']}s", E(s['desc'])] for s in D['skills']])
  + f"<p>💎 Skill training: {D['skillRanks']['max']} ranks. Ranks 1–5 give +{D['skillRanks']['power'] * 100:.0f}% power each, ranks 6–10 +{D['skillRanks']['power2'] * 100:.0f}% each (damage, or duration for War Cry / Battle Fury, stun length for Shield Bash). They cost {', '.join(str(c) for c in D['skillRanks']['cost'])} gems. At rank {D['skillRanks']['max']} the skill <b>evolves</b>:</p>"
  + table(['Skill', 'Evolves into', 'What it gains'], [[f"{s['icon']} {E(s['name'])}", f"<b>✦ {E(s['evo']['name'])}</b>", E(s['evo']['desc'])] for s in D['skills']])))

# ---------- upgrades ----------
b = D['bal']
S.append(('upgrades', 'Gold upgrades', f'''
<p>Bought with gold, reset on rebirth. Price = base × growth<sup>level</sup>, and <b>×{b['stepMult']} every {b['stepEvery']} levels</b> on top.
Capped upgrades keep going as ✪ Mastery (price ×{b['masteryGrowth']} per level from their last price). Unlock floors are your best floor ever.</p>
''' + table(['Unlocks at floor', 'Upgrade', 'Tab', 'Effect per level', 'Base price', 'Growth', 'Max', 'Mastery (per level past max)'],
            [[u['at'], f"{u['icon']} <b>{E(u['name'])}</b>", E(u['tab'] or ''), E(u['desc']), fmt(u['base']), mult(u['growth'], 3), u['max'] or '∞', E(u['mastery'] or '—')] for u in sorted(D['upgrades'], key=lambda u: u['at'])])))

# ---------- rebirth ----------
S.append(('rebirth', 'Rebirth & perks', f'''
<p>Rebirth from floor {ec['rebirthMin']}: floor, hero level, gold, upgrades and Forge reinforcement reset; gear, souls, perks, gems and everything else stay.
Souls = ((floor − 20) / 2)<sup>1.5</sup> × {ec['soulGrowth']}<sup>floor − 30</sup> × your soul bonuses.</p>
''' + table(['Rebirth at floor'] + [str(f) for f, _ in ec['souls']], [['Souls (no bonuses)'] + [fmt(s) for _, s in ec['souls']]])
  + '<h3>Perks (bought with souls, kept through rebirths; an Awakening resets them)</h3>' + table(['Revealed at floor', 'Perk', 'Effect', 'Max', 'First prices'],
      [[p['at'], f"<b>{E(p['name'])}</b>", E(p['desc']), p['max'] or '∞', ', '.join(fmt(c) for c in p['costs'])] for p in sorted(D['perks'], key=lambda p: p['at'])])))

# ---------- late game ----------
st_, aw = D['stars'], D['awaken']
S.append(('late', 'Constellations & Awakening', f'''
<h3>✧ Constellations</h3><p>From floor {st_['at']} (lap 2). Every floor you beat for the first time ever pays ✧ Stardust equal to the laps you've done there (lap 2: 1 a floor, lap 3: 2, …), ×{st_['boss']} on boss floors;
each new Boss Rush record boss pays {st_['rush']} × laps. Stars light in order within a constellation, each costing twice the last. Stars and Stardust are kept forever (Awakenings too).</p>'''
  + table(['Constellation', 'Stars in order', 'Costs'], [[f"{c['icon']} <b style=\"color:{c['color']}\">{E(c['name'])}</b>", E(' → '.join(c['nodes'])), ', '.join(fmt(x) for x in c['costs'])] for c in st_['list']])
  + f'''<h3>🌅 Awakening</h3><p>From floor {aw['at']} (lap 3), in ✦ Rebirth → 🌅 Awaken. Trades every soul earned since your last Awakening (plus what rebirthing now would pay) for Essence = ∛(souls ÷ {fmt(aw['per'])}), counting souls without your Essence's own soul bonus (so Essence can't feed itself).
It resets your souls, perks and run (floor, level, gold, upgrades, reinforcement); gear, stash, gems, relics, Stardust and stars, scrap, pets, achievements and records stay.
Essence is only spent by the 🔷 Essence Chest: each point gives +{aw['souls'] * 100:g}% souls from rebirths, +{aw['power'] * 100:g}% damage & health, and raises some perk caps.</p>'''
  + table(['Souls since the last Awakening'] + [fmt(s) for s, _ in aw['examples']], [['Essence'] + [str(e) for _, e in aw['examples']]])
  + table(['Perk', 'Extra max levels per Essence', 'At most'], [[E(c['name']), f"+{c['per']:g}", f"+{c['most']}"] for c in aw['caps']])))

ex, lb, oa, ev = D['exped'], D['lab'], D['oaths'], D['events']
def hrs(s):
    return f"{s // 3600}h" if s >= 3600 else f"{s // 60}m"
S.append(('adventures', 'Expeditions, Lab, Oaths & Events', f'''
<h3>🐾 Expeditions</h3><p>From floor {ex['at']} (🏁 button). Send a pet away for real time (it carries on while the game is closed); {ex['slots']} slot to start, more from research.
Scrap is × (laps done + 1), Stardust × laps done. Each pet level (√(xp ÷ 2), max {ex['petMax']}) makes its worn bonus +10% stronger and its trips +5% better. A pet that's away can't be worn.</p>'''
  + table(['Trip', 'Time', 'Gems', 'Scrap', 'Insight', 'Stardust', 'Boss items', 'Pet xp'], [[f"{e['icon']} <b>{E(e['name'])}</b>", hrs(e['secs']), e['gems'], e['scrap'], e['insight'], e['dust'], e['items'], e['xp']] for e in ex['list']])
  + f'''<h3>🧪 Laboratory</h3><p>From floor {lb['at']}. 🧪 Insight comes from every boss floor beaten for the first time ever (1 + laps done), new Boss Rush records (2) and expeditions.
Research takes real time, one project at a time (two with Parallel Lab), and is permanent. Cancelling refunds the Insight.</p>'''
  + table(['Project', 'Insight', 'Time', 'Effect'], [[f"{r['icon']} <b>{E(r['name'])}</b>", r['cost'], f"{r['hours']:g}h", E(r['desc'])] for r in lb['list']])
  + f'''<h3>⚜ Oaths</h3><p>From floor {oa['at']} (✦ Rebirth → ⚜ Oath). One Oath per run: swear one any time you have none, change it only at floor {oa['pickUntil']} or below (right after a rebirth). It stays through rebirths until changed.
Every floor fought and beaten under an Oath is 1 mastery xp; mastery = √(xp ÷ 10), max {oa['max']}, each level +{oa['per'] * 100:g}% to the upside.</p>'''
  + table(['Oath', 'Upside (mastery 0)', 'Downside'], [[f"{o['icon']} <b style=\"color:{o['color']}\">{E(o['name'])}</b>", E(o['up']), E(o['down'])] for o in oa['list']])
  + f'''<h3>🌍 World events</h3><p>From floor {ev['at']}. Every {ev['every'][0]}–{ev['every'][1]} minutes of play (half that with the Event Beacon), a random event runs for {ev['secs'] // 60} minutes.</p>'''
  + table(['Event', 'What happens'], [[f"{e['icon']} <b>{E(e['name'])}</b>", E(e['desc'])] for e in ev['list']])))

# ---------- gems ----------
g = D['gems']
S.append(('gems', 'Gems', f'''
<p>A permanent currency. Earned from: the first clear of each zone's last boss ({', '.join(f'floor {f}: {n}' for f, n in g['boss'])}),
+{g['perAch']} per achievement, daily bounties, bestiary milestones, the gem cookie (+{g['cookie']}) and {g['chest'] * 100:.0f}% of treasure chests.</p>
<h3>Relics (one-time)</h3>''' + table(['Relic', 'Gems', 'Effect'], [[f"{r['icon']} <b>{E(r['name'])}</b>", r['cost'], E(r['desc'])] for r in sorted(D['relics'], key=lambda r: r['cost'])])
  + '<h3>Shop (repeatable)</h3>' + table(['Item', 'Gems', 'Effect'], [[f"{s['icon']} <b>{E(s['name'])}</b>", s['cost'], E(s['desc'])] for s in D['gemShop']])
  + f"<h3>Daily bounties</h3><p>From floor {D['bountyAt']}: 3 random goals a day, {D['bountyReward']['each']} gem each and {D['bountyReward']['all']} more for all three.</p>"
  + table(['Goal', 'Possible targets'], [[E(x['text']), ', '.join(fmt(n) for n in x['n'])] for x in D['bounties']])))

# ---------- forge ----------
f_, sc = D['forge'], D['scrap']
S.append(('forge', 'Forge & scrap', f'''
<p>Unlocks at floor 120. 🔩 Scrap comes only from selling Epic-or-better items ({', '.join(f"{r['name']} {r['scrap']}" for r in D['rarity'] if r['scrap'])}), +{sc['mod']} per modifier. Kept through rebirths.</p>
<div class="facts">
<div><span>⚒ Reinforce</span><b>{mult(f_['mult'], 2)} / level</b><i>{fmt(f_['base'])} gold × {f_['growth']}<sup>level</sup>, per slot, resets on rebirth</i></div>
<div><span>🎲 Reforge</span><b>{D['reforge']['base']} × (rarity+1)<sup>1.5</sup> scrap</b><i>×{D['reforge']['growth']} per reforge of that item; keep or revert. Shows the estimated chance a reforge improves the item. Auto: reforges once a second, keeping only better rolls, while the Reforge tab is open; stops when you look elsewhere, after each item has used 5% of your scrap (two items: 10%), or (optionally) below a chance you pick</i></div>
<div><span>🔨 Temper</span><b>{D['temper']['base']} × (rarity+1)<sup>1.5</sup> × √levels</b><i>raises an item to your best floor's item level; auto-temper (optional) tempers stashed items that would then beat your gear, and they're put on</i></div>
<div><span>🎒 Stash</span><b>{D['stashMax']} items</b><i>better gear is always put on (also from the stash, e.g. after tempering), and what it replaces is kept only if it meets your keep rules; when full, a better find replaces the worst unlocked item; rarities you choose aren't auto-sold (optionally only if, once tempered, they'd be close to or better than your gear); anything rarer than a drop chance you pick (default 1 in 100,000) is always kept; 🔒 lock an item so it can't be sold; ▲/▼ compares it with what you wear with both at the same item level (how much better the item itself is)</i></div>
</div>
<h3>Scrap chests</h3><p>Items come at {D['chestIlvl'] * 100:.0f}% of this floor's item level, with normal modifier odds. Each chest bought makes the next of that kind ×{D['chestGrowth']} pricier until you rebirth.</p>'''
  + table(['Chest', 'Scrap', 'Rarity', 'Modifier chance'], [[f"{c['icon']} <b>{E(c['name'])}</b>", fmt(c['cost']), c['range'], f"×{c['mod']:g}"] for c in D['chests']])
  + f"<p>Chest items roll like boss drops (best of two rarity rolls, ×2 modifier chance) with the chest's own modifier multiplier on top, and any modifier they get is always one of the {D['chestTop']} rarest of its kind (power: Void-Kissed, Starforged, Prismatic, Brilliant, Radiant; flavour: Paragon, Titan's, Soulbright, Blessed, Nimble), picked by their usual odds; a chest with a bonus above ×5 picks once per 5 of its bonus (rounded up) and keeps the rarest (Celestial: best of 2, Cosmic: best of 3). <b>Attuned:</b> a Celestial chest rolls 3 items and a Cosmic chest 5, and you get the one that improves your current gear the most (compared as if tempered to your best floor). Every chest shows its estimated chance to beat your gear. Chest items are never auto-sold. 🔷 The Essence Chest (from lap 5) also costs 10% of your Essence; the Essence spent sets its rarity exactly: every 10× more is one tier higher (1K Essence: Ethereal, 10K: Ascended, 100K: Transcendent, 1M: Eternal, 10M: Infinite, 100M: Absolute), with a chance of the next tier in between. Celestial and Cosmic chests have no top rarity: anything above rolls with the normal weights, and Ethereal and up ×{D['chestJackpot']:g} on top. Chest items don't count toward 🌠 Fate.</p>"
  + f"<p>Items found on floors below your best (replays, Blitz) give only {D['replayScrap'] * 100:g}% of their scrap when sold.</p>"
))

# ---------- world ----------
S.append(('enemies', 'Enemies & floors', f'''
<p>Monster health grows ×{en['hpGrowth']:.4f} per floor and damage ×{en['atkGrowth']:.4f}, plus ×{en['atkExtra']} extra damage per floor from floor {en['atkExtraFrom']}.
A toughness bonus ramps from ×{en['toughStart']} (health) to ×{en['tough']} by floor {en['toughRamp']}. Every lap of the dungeon ({en['lapFloors']} floors) multiplies health ×{en['lap']['hp']}, damage ×{en['lap']['atk']} and gold/XP ×2, and monster damage also grows {en['lapStep'] * 100:g}% faster per floor for every lap (lap 2: ×{1 + en['lapStep']:g} per floor extra, lap 3: ×{1 + 2 * en['lapStep']:g}, …).
Bosses have ×{en['bossHp']} health and ×{en['bossAtk']} damage; you get {en['bossTime']}s (+5s per Boss Slayer level, ×1.5 for twin bosses).</p>
''' + table(['Floor', 'Lap', 'Monster health', 'Monster hit', 'Gold per kill', 'XP per kill', 'Monsters'], [[x['f'], x['lap'], fmt(x['hp']), fmt(x['atk']), fmt(x['gold']), fmt(x['xp']), x['wave']] for x in D['floorTable']])
  + f"<p>These are an average monster's numbers before its own multiplier (e.g. Crypt Rat ×0.45 health, Rock Troll ×2.5). Gold per floor ×{ec['goldGrowth']}, XP ×{ec['xpGrowth']}; each hero level needs ×{ec['xpLevel']} more XP.</p>"
  + '<h3>Retry timer after a failed push</h3>' + table(['Floor'] + [str(f) for f, _ in D['retry']], [['Seconds'] + [str(s) for _, s in D['retry']]])
  + '<h3>Monster traits</h3>' + table(['Trait', 'Share of traited monsters', 'Effect'], [[f"{t['icon']} <b>{E(t['name'])}</b>", f"{t['p'] * 100:.1f}%", E(t['desc'])] for t in D['traits']])
  + f"<p>Chance a monster has a trait: {', '.join(f'floor {f}: {c * 100:.0f}%' for f, c in D['traitChance'])} (none before floor 5).</p>"
  + f"<p>🏅 <b>Champions</b>: from lap 2, {D['champion']['chance'] * 100:.0f}% of trait monsters roll a second, different trait. They have ×{D['champion']['hp']} health on top and pay ×{D['champion']['reward']} gold, XP and loot. The Champion Arena special stage always holds one, much bigger.</p>"))

ab = D['bossAbilities']
abdesc = {'summon': f"calls {ab['summon']['n']} minions every {ab['summon']['every']}s", 'enrage': f"under {ab['enrage']['below'] * 100:.0f}% health: ×{ab['enrage']['spd']} speed, ×{ab['enrage']['atk']} damage",
          'shield': f"shield of {ab['shield']['pct'] * 100:.0f}% health every {ab['shield']['every']}s", 'breath': f"every {ab['breath']['every']}s, a {ab['breath']['windup']}s wind-up then a ×{ab['breath']['mult']} hit",
          'curse': f"every {ab['curse']['every']}s your damage ×{ab['curse']['dmg']} for {ab['curse']['secs']}s", 'heal': f"heals {ab['heal']['pct'] * 100:.0f}% every {ab['heal']['every']}s", 'slam': f"every {ab['slam']['every']}s a ×{ab['slam']['mult']} hit that stuns you {ab['slam']['stun']}s",
          'drain': f"every {ab['drain']['every']}s a ×{ab['drain']['mult']} hit that heals it {ab['drain']['pct'] * 100:.0f}%", 'frenzy': f"every {ab['frenzy']['every']}s attacks ×{ab['frenzy']['spd']} as fast for {ab['frenzy']['secs']}s",
          'barrier': f"every {ab['barrier']['every']}s immune to damage for {ab['barrier']['secs']}s", 'meteor': f"every {ab['meteor']['every']}s, a {ab['meteor']['windup']}s wind-up then a ×{ab['meteor']['mult']} hit that stuns you {ab['meteor']['stun']}s"}
S.append(('zones', 'Zones & bosses', f'''
<p>{len(D['zones'])} zones of 20 floors each: the Guardian fights on floors ending in 10, the Lord on floors ending in 20 (both at once from lap 2). Each zone has its own rule.
Every boss has one ability on lap 1, gains a second on lap 2 and a third from lap 3 (listed in that order below).</p>
''' + table(['Floors', 'Zone', 'Rule', 'Guardian', 'Lord', 'Monsters', 'Home sets'], [[z['floors'], f"<b>{E(z['name'])}</b>", E(z['fx']), f"{E(z['guard'])} <span class=\"dim\">({z['guardAb']})</span>", f"{E(z['lord'])} <span class=\"dim\">({z['lordAb']})</span>", E(', '.join(z['mobs'])), E(', '.join(z['sets']))] for z in D['zones']], 'zones')
  + '<h3>Boss abilities</h3>' + table(['Ability', 'What it does'], [[f"<b>{k}</b>", E(v)] for k, v in abdesc.items()])))

S.append(('events', 'Events & specials', f'''
<h3>Golden cookies</h3><p>Every 3–7 minutes from floor 6 (Sweet Tooth: more often, fewer duds; Cookie Jar eats them for you).</p>'''
  + table(['Cookie', 'Chance'], [[E(c['text']), f"{c['p'] * 100:.1f}%"] for c in D['cookies']])
  + f"<h3>Treasure chests</h3><p>Wander in every 90–200s from floor 3 (Chest Magnet +{D['chestsWorld']['magnetFreq'] * 100:.0f}% per level, Chest Hunter +{D['chestsWorld']['hunterFreq'] * 100:.0f}% per level, Treasure Map ×{D['chestsWorld']['mapFreq']}). 35% hold a boss-quality item, the rest {D['chestsWorld']['minutes']} min of income in gold (Chest Magnet +{D['chestsWorld']['magnetGold'] * 100:.0f}%, Chest Hunter +{D['chestsWorld']['hunterGold'] * 100:.0f}% per level).</p>"
  + f"<h3>Special stages</h3><p>{D['specialChance'] * 100:.1f}% of new floors (not replays or boss floors, from floor 20).</p>"
  + table(['Stage', 'What happens'], [[f"{s['icon']} <b>{E(s['name'])}</b>", E(s['desc'])] for s in D['specials']])
  + '<h3>Bestiary</h3>' + table(['Milestone', 'Kills (monster)', 'Kills (boss)', 'Damage vs it', 'Gems'],
      [[i + 1, fmt(D['bestiary']['tiers'][i]), D['bestiary']['bossTiers'][i], f"+{D['bestiary']['dmg'][i]}%", f"{D['bestiary']['gems'][i]} / {D['bestiary']['bossGems'][i]}"] for i in range(len(D['bestiary']['tiers']))])
  + f"<h3>Pets</h3><p>Worn in the Wardrobe; bosses drop a pet you don't have {D['petDrop'] * 100:.1f}% of the time.</p>"
  + table(['Pet', 'Bonus while worn', 'Also from achievement'], [[f"<b>{E(p['name'])}</b>", statfx(p['fx']) or '—', E(p['from'] or '—')] for p in D['pets']])))

ru = D['rush']
S.append(('modes', 'Challenges & Boss Rush', f'''
<h3>🏁 Challenge runs</h3><p>Open after your first rebirth (🏁 in the title bar). Each is a fresh game with one rule, kept apart from your save, which waits untouched.
Reach the goal floor to win a permanent bonus on your save; back out any time (the run is lost, your best floor is remembered).
Inside a run there are no rebirths, bounties or gems for your save, its achievements only count for that run, and it pauses while the game is closed.
💪 Grit: after 2 minutes without a new floor you get +10% damage & health for every further minute (up to +200%), until your next new floor. Goals are set so most runs finish in about 25–45 minutes.</p>'''
  + table(['Challenge', 'Rule', 'Goal', 'Reward (permanent)'], [[f"{c['icon']} <b>{E(c['name'])}</b>", E(c['rule']), f"floor {c['goal']}", E(c['reward'])] for c in D['challenges']])
  + f'''<h3>☠ Boss Rush</h3><p>From floor {ru['at']}, once every {ru['cooldown'] // 60} minutes: all {ru['n']} bosses (every zone's Guardian, then Lord, in zone order) back to back.
The first is as strong as the toughest boss you've ever beaten in a Boss Rush (your first rush: your deepest floor this run), so every rush picks up at your record; each next one is {ru['step'] * 100:g}% of that floor deeper. {ru['walk']}s to catch your breath between bosses; dying or the boss timer ends the rush.
Only the bosses' item drops count, at the item level of the floor they were fought at: no gold, XP, souls, gems, amulets, pets or bestiary kills.</p>'''
  + table(['Toughest rush boss beaten', 'First boss', 'Each next', 'Last boss'], [[b, f"floor {a}", f"+{s} floors", f"floor {z}"] for b, a, s, z in ru['examples']])))

S.append(('unlocks', 'Unlocks & replays', table(['Best floor', 'Unlocks'], [[x['at'], E(x['name'])] for x in sorted(D['features'], key=lambda x: x['at'])])
  + f"<p>Replaying floors below your best: ×{ec['replayBonus']} gold and XP, quick clears skip up to {ec['replay']['skipMax']} floors, and Blitz clears a floor every {ec['replay']['blitzStep']}s when you'd one-shot everything. Loot (items and amulets, bosses included) is much scarcer there: ×0.05 on Blitzed floors and ×0.4 on fought replay floors. While the window is minimized the hero only farms the current floor. A boss floor can be cleared 3 times per run: farming it after that moves you on to the next floor, and a fall from there skips back past it.</p>"))

ach_html = ''.join(f"<details><summary>{E(c['cat'])} <span class=\"dim\">({len(c['list'])})</span></summary>" + table(['Achievement', 'How', 'Unlocks'], [[f"<b>{E(a['name'])}</b>", E(a['desc']), E(a['cos'] or '')] for a in c['list']]) + '</details>' for c in D['achievements'])
S.append(('achievements', 'Achievements', f"<p>{D['counts']['achievements']} achievements, +{ec['achBonus'] * 100:.0f}% damage, health and gold each and +{g['perAch']} gem each. Cosmetics: " + ', '.join(f"{E(c['cat'])} {c['n']}" for c in D['cosmetics']) + '.</p>' + ach_html))

c = D['counts']
nav = ''.join(f'<a href="#{i}">{E(t)}</a>' for i, t, _ in S)
body = ''.join(f'<section id="{i}"><h2>{E(t)}</h2>{h}</section>' for i, t, h in S)
page = f'''<title>Pocket Delve Codex</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@500;700&family=Atkinson+Hyperlegible:wght@400;700&family=JetBrains+Mono:wght@400;600&display=swap">
<style>
:root {{ color-scheme: dark; --ground: #15131d; --panel: #1d1a28; --row: #221f2f; --line: #342f47; --text: #ece8f5; --dim: #9c95b5; --gold: #ffd54f; --soul: #b388ff; --gem: #6fe3ff; }}
* {{ box-sizing: border-box; }}
body {{ background: var(--ground); color: var(--text); font: 15px/1.55 'Atkinson Hyperlegible', 'Segoe UI', system-ui, sans-serif; padding-inline: 16px; padding-block: 0 48px; }}
.wrap {{ max-width: 1180px; margin: 0 auto; display: grid; grid-template-columns: 190px minmax(0, 1fr); gap: 32px; }}
header {{ max-width: 1180px; margin: 0 auto; padding-block: 28px 18px; border-bottom: 1px solid var(--line); margin-bottom: 24px; }}
h1 {{ font: 700 34px/1.1 'Pixelify Sans', 'Segoe UI', sans-serif; margin: 0; color: var(--gold); letter-spacing: .5px; text-wrap: balance; }}
header p {{ margin: 8px 0 0; color: var(--dim); max-width: 70ch; }}
.counts {{ display: flex; flex-wrap: wrap; gap: 8px 18px; margin-top: 12px; font: 13px 'JetBrains Mono', monospace; color: var(--dim); }}
.counts b {{ color: var(--text); font-weight: 600; }}
nav {{ position: sticky; top: env(safe-area-inset-top, 0px); align-self: start; display: flex; flex-direction: column; gap: 2px; padding-top: 4px; }}
nav a {{ color: var(--dim); text-decoration: none; padding: 5px 10px; border-left: 2px solid var(--line); font-size: 14px; }}
nav a:hover, nav a:focus-visible {{ color: var(--text); border-left-color: var(--gold); outline: none; }}
section {{ padding-block: 8px 28px; border-bottom: 1px solid var(--line); scroll-margin-top: 12px; }}
h2 {{ font: 700 24px/1.2 'Pixelify Sans', 'Segoe UI', sans-serif; margin: 14px 0 10px; color: var(--text); }}
h3 {{ font: 700 13px/1.3 'Atkinson Hyperlegible', sans-serif; text-transform: uppercase; letter-spacing: .08em; color: var(--soul); margin: 22px 0 8px; }}
p {{ max-width: 78ch; margin: 8px 0; color: #d9d4e8; }}
.dim {{ color: var(--dim); }}
.tw {{ overflow-x: auto; margin: 8px 0 14px; border: 1px solid var(--line); border-radius: 6px; }}
table {{ border-collapse: collapse; width: 100%; font-size: 13.5px; }}
th {{ text-align: left; font-weight: 700; color: var(--dim); background: var(--panel); padding: 7px 10px; border-bottom: 1px solid var(--line); white-space: nowrap; font-size: 12.5px; }}
td {{ padding: 6px 10px; border-bottom: 1px solid #2a2639; vertical-align: top; font-variant-numeric: tabular-nums; }}
tbody tr:nth-child(even) td {{ background: var(--row); }}
tbody tr:last-child td {{ border-bottom: 0; }}
td:not(:first-child) {{ font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 12.5px; }}
table.zones td:nth-child(3), table.zones td:nth-child(6) {{ font-family: 'Atkinson Hyperlegible', sans-serif; font-size: 13px; min-width: 16ch; }}
table.zones td:nth-child(4), table.zones td:nth-child(5) {{ font-family: 'Atkinson Hyperlegible', sans-serif; font-size: 13px; }}
.facts {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; margin: 12px 0; }}
.facts div {{ background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 10px 12px; display: flex; flex-direction: column; gap: 2px; }}
.facts span {{ color: var(--dim); font-size: 12.5px; }}
.facts b {{ font: 600 17px 'JetBrains Mono', monospace; color: var(--gold); }}
.facts i {{ font-style: normal; color: var(--dim); font-size: 12.5px; }}
details {{ margin: 8px 0; }}
summary {{ cursor: pointer; font-weight: 700; padding: 6px 0; }}
summary:focus-visible {{ outline: 2px solid var(--gold); outline-offset: 2px; }}
@media (max-width: 820px) {{
  .wrap {{ grid-template-columns: 1fr; gap: 0; }}
  nav {{ position: static; flex-direction: row; flex-wrap: wrap; gap: 6px; padding-bottom: 12px; border-bottom: 1px solid var(--line); }}
  nav a {{ border: 1px solid var(--line); border-radius: 4px; padding: 3px 8px; font-size: 13px; }}
}}
</style>
<header>
<h1>Pocket Delve Codex</h1>
<p>Every number in the game, read straight from the game's own data files: drop odds, multipliers, prices, unlocks and more. Odds are base odds with no loot bonuses or perks.</p>
<div class="counts"><span><b>{c['zones']}</b> zones</span><span><b>{c['enemies']}</b> monster types</span><span><b>{c['bosses']}</b> bosses</span><span><b>{c['modifiers']}</b> modifiers</span><span><b>{c['achievements']}</b> achievements</span><span><b>{c['cosmetics']}</b> cosmetics</span><span>as of 27 Sep 2026</span></div>
</header>
<div class="wrap"><nav aria-label="Sections">{nav}</nav><main>{body}</main></div>
'''
open(os.path.join(HERE, 'pocket_delve_codex.html'), 'w', encoding='utf-8').write(page)
print('written', len(page))
