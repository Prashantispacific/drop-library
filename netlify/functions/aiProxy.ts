interface ProxyEvent {
  httpMethod: string;
  body: string | null;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
};

export async function handler(event: ProxyEvent) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST' || !event.body) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'POST request with body required' }),
    };
  }

  try {
    const { endpoint, headers, body } = JSON.parse(event.body);

    if (!endpoint || typeof endpoint !== 'string' || !endpoint.startsWith('http')) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Valid HTTP/HTTPS endpoint required' }),
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 28000);

    const upstreamResponse = await fetch(endpoint, {
      method: 'POST',
      headers: headers || { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const responseText = await upstreamResponse.text();

    return {
      statusCode: upstreamResponse.status,
      headers: CORS_HEADERS,
      body: responseText,
    };
  } catch (err: unknown) {
    return {
      statusCode: 502,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: `Proxy request failed: ${(err as Error)?.message || String(err)}`,
      }),
    };
  }
}
