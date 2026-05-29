import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Load env file from the current directory
  const env = loadEnv(mode, process.cwd(), '');

  return {
    server: {
      port: 5173,
      host: true
    },
    plugins: [
      {
        name: 'api-server-mock',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            // Match the API endpoint for generation
            if (req.url.startsWith('/api/generate-report') && req.method === 'POST') {
              let body = '';
              req.on('data', chunk => {
                body += chunk;
              });
              req.on('end', async () => {
                try {
                  const data = JSON.parse(body);
                  const { theme, limit, sauceText, users, feature, prompt, customApiKey, model } = data;

                  // Resolve the API Key: prioritize environment variables, fallback to client-supplied override
                  const apiKey = env.OPENROUTER_API_KEY || env.GLOBAL_API_KEY || customApiKey;

                  if (!apiKey) {
                    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ 
                      error: 'APIキーが設定されていません。ローカルの .env ファイルに OPENROUTER_API_KEY を設定するか、または「設定」からカスタムAPIキーを入力してください。' 
                    }));
                    return;
                  }

                  // Process source text exactly like the GAS code
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

                  // Call OpenRouter API using native fetch (supported in modern Node.js)
                  const apiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${apiKey}`,
                      'Content-Type': 'application/json',
                      'HTTP-Referer': 'http://localhost:5173/',
                      'X-Title': 'AI Report generator standalone'
                    },
                    body: JSON.stringify({
                      model: chosenModel,
                      messages: messages,
                      temperature: 0.7,
                      max_tokens: 1024
                    })
                  });

                  if (!apiResponse.ok) {
                    const errDetail = await apiResponse.text();
                    res.writeHead(apiResponse.status, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ error: `OpenRouter API Error: ${errDetail}` }));
                    return;
                  }

                  const responseData = await apiResponse.json();
                  let resultText = responseData?.choices?.[0]?.message?.content ?? '';

                  if (resultText) {
                    resultText = resultText.split('\n').filter(line => line.trim() !== "").join('\n');
                    if (!resultText.startsWith('　')) resultText = '　' + resultText;
                  }

                  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                  res.end(JSON.stringify({ result: resultText }));
                } catch (err) {
                  res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                  res.end(JSON.stringify({ error: `サーバーエラー: ${err.message}` }));
                }
              });
              return;
            }
            next();
          });
        }
      }
    ]
  };
});
