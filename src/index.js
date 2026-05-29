// Cloudflare Workers with Assets entry point.
// Routes API requests, verifies Google login tokens, handles KV storage, and serves static files.

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Common CORS headers for API endpoints
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    };

    // Handle OPTIONS (CORS preflight) for all paths
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // 1. GET /api/config
    if (url.pathname === '/api/config' && request.method === 'GET') {
      const responseData = {
        googleClientId: env.GOOGLE_CLIENT_ID || '34103901665-i8jtjr8ai9aj60dfflgce0sq0mrivedc.apps.googleusercontent.com',
        kvEnabled: !!env.SELF_ANALYSIS_KV
      };
      return new Response(JSON.stringify(responseData), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' }
      });
    }

    // 2. POST /api/get-user-data
    if (url.pathname === '/api/get-user-data' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { idToken } = body;

        if (!idToken) {
          return new Response(JSON.stringify({ error: 'idToken is required' }), {
            status: 400,
            headers: corsHeaders
          });
        }

        const profile = await verifyGoogleToken(idToken);
        let userData = null;

        if (env.SELF_ANALYSIS_KV) {
          const rawData = await env.SELF_ANALYSIS_KV.get(`user:${profile.sub}`);
          if (rawData) {
            userData = JSON.parse(rawData);
          }
        }

        return new Response(JSON.stringify({
          profile: {
            email: profile.email,
            name: profile.name,
            picture: profile.picture
          },
          data: userData
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: corsHeaders
        });
      }
    }

    // 3. POST /api/save-user-data
    if (url.pathname === '/api/save-user-data' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { idToken, data } = body;

        if (!idToken || !data) {
          return new Response(JSON.stringify({ error: 'idToken and data are required' }), {
            status: 400,
            headers: corsHeaders
          });
        }

        const profile = await verifyGoogleToken(idToken);

        if (!env.SELF_ANALYSIS_KV) {
          return new Response(JSON.stringify({ error: 'Cloudflare KV namespace (SELF_ANALYSIS_KV) is not bound.' }), {
            status: 501,
            headers: corsHeaders
          });
        }

        await env.SELF_ANALYSIS_KV.put(`user:${profile.sub}`, JSON.stringify(data));

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: corsHeaders
        });
      }
    }

    // 4. POST /api/generate-report
    if (url.pathname === '/api/generate-report' && request.method === 'POST') {
      return handleGenerateReport(request, env, corsHeaders);
    }

    // 5. Fallback: serve static assets from the Vite build directory
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not Found", { status: 404 });
  }
};

// Verifies Google ID Token via Google's OAuth2 Token Info endpoint
async function verifyGoogleToken(idToken) {
  if (idToken === 'mock-token-id') {
    return {
      sub: 'mock-user-12345',
      email: 'mock-student@example.com',
      name: 'テストユーザー',
      picture: 'https://api.dicebear.com/7.x/bottts/svg?seed=student'
    };
  }
  
  const verifyResponse = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
  if (!verifyResponse.ok) {
    throw new Error("Google ID Token verification failed.");
  }
  return await verifyResponse.json();
}

async function handleGenerateReport(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const { idToken, theme, limit, sauceText, users, feature, prompt, customApiKey, model } = body;

    if (!idToken) {
      return new Response(
        JSON.stringify({ error: 'Googleログインによる認証が必要です。' }),
        { status: 401, headers: corsHeaders }
      );
    }

    try {
      await verifyGoogleToken(idToken);
    } catch (err) {
      return new Response(
        JSON.stringify({ error: `認証エラー: ${err.message}` }),
        { status: 401, headers: corsHeaders }
      );
    }

    const apiKey = env.OPENROUTER_API_KEY || env.GLOBAL_API_KEY || customApiKey;

    if (!apiKey) {
      return new Response(
        JSON.stringify({ 
          error: 'APIキーが設定されていません。Cloudflare Workersダッシュボードの環境変数で OPENROUTER_API_KEY を設定するか、またはアプリ上の「設定」からカスタムAPIキーを入力してください。' 
        }), 
        { status: 400, headers: corsHeaders }
      );
    }

    let infoText = "";
    if (sauceText && sauceText.trim()) {
      const lines = sauceText.split('\n').map(l => l.trim()).filter(l => l !== "");
      if (lines.length > 0) {
        lines.forEach(line => {
          if (line.includes('・') || line.includes('【')) {
            infoText += line + "\n";
          } else if (theme && (theme.includes(line.substring(0, 5)) || line.includes(theme.substring(0, 5)))) {
            infoText += line + "\n";
          }
        });
      }
    }
    if (!infoText) infoText = sauceText || "";

    const messages = [
      { role: 'system', content: `あなたは${users || '学生'}である私です。私は、自分に合うのは${feature || '個別アピール'}だと考えています` },
      { role: 'system', content: `人間の学生らしい文章を意識して。` },
      { role: 'system', content: `${prompt || ''}` },
      { role: 'user', content: `質問：「${theme}」について、以下の情報を参考に、${limit}文字以内でですます調で書いて。\n\n${infoText}` }
    ];

    const chosenModel = model || 'openai/gpt-oss-120b:free';

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://script.google.com/',
        'X-Title': 'AI Report generator standalone'
      },
      body: JSON.stringify({
        model: chosenModel,
        messages: messages,
        temperature: 0.7,
        max_tokens: 1024
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return new Response(
        JSON.stringify({ error: `OpenRouter API Error: ${errText}` }), 
        { status: response.status, headers: corsHeaders }
      );
    }

    const resData = await response.json();
    let result = resData?.choices?.[0]?.message?.content ?? '';

    if (result) {
      result = result.split('\n').filter(line => line.trim() !== "").join('\n');
      if (!result.startsWith('　')) result = '　' + result;
    }

    return new Response(
      JSON.stringify({ result }), 
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: `サーバー処理中にエラーが発生しました: ${error.message}` }), 
      { status: 500, headers: corsHeaders }
    );
  }
}
