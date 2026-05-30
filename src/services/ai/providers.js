const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const CLI_PROXY_URL = 'http://localhost:3141/chat';

function sanitizeKey(key) {
  if (!key) return '';
  return key.trim().replace(/[^\x20-\x7E]/g, '');
}

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

  // Anthropic server-side web search tool. Lets Coach look up info (food
  // macros, exercise form, etc.) without the user pasting URLs. $0.01/search.
  // Caller passes opts.webSearch: true to enable.
  if (opts.webSearch) {
    body.tools = [
      { type: 'web_search_20250305', name: 'web_search', max_uses: 3 },
    ];
  }

  const response = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': cleanKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `Anthropic error: ${response.status}`);
  }

  const data = await response.json();
  // Web search and tool use mean the response can have multiple content
  // blocks (text, server_tool_use, web_search_tool_result). Concatenate all
  // text blocks — old `data.content?.[0]?.text` only read the first block
  // and would drop the actual answer when a tool ran first.
  const textBlocks = (data.content || []).filter((b) => b.type === 'text');
  const content = textBlocks.map((b) => b.text).join('').trim();
  return {
    content,
    usage: {
      input: data.usage?.input_tokens || 0,
      output: data.usage?.output_tokens || 0,
      cacheRead: data.usage?.cache_read_input_tokens || 0,
      cacheCreate: data.usage?.cache_creation_input_tokens || 0,
    },
    stopReason: data.stop_reason,
  };
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

export async function sendMessage(settings, messages, systemPrompt) {
  const { provider, openrouterKey, anthropicKey, model, anthropicModel, enableWebSearch } = settings;

  if (provider === 'cli') {
    return sendToCLI(anthropicModel || 'claude-sonnet-4-6', messages, systemPrompt);
  } else if (provider === 'openrouter') {
    if (!openrouterKey) throw new Error('OpenRouter API key not configured');
    return sendToOpenRouter(openrouterKey, model, messages, systemPrompt);
  } else {
    if (!anthropicKey) throw new Error('Anthropic API key not configured');
    // Web search defaults ON for Anthropic provider — costs ~$0.01/search,
    // dramatically reduces the need for users to paste URLs. Settings can flip off.
    const webSearch = enableWebSearch !== false;
    return sendToAnthropic(anthropicKey, anthropicModel, messages, systemPrompt, { webSearch });
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
