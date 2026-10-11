export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return res.status(200).json({ places: [], mode: "osm-only" });
  const lat = Number(req.query && req.query.lat);
  const lon = Number(req.query && req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return res.status(400).json({ error: "Valid lat and lon are required." });
  }
  try {
    const response = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.primaryType,places.websiteUri,places.googleMapsUri,places.rating,places.userRatingCount"
      },
      body: JSON.stringify({
        includedTypes: ["restaurant", "cafe", "tourist_attraction", "museum", "park", "shopping_mall", "hotel", "night_club", "bar"],
        maxResultCount: 20,
        rankPreference: "POPULARITY",
        locationRestriction: {
          circle: { center: { latitude: lat, longitude: lon }, radius: 15000.0 }
        }
      })
    });
    const data = await response.json().catch(function () { return {}; });
    if (!response.ok) {
      console.error("Google Places API error:", response.status);
      return res.status(502).json({ error: "Google Places could not complete this search." });
    }
    const places = (data.places || []).map(function (p) {
      const type = p.primaryType === "restaurant" ? "restaurant" :
        p.primaryType === "cafe" ? "cafe" :
        p.primaryType === "hotel" ? "hotel" :
        p.primaryType === "shopping_mall" ? "shopping" :
        p.primaryType === "park" ? "nature" :
        p.primaryType === "night_club" || p.primaryType === "bar" ? "nightlife" : "tourism";
      return {
        name: p.displayName && p.displayName.text || "",
        city: "",
        desc: p.formattedAddress || p.primaryType || "Google Places result",
        type: type,
        lat: p.location && p.location.latitude,
        lon: p.location && p.location.longitude,
        source: "Google Places",
        website: p.websiteUri || "",
        mapsUrl: p.googleMapsUri || "",
        rating: typeof p.rating === "number" ? p.rating : null,
        reviewCount: typeof p.userRatingCount === "number" ? p.userRatingCount : null,
        id: p.id || ""
      };
    }).filter(function (p) { return p.name; });
    return res.status(200).json({ places: places, mode: "google-places" });
  } catch (error) {
    console.error("SEYR Places route failed:", error && error.message);
    return res.status(500).json({ error: "Unexpected server error." });
  }
}
