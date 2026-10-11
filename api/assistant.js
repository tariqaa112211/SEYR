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
      "You are SEYR (سَيْر), a helpful bilingual travel planning assistant for Saudi and international travelers.",
      "Answer in the language of the latest user message unless they request another language.",
      "Use the provided trip context: destination, origin, travel dates, duration, budget, trip type, and discovered places.",
      "Be specific and practical. Tailor suggestions to family, friends/youth, or solo travel and the stated budget.",
      "Never invent live prices, hotel availability, flight fares, ratings, opening hours, visa rules, or booking confirmations.",
      "When live information is not present in context, say so and direct the traveler to verify it with the official provider.",
      "If a destination or travel date is missing and matters to the answer, ask one concise follow-up question.",
      "Do not claim to have booked or reserved anything. Provide concise itineraries and explain assumptions.",
      "Trip context JSON: " + JSON.stringify(context).slice(0, 14000)
    ].join("\n");

    const input = history
      .filter(function (item) {
        return item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string";
      })
      .map(function (item) {
        return { role: item.role, content: item.content.slice(0, 3000) };
      });
    input.push({ role: "user", content: message });

    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        instructions: instructions,
        input: input,
        store: false,
        max_output_tokens: 900
      })
    });

    const result = await upstream.json().catch(function () { return {}; });
    if (!upstream.ok) {
      console.error("OpenAI Responses API error:", upstream.status, result.error && result.error.code);
      return res.status(502).json({ error: "The AI provider could not complete this request." });
    }

    let answer = typeof result.output_text === "string" ? result.output_text : "";
    if (!answer && Array.isArray(result.output)) {
      answer = result.output.flatMap(function (item) {
        return Array.isArray(item.content) ? item.content : [];
      }).filter(function (item) {
        return item.type === "output_text" && typeof item.text === "string";
      }).map(function (item) {
        return item.text;
      }).join("\n");
    }
    if (!answer.trim()) return res.status(502).json({ error: "The AI provider returned an empty answer." });
    return res.status(200).json({ answer: answer.trim(), mode: "ai" });
  } catch (error) {
    console.error("SEYR assistant route failed:", error && error.message);
    return res.status(500).json({ error: "Unexpected server error." });
  }
}
