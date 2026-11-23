export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const lat = Number(req.query && req.query.lat);
  const lon = Number(req.query && (req.query.lon || req.query.lng));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return res.status(400).json({ error: "Valid lat and lon are required." });
  }

  // Public, short-lived cache helps keep Explore fast while allowing the data to refresh.
  res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=3600");
  const key = process.env.GOOGLE_PLACES_API_KEY;
  const overpassQuery = `[out:json][timeout:18];(
    nwr(around:30000,${lat},${lon})[tourism~"attraction|museum|gallery|zoo|theme_park|viewpoint|aquarium|artwork|camp_site"];
    nwr(around:30000,${lat},${lon})[amenity~"restaurant|cafe|fast_food|ice_cream|bar|nightclub|museum|gallery|arts_centre|theatre|cinema|aquarium|zoo"];
    nwr(around:30000,${lat},${lon})[leisure~"park|nature_reserve|garden|beach_resort|water_park"];
    nwr(around:30000,${lat},${lon})[shop~"mall|department_store|marketplace"];
    nwr(around:30000,${lat},${lon})[historic];
    nwr(around:30000,${lat},${lon})[natural~"beach|waterfall|cave|peak"];
  );out center tags 100;`;

  const requestJson = async (url, options, timeoutMs = 10000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (!response.ok) throw new Error("upstream-" + response.status);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  };

  const osmFetch = async (endpoint) => {
    const data = await requestJson(endpoint + "?data=" + encodeURIComponent(overpassQuery), {
      headers: { "Accept": "application/json", "User-Agent": "SEYR-Travel-App/1.0" }
    }, 18000);
    return (data.elements || []).map((item) => {
      const tags = item.tags || {};
      const rawType = tags.amenity || tags.tourism || tags.leisure || tags.shop || (tags.historic ? "historic" : "activity");
      let type = "tourism";
      if (["restaurant", "cafe", "fast_food", "ice_cream"].includes(tags.amenity)) type = tags.amenity === "cafe" ? "cafe" : "restaurant";
      else if (["bar", "nightclub"].includes(tags.amenity)) type = "nightlife";
      else if (["park", "nature_reserve", "garden"].includes(tags.leisure)) type = "nature";
      else if (["mall", "department_store"].includes(tags.shop)) type = "shopping";
      else if (["hotel", "hostel", "guest_house"].includes(tags.tourism)) type = "hotel";
      const latitude = item.lat ?? (item.center && item.center.lat);
      const longitude = item.lon ?? (item.center && item.center.lon);
      return {
        id: "osm-" + item.type + "-" + item.id,
        name: tags.name || tags["name:en"] || tags["name:ar"] || "",
        city: "",
        desc: tags.description || tags["description:en"] || tags.cuisine || tags.tourism || tags.amenity || rawType,
        type,
        lat: latitude,
        lon: longitude,
        source: "OpenStreetMap",
        website: tags.website || tags["contact:website"] || "",
        mapsUrl: Number.isFinite(latitude) && Number.isFinite(longitude)
          ? "https://www.google.com/maps/search/?api=1&query=" + latitude + "," + longitude : "",
        rating: null,
        reviewCount: null,
        image: tags.image || "",
        openingHours: tags.opening_hours || ""
      };
    }).filter((place) => place.name && Number.isFinite(place.lat) && Number.isFinite(place.lon));
  };

  const jobs = [
    osmFetch("https://overpass-api.de/api/interpreter"),
    osmFetch("https://overpass.kumi.systems/api/interpreter")
  ];
  if (key) {
    jobs.push((async () => {
      const data = await requestJson("https://places.googleapis.com/v1/places:searchNearby", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.primaryType,places.websiteUri,places.googleMapsUri,places.rating,places.userRatingCount,places.photos,places.currentOpeningHours,places.regularOpeningHours"
        },
        body: JSON.stringify({
          includedTypes: ["restaurant", "cafe", "tourist_attraction", "museum", "park", "shopping_mall", "hotel", "night_club", "bar"],
          maxResultCount: 20,
          rankPreference: "POPULARITY",
          locationRestriction: { circle: { center: { latitude: lat, longitude: lon }, radius: 15000.0 } }
        })
      }, 10000);
      return (data.places || []).map((p) => {
        const primary = p.primaryType || "";
        const type = primary === "restaurant" ? "restaurant" : primary === "cafe" ? "cafe" :
          primary === "hotel" ? "hotel" : primary === "shopping_mall" ? "shopping" :
          primary === "park" ? "nature" : primary === "night_club" || primary === "bar" ? "nightlife" : "tourism";
        return {
          id: p.id || "",
          name: p.displayName && p.displayName.text || "",
          city: "",
          desc: p.formattedAddress || primary || "Google Places result",
          type,
          lat: p.location && p.location.latitude,
          lon: p.location && p.location.longitude,
          source: "Google Places",
          website: p.websiteUri || "",
          mapsUrl: p.googleMapsUri || "",
          rating: typeof p.rating === "number" ? p.rating : null,
          reviewCount: typeof p.userRatingCount === "number" ? p.userRatingCount : null,
          photoName: p.photos && p.photos[0] && p.photos[0].name || "",
          openingHours: p.currentOpeningHours && p.currentOpeningHours.weekdayDescriptions || p.regularOpeningHours && p.regularOpeningHours.weekdayDescriptions || []
        };
      }).filter((p) => p.name);
    })());
  }

  const settled = await Promise.allSettled(jobs);
  const all = settled.flatMap((result) => result.status === "fulfilled" && Array.isArray(result.value) ? result.value : []);
  const unique = [];
  const seen = new Set();
  for (const place of all) {
    const normalized = String(place.name || "").trim().toLocaleLowerCase();
    const locationKey = Number.isFinite(place.lat) && Number.isFinite(place.lon)
      ? Math.round(place.lat * 10000) + ":" + Math.round(place.lon * 10000) : "no-coordinates";
    const dedupeKey = normalized + "|" + locationKey;
    if (!normalized || seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    unique.push(place);
  }
  if (!unique.length) {
    console.error("SEYR places: all data providers failed or returned no named places.");
    return res.status(502).json({ error: "No places could be loaded right now. Please retry.", places: [], mode: "unavailable" });
  }
  return res.status(200).json({
    places: unique.slice(0, 500),
    mode: key && settled[1] && settled[1].status === "fulfilled" ? "osm-google" : "osm",
    count: Math.min(unique.length, 500),
    targetCount: 80,
    radiusKm: 30
  });
}
