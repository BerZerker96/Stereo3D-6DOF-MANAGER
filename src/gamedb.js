'use strict';
/* Curated game database: accurate name / exe / engine / graphics API for detection.
   Each entry: { n:name, exe:[main exe names, no path], folder:[steam installdir aliases], eng:engine, api:[APIs] }
   APIs are ordered best→legacy; the FIRST is what the modern 3D/6DOF paths target.
   Matching is by exe basename or steam folder (normalized). Data is a best-effort curated set. */

const G = (n, exe, folder, eng, api) => ({ n, exe: [].concat(exe), folder: [].concat(folder || []), eng, api: [].concat(api) });

const GAMES = [
  // ---- BerZerker 6DOF hub games ----
  G("Assassin's Creed Origins", ['ACOrigins'], ['Assassins Creed Origins'], 'AnvilNext 2.0', ['DX11']),
  G("Assassin's Creed Syndicate", ['ACS'], ['Assassins Creed Syndicate'], 'AnvilNext 2.0', ['DX11']),
  G("Assassin's Creed Unity", ['ACU'], ['Assassins Creed Unity'], 'AnvilNext 2.0', ['DX11']),
  G('Alan Wake 2', ['AlanWake2'], ['AlanWake2'], 'Northlight', ['DX12']),
  G('Alan Wake Remastered', ['AlanWake', 'AlanWakeRemastered'], ['Alan Wake Remastered'], 'Northlight', ['DX11']),
  G('Batman: Arkham Asylum', ['ShippingPC-BmGame', 'BmLauncher'], ['Batman Arkham Asylum GOTY Edition'], 'Unreal Engine 3', ['DX9']),
  G('Batman: Arkham City', ['BatmanAC'], ['Batman Arkham City GOTY'], 'Unreal Engine 3', ['DX9', 'DX11']),
  G('Batman: Arkham Knight', ['BatmanAK'], ['Batman Arkham Knight'], 'Unreal Engine 3', ['DX11']),
  G('Batman: Arkham Origins', ['BatmanOrigins'], ['Batman Arkham Origins'], 'Unreal Engine 3', ['DX11']),
  G('Control', ['Control_DX11', 'Control_DX12', 'Control'], ['Control'], 'Northlight', ['DX12', 'DX11']),
  G('Crimson Desert', ['CrimsonDesert'], ['Crimson Desert'], 'BlackSpace', ['DX11']),
  G('Crysis 3', ['Crysis3', 'Crysis3_x64'], ['Crysis3'], 'CryEngine 3', ['DX11']),
  G('Dead Space (Remake)', ['Dead Space'], ['Dead Space (2023)', 'Dead Space'], 'Frostbite', ['DX12']),
  G('Deus Ex: Human Revolution', ['DXHRDC', 'DXHR'], ['Deus Ex Human Revolution - Directors Cut'], 'Custom', ['DX11', 'DX9']),
  G('Deus Ex: Mankind Divided', ['DXMD'], ['Deus Ex Mankind Divided'], 'Dawn Engine', ['DX12', 'DX11']),
  G('Dragon Age II', ['DragonAge2'], ['Dragon Age II'], 'Eclipse', ['DX11', 'DX9']),
  G('Dragon Age: Inquisition', ['DragonAgeInquisition'], ['Dragon Age Inquisition'], 'Frostbite 3', ['DX11']),
  G('Dragon Age: Origins', ['daorigins', 'DAOrigins'], ['Dragon Age Ultimate Edition', 'Dragon Age Origins'], 'Eclipse', ['DX9']),
  G('GTA IV: Complete Edition', ['GTAIV', 'EFLC'], ['Grand Theft Auto IV', 'GTAIV'], 'RAGE', ['DX9']),
  G("Marvel's Guardians of the Galaxy", ['GOTG'], ['Guardians of the Galaxy'], 'Dawn Engine', ['DX12']),
  G('Metal Gear Solid V: The Phantom Pain', ['mgsvtpp', 'mgsvgz'], ['MGS_TPP', 'Metal Gear Solid V The Phantom Pain'], 'Fox Engine', ['DX11']),
  G('Metal Gear Rising: Revengeance', ['MetalGearRising'], ['MetalGearRisingRevengeance'], 'PlatinumGames', ['DX9']),
  G('NieR: Automata', ['NieRAutomata'], ['NieRAutomata'], 'PlatinumGames', ['DX11']),
  G('NieR Replicant ver.1.22474487139', ['NieR Replicant ver.1.22474487139'], ['NieR Replicant ver.1.22474487139'], 'Custom', ['DX11']),
  G('Ni no Kuni: Wrath of the White Witch', ['NinoKuni'], ['Ni no Kuni Wrath of the White Witch Remastered'], 'Unreal Engine 3', ['DX11']),
  G('Persona 4 Golden', ['P4G'], ['Persona4Golden'], 'Unity', ['DX11']),
  G('Persona 5 Royal', ['P5R'], ['P5R', 'Persona5Royal'], 'Catherine Engine', ['DX11']),
  G('Red Dead Redemption 2', ['RDR2'], ['Red Dead Redemption 2'], 'RAGE', ['DX12', 'Vulkan']),
  G('Resident Evil 5', ['re5dx9', 'RE5'], ['resident evil 5', 'Resident Evil 5'], 'MT Framework', ['DX10', 'DX9']),
  G('Rise of the Tomb Raider', ['ROTTR'], ['Rise of the Tomb Raider'], 'Foundation', ['DX12', 'DX11']),
  G('Shadow of the Tomb Raider', ['SOTTR'], ['Shadow of the Tomb Raider'], 'Foundation', ['DX12', 'DX11']),
  G('The Witcher 2: Assassins of Kings', ['witcher2', 'witcher2_dx9'], ['the witcher 2'], 'RED Engine', ['DX9']),
  G('The Witcher 3: Wild Hunt', ['witcher3', 'witcher3_dx12'], ['The Witcher 3'], 'REDengine 3', ['DX12', 'DX11']),
  G('Tomb Raider (2013)', ['TombRaider'], ['Tomb Raider'], 'Crystal Engine', ['DX11', 'DX9']),
  G('Yakuza 6: The Song of Life', ['Yakuza6'], ['Yakuza 6 The Song of Life'], 'Dragon Engine', ['DX11']),
  G('Yakuza Kiwami 2', ['YakuzaKiwami2'], ['Yakuza Kiwami 2'], 'Dragon Engine', ['DX11']),
  G('Yakuza: Like a Dragon', ['YakuzaLikeADragon', 'LikeADragon'], ['Yakuza Like a Dragon'], 'Dragon Engine', ['DX11']),

  // ---- Loop (itsloopyo) games ----
  G('PEAK', ['PEAK'], ['PEAK'], 'Unity', ['DX11']),
  G('Subnautica', ['Subnautica'], ['Subnautica'], 'Unity', ['DX11']),
  G('Subnautica: Below Zero', ['SubnauticaZero'], ['SubnauticaZero'], 'Unity', ['DX11']),
  G('Skyrim Special Edition', ['SkyrimSE'], ['Skyrim Special Edition'], 'Creation Engine', ['DX11']),
  G('Resident Evil Requiem', ['re9', 'REQUIEM'], ['Resident Evil Requiem'], 'RE Engine', ['DX12']),
  G('BioShock Remastered', ['Bioshock'], ['Bioshock Remastered', 'BioShock Remastered'], 'Unreal Engine 2.5', ['DX11']),
  G('Return of the Obra Dinn', ['ObraDinn'], ['Return of the Obra Dinn'], 'Unity', ['DX11']),
  G('Outer Wilds', ['OuterWilds'], ['Outer Wilds'], 'Unity', ['DX11']),

  // ---- Popular / high-demand titles ----
  G('Elden Ring', ['eldenring', 'start_protected_game'], ['ELDEN RING'], 'FromSoftware Engine', ['DX12']),
  G('Elden Ring: Nightreign', ['nightreign'], ['ELDEN RING NIGHTREIGN'], 'FromSoftware Engine', ['DX12']),
  G('Dark Souls III', ['DarkSoulsIII'], ['DARK SOULS III'], 'FromSoftware Engine', ['DX11']),
  G('Dark Souls: Remastered', ['DarkSoulsRemastered'], ['DARK SOULS REMASTERED'], 'FromSoftware Engine', ['DX11']),
  G('Sekiro: Shadows Die Twice', ['sekiro'], ['Sekiro'], 'FromSoftware Engine', ['DX11']),
  G('Armored Core VI', ['armoredcore6'], ['ARMORED CORE VI FIRES OF RUBICON'], 'FromSoftware Engine', ['DX12']),
  G('The Elder Scrolls V: Skyrim', ['TESV'], ['Skyrim'], 'Creation Engine', ['DX9']),
  G('Fallout 4', ['Fallout4'], ['Fallout 4'], 'Creation Engine', ['DX11']),
  G('Fallout 76', ['Fallout76'], ['Fallout76'], 'Creation Engine', ['DX11']),
  G('Starfield', ['Starfield'], ['Starfield'], 'Creation Engine 2', ['DX12']),
  G('Grand Theft Auto V', ['GTA5', 'GTAV', 'PlayGTAV'], ['Grand Theft Auto V'], 'RAGE', ['DX11']),
  G('Red Dead Redemption', ['RDR'], ['Red Dead Redemption'], 'RAGE', ['DX12']),
  G('Hogwarts Legacy', ['HogwartsLegacy'], ['Hogwarts Legacy'], 'Unreal Engine 4', ['DX12']),
  G('God of War', ['GoW'], ['GodofWar', 'God of War'], 'Kratos Engine', ['DX11']),
  G('God of War Ragnarök', ['GoWR'], ['GodofWarRagnarok', 'God of War Ragnarok'], 'Kratos Engine', ['DX12', 'DX11']),
  G('Horizon Zero Dawn', ['HorizonZeroDawn'], ['Horizon Zero Dawn'], 'Decima', ['DX12']),
  G('Horizon Forbidden West', ['HorizonForbiddenWest'], ['Horizon Forbidden West Complete Edition'], 'Decima', ['DX12']),
  G('Death Stranding', ['ds'], ['DEATH STRANDING'], 'Decima', ['DX12']),
  G('Death Stranding: Director\u2019s Cut', ['ds'], ['DEATH STRANDING DIRECTORS CUT'], 'Decima', ['DX12']),
  G("Baldur's Gate 3", ['bg3', 'bg3_dx11'], ["Baldurs Gate 3"], 'Divinity 4.0', ['DX11', 'Vulkan']),
  G('Resident Evil 2 (Remake)', ['re2'], ['RESIDENT EVIL 2'], 'RE Engine', ['DX12', 'DX11']),
  G('Resident Evil 3 (Remake)', ['re3'], ['RESIDENT EVIL 3'], 'RE Engine', ['DX12', 'DX11']),
  G('Resident Evil 4 (Remake)', ['re4'], ['RESIDENT EVIL 4'], 'RE Engine', ['DX12']),
  G('Resident Evil 7', ['re7'], ['Resident Evil 7 Biohazard'], 'RE Engine', ['DX11']),
  G('Resident Evil Village', ['re8'], ['Resident Evil Village'], 'RE Engine', ['DX12']),
  G('Monster Hunter: World', ['MonsterHunterWorld'], ['Monster Hunter World'], 'MT Framework', ['DX11']),
  G('Monster Hunter Rise', ['MonsterHunterRise'], ['MonsterHunterRise'], 'RE Engine', ['DX12', 'DX11']),
  G('Monster Hunter Wilds', ['MonsterHunterWilds'], ['MonsterHunterWilds'], 'RE Engine', ['DX12']),
  G('Devil May Cry 5', ['devilmaycry5', 'DevilMayCry5'], ['DevilMayCry5'], 'RE Engine', ['DX12', 'DX11']),
  G('Doom Eternal', ['DOOMEternalx64vk'], ['DOOMEternal'], 'id Tech 7', ['Vulkan']),
  G('Doom (2016)', ['DOOMx64', 'DOOMx64vk'], ['DOOM'], 'id Tech 6', ['Vulkan', 'OpenGL']),
  G('Doom: The Dark Ages', ['DOOMTheDarkAges'], ['DOOM The Dark Ages'], 'id Tech 8', ['Vulkan']),
  G('Metro Exodus', ['MetroExodus'], ['Metro Exodus'], '4A Engine', ['DX12', 'DX11']),
  G('Metro: Last Light Redux', ['MetroLL'], ['Metro Last Light Redux'], '4A Engine', ['DX11']),
  G("Assassin's Creed Odyssey", ['ACOdyssey'], ['Assassins Creed Odyssey'], 'AnvilNext 2.0', ['DX11']),
  G("Assassin's Creed Valhalla", ['ACValhalla'], ['Assassins Creed Valhalla'], 'AnvilNext 2.0', ['DX12']),
  G("Assassin's Creed Mirage", ['ACMirage'], ['Assassins Creed Mirage'], 'AnvilNext 2.0', ['DX12']),
  G("Assassin's Creed Shadows", ['ACShadows'], ['Assassins Creed Shadows'], 'AnvilNext (Anvil)', ['DX12']),
  G('Far Cry 5', ['FarCry5'], ['Far Cry 5'], 'Dunia 2', ['DX11']),
  G('Far Cry 6', ['FarCry6'], ['Far Cry 6'], 'Dunia', ['DX12', 'DX11']),
  G('Watch Dogs: Legion', ['WatchDogsLegion'], ['Watch Dogs Legion'], 'Disrupt', ['DX12', 'DX11']),
  G('Final Fantasy VII Remake Intergrade', ['ff7remake', 'ff7remake_'], ['FINAL FANTASY VII REMAKE INTERGRADE'], 'Unreal Engine 4', ['DX12']),
  G('Final Fantasy VII Rebirth', ['ff7rebirth', 'ff7rebirth_'], ['FINAL FANTASY VII REBIRTH'], 'Unreal Engine 4', ['DX12']),
  G('Final Fantasy XV', ['ffxv_s'], ['FINAL FANTASY XV'], 'Luminous', ['DX11']),
  G('Final Fantasy XVI', ['ffxvi', 'ff16'], ['FINAL FANTASY XVI'], 'Custom', ['DX12']),
  G('Star Wars Jedi: Fallen Order', ['SwGame', 'starwarsjedifallenorder'], ['Jedi Fallen Order'], 'Unreal Engine 4', ['DX11']),
  G('Star Wars Jedi: Survivor', ['JediSurvivor', 'starwarsjedisurvivor'], ['Jedi Survivor'], 'Unreal Engine 4', ['DX12']),
  G('Stray', ['Stray'], ['Stray'], 'Unreal Engine 4', ['DX12', 'DX11']),
  G('Lies of P', ['LOP'], ['Lies of P'], 'Unreal Engine 4', ['DX11']),
  G('Black Myth: Wukong', ['b1', 'BlackMythWukong'], ['BlackMythWukong'], 'Unreal Engine 5', ['DX12']),
  G('Palworld', ['Palworld'], ['Palworld'], 'Unreal Engine 5', ['DX12', 'DX11']),
  G('Remnant II', ['Remnant2'], ['Remnant2'], 'Unreal Engine 5', ['DX12']),
  G('Silent Hill 2 (Remake)', ['SilentHill2', 'SHProto'], ['SILENT HILL 2'], 'Unreal Engine 5', ['DX12']),
  G('The Callisto Protocol', ['CallistoProtocol'], ['The Callisto Protocol'], 'Unreal Engine 4', ['DX12', 'DX11']),
  G('Atomic Heart', ['AtomicHeart'], ['AtomicHeart'], 'Unreal Engine 4', ['DX12', 'DX11']),
  G('Cyberpunk 2077', ['Cyberpunk2077'], ['Cyberpunk 2077'], 'REDengine 4', ['DX12']),
  G('Hades', ['Hades'], ['Hades'], 'SuperGiant Engine', ['DX11']),
  G('Hades II', ['Hades2'], ['Hades II'], 'SuperGiant Engine', ['DX11']),
  G('Hollow Knight', ['hollow_knight'], ['Hollow Knight'], 'Unity', ['DX11']),
  G('Grand Theft Auto: San Andreas', ['gta_sa', 'gta-sa'], ['Grand Theft Auto San Andreas'], 'RenderWare', ['DX9']),
  G('Grand Theft Auto III', ['gta3'], ['Grand Theft Auto III'], 'RenderWare', ['DX9']),
  G('Half-Life 2', ['hl2'], ['Half-Life 2'], 'Source', ['DX9']),
  G('Portal 2', ['portal2'], ['Portal 2'], 'Source', ['DX9']),
  G("Alien: Isolation", ['AI'], ['Alien Isolation'], 'CATHODE', ['DX11']),
  G('Dishonored 2', ['Dishonored2'], ['Dishonored2'], 'Void Engine', ['DX11']),
  G('Prey (2017)', ['Prey'], ['Prey'], 'CryEngine', ['DX11']),
  G('DEATHLOOP', ['deathloop'], ['Deathloop'], 'Void Engine', ['DX12']),
  G('Ghostrunner', ['Ghostrunner'], ['Ghostrunner'], 'Unreal Engine 4', ['DX11']),
  G('Kingdom Come: Deliverance', ['KingdomCome'], ['KingdomComeDeliverance'], 'CryEngine', ['DX11']),
  G('Kingdom Come: Deliverance II', ['KingdomCome2'], ['KingdomComeDeliverance2'], 'CryEngine', ['DX11']),
  G('The Last of Us Part I', ['tlou-i'], ['The Last of Us Part I'], 'Naughty Dog Engine', ['DX12']),
  G('The Last of Us Part II', ['tlou-ii'], ['The Last of Us Part II'], 'Naughty Dog Engine', ['DX12']),
  G("Marvel's Spider-Man Remastered", ['Spider-Man'], ['Marvels Spider-Man Remastered'], 'Insomniac Engine', ['DX12']),
  G("Marvel's Spider-Man 2", ['Spider-Man2'], ['Marvels Spider-Man 2'], 'Insomniac Engine', ['DX12']),
  G('Ghost of Tsushima', ['GhostOfTsushima'], ['Ghost of Tsushima DIRECTORS CUT'], 'Sucker Punch Engine', ['DX12']),
  G('Uncharted: Legacy of Thieves', ['u4', 'tll'], ['UNCHARTED Legacy of Thieves Collection'], 'Naughty Dog Engine', ['DX12']),
  G('Forza Horizon 5', ['ForzaHorizon5'], ['ForzaHorizon5'], 'ForzaTech', ['DX12']),
  G('Microsoft Flight Simulator', ['FlightSimulator'], ['Microsoft Flight Simulator'], 'Custom', ['DX11', 'DX12']),
  G('Mafia: Definitive Edition', ['mafiadefinitiveedition'], ['Mafia Definitive Edition'], 'Illusion Engine', ['DX11']),
  G('Days Gone', ['DaysGone'], ['Days Gone'], 'Unreal Engine 4', ['DX11']),
  G('Ready or Not', ['ReadyOrNot'], ['Ready Or Not'], 'Unreal Engine 4', ['DX11', 'DX12'])
];


/* ===== Expanded set — grouped by engine/franchise for accuracy ===== */
const GAMES2 = [
  // Unreal Engine 3 (DX9 / DX11)
  G('Mass Effect', ['MassEffect'], ['Mass Effect'], 'Unreal Engine 3', ['DX9']),
  G('Mass Effect 2', ['MassEffect2'], ['Mass Effect 2'], 'Unreal Engine 3', ['DX9']),
  G('Mass Effect 3', ['MassEffect3'], ['Mass Effect 3'], 'Unreal Engine 3', ['DX9']),
  G('Mass Effect Legendary Edition', ['MassEffect1','MassEffect2','MassEffect3'], ['Mass Effect Legendary Edition'], 'Unreal Engine 3', ['DX11']),
  G('BioShock Infinite', ['BioShockInfinite'], ['BioShock Infinite'], 'Unreal Engine 3', ['DX11']),
  G('BioShock 2 Remastered', ['Bioshock2'], ['Bioshock 2 Remastered'], 'Unreal Engine 2.5', ['DX11']),
  G('Borderlands', ['Borderlands'], ['Borderlands Game of the Year'], 'Unreal Engine 3', ['DX9']),
  G('Borderlands 2', ['Borderlands2'], ['Borderlands 2'], 'Unreal Engine 3', ['DX9']),
  G('Borderlands: The Pre-Sequel', ['BorderlandsPreSequel'], ['BorderlandsPreSequel'], 'Unreal Engine 3', ['DX9']),
  G('Mirror\u2019s Edge', ['MirrorsEdge'], ['Mirrors Edge'], 'Unreal Engine 3', ['DX9']),
  G('Spec Ops: The Line', ['specops'], ['Spec Ops The Line'], 'Unreal Engine 3', ['DX9']),
  G('XCOM: Enemy Unknown', ['XComGame'], ['XCom-Enemy-Unknown'], 'Unreal Engine 3', ['DX9', 'DX11']),
  G('XCOM 2', ['XCom2'], ['XCOM 2'], 'Unreal Engine 3', ['DX11']),
  G('Dishonored', ['Dishonored'], ['Dishonored'], 'Void Engine', ['DX9', 'DX11']),
  G('Remember Me', ['RememberMe'], ['Remember Me'], 'Unreal Engine 3', ['DX9']),
  G('Alice: Madness Returns', ['AliceMadnessReturns'], ['Alice Madness Returns'], 'Unreal Engine 3', ['DX9']),
  // Unreal Engine 4 (DX11 / DX12)
  G('Fortnite', ['FortniteClient-Win64-Shipping','FortniteLauncher'], ['Fortnite'], 'Unreal Engine 5', ['DX12', 'DX11']),
  G('PUBG: Battlegrounds', ['TslGame'], ['PUBG'], 'Unreal Engine 4', ['DX11']),
  G('Sea of Thieves', ['SoTGame'], ['Sea of Thieves'], 'Unreal Engine 4', ['DX11']),
  G('Hellblade: Senua\u2019s Sacrifice', ['HellbladeGame'], ['Hellblade'], 'Unreal Engine 4', ['DX11']),
  G('Senua\u2019s Saga: Hellblade II', ['Hellblade2'], ['Hellblade2'], 'Unreal Engine 5', ['DX12']),
  G('ARK: Survival Evolved', ['ShooterGame'], ['ARK'], 'Unreal Engine 4', ['DX11']),
  G('ARK: Survival Ascended', ['ArkAscended'], ['ARK Survival Ascended'], 'Unreal Engine 5', ['DX12', 'DX11']),
  G('Borderlands 3', ['Borderlands3'], ['Borderlands 3'], 'Unreal Engine 4', ['DX12', 'DX11']),
  G('Tiny Tina\u2019s Wonderlands', ['Wonderlands'], ['Tiny Tinas Wonderlands'], 'Unreal Engine 4', ['DX12', 'DX11']),
  G('Gears 5', ['Gears5'], ['Gears5'], 'Unreal Engine 4', ['DX12']),
  G('Gears of War 4', ['GearsOfWar4'], ['Gears of War 4'], 'Unreal Engine 4', ['DX12']),
  G('The Outer Worlds', ['TheOuterWorlds'], ['The Outer Worlds'], 'Unreal Engine 4', ['DX11']),
  G('It Takes Two', ['ItTakesTwo'], ['It Takes Two'], 'Unreal Engine 4', ['DX11']),
  G('A Way Out', ['AWayOut'], ['A Way Out'], 'Unreal Engine 4', ['DX11']),
  G('Kena: Bridge of Spirits', ['Kena'], ['Kena Bridge of Spirits'], 'Unreal Engine 4', ['DX11']),
  G('Kingdom Hearts III', ['KINGDOM HEARTS III'], ['KINGDOM HEARTS III'], 'Unreal Engine 4', ['DX11']),
  G('Dragon Quest XI S', ['DRAGON QUEST XI S'], ['DRAGON QUEST XI S'], 'Unreal Engine 4', ['DX11']),
  G('Octopath Traveler', ['Octopath_Traveler'], ['OCTOPATH TRAVELER'], 'Unreal Engine 4', ['DX11']),
  G('Tekken 7', ['TekkenGame-Win64-Shipping'], ['TEKKEN 7'], 'Unreal Engine 4', ['DX11']),
  G('Tekken 8', ['Polaris-Win64-Shipping'], ['TEKKEN 8'], 'Unreal Engine 5', ['DX12']),
  G('Mortal Kombat 11', ['MK11'], ['Mortal Kombat 11'], 'Unreal Engine 3', ['DX11']),
  G('Mortal Kombat 1', ['MK12'], ['Mortal Kombat 1'], 'Unreal Engine 4', ['DX11', 'DX12']),
  G('Hi-Fi Rush', ['Hi-Fi-RUSH'], ['Hi-Fi RUSH'], 'Unreal Engine 4', ['DX12']),
  G('Ghostwire: Tokyo', ['GWTGame-Win64-Shipping'], ['GhostwireTokyo'], 'Unreal Engine 4', ['DX12']),
  G('The Medium', ['TheMedium'], ['The Medium'], 'Unreal Engine 4', ['DX11', 'DX12']),
  G('Layers of Fear (2023)', ['LayersofFear'], ['Layers of Fear'], 'Unreal Engine 5', ['DX12']),
  G('Robocop: Rogue City', ['RoboCop'], ['RoboCop Rogue City'], 'Unreal Engine 5', ['DX12']),
  G('Lords of the Fallen (2023)', ['LOTF2'], ['Lords of the Fallen'], 'Unreal Engine 5', ['DX12']),
  G('The Talos Principle 2', ['Talos2'], ['The Talos Principle 2'], 'Unreal Engine 5', ['DX12']),
  G('Immortals of Aveum', ['Immortals'], ['Immortals of Aveum'], 'Unreal Engine 5', ['DX12']),
  G('S.T.A.L.K.E.R. 2', ['Stalker2-Win64-Shipping'], ['S.T.A.L.K.E.R. 2 Heart of Chornobyl'], 'Unreal Engine 5', ['DX12']),
  G('The Elder Scrolls IV: Oblivion Remastered', ['OblivionRemastered', 'Altar-Win64-Shipping'], ['The Elder Scrolls IV Oblivion Remastered', 'Oblivion Remastered'], 'Unreal Engine 5', ['DX12']),
  G('The First Descendant', ['M1-Win64-Shipping'], ['The First Descendant'], 'Unreal Engine 5', ['DX12', 'DX11']),
  G('Wuthering Waves', ['Client-Win64-Shipping'], ['Wuthering Waves'], 'Unreal Engine 4', ['DX12', 'DX11']),
  G('Grand Theft Auto: The Trilogy \u2013 Definitive Edition', ['Gameface'], ['GTA The Trilogy'], 'Unreal Engine 4', ['DX11']),
  // Unity (DX11)
  G('Cities: Skylines', ['Cities'], ['Cities_Skylines'], 'Unity', ['DX11']),
  G('Cities: Skylines II', ['Cities2'], ['Cities Skylines II'], 'Unity', ['DX11']),
  G('Cuphead', ['Cuphead'], ['Cuphead'], 'Unity', ['DX11']),
  G('Ori and the Blind Forest', ['ori'], ['Ori and the Blind Forest'], 'Unity', ['DX11']),
  G('Ori and the Will of the Wisps', ['oriwotw'], ['Ori and the Will of the Wisps'], 'Unity', ['DX11']),
  G('Rust', ['RustClient'], ['Rust'], 'Unity', ['DX11']),
  G('Escape from Tarkov', ['EscapeFromTarkov'], ['Escape from Tarkov'], 'Unity', ['DX11']),
  G('Valheim', ['valheim'], ['Valheim'], 'Unity', ['DX11']),
  G('Green Hell', ['GreenHell'], ['Green Hell'], 'Unity', ['DX11']),
  G('7 Days to Die', ['7DaysToDie'], ['7 Days To Die'], 'Unity', ['DX11']),
  G('Cult of the Lamb', ['Cult Of The Lamb'], ['Cult of the Lamb'], 'Unity', ['DX11']),
  G('Genshin Impact', ['GenshinImpact'], ['Genshin Impact'], 'Unity', ['DX11']),
  G('Honkai: Star Rail', ['StarRail'], ['Star Rail'], 'Unity', ['DX11']),
  G('Phasmophobia', ['Phasmophobia'], ['Phasmophobia'], 'Unity', ['DX11']),
  G('Lethal Company', ['Lethal Company'], ['Lethal Company'], 'Unity', ['DX11']),
  G('Content Warning', ['Content Warning'], ['Content Warning'], 'Unity', ['DX11']),
  G('RimWorld', ['RimWorldWin64'], ['RimWorld'], 'Unity', ['DX11']),
  G('Slime Rancher', ['SlimeRancher'], ['Slime Rancher'], 'Unity', ['DX11']),
  G('Kerbal Space Program', ['KSP_x64'], ['Kerbal Space Program'], 'Unity', ['DX11']),
  G('Pillars of Eternity', ['PillarsOfEternity'], ['Pillars of Eternity'], 'Unity', ['DX11']),
  G('Wasteland 3', ['WL3'], ['Wasteland3'], 'Unity', ['DX11']),
  G('Hollow Knight: Silksong', ['Hollow Knight Silksong'], ['Hollow Knight Silksong'], 'Unity', ['DX11']),
  G('Beat Saber', ['Beat Saber'], ['Beat Saber'], 'Unity', ['DX11']),
  G('Enshrouded', ['enshrouded'], ['Enshrouded'], 'Custom', ['DX12']),
  G('Palia', ['Palia-Win64-Shipping'], ['Palia'], 'Unreal Engine 4', ['DX11']),
  G('V Rising', ['VRising'], ['VRising'], 'Unity', ['DX11']),
  G('Sons of the Forest', ['SonsOfTheForest'], ['Sons Of The Forest'], 'Unity', ['DX11']),
  G('The Forest', ['TheForest'], ['The Forest'], 'Unity', ['DX11']),
  // RE Engine
  G('Street Fighter 6', ['StreetFighter6'], ['Street Fighter 6'], 'RE Engine', ['DX12', 'DX11']),
  G('Dragon\u2019s Dogma 2', ['DD2'], ['Dragons Dogma 2'], 'RE Engine', ['DX12']),
  G('Resident Evil 6', ['re6'], ['Resident Evil 6'], 'MT Framework', ['DX9']),
  // Frostbite
  G('Battlefield 1', ['bf1'], ['Battlefield 1'], 'Frostbite 3', ['DX11', 'DX12']),
  G('Battlefield V', ['bfv'], ['Battlefield V'], 'Frostbite 3', ['DX11', 'DX12']),
  G('Battlefield 2042', ['BF2042'], ['Battlefield 2042'], 'Frostbite', ['DX12']),
  G('Battlefield 4', ['bf4'], ['Battlefield 4'], 'Frostbite 3', ['DX11']),
  G('Star Wars Battlefront II', ['starwarsbattlefrontii'], ['STAR WARS Battlefront II'], 'Frostbite 3', ['DX11']),
  G('Star Wars: Squadrons', ['starwarssquadrons'], ['STAR WARS Squadrons'], 'Frostbite', ['DX11']),
  G('Mass Effect: Andromeda', ['MassEffectAndromeda'], ['Mass Effect Andromeda'], 'Frostbite 3', ['DX11']),
  G('Need for Speed Heat', ['NeedForSpeedHeat'], ['Need for Speed Heat'], 'Frostbite', ['DX11']),
  G('Need for Speed Unbound', ['NeedForSpeedUnbound'], ['Need for Speed Unbound'], 'Frostbite', ['DX12']),
  G('Dragon Age: The Veilguard', ['DragonAgeTheVeilguard'], ['Dragon Age The Veilguard'], 'Frostbite', ['DX12']),
  G('Anthem', ['Anthem'], ['Anthem'], 'Frostbite', ['DX11']),
  G('EA Sports FC 25', ['FC25'], ['EA SPORTS FC 25'], 'Frostbite', ['DX12']),
  // Creation / Gamebryo
  G('Fallout: New Vegas', ['FalloutNV'], ['Fallout New Vegas'], 'Gamebryo', ['DX9']),
  G('Fallout 3', ['Fallout3'], ['Fallout 3 goty'], 'Gamebryo', ['DX9']),
  G('The Elder Scrolls IV: Oblivion', ['Oblivion'], ['Oblivion'], 'Gamebryo', ['DX9']),
  // id Tech
  G('Wolfenstein: The New Order', ['WolfNewOrder_x64'], ['Wolfenstein.The.New.Order'], 'id Tech 5', ['OpenGL']),
  G('Wolfenstein II: The New Colossus', ['NewColossus_x64vk'], ['Wolfenstein II The New Colossus'], 'id Tech 6', ['Vulkan']),
  G('Wolfenstein: Youngblood', ['Youngblood_x64vk'], ['Wolfenstein Youngblood'], 'id Tech 6', ['Vulkan']),
  G('Rage 2', ['RAGE2'], ['Rage 2'], 'Apex (Avalanche)', ['Vulkan']),
  G('Quake Champions', ['QuakeChampions'], ['Quake Champions'], 'id Tech (Saber)', ['DX11']),
  // RAGE / Rockstar
  G('Max Payne 3', ['MaxPayne3'], ['Max Payne 3'], 'RAGE', ['DX9', 'DX11']),
  G('L.A. Noire', ['LANoire'], ['LA Noire'], 'RAGE', ['DX11']),
  // CryEngine
  G('Crysis', ['Crysis'], ['Crysis'], 'CryEngine 2', ['DX9', 'DX10']),
  G('Crysis 2', ['Crysis2'], ['Crysis 2'], 'CryEngine 3', ['DX9', 'DX11']),
  G('Crysis Remastered', ['Crysis Remastered'], ['Crysis Remastered'], 'CryEngine', ['DX11']),
  G('Far Cry', ['FarCry'], ['FarCry'], 'CryEngine', ['DX9']),
  G('Hunt: Showdown', ['HuntGame'], ['Hunt Showdown'], 'CryEngine', ['DX11', 'DX12']),
  G('Ryse: Son of Rome', ['Ryse'], ['Ryse Son of Rome'], 'CryEngine', ['DX11']),
  G('Sniper: Ghost Warrior Contracts', ['SGWContracts'], ['Sniper Ghost Warrior Contracts'], 'CryEngine', ['DX11']),
  G('MechWarrior 5: Mercenaries', ['MechWarrior-Win64-Shipping'], ['MechWarrior 5 Mercenaries'], 'Unreal Engine 4', ['DX11', 'DX12']),
  // Snowdrop / Ubisoft
  G('Tom Clancy\u2019s The Division', ['TheDivision'], ['Tom Clancys The Division'], 'Snowdrop', ['DX11', 'DX12']),
  G('Tom Clancy\u2019s The Division 2', ['TheDivision2'], ['Tom Clancys The Division 2'], 'Snowdrop', ['DX11', 'DX12']),
  G('Avatar: Frontiers of Pandora', ['Avatar'], ['Avatar Frontiers of Pandora'], 'Snowdrop', ['DX12']),
  G('Star Wars Outlaws', ['outlaws_plus','outlaws'], ['Star Wars Outlaws'], 'Snowdrop', ['DX12']),
  G('Far Cry 3', ['farcry3','fc3'], ['Far Cry 3'], 'Dunia 2', ['DX11', 'DX9']),
  G('Far Cry 4', ['FarCry4'], ['Far Cry 4'], 'Dunia 2', ['DX11']),
  G('Watch Dogs 2', ['WatchDogs2'], ['WATCH_DOGS 2'], 'Disrupt', ['DX11']),
  G('Watch Dogs', ['watch_dogs'], ['Watch_Dogs'], 'Disrupt', ['DX11']),
  // Decima
  G('Until Dawn', ['UntilDawn'], ['Until Dawn'], 'Decima', ['DX12']),
  // Luminous / Square
  G('Forspoken', ['Forspoken'], ['FORSPOKEN'], 'Luminous', ['DX12']),
  G('Stellar Blade', ['StellarBlade'], ['Stellar Blade'], 'Unreal Engine 4', ['DX11']),
  // Call of Duty
  G('Call of Duty: Modern Warfare (2019)', ['ModernWarfare'], ['Call of Duty Modern Warfare'], 'IW 8.0', ['DX12']),
  G('Call of Duty: Warzone', ['cod'], ['Call of Duty'], 'IW 9.0', ['DX12']),
  G('Call of Duty: Black Ops Cold War', ['BlackOpsColdWar'], ['Call of Duty Black Ops Cold War'], 'IW 8.0', ['DX12']),
  G('Call of Duty: Black Ops 6', ['cod'], ['Call of Duty'], 'IW 9.0', ['DX12']),
  // Source / Valve
  G('Left 4 Dead 2', ['left4dead2'], ['Left 4 Dead 2'], 'Source', ['DX9']),
  G('Team Fortress 2', ['tf'], ['Team Fortress 2'], 'Source', ['DX9']),
  G('Counter-Strike 2', ['cs2'], ['Counter-Strike Global Offensive'], 'Source 2', ['DX11', 'Vulkan']),
  G('Dota 2', ['dota2'], ['dota 2 beta'], 'Source 2', ['DX11', 'Vulkan']),
  G('Half-Life: Alyx', ['hlvr'], ['Half-Life Alyx'], 'Source 2', ['Vulkan']),
  G('Garry\u2019s Mod', ['gmod','hl2'], ['GarrysMod'], 'Source', ['DX9']),
  G('Apex Legends', ['r5apex'], ['Apex Legends'], 'Source (modified)', ['DX11']),
  G('Titanfall 2', ['Titanfall2'], ['Titanfall2'], 'Source (modified)', ['DX11']),
  // FromSoftware
  G('Dark Souls II: Scholar of the First Sin', ['DarkSoulsII'], ['Dark Souls II Scholar of the First Sin'], 'FromSoftware Engine', ['DX11']),
  G('Dark Souls: Prepare to Die Edition', ['DARKSOULS'], ['Dark Souls Prepare to Die Edition'], 'FromSoftware Engine', ['DX9']),
  // Misc AAA / notable
  G('Divinity: Original Sin 2', ['EoCApp'], ['Divinity Original Sin 2'], 'Divinity 4.0', ['DX11', 'Vulkan']),
  G('Grounded', ['Maine-Win64-Shipping'], ['Grounded'], 'Unreal Engine 4', ['DX11', 'DX12']),
  G('Pentiment', ['Pentiment'], ['Pentiment'], 'Unity', ['DX11']),
  G('Sifu', ['Sifu'], ['Sifu'], 'Unreal Engine 4', ['DX11']),
  G('Returnal', ['Returnal-Win64-Shipping'], ['Returnal'], 'Unreal Engine 4', ['DX12']),
  G('Alan Wake', ['AlanWake'], ['Alan Wake'], 'Northlight', ['DX9']),
  G('Quantum Break', ['QuantumBreak'], ['Quantum Break'], 'Northlight', ['DX11']),
  G('Sackboy: A Big Adventure', ['Sackboy'], ['Sackboy A Big Adventure'], 'Unreal Engine 4', ['DX11', 'DX12']),
];

for (const g of GAMES2) GAMES.push(g);


/* ===== Popular series completions ===== */
const GAMES3 = [
  // Assassin's Creed (chronological)
  G("Assassin's Creed", ['AssassinsCreed_Dx10','AssassinsCreed_Dx9'], ['Assassins Creed'], 'Anvil', ['DX10', 'DX9']),
  G("Assassin's Creed II", ['AssassinsCreedIIGame'], ['Assassins Creed 2'], 'Anvil', ['DX9']),
  G("Assassin's Creed Brotherhood", ['ACBSP'], ['Assassins Creed Brotherhood'], 'Anvil', ['DX9', 'DX11']),
  G("Assassin's Creed Revelations", ['ACRSP'], ['Assassins Creed Revelations'], 'Anvil', ['DX9', 'DX11']),
  G("Assassin's Creed III", ['AC3SP'], ['Assassins Creed III'], 'AnvilNext', ['DX11', 'DX9']),
  G("Assassin's Creed IV: Black Flag", ['AC4BFSP'], ['Assassins Creed IV Black Flag'], 'AnvilNext', ['DX11']),
  G("Assassin's Creed Rogue", ['ACRogue'], ['Assassins Creed Rogue'], 'AnvilNext', ['DX11']),
  // Far Cry
  G('Far Cry 2', ['farcry2'], ['Far Cry 2'], 'Dunia', ['DX10', 'DX9']),
  G('Far Cry Primal', ['FarCryPrimal'], ['Far Cry Primal'], 'Dunia 2', ['DX11']),
  G('Far Cry New Dawn', ['FarCryNewDawn'], ['Far Cry New Dawn'], 'Dunia', ['DX11']),
  // Tomb Raider (classic reboot)
  G('Lara Croft: Tomb Raider Legend', ['trl'], ['Tomb Raider Legend'], 'Crystal Engine', ['DX9']),
  G('Tomb Raider: Underworld', ['tru'], ['Tomb Raider Underworld'], 'Crystal Engine', ['DX9']),
  // Hitman
  G('Hitman (2016)', ['Hitman'], ['Hitman'], 'Glacier 2', ['DX11', 'DX12']),
  G('Hitman 2', ['HITMAN2'], ['Hitman2'], 'Glacier 2', ['DX11', 'DX12']),
  G('Hitman: World of Assassination', ['HITMAN3'], ['HITMAN 3'], 'Glacier 2', ['DX12', 'DX11']),
  G('Hitman: Absolution', ['HMA'], ['Hitman Absolution'], 'Glacier 2', ['DX11']),
  G('Hitman: Blood Money', ['hitmanbloodmoney'], ['Hitman Blood Money'], 'Glacier', ['DX9']),
  // Total War
  G('Total War: Warhammer III', ['Warhammer3'], ['Total War WARHAMMER III'], 'TW Engine', ['DX11']),
  G('Total War: Warhammer II', ['Warhammer2'], ['Total War WARHAMMER II'], 'TW Engine', ['DX11']),
  G('Total War: Three Kingdoms', ['Three_Kingdoms'], ['Total War THREE KINGDOMS'], 'TW Engine', ['DX11']),
  G('Total War: Pharaoh', ['Pharaoh'], ['Total War PHARAOH'], 'TW Engine', ['DX11']),
  G('Total War: Rome II', ['Rome2'], ['Total War Rome II'], 'TW Engine', ['DX11']),
  // Civilization
  G('Sid Meier\u2019s Civilization VI', ['CivilizationVI', 'CivilizationVI_DX12'], ['Sid Meiers Civilization VI'], 'LORE', ['DX12', 'DX11']),
  G('Sid Meier\u2019s Civilization V', ['CivilizationV'], ['Sid Meiers Civilization V'], 'LORE', ['DX11', 'DX9']),
  G('Sid Meier\u2019s Civilization VII', ['Civ7'], ['Sid Meiers Civilization VII'], 'LORE', ['DX12']),
  // Halo
  G('Halo: The Master Chief Collection', ['MCC-Win64-Shipping', 'MCCWinStore-Win64-Shipping'], ['Halo The Master Chief Collection'], 'Blam!', ['DX11']),
  G('Halo Infinite', ['HaloInfinite'], ['Halo Infinite'], 'Slipspace', ['DX12']),
  // Forza
  G('Forza Horizon 4', ['ForzaHorizon4'], ['ForzaHorizon4'], 'ForzaTech', ['DX12']),
  G('Forza Motorsport (2023)', ['ForzaMotorsport'], ['Forza Motorsport'], 'ForzaTech', ['DX12']),
  // Yakuza / Like a Dragon
  G('Yakuza 0', ['Yakuza0'], ['Yakuza 0'], 'OGE', ['DX11']),
  G('Yakuza Kiwami', ['YakuzaKiwami'], ['Yakuza Kiwami'], 'OGE', ['DX11']),
  G('Like a Dragon: Infinite Wealth', ['LikeADragon8', 'InfiniteWealth'], ['Like a Dragon Infinite Wealth'], 'Dragon Engine', ['DX11']),
  G('Like a Dragon Gaiden', ['LikeADragonGaiden'], ['Like a Dragon Gaiden'], 'Dragon Engine', ['DX11']),
  G('Like a Dragon: Ishin!', ['Ishin'], ['Like a Dragon Ishin'], 'Unreal Engine 4', ['DX11']),
  G('Judgment', ['Judgment'], ['Judgment'], 'Dragon Engine', ['DX11']),
  G('Lost Judgment', ['LostJudgment'], ['Lost Judgment'], 'Dragon Engine', ['DX11']),
  // Persona / Atlus
  G('Persona 3 Reload', ['P3R'], ['P3R'], 'Unreal Engine 4', ['DX11']),
  G('Persona 5 Strikers', ['P5S'], ['P5S'], 'Silicon Studio', ['DX11']),
  G('Persona 5 Tactica', ['P5T'], ['P5T'], 'Unity', ['DX11']),
  G('Metaphor: ReFantazio', ['Metaphor'], ['Metaphor ReFantazio'], 'Catherine Engine', ['DX11']),
  G('Shin Megami Tensei V: Vengeance', ['SMTVV'], ['Shin Megami Tensei V Vengeance'], 'Unreal Engine 4', ['DX11']),
  // Final Fantasy
  G('Final Fantasy XIV', ['ffxiv_dx11'], ['FINAL FANTASY XIV Online'], 'Custom', ['DX11']),
  G('Final Fantasy X/X-2 HD Remaster', ['FFX', 'FFX-2'], ['FINAL FANTASY X X-2 HD Remaster'], 'Custom', ['DX11']),
  G('Final Fantasy XII: The Zodiac Age', ['FFXII_TZA'], ['FINAL FANTASY XII THE ZODIAC AGE'], 'Custom', ['DX11']),
  G('Crisis Core: Final Fantasy VII Reunion', ['crisiscoreff7reunion', 'ff7cc'], ['CRISIS CORE FINAL FANTASY VII REUNION'], 'Unreal Engine 4', ['DX11']),
  G('Stranger of Paradise: Final Fantasy Origin', ['FFOrigin'], ['STRANGER OF PARADISE FINAL FANTASY ORIGIN'], 'Unreal Engine 4', ['DX11']),
  // Devil May Cry
  G('Devil May Cry 4: Special Edition', ['DevilMayCry4SpecialEdition'], ['Devil May Cry 4 Special Edition'], 'MT Framework', ['DX11']),
  G('DmC: Devil May Cry', ['DMC-DevilMayCry'], ['DmC Devil May Cry'], 'Unreal Engine 3', ['DX9', 'DX11']),
  // Saints Row
  G('Saints Row: The Third Remastered', ['SaintsRowTheThirdRemastered'], ['Saints Row The Third Remastered'], 'CTG', ['DX11']),
  G('Saints Row IV', ['SaintsRowIV'], ['Saints Row IV'], 'CTG', ['DX11', 'DX9']),
  G('Saints Row (2022)', ['SaintsRow'], ['Saints Row'], 'Unreal Engine 4', ['DX12', 'DX11']),
  // Tom Clancy
  G("Tom Clancy's Splinter Cell: Blacklist", ['Blacklist_game', 'Blacklist_DX11_game'], ['Tom Clancys Splinter Cell Blacklist'], 'LEAD', ['DX11']),
  G("Tom Clancy's Ghost Recon Wildlands", ['GRW'], ['Ghost Recon Wildlands'], 'AnvilNext', ['DX11']),
  G("Tom Clancy's Ghost Recon Breakpoint", ['GRB'], ['Ghost Recon Breakpoint'], 'AnvilNext', ['DX11', 'DX12']),
  G("Tom Clancy's Rainbow Six Siege", ['RainbowSix', 'RainbowSix_Vulkan'], ['Tom Clancys Rainbow Six Siege'], 'AnvilNext', ['DX11', 'Vulkan']),
  // Half-Life / Valve classics
  G('Half-Life', ['hl'], ['Half-Life'], 'GoldSrc', ['DX9', 'OpenGL']),
  G('Black Mesa', ['bms', 'hl2'], ['Black Mesa'], 'Source', ['DX9']),
  G('Portal', ['portal', 'hl2'], ['Portal'], 'Source', ['DX9']),
  G('Left 4 Dead', ['left4dead'], ['Left 4 Dead'], 'Source', ['DX9']),
  // Blizzard / ARPG
  G('Diablo IV', ['Diablo IV', 'fenris'], ['Diablo IV'], 'Custom', ['DX12']),
  G('Diablo III', ['Diablo III64'], ['Diablo III'], 'Custom', ['DX11', 'DX9']),
  G('Diablo II: Resurrected', ['D2R'], ['Diablo II Resurrected'], 'Custom', ['DX11', 'Vulkan']),
  G('World of Warcraft', ['Wow', 'WowClassic'], ['World of Warcraft'], 'Custom', ['DX12', 'DX11']),
  G('StarCraft II', ['SC2_x64'], ['StarCraft II'], 'Custom', ['DX11', 'DX9']),
  G('Overwatch 2', ['Overwatch'], ['Overwatch'], 'Custom', ['DX11']),
  G('Warcraft III: Reforged', ['Warcraft III'], ['Warcraft III'], 'Custom', ['DX11']),
  // Path of Exile / Destiny / Warframe
  G('Path of Exile', ['PathOfExile', 'PathOfExile_x64'], ['Path of Exile'], 'Custom', ['DX11', 'Vulkan']),
  G('Path of Exile 2', ['PathOfExile2', 'PathOfExileSteam'], ['Path of Exile 2'], 'Custom', ['DX12', 'Vulkan']),
  G('Destiny 2', ['destiny2'], ['Destiny 2'], 'Tiger Engine', ['DX11']),
  G('Warframe', ['Warframe.x64'], ['Warframe'], 'Evolution', ['DX11', 'DX12', 'Vulkan']),
  // Sonic / Sega
  G('Sonic Frontiers', ['SonicFrontiers'], ['SonicFrontiers'], 'Hedgehog Engine 2', ['DX11']),
  G('Sonic x Shadow Generations', ['SonicXShadowGenerations'], ['Sonic x Shadow Generations'], 'Hedgehog Engine 2', ['DX11']),
  // Fighting
  G('Street Fighter V', ['StreetFighterV'], ['StreetFighterV'], 'Unreal Engine 4', ['DX11']),
  G('Guilty Gear -Strive-', ['GGST'], ['GUILTY GEAR STRIVE'], 'Unreal Engine 4', ['DX11']),
  // Strategy / builders
  G('Age of Empires IV', ['RelicCardinal'], ['Age of Empires IV'], 'Essence', ['DX12']),
  G('Age of Empires II: Definitive Edition', ['AoE2DE_s'], ['AoE2DE'], 'Genie/Custom', ['DX11']),
  G('Anno 1800', ['Anno1800'], ['Anno 1800'], 'Anno Engine', ['DX12', 'DX11']),
  // Co-op / live service (UE)
  G('Dead by Daylight', ['DeadByDaylight-Win64-Shipping'], ['Dead by Daylight'], 'Unreal Engine 4', ['DX11']),
  G('Deep Rock Galactic', ['FSD-Win64-Shipping'], ['Deep Rock Galactic'], 'Unreal Engine 4', ['DX11', 'DX12']),
  G('Helldivers 2', ['helldivers2'], ['Helldivers 2'], 'Autodesk Stingray', ['DX11']),
  G('The Finals', ['Discovery'], ['The Finals'], 'Unreal Engine 5', ['DX12']),
  G('Marvel Rivals', ['Marvel-Win64-Shipping'], ['MarvelRivals'], 'Unreal Engine 5', ['DX12', 'DX11']),
  G('Warhammer 40,000: Space Marine 2', ['Warhammer 40000 Space Marine 2'], ['Warhammer 40000 Space Marine 2'], 'Swarm Engine', ['DX12']),
  G('Warhammer 40,000: Darktide', ['darktide'], ['Warhammer 40000 DARKTIDE'], 'Autodesk Stingray', ['DX12', 'DX11']),
  G('Granblue Fantasy: Relink', ['granblue_fantasy_relink'], ['Granblue Fantasy Relink'], 'Custom', ['DX11', 'DX12']),
  G('Once Human', ['Once Human'], ['Once Human'], 'Unreal Engine 4', ['DX11']),
  // Bethesda / RPG
  G('The Elder Scrolls Online', ['eso64'], ['Zenimax Online', 'The Elder Scrolls Online'], 'HeroEngine', ['DX11']),
  G('The Elder Scrolls III: Morrowind', ['Morrowind'], ['Morrowind'], 'NetImmerse', ['DX9']),
  // Indie / other popular
  G('Terraria', ['Terraria'], ['Terraria'], 'XNA/FNA', ['DX11', 'OpenGL']),
  G('Stardew Valley', ['Stardew Valley'], ['Stardew Valley'], 'MonoGame', ['DX11', 'OpenGL']),
  G('The Sims 4', ['TS4_x64'], ['The Sims 4'], 'Custom', ['DX9']),
  G('No Man\u2019s Sky', ['NMS'], ['No Mans Sky'], 'Custom', ['Vulkan', 'DX11']),
  G('Grand Theft Auto: Vice City', ['gta-vc'], ['Grand Theft Auto Vice City'], 'RenderWare', ['DX9'])
];

for (const g of GAMES3) GAMES.push(g);


/* ===== Broad expansion (racing, survival, strategy, sim, RPG, fighting, indie, horror, shooters, MMO) ===== */
const GAMES4 = [
  // Racing / driving
  G('Assetto Corsa', ['acs'], ['assettocorsa'], 'Custom', ['DX11']),
  G('Assetto Corsa Competizione', ['AC2-Win64-Shipping'], ['Assetto Corsa Competizione'], 'Unreal Engine 4', ['DX11']),
  G('Assetto Corsa EVO', ['AC2'], ['Assetto Corsa EVO'], 'Unreal Engine 5', ['DX12']),
  G('F1 24', ['F1_24'], ['F1 24'], 'EGO Engine', ['DX12']),
  G('F1 23', ['F1_23'], ['F1 23'], 'EGO Engine', ['DX12', 'DX11']),
  G('DiRT Rally 2.0', ['dirtrally2'], ['DiRT Rally 2.0'], 'EGO Engine', ['DX11']),
  G('EA Sports WRC', ['WRC'], ['EA SPORTS WRC'], 'Unreal Engine 4', ['DX12']),
  G('Wreckfest', ['Wreckfest_x64'], ['Wreckfest'], 'ROMU', ['DX11', 'DX9']),
  G('BeamNG.drive', ['BeamNG.drive.x64'], ['BeamNG.drive'], 'Custom', ['DX11']),
  G('The Crew Motorfest', ['MotorFest'], ['The Crew Motorfest'], 'Custom', ['DX12', 'DX11']),
  G('Need for Speed: Most Wanted (2012)', ['NFS13'], ['Need For Speed Most Wanted'], 'Frostbite 2', ['DX11']),
  G('Forza Horizon 3', ['ForzaHorizon3'], ['ForzaHorizon3'], 'ForzaTech', ['DX12']),
  G('Trackmania', ['Trackmania'], ['Trackmania'], 'ManiaPlanet', ['DX11']),
  // Survival / crafting
  G('Satisfactory', ['FactoryGame-Win64-Shipping'], ['Satisfactory'], 'Unreal Engine 5', ['DX12', 'Vulkan']),
  G('Factorio', ['factorio'], ['Factorio'], 'Custom', ['DX11', 'OpenGL', 'Vulkan']),
  G('Astroneer', ['Astro-Win64-Shipping'], ['Astroneer'], 'Unreal Engine 4', ['DX11']),
  G('Raft', ['Raft'], ['Raft'], 'Unity', ['DX11']),
  G('Icarus', ['Icarus-Win64-Shipping'], ['Icarus'], 'Unreal Engine 4', ['DX11', 'DX12']),
  G('Conan Exiles', ['ConanSandbox-Win64-Shipping'], ['Conan Exiles'], 'Unreal Engine 4', ['DX11', 'DX12']),
  G('DayZ', ['DayZ_x64'], ['DayZ'], 'Enfusion', ['DX11']),
  G('Project Zomboid', ['ProjectZomboid64'], ['ProjectZomboid'], 'Custom (Java)', ['OpenGL']),
  G("Don't Starve Together", ['dontstarve_steam_x64'], ['Dont Starve Together'], 'Custom', ['DX11', 'OpenGL']),
  G('The Long Dark', ['tld'], ['TheLongDark'], 'Unity', ['DX11']),
  G('Nightingale', ['Nightingale-Win64-Shipping'], ['Nightingale'], 'Unreal Engine 5', ['DX12']),
  G('Core Keeper', ['CoreKeeper'], ['Core Keeper'], 'Unity', ['DX11']),
  G('Abiotic Factor', ['AbioticFactor-Win64-Shipping'], ['AbioticFactor'], 'Unreal Engine 5', ['DX11']),
  G('Vintage Story', ['Vintagestory'], ['Vintagestory'], 'Custom', ['OpenGL']),
  // Strategy / 4X / grand strategy
  G('Stellaris', ['stellaris'], ['Stellaris'], 'Clausewitz', ['DX11', 'DX9']),
  G('Europa Universalis IV', ['eu4'], ['Europa Universalis IV'], 'Clausewitz', ['DX9', 'DX11']),
  G('Hearts of Iron IV', ['hoi4'], ['Hearts of Iron IV'], 'Clausewitz', ['DX11', 'DX9']),
  G('Crusader Kings III', ['ck3'], ['Crusader Kings III'], 'Clausewitz', ['DX11', 'Vulkan']),
  G('Victoria 3', ['victoria3'], ['Victoria 3'], 'Clausewitz', ['DX11', 'Vulkan']),
  G('Company of Heroes 3', ['RelicCOH3'], ['Company of Heroes 3'], 'Essence', ['DX11', 'DX12']),
  G('Company of Heroes 2', ['RelicCoH2'], ['Company of Heroes 2'], 'Essence', ['DX11']),
  G('Frostpunk', ['Frostpunk'], ['Frostpunk'], 'Liquid Engine', ['DX11']),
  G('Frostpunk 2', ['Frostpunk2-Win64-Shipping'], ['Frostpunk 2'], 'Unreal Engine 5', ['DX12']),
  G('Manor Lords', ['ManorLords-Win64-Shipping'], ['Manor Lords'], 'Unreal Engine 5', ['DX12', 'DX11']),
  G('They Are Billions', ['TheyAreBillions'], ['They Are Billions'], 'Custom', ['DX11']),
  G('Tropico 6', ['Tropico6-Win64-Shipping'], ['Tropico 6'], 'Unreal Engine 4', ['DX11']),
  G('Northgard', ['Northgard'], ['Northgard'], 'Heaps', ['DX11', 'OpenGL']),
  G('Surviving Mars', ['MarsSteam'], ['Surviving Mars'], 'Custom', ['DX11', 'OpenGL']),
  G('Homeworld 3', ['Homeworld3'], ['Homeworld 3'], 'Unreal Engine 4', ['DX12', 'DX11']),
  G('Against the Storm', ['Against the Storm'], ['Against the Storm'], 'Unity', ['DX11']),
  G('Age of Wonders 4', ['AOW4-Win64-Shipping'], ['Age of Wonders 4'], 'Unreal Engine 4', ['DX11']),
  G('Humankind', ['Humankind'], ['Humankind'], 'Custom', ['DX11', 'DX12']),
  // Simulation
  G('Euro Truck Simulator 2', ['eurotrucks2'], ['Euro Truck Simulator 2'], 'Prism3D', ['DX11', 'OpenGL', 'Vulkan']),
  G('American Truck Simulator', ['amtrucks'], ['American Truck Simulator'], 'Prism3D', ['DX11', 'OpenGL', 'Vulkan']),
  G('Farming Simulator 25', ['FarmingSimulator2025'], ['Farming Simulator 25'], 'GIANTS Engine', ['DX12', 'DX11']),
  G('Farming Simulator 22', ['FarmingSimulator2022'], ['Farming Simulator 22'], 'GIANTS Engine', ['DX12', 'DX11']),
  G('PowerWash Simulator', ['PowerWashSimulator'], ['PowerWash Simulator'], 'Unity', ['DX11']),
  G('House Flipper 2', ['HouseFlipper2'], ['House Flipper 2'], 'Unreal Engine 5', ['DX12']),
  G('Planet Coaster 2', ['PlanetCoaster2'], ['Planet Coaster 2'], 'Cobra', ['DX12', 'DX11']),
  G('Planet Zoo', ['PlanetZoo'], ['Planet Zoo'], 'Cobra', ['DX11']),
  G('Jurassic World Evolution 2', ['JWE2'], ['Jurassic World Evolution 2'], 'Cobra', ['DX11']),
  G('Two Point Hospital', ['Two Point Hospital'], ['Two Point Hospital'], 'Unity', ['DX11']),
  G('Microsoft Flight Simulator 2024', ['FlightSimulator2024'], ['Microsoft Flight Simulator 2024'], 'Custom', ['DX12', 'DX11']),
  // RPG / JRPG / ARPG
  G('Divinity: Original Sin (Enhanced Edition)', ['EoCApp'], ['Divinity Original Sin Enhanced Edition'], 'Divinity Engine', ['DX11']),
  G('Disco Elysium', ['disco'], ['Disco Elysium'], 'Unity', ['DX11']),
  G('Pathfinder: Wrath of the Righteous', ['Wrath'], ['Pathfinder Wrath of the Righteous'], 'Unity', ['DX11']),
  G('Pathfinder: Kingmaker', ['Kingmaker'], ['Pathfinder Kingmaker'], 'Unity', ['DX11']),
  G('Warhammer 40,000: Rogue Trader', ['WH40KRT'], ['Warhammer 40000 Rogue Trader'], 'Unity', ['DX11']),
  G('Nioh 2', ['nioh2'], ['Nioh2'], 'Katana Engine', ['DX11']),
  G('Nioh: Complete Edition', ['nioh'], ['Nioh'], 'Katana Engine', ['DX11']),
  G('Wo Long: Fallen Dynasty', ['wolong'], ['Wo Long Fallen Dynasty'], 'Katana Engine', ['DX12']),
  G('Rise of the Ronin', ['RiseOfTheRonin'], ['Rise of the Ronin'], 'Katana Engine', ['DX12']),
  G('Code Vein', ['CodeVein-Win64-Shipping'], ['CODE VEIN'], 'Unreal Engine 4', ['DX11']),
  G('Scarlet Nexus', ['ScarletNexus'], ['SCARLET NEXUS'], 'Unreal Engine 4', ['DX11']),
  G('Tales of Arise', ['Tales of Arise'], ['Tales of Arise'], 'Unreal Engine 4', ['DX11']),
  G('Ys X: Nordics', ['ys_x'], ['Ys X Nordics'], 'Custom', ['DX11']),
  G('The Legend of Heroes: Trails through Daybreak', ['ed9'], ['Trails through Daybreak'], 'Custom', ['DX11']),
  G('Star Ocean: The Second Story R', ['SO2R'], ['STAR OCEAN THE SECOND STORY R'], 'Unity', ['DX11']),
  G('Sea of Stars', ['SeaOfStars'], ['Sea of Stars'], 'Unity', ['DX11']),
  G('Avowed', ['Avowed'], ['Avowed'], 'Unreal Engine 5', ['DX12']),
  G('Clair Obscur: Expedition 33', ['Expedition33'], ['Expedition 33'], 'Unreal Engine 5', ['DX12']),
  G('Wartales', ['Wartales'], ['Wartales'], 'Custom', ['DX11']),
  G('Solasta: Crown of the Magister', ['Solasta'], ['Solasta Crown of the Magister'], 'Unity', ['DX11']),
  // Fighting
  G('Dragon Ball FighterZ', ['DBFighterZ'], ['DRAGON BALL FighterZ'], 'Unreal Engine 4', ['DX11']),
  G('Dragon Ball: Sparking! Zero', ['SparkingZERO'], ['SPARKING ZERO'], 'Unreal Engine 5', ['DX12']),
  G('Injustice 2', ['Injustice2'], ['Injustice 2'], 'Unreal Engine 3', ['DX11']),
  G('The King of Fighters XV', ['KOFXV'], ['The King of Fighters XV'], 'Unreal Engine 4', ['DX11']),
  G('Granblue Fantasy Versus: Rising', ['GBVSR'], ['Granblue Fantasy Versus Rising'], 'Unreal Engine 4', ['DX11']),
  G('MultiVersus', ['MultiVersus'], ['MultiVersus'], 'Unreal Engine 5', ['DX12', 'DX11']),
  G('Brawlhalla', ['Brawlhalla'], ['Brawlhalla'], 'Air Engine', ['DX11']),
  // Indie / platformer
  G('Celeste', ['Celeste'], ['Celeste'], 'FNA/MonoGame', ['OpenGL', 'DX11']),
  G('Dead Cells', ['deadcells'], ['Dead Cells'], 'Heaps', ['DX11', 'OpenGL']),
  G('Psychonauts 2', ['Psychonauts2'], ['Psychonauts 2'], 'Unreal Engine 4', ['DX11']),
  G('A Hat in Time', ['HatinTimeGame'], ['HatinTime'], 'Unreal Engine 3', ['DX9', 'DX11']),
  G('Blasphemous 2', ['Blasphemous 2'], ['Blasphemous 2'], 'Unity', ['DX11']),
  G('Nine Sols', ['NineSols'], ['Nine Sols'], 'Unity', ['DX11']),
  G('Pizza Tower', ['PizzaTower'], ['Pizza Tower'], 'GameMaker', ['DX11']),
  G('Balatro', ['Balatro'], ['Balatro'], 'LOVE', ['OpenGL']),
  G('Animal Well', ['Animal Well'], ['Animal Well'], 'Custom', ['DX11']),
  G('Crash Bandicoot N. Sane Trilogy', ['CrashBandicootNSaneTrilogy'], ['Crash Bandicoot N Sane Trilogy'], 'Unreal Engine 4', ['DX11']),
  G('Spyro Reignited Trilogy', ['Spyro'], ['Spyro Reignited Trilogy'], 'Unreal Engine 4', ['DX11']),
  // Horror
  G('Amnesia: The Bunker', ['Amnesia_TheBunker'], ['Amnesia The Bunker'], 'HPL3', ['OpenGL', 'Vulkan']),
  G('SOMA', ['soma'], ['SOMA'], 'HPL3', ['OpenGL']),
  G('Outlast', ['OLGame'], ['Outlast'], 'Unreal Engine 3', ['DX9', 'DX11']),
  G('The Outlast Trials', ['OPP-Win64-Shipping'], ['The Outlast Trials'], 'Unreal Engine 4', ['DX11']),
  G('The Evil Within', ['EvilWithin'], ['The Evil Within'], 'id Tech 5', ['OpenGL']),
  G('The Evil Within 2', ['EvilWithin2'], ['The Evil Within 2'], 'STEM/id Tech', ['DX11']),
  G('Visage', ['Visage-Win64-Shipping'], ['Visage'], 'Unreal Engine 4', ['DX11']),
  // Shooters
  G('Doom 3', ['Doom3', 'Doom3BFG'], ['DOOM 3'], 'id Tech 4', ['OpenGL']),
  G('Quake', ['quake'], ['Quake'], 'id Tech (KEX)', ['Vulkan', 'OpenGL']),
  G('Serious Sam 4', ['Sam4'], ['Serious Sam 4'], 'Serious Engine', ['DX11', 'Vulkan']),
  G('Bulletstorm: Full Clip Edition', ['Bulletstorm'], ['Bulletstorm Full Clip Edition'], 'Unreal Engine 3', ['DX11']),
  G('Sniper Elite 5', ['SniperElite5'], ['Sniper Elite 5'], 'Asura', ['DX12', 'DX11']),
  G('Sniper Elite 4', ['SniperElite4_DX11'], ['Sniper Elite 4'], 'Asura', ['DX11', 'DX12']),
  G('Killing Floor 2', ['KFGame'], ['killingfloor2'], 'Unreal Engine 3', ['DX11']),
  G('Insurgency: Sandstorm', ['InsurgencyClient-Win64-Shipping'], ['Insurgency Sandstorm'], 'Unreal Engine 4', ['DX11']),
  G('Hell Let Loose', ['HLL-Win64-Shipping'], ['Hell Let Loose'], 'Unreal Engine 4', ['DX11']),
  G('Back 4 Blood', ['Gobland-Win64-Shipping'], ['Back 4 Blood'], 'Unreal Engine 4', ['DX11', 'DX12']),
  G('Indiana Jones and the Great Circle', ['TheGreatCircle'], ['Indiana Jones and the Great Circle'], 'id Tech 7', ['Vulkan']),
  // MMO / online
  G('Guild Wars 2', ['Gw2-64'], ['Guild Wars 2'], 'Custom', ['DX11', 'DX9']),
  G('New World', ['NewWorld'], ['New World'], 'Amazon Lumberyard', ['DX12', 'DX11']),
  G('Lost Ark', ['LOSTARK'], ['Lost Ark'], 'Unreal Engine 3', ['DX9', 'DX11']),
  G('Black Desert Online', ['BlackDesert64'], ['Black Desert'], 'BlackSpace', ['DX11']),
  G('Throne and Liberty', ['TL'], ['Throne and Liberty'], 'Unreal Engine 4', ['DX11']),
  // MOBA / competitive
  G('League of Legends', ['League of Legends'], ['League of Legends'], 'Custom', ['DX11', 'DX9']),
  G('VALORANT', ['VALORANT-Win64-Shipping'], ['VALORANT'], 'Unreal Engine 4', ['DX11']),
  G('Rocket League', ['RocketLeague'], ['rocketleague'], 'Unreal Engine 3', ['DX11', 'DX9']),
  G('Deadlock', ['deadlock'], ['Deadlock'], 'Source 2', ['DX11', 'Vulkan']),
  G('SMITE 2', ['Smite2'], ['SMITE 2'], 'Unreal Engine 5', ['DX12', 'DX11']),
  // More AAA
  G("Ratchet & Clank: Rift Apart", ['RiftApart'], ['Ratchet and Clank Rift Apart'], 'Insomniac Engine', ['DX12']),
  G('Mafia II: Definitive Edition', ['mafia2definitiveedition'], ['Mafia II Definitive Edition'], 'Illusion Engine', ['DX11']),
  G('Mafia III: Definitive Edition', ['mafia3definitiveedition'], ['Mafia III Definitive Edition'], 'Illusion Engine', ['DX11']),
  G('The Crew 2', ['TheCrew2'], ['The Crew 2'], 'Custom', ['DX11']),
  G('Star Wars: Battlefront (2015)', ['starwarsbattlefront'], ['STAR WARS Battlefront'], 'Frostbite 3', ['DX11']),
  G('Star Wars: The Force Unleashed', ['SWTFU'], ['Star Wars The Force Unleashed'], 'Ronin (custom)', ['DX9'])
];

for (const g of GAMES4) GAMES.push(g);


/* ===== RPG series: Final Fantasy, Persona/Atlus, JRPG & CRPG franchises ===== */
const GAMES5 = [
  // Final Fantasy
  G('Final Fantasy (Pixel Remaster)', ['FINAL FANTASY'], ['FINAL FANTASY PR'], 'Unity', ['DX11']),
  G('Final Fantasy VI (Pixel Remaster)', ['FINAL FANTASY VI PR'], ['FINAL FANTASY VI PR'], 'Unity', ['DX11']),
  G('Final Fantasy VII', ['ff7_en', 'ff7'], ['FINAL FANTASY VII'], 'Custom', ['DX11']),
  G('Final Fantasy VIII Remastered', ['FFVIII'], ['FINAL FANTASY VIII Remastered'], 'Custom', ['DX11']),
  G('Final Fantasy IX', ['FF9'], ['FINAL FANTASY IX'], 'Unity', ['DX11']),
  G('Final Fantasy XIII', ['ffxiiiimg'], ['FINAL FANTASY XIII'], 'Crystal Tools', ['DX11']),
  G('Final Fantasy XIII-2', ['FFXIII2img'], ['FINAL FANTASY XIII-2'], 'Crystal Tools', ['DX11']),
  G('Lightning Returns: Final Fantasy XIII', ['SCE'], ['LRFF13'], 'Crystal Tools', ['DX11']),
  G('World of Final Fantasy', ['WOFF'], ['WORLD OF FINAL FANTASY'], 'Custom', ['DX11']),
  G('Final Fantasy Type-0 HD', ['fftype0hd'], ['FINAL FANTASY TYPE-0 HD'], 'Custom', ['DX11']),
  // Persona / Atlus (adds)
  G('Persona 3 Portable', ['P3P'], ['P3P'], 'Unity', ['DX11']),
  G('Persona 4 Arena Ultimax', ['p4u2'], ['Persona 4 Arena Ultimax'], 'Custom', ['DX9']),
  // Kingdom Hearts
  G('Kingdom Hearts HD 1.5+2.5 ReMIX', ['KINGDOM HEARTS HD 1.5+2.5 ReMIX'], ['KINGDOM HEARTS HD 1.5+2.5 ReMIX'], 'Unreal Engine 4', ['DX11']),
  G('Kingdom Hearts HD 2.8 Final Chapter Prologue', ['KINGDOM HEARTS HD 2.8 Final Chapter Prologue'], ['KINGDOM HEARTS HD 2.8'], 'Unreal Engine 4', ['DX11']),
  // Dragon Quest
  G('Dragon Quest Builders 2', ['DQB2'], ['DRAGON QUEST BUILDERS 2'], 'Custom', ['DX11']),
  G('Dragon Quest III HD-2D Remake', ['DRAGON QUEST III HD-2D Remake'], ['DRAGON QUEST III HD-2D Remake'], 'Unreal Engine 4', ['DX11']),
  // Tales of
  G('Tales of Berseria', ['TOB'], ['Tales of Berseria'], 'Custom', ['DX11']),
  G('Tales of Zestiria', ['Tales of Zestiria'], ['Tales of Zestiria'], 'Custom', ['DX11']),
  G('Tales of Vesperia: Definitive Edition', ['TOV_DE'], ['Tales of Vesperia Definitive Edition'], 'Unreal Engine 3', ['DX11']),
  G('Tales of Symphonia Remastered', ['Tales of Symphonia Remastered'], ['Tales of Symphonia Remastered'], 'Custom', ['DX11']),
  // Ys
  G('Ys VIII: Lacrimosa of Dana', ['ys8'], ['Ys VIII Lacrimosa of DANA'], 'Custom', ['DX11']),
  G('Ys IX: Monstrum Nox', ['ys9'], ['Ys IX Monstrum Nox'], 'Custom', ['DX11']),
  G('Ys Origin', ['ys_origin'], ['Ys Origin'], 'Custom', ['DX9']),
  // Trails / Legend of Heroes
  G('The Legend of Heroes: Trails of Cold Steel', ['ed8'], ['Trails of Cold Steel'], 'PhyreEngine', ['DX11']),
  G('The Legend of Heroes: Trails of Cold Steel II', ['ed8_2'], ['Trails of Cold Steel II'], 'PhyreEngine', ['DX11']),
  G('The Legend of Heroes: Trails of Cold Steel III', ['ed8_3'], ['Trails of Cold Steel III'], 'PhyreEngine', ['DX11']),
  G('The Legend of Heroes: Trails of Cold Steel IV', ['ed8_4'], ['Trails of Cold Steel IV'], 'PhyreEngine', ['DX11']),
  G('The Legend of Heroes: Trails into Reverie', ['hnk'], ['Trails into Reverie'], 'PhyreEngine', ['DX11']),
  // Star Ocean / Atelier
  G('Star Ocean: The Divine Force', ['SOTDF', 'StarOcean6'], ['STAR OCEAN THE DIVINE FORCE'], 'Unreal Engine 4', ['DX11']),
  G('Atelier Ryza: Ever Darkness & the Secret Hideout', ['Atelier_Ryza'], ['Atelier Ryza'], 'Custom', ['DX11']),
  G('Atelier Ryza 2', ['Atelier_Ryza_2'], ['Atelier Ryza 2'], 'Custom', ['DX11']),
  G('Atelier Ryza 3', ['Atelier_Ryza_3'], ['Atelier Ryza 3'], 'Custom', ['DX11']),
  // Ni no Kuni II / Mana / Octopath II / HD-2D
  G('Ni no Kuni II: Revenant Kingdom', ['Nino2'], ['Ni no Kuni II Revenant Kingdom'], 'Custom', ['DX11']),
  G('Trials of Mana', ['TOM'], ['Trials of Mana'], 'Unreal Engine 4', ['DX11']),
  G('Visions of Mana', ['VoM'], ['Visions of Mana'], 'Unreal Engine 4', ['DX11']),
  G('Octopath Traveler II', ['Octopath_Traveler2'], ['Octopath Traveler II'], 'Unreal Engine 4', ['DX11']),
  G('Triangle Strategy', ['Triangle Strategy'], ['Triangle Strategy'], 'Unreal Engine 4', ['DX11']),
  G('Live A Live', ['LiveALive'], ['LIVE A LIVE'], 'Unreal Engine 4', ['DX11']),
  G('Eiyuden Chronicle: Hundred Heroes', ['Eiyuden'], ['Eiyuden Chronicle Hundred Heroes'], 'Unreal Engine 4', ['DX11']),
  G('Chained Echoes', ['Chained Echoes'], ['Chained Echoes'], 'MonoGame', ['DX11']),
  G('Fantasian Neo Dimension', ['Fantasian'], ['Fantasian Neo Dimension'], 'Unity', ['DX11']),
  G('Romancing SaGa 2: Revenge of the Seven', ['RSG2ROTS'], ['Romancing SaGa 2 Revenge of the Seven'], 'Unreal Engine 4', ['DX11']),
  // Dragon's Dogma
  G("Dragon's Dogma: Dark Arisen", ['DDDA'], ['DDDA'], 'MT Framework', ['DX9']),
  // CRPG franchises
  G('Baldur\u2019s Gate: Enhanced Edition', ['Baldur'], ['Baldurs Gate Enhanced Edition'], 'Infinity (EE)', ['OpenGL', 'DX11']),
  G('Baldur\u2019s Gate II: Enhanced Edition', ['BaldursGateII'], ['Baldurs Gate II Enhanced Edition'], 'Infinity (EE)', ['OpenGL', 'DX11']),
  G('Planescape: Torment: Enhanced Edition', ['Torment'], ['Planescape Torment Enhanced Edition'], 'Infinity (EE)', ['OpenGL', 'DX11']),
  G('Neverwinter Nights: Enhanced Edition', ['nwmain'], ['Neverwinter Nights Enhanced Edition'], 'Aurora', ['DX11', 'OpenGL', 'Vulkan']),
  G('Icewind Dale: Enhanced Edition', ['icewind'], ['Icewind Dale Enhanced Edition'], 'Infinity (EE)', ['OpenGL', 'DX11']),
  G('Torment: Tides of Numenera', ['TidesOfNumenera'], ['Torment Tides of Numenera'], 'Unity', ['DX11']),
  G('Tyranny', ['Tyranny'], ['Tyranny'], 'Unity', ['DX11']),
  G('Wasteland 2: Director\u2019s Cut', ['WL2'], ['Wasteland 2'], 'Unity', ['DX11']),
  // Action-RPG / Euro-RPG
  G('GreedFall', ['GreedFall'], ['GreedFall'], 'Silk Engine', ['DX11']),
  G('GreedFall II: The Dying World', ['GreedFall2'], ['GreedFall II'], 'Unreal Engine', ['DX11']),
  G('ELEX', ['ELEX'], ['ELEX'], 'Genome', ['DX11']),
  G('ELEX II', ['ELEX2'], ['ELEX II'], 'Genome', ['DX11']),
  G('Gothic 3', ['Gothic3'], ['Gothic 3'], 'Genome', ['DX9']),
  G('Gothic II: Gold Edition', ['Gothic2'], ['Gothic II Gold Edition'], 'ZenGin', ['DX7']),
  G('Risen', ['Risen'], ['Risen'], 'Genome', ['DX9']),
  G('Outward', ['Outward'], ['Outward Definitive Edition'], 'Unity', ['DX11']),
  G('The Bard\u2019s Tale IV', ['BardsTale-Win64-Shipping'], ['The Bards Tale IV'], 'Unreal Engine 4', ['DX11']),
  G('Encased', ['Encased'], ['Encased'], 'Unity', ['DX11'])
];

for (const g of GAMES5) GAMES.push(g);


/* ===== Remedy · Ubisoft · Atlus · Square Enix · Yakuza (RGG) ===== */
const GAMES6 = [
  // --- Remedy ---
  G("Alan Wake's American Nightmare", ['AlanWakesAmericanNightmare'], ['Alan Wakes American Nightmare'], 'Northlight', ['DX9']),
  G('Max Payne', ['MaxPayne'], ['Max Payne'], 'MAX-FX', ['DX8', 'DX9']),
  G('Max Payne 2: The Fall of Max Payne', ['MaxPayne2'], ['Max Payne 2 The Fall of Max Payne'], 'MAX-FX 2', ['DX9']),
  G('FBC: Firebreak', ['Firebreak'], ['FBC Firebreak'], 'Northlight', ['DX12']),
  // --- Ubisoft ---
  G('Prince of Persia: The Sands of Time', ['POP_The_Sands_of_Time'], ['Prince of Persia The Sands of Time'], 'Jade', ['DX9']),
  G('Prince of Persia: Warrior Within', ['PrinceOfPersia2'], ['Prince of Persia Warrior Within'], 'Jade', ['DX9']),
  G('Prince of Persia: The Two Thrones', ['POP3'], ['Prince of Persia The Two Thrones'], 'Jade', ['DX9']),
  G('Prince of Persia (2008)', ['Prince of Persia'], ['Prince of Persia'], 'Anvil', ['DX9']),
  G('Prince of Persia: The Forgotten Sands', ['POP_TFS_Game'], ['Prince of Persia The Forgotten Sands'], 'Anvil', ['DX9']),
  G('Prince of Persia: The Lost Crown', ['PrinceofPersia_TheLostCrown'], ['Prince of Persia The Lost Crown'], 'Ubisoft Anvil', ['DX12', 'DX11']),
  G('Rayman Legends', ['Rayman Legends', 'LegendsUplay_full_x64'], ['Rayman Legends'], 'UbiArt', ['DX11']),
  G('Rayman Origins', ['Rayman Origins'], ['Rayman Origins'], 'UbiArt', ['DX9']),
  G('For Honor', ['ForHonor', 'forhonor'], ['For Honor'], 'AnvilNext 2.0', ['DX11']),
  G('Immortals Fenyx Rising', ['Immortals Fenyx Rising'], ['ImmortalsFenyxRising'], 'AnvilNext', ['DX11', 'DX12']),
  G("Tom Clancy's Splinter Cell: Chaos Theory", ['splintercell3'], ['Splinter Cell Chaos Theory'], 'Unreal Engine 2', ['DX9']),
  G("Tom Clancy's Splinter Cell: Conviction", ['conviction_game'], ['Splinter Cell Conviction'], 'Unreal Engine 2.5', ['DX9', 'DX10']),
  G("Tom Clancy's Ghost Recon: Future Soldier", ['GRFS'], ['Ghost Recon Future Soldier'], 'YETI', ['DX11']),
  G("Tom Clancy's Rainbow Six Vegas 2", ['R6Vegas2_Game'], ['Rainbow Six Vegas 2'], 'Unreal Engine 2.5', ['DX9']),
  G("Tom Clancy's Rainbow Six Extraction", ['R6-Extraction'], ['Rainbow Six Extraction'], 'AnvilNext', ['DX11', 'DX12']),
  G('Steep', ['Steep'], ['Steep'], 'AnvilNext', ['DX11']),
  G('Skull and Bones', ['Skull & Bones', 'SkullAndBones'], ['Skull and Bones'], 'AnvilNext', ['DX12']),
  G('Beyond Good and Evil: 20th Anniversary Edition', ['BGE'], ['Beyond Good and Evil 20th Anniversary Edition'], 'Jade', ['DX11']),
  G('Child of Light', ['ChildofLight'], ['Child of Light'], 'UbiArt', ['DX9', 'DX11']),
  // --- Atlus ---
  G('Shin Megami Tensei III Nocturne HD Remaster', ['smt3hd'], ['SMT3 Nocturne HD Remaster'], 'Unity', ['DX11']),
  G('Catherine Classic', ['Catherine'], ['Catherine Classic'], 'Gamebryo', ['DX9']),
  G('Soul Hackers 2', ['SoulHackers2'], ['Soul Hackers 2'], 'Unreal Engine 4', ['DX11']),
  G('Etrian Odyssey Origins Collection', ['EOOrigins'], ['Etrian Odyssey Origins Collection'], 'Custom', ['DX11']),
  // --- Square Enix ---
  G('Just Cause 3', ['JustCause3'], ['Just Cause 3'], 'Apex (Avalanche)', ['DX11']),
  G('Just Cause 4', ['JustCause4'], ['Just Cause 4'], 'Apex (Avalanche)', ['DX11', 'DX12']),
  G('Just Cause 2', ['JustCause2'], ['Just Cause 2'], 'Avalanche Engine', ['DX10', 'DX9']),
  G('Sleeping Dogs: Definitive Edition', ['SleepingDogsDE', 'SDHDShip'], ['SleepingDogsDefinitiveEdition'], 'Havok/Custom', ['DX11']),
  G('Outriders', ['Outriders'], ['OUTRIDERS'], 'Unreal Engine 4', ['DX12', 'DX11']),
  G("Marvel's Avengers", ['Avengers'], ['Marvels Avengers'], 'Foundation', ['DX12', 'DX11']),
  G('Life is Strange', ['lifeisstrange'], ['Life Is Strange'], 'Unreal Engine 3', ['DX9', 'DX11']),
  G('Life is Strange: True Colors', ['Avalanche-Win64-Shipping'], ['Life is Strange True Colors'], 'Unreal Engine 4', ['DX11']),
  G('Life is Strange: Double Exposure', ['Cabot-Win64-Shipping'], ['Life is Strange Double Exposure'], 'Unreal Engine 5', ['DX12']),
  G('NEO: The World Ends with You', ['NEO_TWEWY'], ['NEO The World Ends with You'], 'Unity', ['DX11']),
  G('Valkyrie Elysium', ['ValkyrieElysium'], ['VALKYRIE ELYSIUM'], 'Unreal Engine 4', ['DX11']),
  G('Harvestella', ['Harvestella'], ['HARVESTELLA'], 'Unreal Engine 4', ['DX11']),
  G('SaGa Frontier Remastered', ['SFRemastered'], ['SaGa Frontier Remastered'], 'Custom', ['DX11']),
  G('SaGa Emerald Beyond', ['SaGaEmeraldBeyond'], ['SaGa Emerald Beyond'], 'Unreal Engine', ['DX11']),
  G('Chrono Cross: The Radical Dreamers Edition', ['ChronoCross'], ['CHRONO CROSS'], 'Custom', ['DX11']),
  G('Balan Wonderworld', ['BalanWonderworld'], ['BALAN WONDERWORLD'], 'Unreal Engine 4', ['DX11']),
  G('Front Mission 1st: Remake', ['FRONT MISSION 1st Remake'], ['FRONT MISSION 1st Remake'], 'Unity', ['DX11']),
  G('The DioField Chronicle', ['DioField'], ['The DioField Chronicle'], 'Unreal Engine 4', ['DX11']),
  // --- Yakuza / Like a Dragon (RGG Studio) ---
  G('Yakuza 3 Remastered', ['Yakuza3'], ['Yakuza 3 Remastered'], 'RGG Engine', ['DX11']),
  G('Yakuza 4 Remastered', ['Yakuza4'], ['Yakuza 4 Remastered'], 'RGG Engine', ['DX11']),
  G('Yakuza 5 Remastered', ['Yakuza5'], ['Yakuza 5 Remastered'], 'RGG Engine', ['DX11']),
  G('Like a Dragon: Pirate Yakuza in Hawaii', ['PirateYakuza', 'LADPirates'], ['Like a Dragon Pirate Yakuza in Hawaii'], 'Dragon Engine', ['DX12', 'DX11']),
  G('Binary Domain', ['Binary Domain'], ['Binary Domain'], 'RGG Engine', ['DX9']),
  G('Fist of the North Star: Lost Paradise', ['FistOfTheNorthStar'], ['Fist of the North Star Lost Paradise'], 'Dragon Engine', ['DX11'])
];

for (const g of GAMES6) GAMES.push(g);


/* ===== Batman · Rockstar · CoD/BF/Crysis shooters · full Resident Evil & Silent Hill ===== */
const GAMES7 = [
  // --- Batman ---
  G('Batman: Arkham Origins Blackgate', ['BatmanOriginsBlackgate'], ['Batman Arkham Origins Blackgate'], 'Unreal Engine 3', ['DX9']),
  G('Gotham Knights', ['GothamKnights'], ['Gotham Knights'], 'Unreal Engine 4', ['DX12']),
  G('Suicide Squad: Kill the Justice League', ['SuicideSquadKTJL', 'BadKarma'], ['Suicide Squad Kill the Justice League'], 'Unreal Engine 4', ['DX12']),
  G('Batman: The Telltale Series', ['Batman'], ['BATMAN - The Telltale Series'], 'Telltale Tool', ['DX11']),
  // --- Rockstar ---
  G('Bully: Scholarship Edition', ['Bully'], ['Bully Scholarship Edition'], 'RenderWare', ['DX9']),
  G('Manhunt', ['manhunt'], ['Manhunt'], 'RenderWare', ['DX9']),
  // --- Call of Duty ---
  G('Call of Duty 4: Modern Warfare', ['iw3sp', 'iw3mp'], ['Call of Duty 4 - Modern Warfare'], 'IW 3.0', ['DX9']),
  G('Call of Duty: Modern Warfare 2 (2009)', ['iw4sp', 'iw4mp'], ['Call of Duty Modern Warfare 2'], 'IW 4.0', ['DX9']),
  G('Call of Duty: Modern Warfare 3 (2011)', ['iw5sp', 'iw5mp'], ['Call of Duty Modern Warfare 3'], 'IW 5.0', ['DX9']),
  G('Call of Duty: World at War', ['CoDWaW', 'CoDWaWmp'], ['Call of Duty World at War'], 'IW 3.0', ['DX9']),
  G('Call of Duty: Black Ops', ['BlackOps', 'BlackOpsMP'], ['Call of Duty Black Ops'], 'IW 3.0', ['DX9']),
  G('Call of Duty: Black Ops II', ['t6sp', 't6mp'], ['Call of Duty Black Ops II'], 'IW 3.0', ['DX11', 'DX9']),
  G('Call of Duty: Black Ops III', ['BlackOps3'], ['Call of Duty Black Ops III'], 'IW 3.0', ['DX11']),
  G('Call of Duty: Black Ops 4', ['BlackOps4'], ['Call of Duty Black Ops 4'], 'IW 3.0', ['DX11']),
  G('Call of Duty: Ghosts', ['iw6sp64_ship', 'iw6mp64_ship'], ['Call of Duty Ghosts'], 'IW 6.0', ['DX11']),
  G('Call of Duty: Advanced Warfare', ['s1_sp64_ship', 's1_mp64_ship'], ['Call of Duty Advanced Warfare'], 'IW 6.0', ['DX11']),
  G('Call of Duty: Infinite Warfare', ['iw7_ship'], ['Call of Duty Infinite Warfare'], 'IW 7.0', ['DX11']),
  G('Call of Duty: WWII', ['s2_sp64_ship'], ['Call of Duty WWII'], 'IW 6.0', ['DX11']),
  G('Call of Duty: Modern Warfare Remastered', ['h1_sp64_ship', 'h1_mp64_ship'], ['Call of Duty Modern Warfare Remastered'], 'IW 6.0', ['DX11']),
  G('Call of Duty: Vanguard', ['Vanguard'], ['Call of Duty Vanguard'], 'IW 8.0', ['DX12']),
  // --- Battlefield ---
  G('Battlefield 3', ['bf3'], ['Battlefield 3'], 'Frostbite 2', ['DX11', 'DX10']),
  G('Battlefield: Bad Company 2', ['BFBC2Game'], ['Battlefield Bad Company 2'], 'Frostbite', ['DX11', 'DX9']),
  G('Battlefield Hardline', ['bfh'], ['Battlefield Hardline'], 'Frostbite 3', ['DX11']),
  G('Battlefield 2', ['BF2'], ['Battlefield 2'], 'Refractor 2', ['DX9']),
  G('Battlefield 6', ['bf6'], ['Battlefield 6'], 'Frostbite', ['DX12']),
  // --- Crysis (rest) ---
  G('Crysis Warhead', ['crysis'], ['Crysis Warhead'], 'CryEngine 2', ['DX10', 'DX9']),
  G('Crysis 2 Remastered', ['Crysis2Remastered'], ['Crysis 2 Remastered'], 'CryEngine 3', ['DX11']),
  G('Crysis 3 Remastered', ['Crysis3Remastered'], ['Crysis 3 Remastered'], 'CryEngine 3', ['DX11']),
  // --- Resident Evil (full series) ---
  G('Resident Evil HD Remaster', ['bhd', 'biohazard'], ['resident evil hd remaster', 'Resident Evil biohazard HD REMASTER'], 'MT Framework', ['DX9']),
  G('Resident Evil 0 HD Remaster', ['re0hd'], ['Resident Evil 0'], 'MT Framework', ['DX9']),
  G('Resident Evil 4 (2005) Ultimate HD', ['bio4'], ['Resident Evil 4'], 'MT Framework', ['DX9']),
  G('Resident Evil Revelations', ['revelations'], ['Resident Evil Revelations'], 'MT Framework', ['DX11']),
  G('Resident Evil Revelations 2', ['revelations2'], ['Resident Evil Revelations 2'], 'MT Framework', ['DX11']),
  G('Resident Evil: Operation Raccoon City', ['RE_ORC'], ['Resident Evil Operation Raccoon City'], 'Unreal Engine 3', ['DX9']),
  G('Resident Evil Re:Verse', ['reverse'], ['Resident Evil ReVerse'], 'RE Engine', ['DX11']),
  // --- Silent Hill (full series) ---
  G('Silent Hill 2 (2001)', ['sh2pc'], ['Silent Hill 2'], 'Custom', ['DX8']),
  G('Silent Hill 3', ['sh3'], ['Silent Hill 3'], 'Custom', ['DX9']),
  G('Silent Hill 4: The Room', ['Silent Hill 4'], ['Silent Hill 4 The Room'], 'Custom', ['DX9']),
  G('Silent Hill: Homecoming', ['SHHome'], ['Silent Hill Homecoming'], 'Custom (Havok)', ['DX9']),
  G('Silent Hill f', ['SilentHillf', 'SHf'], ['SILENT HILL f'], 'Unreal Engine 5', ['DX12']),
  G('Silent Hill: Townfall', ['SilentHillTownfall'], ['Silent Hill Townfall'], 'Unreal Engine 5', ['DX12'])
];

for (const g of GAMES7) GAMES.push(g);


/* ===== More popular games & franchises (DX9-12 / OpenGL / Vulkan) ===== */
const GAMES8 = [
  // DX9-era classics / cult hits
  G('Deus Ex (2000)', ['DeusEx'], ['Deus Ex GOTY'], 'Unreal Engine 1', ['DX9', 'OpenGL']),
  G('System Shock (2023)', ['SystemShock'], ['System Shock'], 'Unreal Engine 4', ['DX11']),
  G('System Shock 2', ['shock2', 'SS2'], ['SystemShock2'], 'Dark Engine', ['DX9', 'OpenGL']),
  G('Thief (2014)', ['Thief'], ['Thief'], 'Unreal Engine 3', ['DX11']),
  G('F.E.A.R.', ['FEAR'], ['FEAR Ultimate Shooter Edition'], 'Jupiter EX', ['DX9']),
  G('Painkiller: Black Edition', ['Painkiller'], ['Painkiller Black Edition'], 'PainEngine', ['DX9']),
  G('Serious Sam 3: BFE', ['Sam3'], ['Serious Sam 3 BFE'], 'Serious Engine 3.5', ['DX9', 'OpenGL']),
  G('Unreal Tournament 2004', ['UT2004'], ['Unreal Tournament 2004'], 'Unreal Engine 2', ['DX9', 'OpenGL']),
  G('Unreal Tournament 3', ['UT3'], ['Unreal Tournament 3'], 'Unreal Engine 3', ['DX9']),
  G('Quake III Arena', ['quake3'], ['Quake III Arena'], 'id Tech 3', ['OpenGL']),
  G('Quake II', ['quake2'], ['Quake 2'], 'id Tech 2', ['OpenGL']),
  G('Return to Castle Wolfenstein', ['WolfSP'], ['Return to Castle Wolfenstein'], 'id Tech 3', ['OpenGL']),
  G('Vampire: The Masquerade - Bloodlines', ['vampire'], ['Vampire The Masquerade - Bloodlines'], 'Source', ['DX9']),
  G('Vampire: The Masquerade - Bloodlines 2', ['Bloodlines2'], ['Bloodlines 2'], 'Unreal Engine 5', ['DX12']),
  // S.T.A.L.K.E.R.
  G('S.T.A.L.K.E.R.: Shadow of Chernobyl', ['XR_3DA'], ['STALKER Shadow of Chernobyl'], 'X-Ray', ['DX9']),
  G('S.T.A.L.K.E.R.: Call of Pripyat', ['Stalker-CoP', 'xrEngine'], ['STALKER Call of Pripyat'], 'X-Ray', ['DX11', 'DX10', 'DX9']),
  // Darksiders / action
  G('Darksiders', ['Darksiders'], ['Darksiders'], 'Unreal Engine 3', ['DX9']),
  G('Darksiders II: Deathinitive Edition', ['Darksiders2'], ['Darksiders II Deathinitive Edition'], 'Unreal Engine 3', ['DX11']),
  G('Darksiders III', ['Darksiders3'], ['Darksiders III'], 'Unreal Engine 4', ['DX11']),
  G('Prototype', ['prototypef'], ['PROTOTYPE'], 'Titanium', ['DX9']),
  G('Prototype 2', ['Prototype2'], ['PROTOTYPE2'], 'Titanium', ['DX11']),
  // Capcom
  G('Mega Man 11', ['MegaMan11'], ['MegaMan11'], 'RE Engine', ['DX11']),
  G('Okami HD', ['okami'], ['Okami HD'], 'MT Framework', ['DX11']),
  G('Dead Rising', ['DeadRising'], ['Dead Rising'], 'MT Framework', ['DX11']),
  G('Dead Rising Deluxe Remaster', ['DeadRisingDX'], ['Dead Rising Deluxe Remaster'], 'RE Engine', ['DX12']),
  G('Exoprimal', ['Exoprimal'], ['Exoprimal'], 'RE Engine', ['DX12', 'DX11']),
  G('Kunitsu-Gami: Path of the Goddess', ['KunitsuGami'], ['Kunitsu-Gami Path of the Goddess'], 'RE Engine', ['DX12']),
  // Bandai Namco
  G('Ace Combat 7: Skies Unknown', ['Ace7Game-Win64-Shipping'], ['ACE COMBAT 7 SKIES UNKNOWN'], 'Unreal Engine 4', ['DX11']),
  G('Little Nightmares II', ['LittleNightmares2-Win64-Shipping'], ['Little Nightmares II'], 'Unreal Engine 4', ['DX11']),
  G('Little Nightmares III', ['LN3-Win64-Shipping'], ['Little Nightmares III'], 'Unreal Engine 4', ['DX12']),
  G('Dragon Ball Z: Kakarot', ['DBZKakarot'], ['DRAGON BALL Z KAKAROT'], 'Unreal Engine 4', ['DX11']),
  G('Naruto Shippuden: Ultimate Ninja Storm 4', ['NSUNS4'], ['NARUTO SHIPPUDEN Ultimate Ninja STORM 4'], 'Unreal Engine 4', ['DX11']),
  G('Sword Art Online: Last Recollection', ['SAOLR'], ['Sword Art Online Last Recollection'], 'Unreal Engine 4', ['DX11']),
  // Sega / Platinum
  G('Bayonetta', ['Bayonetta'], ['Bayonetta'], 'PlatinumGames', ['DX9', 'DX11']),
  G('Vanquish', ['Vanquish'], ['Vanquish'], 'PlatinumGames', ['DX9', 'DX11']),
  G('Sonic Generations', ['SonicGenerations'], ['Sonic Generations'], 'Hedgehog Engine', ['DX9']),
  G('Sonic Mania', ['SonicMania'], ['Sonic Mania'], 'Retro Engine', ['DX11', 'OpenGL']),
  G('Sonic Superstars', ['SonicSuperstars'], ['SonicSuperstars'], 'Unreal Engine', ['DX11']),
  // Konami
  G('Metal Gear Solid: Master Collection Vol.1', ['MGS1', 'METAL GEAR SOLID2', 'METAL GEAR SOLID3'], ['MGS Master Collection Vol1'], 'Custom', ['DX11']),
  G('Metal Gear Solid Delta: Snake Eater', ['MGSDelta'], ['Metal Gear Solid Delta Snake Eater'], 'Unreal Engine 5', ['DX12']),
  G('Castlevania: Lords of Shadow', ['Castlevania'], ['Castlevania Lords of Shadow'], 'MercurySteam Engine', ['DX9']),
  G('Castlevania: Lords of Shadow 2', ['Lords of Shadow 2'], ['Castlevania Lords of Shadow 2'], 'MercurySteam Engine', ['DX11']),
  // Warhammer 40K
  G('Warhammer 40,000: Space Marine', ['spacemarine'], ['Warhammer 40000 Space Marine'], 'Custom', ['DX9', 'DX11']),
  G('Warhammer 40,000: Boltgun', ['Boltgun'], ['Boltgun'], 'Custom', ['DX11']),
  G('Warhammer 40,000: Dawn of War II', ['DOW2'], ['Dawn of War II'], 'Essence', ['DX9']),
  G('Warhammer: Vermintide 2', ['vermintide2'], ['Warhammer Vermintide 2'], 'Autodesk Stingray', ['DX11', 'DX12']),
  // Total War (older)
  G('Total War: Shogun 2', ['Shogun2'], ['Total War SHOGUN 2'], 'TW Engine', ['DX11', 'DX9']),
  G('Total War: Attila', ['Attila'], ['Total War Attila'], 'TW Engine', ['DX11']),
  G('Total War: Medieval II', ['medieval2'], ['Medieval II Total War'], 'TW Engine', ['DX9']),
  G('A Total War Saga: Troy', ['Troy'], ['Total War Saga TROY'], 'TW Engine', ['DX11']),
  // Racing (more)
  G('Project CARS 2', ['pCARS2'], ['Project CARS 2'], 'Madness Engine', ['DX11']),
  G('Automobilista 2', ['AMS2'], ['Automobilista 2'], 'Madness Engine', ['DX11']),
  G('RaceRoom Racing Experience', ['RRRE64'], ['raceroom racing experience'], 'Custom', ['DX9']),
  G('Need for Speed: Hot Pursuit Remastered', ['NFS16'], ['Need for Speed Hot Pursuit Remastered'], 'Chameleon', ['DX11']),
  G('Need for Speed Payback', ['NeedForSpeedPayback'], ['Need for Speed Payback'], 'Frostbite 3', ['DX11']),
  G('Need for Speed (2015)', ['NeedForSpeed'], ['Need for Speed'], 'Frostbite 3', ['DX11']),
  G('Burnout Paradise Remastered', ['BurnoutParadiseRemastered'], ['BurnoutPR'], 'Custom', ['DX11']),
  G('CarX Street', ['CarXStreet'], ['CarX Street'], 'Unity', ['DX11']),
  // Live service / multiplayer (more)
  G('Delta Force', ['DeltaForceClient-Win64-Shipping'], ['Delta Force'], 'Unreal Engine', ['DX12', 'DX11']),
  G('Gray Zone Warfare', ['GrayZoneWarfare'], ['Gray Zone Warfare'], 'Unreal Engine 5', ['DX12']),
  G('Dune: Awakening', ['DuneAwakening'], ['Dune Awakening'], 'Unreal Engine 5', ['DX12']),
  G('Payday 3', ['Payday3'], ['PAYDAY 3'], 'Unreal Engine 4', ['DX12', 'DX11']),
  G('Payday 2', ['payday2_win32_release'], ['PAYDAY 2'], 'Diesel', ['DX9', 'DX11']),
  G('Squad', ['SquadGame'], ['Squad'], 'Unreal Engine 4', ['DX11']),
  G('Arena Breakout: Infinite', ['ArenaBreakout'], ['Arena Breakout Infinite'], 'Unreal Engine 4', ['DX11']),
  G('The Day Before', ['TheDayBefore'], ['The Day Before'], 'Unreal Engine 5', ['DX12']),
  // Souls-like / action-RPG (more)
  G('Wuchang: Fallen Feathers', ['Wuchang'], ['Wuchang Fallen Feathers'], 'Unreal Engine 5', ['DX12']),
  G('Banishers: Ghosts of New Eden', ['Banishers'], ['Banishers Ghosts of New Eden'], 'Unreal Engine 4', ['DX12', 'DX11']),
  G('Enotria: The Last Song', ['Enotria'], ['Enotria The Last Song'], 'Unreal Engine 5', ['DX12']),
  G('Flintlock: The Siege of Dawn', ['Flintlock'], ['Flintlock The Siege of Dawn'], 'Unreal Engine 4', ['DX12', 'DX11']),
  G('The First Berserker: Khazan', ['Khazan'], ['The First Berserker Khazan'], 'Unreal Engine 4', ['DX11']),
  // Indie hits (more)
  G('Undertale', ['UNDERTALE'], ['Undertale'], 'GameMaker', ['DX9']),
  G('Vampire Survivors', ['VampireSurvivors'], ['Vampire Survivors'], 'Custom (Electron)', ['OpenGL']),
  G('Slay the Spire', ['SlayTheSpire'], ['SlayTheSpire'], 'libGDX', ['OpenGL']),
  G('Dave the Diver', ['DaveTheDiver'], ['DAVE THE DIVER'], 'Unity', ['DX11']),
  G('REPO', ['REPO'], ['REPO'], 'Unity', ['DX11']),
  G('Schedule I', ['Schedule I'], ['Schedule I'], 'Unity', ['DX11']),
  G('Buckshot Roulette', ['Buckshot Roulette'], ['Buckshot Roulette'], 'Godot', ['Vulkan', 'OpenGL']),
  G('Five Nights at Freddy\u2019s: Security Breach', ['SecurityBreach'], ['Five Nights at Freddys Security Breach'], 'Unreal Engine 4', ['DX11']),
  G('Poppy Playtime', ['Poppy Playtime'], ['Poppy Playtime'], 'Unreal Engine 4', ['DX11']),
  // First-party / notable (more)
  G('Sniper Elite: Resistance', ['SniperEliteResistance'], ['Sniper Elite Resistance'], 'Asura', ['DX12', 'DX11'])
];

/* ===== Popular emulators (recognized as apps; rendering backends listed as API) ===== */
const EMUS = [
  G('RPCS3 (PlayStation 3)', ['rpcs3'], ['rpcs3'], 'Emulator', ['Vulkan', 'OpenGL']),
  G('PCSX2 (PlayStation 2)', ['pcsx2-qt', 'pcsx2', 'pcsx2x64-avx2'], ['PCSX2'], 'Emulator', ['DX12', 'DX11', 'Vulkan', 'OpenGL']),
  G('DuckStation (PlayStation 1)', ['duckstation-qt-x64-ReleaseLTCG', 'duckstation-qt', 'duckstation'], ['DuckStation'], 'Emulator', ['DX12', 'DX11', 'Vulkan', 'OpenGL']),
  G('ePSXe (PlayStation 1)', ['ePSXe'], ['ePSXe'], 'Emulator', ['OpenGL', 'DX9']),
  G('Vita3K (PS Vita)', ['Vita3K'], ['Vita3K'], 'Emulator', ['Vulkan', 'OpenGL']),
  G('PPSSPP (PSP)', ['PPSSPPWindows64', 'PPSSPPWindows'], ['PPSSPP'], 'Emulator', ['Vulkan', 'DX11', 'OpenGL']),
  G('Dolphin (GameCube / Wii)', ['Dolphin'], ['Dolphin'], 'Emulator', ['Vulkan', 'DX12', 'DX11', 'OpenGL']),
  G('Cemu (Wii U)', ['Cemu'], ['Cemu'], 'Emulator', ['Vulkan', 'OpenGL']),
  G('Ryujinx (Switch)', ['Ryujinx', 'Ryujinx.Headless.SDL2'], ['Ryujinx'], 'Emulator', ['Vulkan', 'OpenGL']),
  G('yuzu (Switch)', ['yuzu'], ['yuzu'], 'Emulator', ['Vulkan', 'OpenGL']),
  G('Eden (Switch)', ['eden'], ['Eden'], 'Emulator', ['Vulkan', 'OpenGL']),
  G('Sudachi (Switch)', ['sudachi'], ['Sudachi'], 'Emulator', ['Vulkan', 'OpenGL']),
  G('Citra (Nintendo 3DS)', ['citra-qt', 'citra'], ['Citra'], 'Emulator', ['OpenGL', 'Vulkan']),
  G('Azahar (Nintendo 3DS)', ['azahar'], ['Azahar'], 'Emulator', ['OpenGL', 'Vulkan']),
  G('Lime3DS (Nintendo 3DS)', ['lime3ds'], ['Lime3DS'], 'Emulator', ['OpenGL', 'Vulkan']),
  G('melonDS (Nintendo DS)', ['melonDS'], ['melonDS'], 'Emulator', ['OpenGL']),
  G('DeSmuME (Nintendo DS)', ['DeSmuME'], ['DeSmuME'], 'Emulator', ['OpenGL', 'DX9']),
  G('Xenia (Xbox 360)', ['xenia', 'xenia_canary'], ['Xenia'], 'Emulator', ['Vulkan', 'DX12']),
  G('Xemu (Original Xbox)', ['xemu'], ['xemu'], 'Emulator', ['OpenGL', 'Vulkan']),
  G('Project64 (Nintendo 64)', ['Project64'], ['Project64'], 'Emulator', ['OpenGL', 'Vulkan']),
  G('Mupen64Plus (Nintendo 64)', ['mupen64plus'], ['Mupen64Plus'], 'Emulator', ['OpenGL', 'Vulkan']),
  G('Flycast (Dreamcast)', ['flycast'], ['Flycast'], 'Emulator', ['Vulkan', 'OpenGL', 'DX11']),
  G('Redream (Dreamcast)', ['redream'], ['redream'], 'Emulator', ['OpenGL', 'DX11']),
  G('Snes9x (SNES)', ['snes9x-x64', 'snes9x'], ['Snes9x'], 'Emulator', ['OpenGL', 'DX9']),
  G('mGBA (Game Boy Advance)', ['mGBA'], ['mGBA'], 'Emulator', ['OpenGL']),
  G('RetroArch (multi-system)', ['retroarch'], ['RetroArch'], 'Emulator (libretro)', ['Vulkan', 'DX11', 'OpenGL']),
  G('BizHawk (multi-system)', ['EmuHawk'], ['BizHawk'], 'Emulator', ['OpenGL', 'DX9']),
  G('MAME (arcade)', ['mame'], ['MAME'], 'Emulator', ['DX11', 'OpenGL', 'Vulkan']),
  G('ScummVM (adventure engines)', ['scummvm'], ['ScummVM'], 'Emulator', ['OpenGL']),
  G('DOSBox-X (DOS)', ['dosbox-x', 'dosbox'], ['DOSBox-X'], 'Emulator', ['OpenGL', 'DX9'])
];

for (const g of GAMES8) GAMES.push(g);
for (const g of EMUS) GAMES.push(g);


/* ===== shadPS4 + more emulators · Deus Ex · Eidos · Tomb Raider · more popular games ===== */
const GAMES9 = [
  // --- Deus Ex series ---
  G('Deus Ex: Invisible War', ['DeusExInvisibleWar', 'DX2'], ['Deus Ex Invisible War'], 'Unreal Engine 2', ['DX9']),
  G('Deus Ex: The Fall', ['DeusExTheFall'], ['Deus Ex The Fall'], 'Unity', ['DX11']),
  // --- Eidos / Crystal Dynamics / IO catalogue ---
  G('Legacy of Kain: Soul Reaver 1 & 2 Remastered', ['SoulReaver'], ['Legacy of Kain Soul Reaver 1&2 Remastered'], 'Custom', ['DX12', 'DX11']),
  G('Legacy of Kain: Defiance', ['Defiance'], ['Legacy of Kain Defiance'], 'Custom', ['DX9']),
  G('Kane & Lynch: Dead Men', ['kanelynch'], ['Kane and Lynch Dead Men'], 'Glacier', ['DX9']),
  G('Kane & Lynch 2: Dog Days', ['kanelynch2'], ['Kane and Lynch 2 Dog Days'], 'Glacier', ['DX9']),
  G('Commandos 2 - HD Remaster', ['Commandos 2 - HD Remaster'], ['Commandos 2 HD Remaster'], 'Custom', ['DX11']),
  G('Commandos: Origins', ['CommandosOrigins'], ['Commandos Origins'], 'Unreal Engine 4', ['DX12', 'DX11']),
  G('Just Cause', ['JustCause'], ['Just Cause'], 'Avalanche Engine', ['DX9']),
  G('Thief: Deadly Shadows', ['T3', 'Thief3'], ['Thief Deadly Shadows'], 'Unreal Engine 2', ['DX9']),
  G('Battlestations: Pacific', ['Battlestations Pacific'], ['Battlestations Pacific'], 'Custom', ['DX9', 'DX10']),
  G('Gex Trilogy', ['GexTrilogy'], ['Gex Trilogy'], 'Custom', ['DX11']),
  // --- Tomb Raider (full series) ---
  G('Tomb Raider I-III Remastered', ['Tomb Raider I-III Remastered', 'triii'], ['Tomb Raider I-III Remastered Starring Lara Croft'], 'Custom', ['DX11']),
  G('Tomb Raider IV-VI Remastered', ['Tomb Raider IV-VI Remastered'], ['Tomb Raider IV-VI Remastered'], 'Custom', ['DX11']),
  G('Tomb Raider: Anniversary', ['tra'], ['Tomb Raider Anniversary'], 'Crystal Engine', ['DX9']),
  G('Tomb Raider: The Angel of Darkness', ['TRAOD'], ['Tomb Raider The Angel of Darkness'], 'Custom', ['DX9', 'DX8']),
  G('Lara Croft and the Guardian of Light', ['LCGOL'], ['Lara Croft and the Guardian of Light'], 'Crystal Engine', ['DX9', 'DX11']),
  G('Lara Croft and the Temple of Osiris', ['LCTOO'], ['Lara Croft and the Temple of Osiris'], 'Foundation', ['DX11']),
  // --- More popular games ---
  G('Mount & Blade II: Bannerlord', ['Bannerlord'], ['Mount and Blade II Bannerlord'], 'TaleWorlds Engine', ['DX12', 'DX11', 'Vulkan']),
  G('Mount & Blade: Warband', ['mb_warband'], ['MountBlade Warband'], 'TaleWorlds Engine', ['DX9']),
  G('The Sims 3', ['TS3', 'TS3W'], ['The Sims 3'], 'Custom', ['DX9']),
  G('The Sims 2', ['Sims2EP9'], ['The Sims 2'], 'Custom', ['DX9']),
  G('SimCity (2013)', ['SimCity'], ['SimCity'], 'GlassBox', ['DX9']),
  G('Two Point Museum', ['Two Point Museum'], ['Two Point Museum'], 'Unity', ['DX11']),
  G('Dyson Sphere Program', ['DSPGAME'], ['Dyson Sphere Program'], 'Unity', ['DX11']),
  G('Oxygen Not Included', ['OxygenNotIncluded'], ['OxygenNotIncluded'], 'Unity', ['DX11', 'OpenGL']),
  G('Prison Architect', ['PrisonArchitect'], ['Prison Architect'], 'Custom', ['OpenGL', 'DX9']),
  G('Kenshi', ['kenshi_x64'], ['Kenshi'], 'Ogre3D', ['DX9']),
  G('Timberborn', ['Timberborn'], ['Timberborn'], 'Unity', ['DX11']),
  G('Chivalry 2', ['Chivalry2'], ['Chivalry 2'], 'Unreal Engine 4', ['DX11']),
  G('Mordhau', ['Mordhau'], ['Mordhau'], 'Unreal Engine 4', ['DX11']),
  G('Grim Dawn', ['Grim Dawn'], ['Grim Dawn'], 'Custom', ['DX11', 'DX9']),
  G('Last Epoch', ['Last Epoch'], ['Last Epoch'], 'Unity', ['DX11']),
  G('Titan Quest: Anniversary Edition', ['TQ'], ['Titan Quest Anniversary Edition'], 'Custom', ['DX9']),
  G('Risk of Rain 2', ['Risk of Rain 2'], ['Risk of Rain 2'], 'Unity', ['DX11']),
  G('ULTRAKILL', ['ULTRAKILL'], ['ULTRAKILL'], 'Unity', ['DX11']),
  G('Ghostrunner 2', ['Ghostrunner2-Win64-Shipping'], ['Ghostrunner 2'], 'Unreal Engine 4', ['DX12', 'DX11']),
  G('No Rest for the Wicked', ['Wicked'], ['No Rest for the Wicked'], 'Unreal Engine 4', ['DX11']),
  G('Killing Floor 3', ['KF3'], ['Killing Floor 3'], 'Unreal Engine 5', ['DX12']),
  G('Trepang2', ['Trepang2'], ['Trepang2'], 'Unreal Engine 4', ['DX11']),
  G('Selaco', ['Selaco'], ['Selaco'], 'GZDoom', ['Vulkan', 'OpenGL'])
];

/* ===== more emulators ===== */
const EMUS2 = [
  G('shadPS4 (PlayStation 4)', ['shadPS4', 'shadps4'], ['shadPS4'], 'Emulator', ['Vulkan']),
  G('Panda3DS (Nintendo 3DS)', ['Alber', 'Panda3DS'], ['Panda3DS'], 'Emulator', ['Vulkan', 'OpenGL']),
  G('Ares (multi-system)', ['ares'], ['ares'], 'Emulator', ['Vulkan', 'OpenGL', 'DX11']),
  G('Mesen (NES / SNES / GB)', ['Mesen'], ['Mesen'], 'Emulator', ['DX11', 'OpenGL']),
  G('simple64 (Nintendo 64)', ['simple64-gui'], ['simple64'], 'Emulator', ['Vulkan']),
  G('Kronos (Sega Saturn)', ['kronos'], ['Kronos'], 'Emulator', ['OpenGL', 'Vulkan']),
  G('Rosalie\u2019s Mupen GUI (N64)', ['RMG'], ['RMG'], 'Emulator', ['Vulkan', 'OpenGL']),
  G('BSNES (SNES)', ['bsnes'], ['bsnes'], 'Emulator', ['OpenGL', 'DX9'])
];

for (const g of GAMES9) GAMES.push(g);
for (const g of EMUS2) GAMES.push(g);




/* ===== GAMES10: fill genuine gaps (verified not already present) ===== */
const GAMES10 = [
  G('BioShock', ['bioshock'], ['BioShock'], 'Unreal Engine 2.5', ['DX9']),
  G('Metro 2033 Redux', ['metro2033', 'MetroRedux'], ['Metro 2033 Redux'], '4A Engine', ['DX11']),
  G('Mirror\u2019s Edge Catalyst', ['MirrorsEdgeCatalyst'], ["Mirror's Edge Catalyst"], 'Frostbite', ['DX11']),
  G('Firewatch', ['firewatch'], ['Firewatch'], 'Unity', ['DX11', 'OpenGL']),
  G('Gone Home', ['GoneHome'], ['Gone Home'], 'Unity', ['DX9', 'OpenGL']),
  G('Torchlight II', ['Torchlight2'], ['Torchlight II'], 'Ogre3D', ['DX9', 'OpenGL']),
  G('The Outer Worlds 2', ['OuterWorlds2'], ['The Outer Worlds 2'], 'Unreal Engine 5', ['DX12']),
  G('Split Fiction', ['SplitFiction'], ['Split Fiction'], 'Unreal Engine 5', ['DX12']),
  G('Scorn', ['Scorn'], ['Scorn'], 'Unreal Engine 4', ['DX11']),
  G('Observer: System Redux', ['Observer'], ['Observer System Redux'], 'Unreal Engine 4', ['DX12']),
  G('Age of Mythology: Retold', ['AoMRT', 'aomrt_s'], ['Age of Mythology Retold'], 'Bang', ['DX11'])
];
for (const g of GAMES10) GAMES.push(g);

// --- normalization + lookup ---
function norm(s) { return String(s || '').toLowerCase().replace(/\.exe$/i, '').replace(/[^a-z0-9]+/g, ''); }

// Index built from GAMES. Rebuildable, because the expansion pack is appended after this point -
// insertion order decides ties, and the curated core is always inserted first so it keeps priority.
const byExe = new Map(); const byFolder = new Map();
const exeClaims = new Map();   // how many distinct games claim each exe key (claimed once = strong signal)
function reindex() {
  byExe.clear(); byFolder.clear(); exeClaims.clear();
  for (const g of GAMES) {
    for (const e of g.exe) { const k = norm(e); if (k && !byExe.has(k)) byExe.set(k, g); }
    for (const f of g.folder) { const k = norm(f); if (k && !byFolder.has(k)) byFolder.set(k, g); }
    const nk = norm(g.n); if (nk && !byFolder.has(nk)) byFolder.set(nk, g);
  }
  for (const g of GAMES) for (const e of g.exe) { const k = norm(e); if (!k) continue; const s = exeClaims.get(k) || new Set(); s.add(g); exeClaims.set(k, s); }
}
reindex();

/* Exe basenames that name an ENGINE, LAUNCHER or shared runtime rather than a specific game.
 * On their own they identify nothing - GoldSrc ships hl.exe for ten different games, Source ships
 * hl2.exe for six, and "Game.exe" is used by Tiberian Sun, The Longest Journey and Diablo II alike.
 * For these the install FOLDER is the only reliable signal, so an exe-only match must not guess. */
const GENERIC_EXE = new Set(['game', 'client', 'launcher', 'launch', 'start', 'startup', 'main',
  'play', 'run', 'app', 'bin', 'binary', 'javaw', 'java', 'engine', 'loader', 'setup', 'installer',
  'hl', 'hl2', 'srcds', 'gameclient', 'gamelauncher', 'shippingpc', 'win64', 'x64']);

/** Is this exe key too ambiguous to identify a game without the folder? */
function ambiguousExe(k) {
  if (!k) return true;
  if (GENERIC_EXE.has(k)) return true;
  const c = exeClaims.get(k);
  return !!(c && c.size >= 3);          // claimed by 3+ games: the folder has to decide
}

/** Best loose folder match: the LONGEST overlapping key, not merely the first one indexed. */
function looseFolder(fk) {
  if (!fk || fk.length < 5) return null;
  let best = null, bestLen = 0;
  for (const [k, g] of byFolder) {
    if (k.length < 5) continue;
    if (fk.includes(k) || k.includes(fk)) {
      if (k.length > bestLen) { best = g; bestLen = k.length; }
    }
  }
  return best;
}

/** Every exe basename the database expects inside a given install folder. */
function exesForFolder(folderName) {
  const fk = norm(folderName); if (!fk) return [];
  const g = byFolder.get(fk) || looseFolder(fk);
  return g ? g.exe.slice() : [];
}

/** Does this exe actually belong in this folder according to the database? */
function exeMatchesFolder(exeName, folderName) {
  const ek = norm(exeName); if (!ek) return false;
  return exesForFolder(folderName).some(e => norm(e) === ek);
}

/** Look up a game by its exe basename and/or steam folder name. Returns the entry or null. */
function lookupGame(exeName, folderName) {
  const ek = norm(exeName), fk = norm(folderName);
  const exeHit = ek ? byExe.get(ek) : null;
  const folderHit = fk ? byFolder.get(fk) : null;
  if (exeHit && folderHit) {
    if (exeHit === folderHit) return exeHit;
    // 1) agreement wins: the exe's own game also lists this folder (or vice versa)
    if (exeHit.folder.some(f => norm(f) === fk) || norm(exeHit.n) === fk) return exeHit;
    if (folderHit.exe.some(e => norm(e) === ek)) return folderHit;
    // 2) a uniquely-claimed exe is more specific than a shared folder name
    //    (e.g. bio4.exe = RE4 2005 even though its folder "Resident Evil 4" also matches the remake)
    const claims = exeClaims.get(ek);
    if (claims && claims.size === 1) return exeHit;
    // 3) otherwise trust the install folder (e.g. acs.exe is claimed by 2 games; the folder decides)
    return folderHit;
  }
  if (folderHit) return folderHit;
  // An exe-only hit is only trustworthy when that exe names exactly one game. Otherwise fall through
  // to the folder heuristics rather than returning whichever entry happened to be indexed first.
  if (exeHit && !ambiguousExe(ek)) return exeHit;
  // loose folder contains-match (handles "The Witcher 3 Wild Hunt" vs "The Witcher 3")
  const loose = looseFolder(fk);
  if (loose) return loose;
  return exeHit && !ambiguousExe(ek) ? exeHit : null;
}

/* The curated set above is the hand-tuned core. gamedb-ext.js carries the bulk expansion
 * (1000+ further titles, same shape). Merged here so lookupGame() sees everything, with the core
 * entries FIRST so they win any exe-name tie against an expansion entry. */
try {
  const { EXT } = require('./gamedb-ext');
  const have = new Set(GAMES.map(g => String(g.n).toLowerCase().replace(/[^a-z0-9]/g, '')));
  for (const g of (EXT || [])) {
    const k = String(g.n).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (have.has(k)) continue;                 // never let the expansion shadow a curated entry
    have.add(k); GAMES.push(g);
  }
  reindex();
} catch (_) { /* expansion pack is optional */ }

module.exports = { GAMES, lookupGame, exesForFolder, exeMatchesFolder, ambiguousExe };
