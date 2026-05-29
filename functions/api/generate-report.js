// Cloudflare Pages Function for secure server-side OpenRouter API communication.
// Placed in /functions/api/generate-report.js to run on Cloudflare Workers edge network.

export async function onRequestPost(context) {
  const { request, env } = context;

  // Set CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json; charset=utf-8'
  };

  try {
    const body = await request.json();
    const { theme, limit, sauceText, users, feature, prompt, customApiKey, model } = body;

    // Retrieve API key from Cloudflare Pages Environment variables
    // or fallback to customApiKey supplied by client in settings
    const apiKey = env.OPENROUTER_API_KEY || env.GLOBAL_API_KEY || customApiKey;

    if (!apiKey) {
      return new Response(
        JSON.stringify({ 
          error: 'APIキーが設定されていません。Cloudflareダッシュボードの環境変数で OPENROUTER_API_KEY を設定するか、またはアプリ上の「設定」からカスタムAPIキーを入力してください。' 
        }), 
        { status: 400, headers: corsHeaders }
      );
    }

    // Process source information (same logic as the original GAS code)
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

    // Call OpenRouter API
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
      // Apply post-processing
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

// Handle CORS Preflight Options Request
export async function onRequestOptions(context) {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    }
  });
}
