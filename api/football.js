const BASE = "https://v3.football.api-sports.io";
const CACHE = new Map();
const TTL = 10 * 60 * 1000;
const LIVE_TTL = 20 * 1000;
const REQUEST_TIMEOUT_MS = 12000;
function json(res, status, body) { return res.status(status).json(body); }
function norm(s) { return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]/g, " ").replace(/\s+/g, " ").trim(); }
async function apiGet(path, key, ttl = TTL) {
  const cached = CACHE.get(path);
  if (cached && Date.now() - cached.at < ttl) return cached.data;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let r, d;
  try {
    r = await fetch(BASE + path, { headers: { "x-apisports-key": key }, signal: controller.signal });
    d = await r.json().catch(() => ({}));
  } finally { clearTimeout(timer); }
  if (!r.ok || (d.errors && Object.keys(d.errors).length)) throw new Error("Sports provider request failed (" + r.status + ")");
  const rows = d.response || [];
  CACHE.set(path, { at: Date.now(), data: rows });
  return rows;
}
function seasonNow() { const d = new Date(); return d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1; }
const CITY_CLUB_SEARCHES = {
  madrid: { country: "Spain", venues: ["madrid", "getafe", "leganes"], teams: ["Real Madrid", "Atletico Madrid", "Getafe", "Rayo Vallecano", "Leganes"] },
  london: { country: "England", venues: ["london", "hounslow", "brentford", "fulham", "tottenham", "stratford", "selhurst", "islington", "woolwich"], teams: ["Arsenal", "Chelsea", "Tottenham", "West Ham", "Fulham", "Crystal Palace", "Brentford", "Queens Park Rangers", "Millwall", "Charlton Athletic"] },
  barcelona: { country: "Spain", venues: ["barcelona", "cornella de llobregat", "sant adria de besos"], teams: ["Barcelona", "Espanyol", "CE Europa", "Sant Andreu"] },
  paris: { country: "France", venues: ["paris", "saint denis", "boulogne billancourt"], teams: ["Paris Saint Germain", "Paris FC", "Red Star"] },
  rome: { country: "Italy", venues: ["rome"], teams: ["Roma", "Lazio"] },
  munich: { country: "Germany", venues: ["munich"], teams: ["Bayern Munich", "1860 Munich"] },
  riyadh: { country: "Saudi-Arabia", venues: ["riyadh"], teams: ["Al Hilal", "Al Nassr", "Al Shabab", "Al Riyadh"] },
  dubai: { country: "United-Arab-Emirates", venues: ["dubai"], teams: ["Al Wasl", "Al Nasr Dubai", "Shabab Al Ahli", "Dubai City"] }
};
const LIVE_CODES = new Set(["1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT", "LIVE"]);
function isLive(f) { return LIVE_CODES.has(String(f && f.fixture && f.fixture.status && f.fixture.status.short || "").toUpperCase()); }
function mapFixture(x) {
  const f = x.fixture || {}, status = f.status || {}, goals = x.goals || {};
  return {
    id: f.id || null, home: x.teams && x.teams.home && x.teams.home.name || "",
    away: x.teams && x.teams.away && x.teams.away.name || "",
    competition: x.league && x.league.name || "", date: f.date || "",
    timestamp: f.timestamp || null, timezone: x.fixture && x.fixture.timezone || "UTC",
    status: status.short || "TBD", statusLong: status.long || "Unknown",
    elapsed: Number.isFinite(status.elapsed) ? status.elapsed : null,
    homeGoals: Number.isFinite(goals.home) ? goals.home : null,
    awayGoals: Number.isFinite(goals.away) ? goals.away : null,
    venue: f.venue && f.venue.name || ""
  };
}
export default async function handler(req, res) {
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return json(res, 405, { error: "Method not allowed" }); }
  res.setHeader("Cache-Control", req.query && req.query.team ? "s-maxage=15, stale-while-revalidate=15" : "s-maxage=600, stale-while-revalidate=1800");
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) return json(res, 503, { configured: false, error: "Football data is not configured. Add API_FOOTBALL_KEY in Vercel environment variables.", clubs: [] });
  try {
    if (req.query && req.query.team) {
      const id = Number(req.query.team);
      if (!Number.isInteger(id) || id <= 0) return json(res, 400, { error: "Valid team ID required." });
      const year = seasonNow();
      const [teamRows, fixtureRows, liveRows, playerRows, leagueRows] = await Promise.all([
        apiGet("/teams?id=" + id, key),
        apiGet("/fixtures?team=" + id + "&next=10", key, 5 * 60 * 1000),
        apiGet("/fixtures?team=" + id + "&live=all", key, LIVE_TTL).catch(() => []),
        apiGet("/players?team=" + id + "&season=" + year, key).catch(() => []),
        apiGet("/leagues?team=" + id + "&season=" + year, key).catch(() => [])
      ]);
      const team = teamRows[0] || null;
      if (!team) return json(res, 404, { error: "Club not found in sports provider." });
      const stats = playerRows.map(x => {
        const p = x.player || {}, s = x.statistics && x.statistics[0] || {}, g = s.goals || {};
        return { name: p.name || "", photo: p.photo || "", position: s.games && s.games.position || "", appearances: s.games && s.games.appearances || 0, minutes: s.games && s.games.minutes || 0, goals: g.total || 0, assists: g.assists || 0, total: (g.total || 0) + (g.assists || 0) };
      }).filter(x => x.name);
      stats.sort((a,b) => b.total-a.total || b.goals-a.goals || b.minutes-a.minutes);
      const primaryLeague = leagueRows.find(x => x.league && String(x.league.type || "").toLowerCase() === "league") || leagueRows[0] || null;
      let position = null;
      if (primaryLeague && primaryLeague.league && primaryLeague.league.id) {
        try {
          const standings = await apiGet("/standings?league=" + primaryLeague.league.id + "&season=" + year, key);
          const groups = standings[0] && standings[0].league && standings[0].league.standings || [];
          for (const group of groups) { const row = group.find(x => Number(x.team && x.team.id) === id); if (row) { position = row.rank || null; break; } }
        } catch (_) {}
      }
      const now = Date.now(), byId = new Map();
      for (const row of [...fixtureRows, ...liveRows]) {
        const mapped = mapFixture(row), live = isLive(row);
        if (live || (mapped.timestamp && mapped.timestamp * 1000 >= now)) byId.set(mapped.id || mapped.date + mapped.home, { ...mapped, live });
      }
      const fixtures = [...byId.values()].sort((a,b) => Number(b.live)-Number(a.live) || (a.timestamp || 0)-(b.timestamp || 0));
      return json(res, 200, {
        team: { id: team.team.id, name: team.team.name, logo: team.team.logo, founded: team.team.founded, country: team.team.country, venue: team.venue || {} },
        season: year, players: stats, bestPlayer: stats.length ? stats[0] : null, fixtures,
        liveFixtures: fixtures.filter(f => f.live), upcomingFixtures: fixtures.filter(f => !f.live),
        league: primaryLeague && primaryLeague.league ? { name: primaryLeague.league.name, id: primaryLeague.league.id } : null,
        position, source: "API-FOOTBALL", updatedAt: new Date().toISOString(),
        notes: ["تُعرض المباريات الحية فقط عندما يضعها مزود البيانات ضمن حالات اللعب المباشر.", "أوقات المباريات محفوظة كتوقيت ISO من المزود ويجب عرضها بالتوقيت المحلي للجهاز.", "سجل البطولات التاريخي وإحداثيات الملعب غير متاحة في هذا المسار ولا يتم تخمينها."]
      });
    }
    const city = String(req.query && req.query.city || "").trim();
    if (!city || city.length > 100) return json(res, 400, { error: "A valid city query is required.", clubs: [] });
    const cityKey = norm(city), aliases = { 'مدريد':'madrid', 'لندن':'london', 'برشلونة':'barcelona', 'باريس':'paris', 'روما':'rome', 'ميونخ':'munich', 'ميونيخ':'munich', 'الرياض':'riyadh', 'دبي':'dubai' }, config = CITY_CLUB_SEARCHES[cityKey] || CITY_CLUB_SEARCHES[aliases[String(city).trim()]];
    let rows = [];
    if (config) {
      const batches = await Promise.all(config.teams.map(name => apiGet("/teams?search=" + encodeURIComponent(name), key).catch(() => [])));
      rows = batches.flat();
    } else {
      rows = await apiGet("/teams?search=" + encodeURIComponent(city), key);
    }
    const venueAliases = config ? config.venues.map(norm) : [cityKey];
    const unique = new Map();
    for (const x of rows) {
      const venueCity = norm(x.venue && x.venue.city);
      if (!venueCity || !venueAliases.some(alias => venueCity === alias || venueCity.includes(alias) || alias.includes(venueCity))) continue;
      const id = Number(x.team && x.team.id);
      if (!id || unique.has(id)) continue;
      unique.set(id, { id, name: x.team.name, logo: x.team.logo, founded: x.team.founded, country: x.team.country, venue: x.venue || {} });
    }
    const clubs = [...unique.values()].slice(0, 20);
    return json(res, 200, {
      configured: true, source: "API-FOOTBALL", city, clubs, count: clubs.length,
      updatedAt: new Date().toISOString(),
      note: !clubs.length ? (config ? "لم يُرجع المزود أندية بملعب يقع ضمن نطاق المدينة المحدد." : "بحث المزود باسم المدينة لم يعثر على أندية مؤكدة. تغطية اكتشاف الأندية الجغرافية غير مهيأة لهذه المدينة بعد.") : ""
    });
  } catch (e) {
    console.error("SEYR football API:", e && e.message);
    return json(res, 502, { error: "تعذر الحصول على بيانات كرة القدم من المزود حالياً.", clubs: [] });
  }
}
