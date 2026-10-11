export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: "AI is not configured. Add OPENAI_API_KEY to the Vercel project environment variables."
    });
  }

  try {
    const body = req.body || {};
    const message = String(body.message || "").trim();
    if (!message) return res.status(400).json({ error: "Message is required." });

    const context = body.context || {};
    const history = Array.isArray(body.history) ? body.history.slice(-12) : [];
    const instructions = [
      "You are SEYR (سَيْر), a premium bilingual travel planner for Saudi travelers and international trips.",
      "Reply naturally in the language and style of the latest user message. Understand Gulf/Saudi Arabic, Arabic and English.",
      "Treat the provided trip context as the source of truth for destination, origin, dates, trip length, budget, travel party, trip type and discovered places.",
      "Use conversation history to understand references such as 'there', 'the second one', 'make it cheaper', and follow-up corrections. Do not ask again for information already provided.",
      "Give useful, concrete outputs: itineraries by day and time block, realistic travel pace, nearby places grouped together, transport suggestions, budget-aware alternatives and a short reason for each recommendation.",
      "When recommending places, prioritize the provided discovered-place list. Never invent a venue, rating, opening time, fare, hotel price, availability, visa requirement, or booking confirmation.",
      "If web search is available, use it for current travel information and cite the source name or link in the answer. Prefer official attraction, transport, airline, hotel or government sources.",
      "Clearly separate confirmed facts, estimates and suggestions. If exact live prices or availability are unavailable, say so and link the user to the relevant provider search rather than guessing.",
      "Ask at most one short clarifying question only when a missing detail materially prevents a useful answer. Otherwise make a reasonable assumption and state it.",
      "Do not claim to have booked anything. Keep answers well structured and easy to scan; avoid generic filler.",
      "Trip context JSON: " + JSON.stringify(context).slice(0, 14000)
    ].join("\n");

    const input = history
      .filter((item) => item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string")
      .map((item) => ({ role: item.role, content: item.content.slice(0, 3000) }));
    input.push({ role: "user", content: message });

    const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
    const callOpenAI = async (withSearch) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 24000);
      try {
        const payload = {
          model,
          instructions,
          input,
          store: false,
          max_output_tokens: 1200
        };
        if (withSearch) payload.tools = [{ type: "web_search" }];
        const upstream = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        const result = await upstream.json().catch(() => ({}));
        return { upstream, result };
      } finally {
        clearTimeout(timer);
      }
    };

    let response;
    try {
      response = await callOpenAI(true);
      // If web search is not enabled for this model/account, retry once without it.
      if (!response.upstream.ok && [400, 404, 422].includes(response.upstream.status)) {
        response = await callOpenAI(false);
      }
    } catch (error) {
      console.error("SEYR AI upstream request failed:", error && error.name);
      return res.status(504).json({ error: "The AI service timed out. Please try again." });
    }

    const { upstream, result } = response;
    if (!upstream.ok) {
      console.error("OpenAI Responses API error:", upstream.status, result.error && result.error.code);
      return res.status(502).json({ error: "The AI provider could not complete this request." });
    }

    let answer = typeof result.output_text === "string" ? result.output_text : "";
    if (!answer && Array.isArray(result.output)) {
      answer = result.output.flatMap((item) => Array.isArray(item.content) ? item.content : [])
        .filter((item) => item.type === "output_text" && typeof item.text === "string")
        .map((item) => item.text).join("\n");
    }
    if (!answer.trim()) return res.status(502).json({ error: "The AI provider returned an empty answer." });
    return res.status(200).json({ answer: answer.trim(), mode: "ai", webSearch: Array.isArray(result.tools) });
  } catch (error) {
    console.error("SEYR assistant route failed:", error && error.message);
    return res.status(500).json({ error: "Unexpected server error." });
  }
}
