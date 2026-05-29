import { defineConfig, loadEnv } from 'vite';
import fs from 'fs';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // Local JSON file path to simulate Cloudflare KV store in development
  const localKvPath = path.resolve(process.cwd(), '.local-kv.json');
  
  // Helper to read local KV mock
  const readLocalKv = () => {
    try {
      if (fs.existsSync(localKvPath)) {
        return JSON.parse(fs.readFileSync(localKvPath, 'utf-8'));
      }
    } catch (e) {
      console.error('Error reading local KV:', e);
    }
    return {};
  };

  // Helper to write local KV mock
  const writeLocalKv = (data) => {
    try {
      fs.writeFileSync(localKvPath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
      console.error('Error writing local KV:', e);
    }
  };

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
            // 1. GET /api/config
            if (req.url.startsWith('/api/config') && req.method === 'GET') {
              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify({
                googleClientId: env.GOOGLE_CLIENT_ID || '721724668570-nbkv1cfusk7kk4eni4pjvepaus73b13t.apps.googleusercontent.com',
                kvEnabled: true // Enable KV sync UI
              }));
              return;
            }

            // Helper to extract POST body
            const getBody = (request) => new Promise((resolve) => {
              let body = '';
              request.on('data', chunk => { body += chunk; });
              request.on('end', () => resolve(body));
            });

            // Helper to verify Google Token
            const verifyToken = async (idToken) => {
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
                throw new Error("Googleトークンの検証に失敗しました。");
              }
              return await verifyResponse.json();
            };

            // 2. POST /api/get-user-data
            if (req.url.startsWith('/api/get-user-data') && req.method === 'POST') {
              try {
                const bodyStr = await getBody(req);
                const { idToken } = JSON.parse(bodyStr);
                
                if (!idToken) {
                  res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                  res.end(JSON.stringify({ error: 'idToken is required' }));
                  return;
                }

                const profile = await verifyToken(idToken);
                const kvStore = readLocalKv();
                const userData = kvStore[profile.sub] || {
                  personaConfig: null,
                  sauceLibrary: null,
                  reportList: null,
                  favoriteList: null
                };

                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({
                  profile: {
                    email: profile.email,
                    name: profile.name,
                    picture: profile.picture
                  },
                  data: userData
                }));
              } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: err.message }));
              }
              return;
            }

            // 3. POST /api/save-user-data
            if (req.url.startsWith('/api/save-user-data') && req.method === 'POST') {
              try {
                const bodyStr = await getBody(req);
                const { idToken, data } = JSON.parse(bodyStr);

                if (!idToken || !data) {
                  res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                  res.end(JSON.stringify({ error: 'idToken and data are required' }));
                  return;
                }

                const profile = await verifyToken(idToken);
                const kvStore = readLocalKv();
                kvStore[profile.sub] = data;
                writeLocalKv(kvStore);

                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ success: true }));
              } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: err.message }));
              }
              return;
            }

            // 4. POST /api/generate-report
            if (req.url.startsWith('/api/generate-report') && req.method === 'POST') {
              try {
                const bodyStr = await getBody(req);
                const data = JSON.parse(bodyStr);
                const { theme, limit, sauceText, users, feature, prompt, customApiKey, model } = data;

                const apiKey = env.OPENROUTER_API_KEY || env.GLOBAL_API_KEY || customApiKey;

                if (!apiKey) {
                  res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                  res.end(JSON.stringify({ 
                    error: 'APIキーが設定されていません。ローカルの .env ファイルに OPENROUTER_API_KEY を設定するか、またはアプリ上の「設定」からカスタムAPIキーを入力してください。' 
                  }));
                  return;
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
              return;
            }
            next();
          });
        }
      }
    ]
  };
});
