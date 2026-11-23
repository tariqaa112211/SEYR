# SEYR | سَيْر

Mobile-first Arabic/English travel companion.

## Deploy on Vercel

1. Import this repository into Vercel and deploy the `main` branch.
2. For the AI assistant, add an environment variable in Vercel Project Settings → Environment Variables:
   - `OPENAI_API_KEY`: your private OpenAI API key.
   - Optional: `OPENAI_MODEL`: model name available to your account (defaults to `gpt-4.1-mini`).
   - Optional: `GOOGLE_PLACES_API_KEY`: a Google Places API key with Places API (New) enabled and billing configured. Restrict it and keep it only in Vercel environment variables.
3. Redeploy after changing environment variables.

Never put the OpenAI key in `index.html` or any client-side JavaScript. The key is read only by `api/assistant.js`.

## Data and booking notes

- Weather and forecast: Open-Meteo; refreshed on app open and periodic refresh while the page remains open.
- City search: a bundled city/country list with Open-Meteo/Nominatim geocoding fallback.
- Explore: live OpenStreetMap/Overpass places linked to the selected trip coordinates. The client searches within 50 km and expands to 100 km for nearby day-trip options when fewer than 80 results are available. It displays only named mapped places and does not pad results with invented venues. The server endpoint searches within 30 km and can merge Google Places results when `GOOGLE_PLACES_API_KEY` is configured. Coverage and provider availability vary by city; mapped places are not endorsements.
- Currency: ExchangeRate-API open endpoint with Frankfurter fallback.
- Flights, hotels and activities: opens third-party search pages (Wego, Google Flights, Skyscanner, Booking.com and GetYourGuide). These links are search shortcuts, not a booking API or booking confirmation. Live fare/availability data requires the provider's approved API/partner access.
- Ratings, live prices and opening hours are not invented when the source does not provide them.

## Important

The static app can run without AI configuration; in that case, SEYR uses a limited local response fallback. For live AI responses, configure `OPENAI_API_KEY` in Vercel. Test the deployed site on desktop and mobile before sharing it publicly.

## Football data

- Add `API_FOOTBALL_KEY` in Vercel Environment Variables to enable the API-Football v3 integration for club lookup, current-season player statistics, league standings, upcoming fixtures and live fixture status/scores. Team-detail responses use a 15-second cache; club discovery is cached for 10 minutes. The client polls club details every 25 seconds only while the Explore/football section is visible.
- The current integration does not provide verified historical trophy records, club legends, official ticket availability or stadium coordinates for every club; those fields must remain unavailable until a reliable source is integrated.


## Refresh behavior and known provider limits

- Weather is refreshed every 8 minutes while the app is visible; leaving the page pauses this polling.
- Explore uses a 30-minute browser cache and a 15-minute server cache. Manual refresh bypasses the browser cache.
- Currency is fetched on demand when the currency panel is opened; it is not presented as a continuously streaming quote.
- Flight and hotel results remain provider search links, not live prices from a booking API.
- City-to-club discovery has explicit venue-city matching for Madrid, London, Barcelona, Paris, Rome, Munich, Riyadh and Dubai (including Arabic city aliases). Other cities use the provider's city-name search and may return no clubs if its search index cannot resolve the city.
- The football API returns only fixtures supplied by API-Football. It does not claim to provide every lower-division club, live scores outside provider coverage, stadium coordinates, or official ticket inventory.
- OPENAI_API_KEY, API_FOOTBALL_KEY and optional GOOGLE_PLACES_API_KEY are private server-side environment variables. No keys are included in the repository.
