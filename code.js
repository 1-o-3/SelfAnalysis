// Google Apps Script source code backup (original "コード.gs")

function doGet() {
  return HtmlService.createTemplateFromFile('index').evaluate()
      .setTitle('AIレポート生成スタンド')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// 【新設】ログインユーザーのアイコン画像URLとメールアドレスを同時に取得
function getActiveUserInfo() {
  try {
    return {
      email: Session.getActiveUser().getEmail() || "ログイン中",
      photoUrl: UserProperties.getProperty('USER_PHOTO') || "https://www.gstatic.com/images/branding/product/2x/avatar_anonymous_64dp.png" 
    };
  } catch(e) {
    // Session.getActiveUser().getEmail() からアイコンを直接抜けない場合、Googleユーザーサービスの標準アバターを代入
    return {
      email: Session.getActiveUser().getEmail() || "ログイン中",
      photoUrl: "https://www.gstatic.com/images/branding/product/2x/avatar_anonymous_64dp.png"
    };
  }
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function setAdminApiKey(apiKey) {
  PropertiesService.getScriptProperties().setProperty('GLOBAL_API_KEY', apiKey);
  return "共有APIキーを登録しました。";
}

function saveUserSettings(users, feature, prompt) {
  PropertiesService.getUserProperties().setProperties({ users, feature, prompt });
  return "プロフィール設定を保存しました。";
}

function loadUserSettings() {
  const p = PropertiesService.getUserProperties().getProperties();
  return { users: p.users||'', feature: p.feature||'', prompt: p.prompt||'' };
}

function generateSingleReport(theme, limit, sauceText) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GLOBAL_API_KEY');
  const p = PropertiesService.getUserProperties().getProperties();
  if (!apiKey) throw new Error("共有APIキーが設定されていません。");

  let infoText = "";
  if (sauceText.trim()) {
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
  if (!infoText) infoText = sauceText;

  const sentence = [
    {role: 'system', content: `あなたは${p.users || '学生'}である私です。私は、自分に合うのは${p.feature || '個別アアピール'}だと考えています`},
    {role: 'system', content: `人間の学生らしい文章を意識して。`},
    {role: 'system', content: `${p.prompt || ''}`},
    {role: 'user', content: `質問：「${theme}」について、以下の情報を参考に、${limit}文字以内でですます調で書いて。\n\n${infoText}`}
  ];

  let result = callOpenRouter(apiKey, sentence);
  if (result) {
    result = result.split('\n').filter(line => line.trim() !== "").join('\n');
    if (!result.startsWith('　')) result = '　' + result;
  }
  return result;
}

const callOpenRouter = (apiKey, messages) => {
  try {
    const url = 'https://openrouter.ai/api/v1/chat/completions';
    const payload = { model: 'openai/gpt-oss-120b:free', messages, temperature: 0.7, max_tokens: 1024 };
    const headers = {
      Authorization: 'Bearer ' + apiKey,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://script.google.com/',
      'X-Title': 'GAS OpenRouter App'
    };
    const options = { method: 'post', headers, payload: JSON.stringify(payload), muteHttpExceptions: true };
    const res = UrlFetchApp.fetch(url, options);
    if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) return "エラー: " + res.getContentText();
    return JSON.parse(res.getContentText())?.choices?.[0]?.message?.content ?? '';
  } catch (e) {
    return "通信エラー: " + e.message;
  }
};
