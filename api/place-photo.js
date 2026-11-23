export default async function handler(req, res) {
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).end(); }
  const key = process.env.GOOGLE_PLACES_API_KEY;
  const name = String(req.query && req.query.name || "");
  if (!key) return res.status(503).json({ error: "Google Places photos are not configured." });
  if (!/^places\/[^/]+\/photos\/[^/]+$/.test(name) || name.length > 500) return res.status(400).json({ error: "Valid photo resource name required." });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const upstream = await fetch("https://places.googleapis.com/v1/" + name + "/media?maxWidthPx=1000", {
      headers: { "X-Goog-Api-Key": key },
      signal: controller.signal,
      redirect: "follow"
    });
    if (!upstream.ok) return res.status(502).json({ error: "Photo provider unavailable." });
    const type = upstream.headers.get("content-type") || "";
    if (!type.startsWith("image/")) return res.status(502).json({ error: "Photo provider returned a non-image response." });
    res.setHeader("Content-Type", type);
    res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=86400");
    return res.status(200).send(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    return res.status(error && error.name === "AbortError" ? 504 : 502).json({ error: "Could not load place photo." });
  } finally { clearTimeout(timer); }
}
