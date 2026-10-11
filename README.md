# SEYR | سَيْر

Mobile-first Arabic/English travel companion.

## Deploy on Vercel

1. Import this repository into Vercel and deploy the `main` branch.
2. For the AI assistant, add an environment variable in Vercel Project Settings → Environment Variables:
   - `OPENAI_API_KEY`: your private OpenAI API key.
   - Optional: `OPENAI_MODEL`: model name available to your account (defaults to `gpt-4.1-mini`).
3. Redeploy after changing environment variables.

Never put the OpenAI key in `index.html` or any client-side JavaScript. The key is read only by `api/assistant.js`.

## Data and booking notes

- Weather and forecast: Open-Meteo; refreshed on app open and periodic refresh while the page remains open.
- City search: a bundled city/country list with Open-Meteo/Nominatim geocoding fallback.
- Explore: OpenStreetMap/Overpass. Coverage and response speed vary by city; mapped places are not endorsements.
- Currency: ExchangeRate-API open endpoint with Frankfurter fallback.
- Flights, hotels and activities: opens third-party search pages (Wego, Google Flights, Skyscanner, Booking.com and GetYourGuide). These links are search shortcuts, not a booking API or booking confirmation. Live fare/availability data requires the provider's approved API/partner access.
- Ratings, live prices and opening hours are not invented when the source does not provide them.

## Important

The static app can run without AI configuration; in that case, SEYR uses a limited local response fallback. For live AI responses, configure `OPENAI_API_KEY` in Vercel. Test the deployed site on desktop and mobile before sharing it publicly.
