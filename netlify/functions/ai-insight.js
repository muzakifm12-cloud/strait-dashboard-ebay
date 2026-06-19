// netlify/functions/ai-insight.js
//
// POST /api/ai-insight
// Body: { query: string, stats: <stats object from /api/ebay-search> }
//
// This function sends REAL data (aggregate stats from active eBay listings) to
// DeepSeek, then asks DeepSeek to analyze it -- not to invent new data.
// The result is used to fill the Dashboard Overview & Strategy Center.
//
// ============================================================
// CHANGE THIS SECTION if you want to switch AI providers (OpenAI, Claude, etc.):
// just swap AI_BASE_URL, MODEL, and the Authorization header according to that
// provider's docs -- the request body (messages, response_format) is most
// likely the same shape since most providers are OpenAI-format compatible.
// ============================================================
const AI_BASE_URL = 'https://api.deepseek.com/chat/completions';
const MODEL = 'deepseek-v4-flash'; // switch to 'deepseek-v4-pro' for higher analysis quality (more expensive)

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new Error('DEEPSEEK_API_KEY is not set in Netlify Environment Variables.');
    }

    const { query, stats } = JSON.parse(event.body || '{}');
    if (!stats) {
      return { statusCode: 400, body: JSON.stringify({ error: 'stats is required (result from /api/ebay-search).' }) };
    }

    const systemPrompt =
      'You are an experienced eBay market research analyst. You are given REAL AGGREGATE data from active eBay listings (not made-up data). Your task is ONLY to analyze the data provided -- do not invent new numbers with no basis in it. Respond ONLY in valid JSON, no markdown, no introductory text.';

    const userPrompt = `Product being searched: "${query}"

REAL aggregate data from eBay (currently active listings):
${JSON.stringify(stats, null, 2)}

Based on the data above, produce JSON with EXACTLY this structure:
{
  "opportunityScore": 0,
  "entryBarrierScore": 0,
  "competitionScore": 0,
  "demandScore": 0,
  "profitabilityScore": 0,
  "growthPotentialScore": 0,
  "marketSummary": "2-3 sentence market summary",
  "productHealthIndicator": "Healthy | Caution | At Risk",
  "recommendedAction": "1 sentence concrete action",
  "insights": ["insight 1", "insight 2", "insight 3", "insight 4", "insight 5"],
  "actionPlans": ["plan 1", "plan 2", "plan 3", "plan 4", "plan 5"],
  "finalRecommendation": "Buy | Test Small | Avoid",
  "finalRecommendationReason": "2-3 sentence reason",
  "optimizedTitle": "example optimized eBay listing title, max 80 characters"
}

All scores are on a 0-100 scale. Make sure competitionScore & entryBarrierScore are consistent with top3SellerShare and uniqueSellers in the data (high top3SellerShare + low uniqueSellers = market dominated by few sellers = high entry barrier & competition). Use English for all text.`;

    const res = await fetch(AI_BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.4,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`DeepSeek API error (status ${res.status}): ${errText}`);
    }

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed),
    };
  } catch (err) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: err.message }) };
  }
};
