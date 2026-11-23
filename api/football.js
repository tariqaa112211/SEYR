const BASE = "https://v3.football.api-sports.io";
const CACHE = new Map();
const TTL = 10 * 60 * 1000;
function json(res, status, body) { return res.status(status).json(body); }
function norm(s) { return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]/g, " ").trim(); }
async function apiGet(path, key) {
  const cached = CACHE.get(path);
  if (cached && Date.now() - cached.at < TTL) return cached.data;
  const r = await fetch(BASE + path, { headers: { "x-apisports-key": key } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || (d.errors && Object.keys(d.errors).length)) throw new Error("Sports provider request failed (" + r.status + ")");
  CACHE.set(path, { at: Date.now(), data: d.response || [] });
  return d.response || [];
}
function seasonNow() { const d = new Date(); return d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1; }
export default async function handler(req, res) {
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return json(res, 405, { error: "Method not allowed" }); }
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) return json(res, 503, { configured: false, error: "Football data is not configured. Add API_FOOTBALL_KEY in Vercel environment variables.", clubs: [] });
  try {
    if (req.query && req.query.team) {
      const id = Number(req.query.team);
      if (!Number.isInteger(id) || id <= 0) return json(res, 400, { error: "Valid team ID required." });
      const year = seasonNow();
      const [teamRows, fixtureRows, playerRows] = await Promise.all([
        apiGet("/teams?id=" + id, key),
        apiGet("/fixtures?team=" + id + "&next=10", key),
        apiGet("/players?team=" + id + "&season=" + year, key).catch(() => [])
      ]);
      const team = teamRows[0] || null;
      if (!team) return json(res, 404, { error: "Club not found in sports provider." });
      const stats = playerRows.map(x => {
        const p = x.player || {}, s = x.statistics && x.statistics[0] || {}, g = s.goals || {};
        return { name: p.name || "", photo: p.photo || "", position: s.games && s.games.position || "", appearances: s.games && s.games.appearances || 0, minutes: s.games && s.games.minutes || 0, goals: g.total || 0, assists: g.assists || 0, total: (g.total || 0) + (g.assists || 0) };
      }).filter(x => x.name);
      stats.sort((a,b) => b.total-a.total || b.goals-a.goals || b.minutes-a.minutes);
      const fixtures = fixtureRows.filter(x => x.fixture && new Date(x.fixture.date).getTime() >= Date.now()).map(x => ({
        home: x.teams && x.teams.home && x.teams.home.name || "",
        away: x.teams && x.teams.away && x.teams.away.name || "",
        competition: x.league && x.league.name || "",
        date: x.fixture.date || "",
        venue: x.fixture.venue && x.fixture.venue.name || ""
      }));
      return json(res, 200, { team: { id: team.team.id, name: team.team.name, logo: team.team.logo, founded: team.team.founded, country: team.team.country, venue: team.venue || {} }, season: year, players: stats, bestPlayer: stats.length ? stats[0] : null, fixtures, league: null, position: null, source: "API-FOOTBALL", updatedAt: new Date().toISOString(), notes: ["اللاعب الأكثر مساهمة محسوب من اللاعبين والإحصاءات التي أعادها المزود للموسم الحالي فقط.", "سجل البطولات التاريخي والترتيب الدوري لم يقدمهما هذا المسار، لذلك لا يتم تخمينهما.", "لا تتوفر إحداثيات الملعب في بيانات هذا المسار؛ لن يتم إنشاء دبوس تقريبي."] });
    }
    const city = String(req.query && req.query.city || "").trim();
    if (!city || city.length > 100) return json(res, 400, { error: "A valid city query is required.", clubs: [] });
    const rows = await apiGet("/teams?search=" + encodeURIComponent(city), key);
    const target = norm(city);
    const clubs = rows.filter(x => {
      const venueCity = norm(x.venue && x.venue.city);
      return venueCity && (venueCity === target || venueCity.includes(target) || target.includes(venueCity));
    }).slice(0, 4).map(x => ({
      id: x.team.id, name: x.team.name, logo: x.team.logo, founded: x.team.founded,
      country: x.team.country, venue: x.venue || {}
    }));
    return json(res, 200, { configured: true, source: "API-FOOTBALL", city, clubs, count: clubs.length, updatedAt: new Date().toISOString(), note: clubs.length < 4 ? "أُعيدت الأندية المطابقة للمدينة فقط؛ لم تتم إضافة أندية من مدن أخرى لإكمال العدد." : "" });
  } catch (e) {
    console.error("SEYR football API:", e && e.message);
    return json(res, 502, { error: "تعذر الحصول على بيانات كرة القدم من المزود حالياً.", clubs: [] });
  }
}
