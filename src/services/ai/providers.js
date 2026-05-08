const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

function sanitizeKey(key) {
  if (!key) return '';
  return key.trim().replace(/[^\x20-\x7E]/g, '');
}

export async function sendToOpenRouter(apiKey, model, messages, systemPrompt) {
  const cleanKey = sanitizeKey(apiKey);
  const formattedMessages = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

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

export async function sendToAnthropic(apiKey, model, messages, systemPrompt) {
  const cleanKey = sanitizeKey(apiKey);
  const formattedMessages = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const body = {
    model: model || 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: formattedMessages,
  };

  if (systemPrompt) {
    body.system = systemPrompt;
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
  return {
    content: data.content?.[0]?.text || '',
    usage: {
      input: data.usage?.input_tokens || 0,
      output: data.usage?.output_tokens || 0,
    },
  };
}

export async function sendMessage(settings, messages, systemPrompt) {
  const { provider, openrouterKey, anthropicKey, model, anthropicModel } = settings;

  if (provider === 'openrouter') {
    if (!openrouterKey) throw new Error('OpenRouter API key not configured');
    return sendToOpenRouter(openrouterKey, model, messages, systemPrompt);
  } else {
    if (!anthropicKey) throw new Error('Anthropic API key not configured');
    return sendToAnthropic(anthropicKey, anthropicModel, messages, systemPrompt);
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
