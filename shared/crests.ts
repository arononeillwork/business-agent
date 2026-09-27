// Team crests for fixtures whose source has none. National teams get their flag (flagcdn, free, no
// key); clubs get their crest from TheSportsDB, matched by name. Looked up once, then kept.

/** Countries as fixture sources name them → flag code (flagcdn.com). */
export const COUNTRY_FLAGS: Record<string, string> = {
  Albania: 'al', Andorra: 'ad', Armenia: 'am', Austria: 'at', Azerbaijan: 'az', Belarus: 'by', Belgium: 'be',
  'Bosnia and Herzegovina': 'ba', Bulgaria: 'bg', Croatia: 'hr', Cyprus: 'cy', Czechia: 'cz', 'Czech Republic': 'cz',
  Denmark: 'dk', England: 'gb-eng', Estonia: 'ee', 'Faroe Islands': 'fo', Finland: 'fi', France: 'fr', Georgia: 'ge',
  Germany: 'de', Gibraltar: 'gi', Greece: 'gr', Hungary: 'hu', Iceland: 'is', Israel: 'il', Italy: 'it', Kazakhstan: 'kz',
  Kosovo: 'xk', Latvia: 'lv', Liechtenstein: 'li', Lithuania: 'lt', Luxembourg: 'lu', Malta: 'mt', Moldova: 'md',
  Montenegro: 'me', Netherlands: 'nl', 'North Macedonia': 'mk', 'Northern Ireland': 'gb-nir', Norway: 'no', Poland: 'pl',
  Portugal: 'pt', 'Republic of Ireland': 'ie', Ireland: 'ie', Romania: 'ro', Russia: 'ru', 'San Marino': 'sm',
  Scotland: 'gb-sct', Serbia: 'rs', Slovakia: 'sk', Slovenia: 'si', Spain: 'es', Sweden: 'se', Switzerland: 'ch',
  Türkiye: 'tr', Turkey: 'tr', Ukraine: 'ua', Wales: 'gb-wls',
  Argentina: 'ar', Brazil: 'br', Uruguay: 'uy', Colombia: 'co', Chile: 'cl', Mexico: 'mx', 'United States': 'us', USA: 'us',
  Canada: 'ca', Japan: 'jp', 'South Korea': 'kr', 'Korea Republic': 'kr', Australia: 'au', Morocco: 'ma', Senegal: 'sn',
  Nigeria: 'ng', Egypt: 'eg', Ghana: 'gh', Cameroon: 'cm', 'Ivory Coast': 'ci', "Côte d'Ivoire": 'ci', Algeria: 'dz',
  Tunisia: 'tn', 'Saudi Arabia': 'sa', Qatar: 'qa', Iran: 'ir', 'New Zealand': 'nz', Ecuador: 'ec', Peru: 'pe', Paraguay: 'py',
}
export const flagUrl = (code: string) => `https://flagcdn.com/w80/${code}.png`

/** Short names fixture sources use → the club's usual full name. */
export const TEAM_ALIASES: Record<string, string> = {
  'Man Utd': 'Manchester United', 'Man City': 'Manchester City', Spurs: 'Tottenham Hotspur', "Nott'm Forest": 'Nottingham Forest',
  Newcastle: 'Newcastle United', Brighton: 'Brighton and Hove Albion', Leeds: 'Leeds United', Hull: 'Hull City',
  Ipswich: 'Ipswich Town', Coventry: 'Coventry City', Wolves: 'Wolverhampton Wanderers', 'West Ham': 'West Ham United',
  Atleti: 'Atletico Madrid', 'Atlético de Madrid': 'Atletico Madrid', 'B. Dortmund': 'Borussia Dortmund', Paris: 'Paris SG',
  Inter: 'Inter Milan', 'S. Bratislava': 'Slovan Bratislava', 'R. Racing Club': 'Racing Santander', 'RCD Espanyol de Barcelona': 'Espanyol',
  'RC Deportivo': 'Deportivo La Coruna', Celta: 'Celta Vigo', 'Deportivo Alavés': 'Alaves', Leipzig: 'RB Leipzig',
  'Bayern München': 'Bayern Munich', 'Sporting CP': 'Sporting Lisbon', 'Slavia Praha': 'Slavia Prague', Shakhtar: 'Shakhtar Donetsk',
  Roma: 'AS Roma', 'Bodø/Glimt': 'Bodo/Glimt', AZ: 'AZ Alkmaar', PSV: 'PSV Eindhoven', 'N.E.C. Nijmegen': 'NEC Nijmegen',
  'SC Cambuur': 'Cambuur', 'Excelsior Rotterdam': 'Excelsior', LASK: 'LASK Linz', Sabah: 'Sabah FK', Viking: 'Viking FK',
  'Athletic Club': 'Athletic Bilbao', 'CA Osasuna': 'Osasuna', 'Málaga CF': 'Malaga', 'Elche CF': 'Elche', 'Getafe CF': 'Getafe',
  'Levante UD': 'Levante', 'Sevilla FC': 'Sevilla', 'Valencia CF': 'Valencia', 'Villarreal CF': 'Villarreal', 'FC Barcelona': 'Barcelona',
}

/** Extra spellings to search for when the usual name finds nothing (TheSportsDB's own names). */
export const TEAM_SEARCH_NAMES: Record<string, string[]> = {
  "Nott'm Forest": ['Nottingham Forest', 'Nottingham'],
  Lille: ['Lille', 'Lille OSC', 'LOSC Lille'],
  'Bodø/Glimt': ['Bodo/Glimt', 'Bodo Glimt', 'Bodø/Glimt'],
  'H. Beer-Sheva': ["Hapoel Be'er Sheva", 'Hapoel Beer Sheva', 'Hapoel Beersheba'],
  'Ararat-Armenia': ['Ararat-Armenia', 'FC Ararat-Armenia', 'Ararat Armenia'],
}

/** Names to try, best first: the alias, extra spellings, then the name as written; each also with underscores. */
export function searchNamesFor(name: string): string[] {
  const names = [TEAM_ALIASES[name], ...(TEAM_SEARCH_NAMES[name] ?? []), name].filter((n): n is string => !!n)
  return [...new Set(names.flatMap(n => (n.includes(' ') ? [n, n.replace(/ /g, '_')] : [n])))]
}

// Words clubs add or drop freely ("FC", "CF", "de"…), ignored when comparing names.
const FILLER = new Set(['fc', 'cf', 'ud', 'ca', 'cd', 'rcd', 'rc', 'sc', 'afc', 'sd', 'ac', 'as', 'ss', 'sv', 'fk', 'sk', 'bk', 'club', 'de', 'the', 'and', 'cp'])

/** A name reduced to what matters for matching: "Atlético de Madrid" → "atletico madrid". */
export function teamKey(name: string): string {
  return name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/ø/g, 'o').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ')
    .split(' ').filter(w => w && !FILLER.has(w)).join(' ')
}

/** A TheSportsDB team, as far as crests go. */
export interface TsdbTeam { strTeam: string; strTeamShort?: string | null; strTeamAlternate?: string | null; strBadge?: string | null; strSport?: string | null }

/** Every name a TheSportsDB team goes by, as match keys. */
export function teamKeys(t: TsdbTeam): string[] {
  const names = [t.strTeam, t.strTeamShort ?? '', ...(t.strTeamAlternate ?? '').split(',')]
  return [...new Set(names.map(n => teamKey(n.trim())).filter(Boolean))]
}

/** The crest for a fixture's team name from a list of teams, or null. Tries the name, then its alias. */
export function findCrest(name: string, teams: TsdbTeam[]): string | null {
  const wanted = [teamKey(name), ...[TEAM_ALIASES[name], ...(TEAM_SEARCH_NAMES[name] ?? [])].filter(Boolean).map(n => teamKey(n!))].filter(Boolean)
  for (const t of teams) {
    if (!t.strBadge || (t.strSport && t.strSport !== 'Soccer')) continue
    const keys = teamKeys(t)
    if (wanted.some(w => keys.includes(w))) return t.strBadge
  }
  return null
}
