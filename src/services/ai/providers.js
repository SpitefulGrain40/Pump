const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const CLI_PROXY_URL = 'http://localhost:3141/chat';

function sanitizeKey(key) {
  if (!key) return '';
  return key.trim().replace(/[^\x20-\x7E]/g, '');
}

// Client-side tools Coach can call to look up historical data on demand.
// The frontend executes these (localStorage reads) and returns results so
// Claude can answer with real data rather than guessing.
export const COACH_TOOLS = [
  {
    name: 'get_nutrition_history',
    description: "Get the user's daily calorie and protein totals for the last N days. Call when the user asks about food patterns, calorie averages, or nutrition trends. Returns totals only — call get_meal_items for the actual foods eaten on a specific date.",
    input_schema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Days to look back (default 14, max 90)' }
      }
    }
  },
  {
    name: 'get_meal_items',
    description: "Get the individual food items logged on a specific date. Call when the user wants to re-log the same meal as a previous day, asks what they ate on a specific day, or needs food-level detail for one date.",
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date in YYYY-MM-DD format' }
      },
      required: ['date']
    }
  },
  {
    name: 'get_workout_history',
    description: "Get the user's completed workout sessions with exercises, sets, reps, and weights. Call when asked about past workouts, exercise history, or progress on a specific movement.",
    input_schema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Days to look back (default 30, max 180)' },
        exercise: { type: 'string', description: 'Optional: filter to sessions containing this exercise name' }
      }
    }
  },
  {
    name: 'get_pr_records',
    description: "Get the user's personal records — best weight lifted per exercise. Call when asked about PRs, bests, or strength history.",
    input_schema: {
      type: 'object',
      properties: {
        exercise: { type: 'string', description: 'Optional: filter to a specific exercise name' }
      }
    }
  },
  {
    name: 'get_weight_history',
    description: "Get the user's body weight entries over time. Call when asked about weight trend, rate of loss/gain, or specific past weigh-ins.",
    input_schema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Days to look back (default 30, max 365)' }
      }
    }
  },
  {
    name: 'get_workout_templates',
    description: "Get the full exercise lists for all workout templates (push, pull, legs, push_b, etc.). Call when the user asks what's in a template, wants to compare variants, or when you need to suggest specific exercise swaps.",
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'get_performance_summary',
    description: "Get a 2-week performance summary: workout completion rate, current streak, weight change, and average calories/protein. Call when the user asks about overall progress, consistency, or whether they're on track.",
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'lookup_nutrition',
    description: "Look up verified calories/protein/carbs/fat (per 100g or per unit) for a food, by name or barcode. Sources the user's saved food library, the UK CoFID database, and Open Food Facts. Call before logging a meal to ground the numbers in real data instead of guessing.",
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Food name to look up, e.g. "roast beef"' },
        barcode: { type: 'string', description: 'Product barcode digits, if known' }
      }
    }
  }
];

export async function sendToOpenRouter(apiKey, model, messages, systemPrompt) {
  const cleanKey = sanitizeKey(apiKey);
  const formattedMessages = messages.map((m) => {
    // Handle multimodal messages (text + images)
    if (m.image) {
      return {
        role: m.role,
        content: [
          { type: 'text', text: m.content },
          { type: 'image_url', image_url: { url: m.image } }
        ]
      };
    }
    return { role: m.role, content: m.content };
  });

  if (systemPrompt) {
    formattedMessages.unshift({ role: 'system', content: systemPrompt });
  }

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${cleanKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'pump-fitness-app',
      'X-Title': 'Pump Fitness Coach',
    },
    body: JSON.stringify({
      model: model || 'meta-llama/llama-3.3-70b-instruct:free',
      messages: formattedMessages,
      max_tokens: 1024,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const message = error.error?.message || error.message || JSON.stringify(error) || `OpenRouter error: ${response.status}`;
    throw new Error(message);
  }

  const data = await response.json();
  return {
    content: data.choices?.[0]?.message?.content || '',
    usage: {
      input: data.usage?.prompt_tokens || 0,
      output: data.usage?.completion_tokens || 0,
    },
  };
}

export async function sendToAnthropic(apiKey, model, messages, systemPrompt, opts = {}) {
  const cleanKey = sanitizeKey(apiKey);
  const formattedMessages = messages.map((m) => {
    // Handle multimodal messages (text + images)
    if (m.image) {
      const base64Data = m.image.split(',')[1];
      const mediaType = m.image.match(/data:([^;]+);/)?.[1] || 'image/jpeg';
      return {
        role: m.role,
        content: [
          { type: 'text', text: m.content },
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } }
        ]
      };
    }
    return { role: m.role, content: m.content };
  });

  const body = {
    model: model || 'claude-sonnet-4-6',
    // Bumped from 1024. Coach answers were truncating mid-thought. 4096 is a
    // safe non-streaming default (well under SDK 10-min timeout window).
    max_tokens: opts.maxTokens || 4096,
    messages: formattedMessages,
  };

  // System prompt as a cached text block — enables prompt caching when the
  // same prompt repeats inside the cache TTL (5 min default). Coach's system
  // prompt rebuilds with current context every send, so cache hits happen
  // mainly within rapid back-and-forth (where the user hasn't logged a meal
  // or workout between turns). Even partial hits save ~90% on input tokens.
  if (systemPrompt) {
    body.system = [
      { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
    ];
  }

  // Combine server-side web search with client-side data tools.
  // Web search is handled by Anthropic's servers (transparent to our loop).
  // Client tools trigger stop_reason: tool_use and need a tool_result reply.
  const toolsList = [];
  if (opts.webSearch) toolsList.push({ type: 'web_search_20250305', name: 'web_search', max_uses: 3 });
  if (opts.tools?.length) toolsList.push(...opts.tools);
  if (toolsList.length) body.tools = toolsList;

  const headers = {
    'x-api-key': cleanKey,
    'anthropic-version': '2023-06-01',
    'Content-Type': 'application/json',
    'anthropic-dangerous-direct-browser-access': 'true',
  };

  // Tool-use loop: keep sending until stop_reason is end_turn.
  // Client tools (our data tools) return stop_reason: tool_use and need a
  // tool_result reply. Web search is server-side and transparent to this loop.
  let currentMessages = [...formattedMessages];
  const totalUsage = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };

  while (true) {
    const response = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...body, messages: currentMessages }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `Anthropic error: ${response.status}`);
    }

    const data = await response.json();
    totalUsage.input += data.usage?.input_tokens || 0;
    totalUsage.output += data.usage?.output_tokens || 0;
    totalUsage.cacheRead += data.usage?.cache_read_input_tokens || 0;
    totalUsage.cacheCreate += data.usage?.cache_creation_input_tokens || 0;

    if (data.stop_reason !== 'tool_use' || !opts.toolExecutor) {
      const textBlocks = (data.content || []).filter((b) => b.type === 'text');
      const content = textBlocks.map((b) => b.text).join('').trim();
      return { content, usage: totalUsage, stopReason: data.stop_reason };
    }

    // Execute client-side tool calls and loop back
    const toolResults = [];
    for (const block of data.content) {
      if (block.type === 'tool_use') {
        let result;
        try {
          result = await opts.toolExecutor(block.name, block.input);
        } catch (e) {
          result = { error: e.message };
        }
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result, null, 2),
        });
      }
    }

    currentMessages = [
      ...currentMessages,
      { role: 'assistant', content: data.content },
      { role: 'user', content: toolResults },
    ];
  }
}

export async function sendToCLI(model, messages, systemPrompt) {
  const response = await fetch(CLI_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, systemPrompt, model: model || 'claude-sonnet-4-6' }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `CLI proxy error: ${response.status}`);
  }

  const data = await response.json();
  return { content: data.content || '', usage: { input: 0, output: 0 } };
}

export async function sendMessage(settings, messages, systemPrompt, opts = {}) {
  const { provider, openrouterKey, anthropicKey, model, anthropicModel, enableWebSearch } = settings;

  if (provider === 'cli') {
    // CLI proxy is one-shot — no tool-use loop support
    return sendToCLI(anthropicModel || 'claude-sonnet-4-6', messages, systemPrompt);
  } else if (provider === 'openrouter') {
    if (!openrouterKey) throw new Error('OpenRouter API key not configured');
    // OpenRouter tool support varies by model — skip for now
    return sendToOpenRouter(openrouterKey, model, messages, systemPrompt);
  } else {
    if (!anthropicKey) throw new Error('Anthropic API key not configured');
    const webSearch = enableWebSearch !== false;
    return sendToAnthropic(anthropicKey, anthropicModel, messages, systemPrompt, {
      webSearch,
      tools: opts.tools,
      toolExecutor: opts.toolExecutor,
    });
  }
}

export async function testConnection(settings) {
  const testMessages = [{ role: 'user', content: 'Reply with just "OK"' }];
  const start = Date.now();

  try {
    const response = await sendMessage(settings, testMessages, null);
    const latency = Date.now() - start;
    return { success: true, latency, response: response.content };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
