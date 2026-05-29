// AI Report Generator Standalone - Client Side JavaScript

// 1. Initial State & LocalStorage Configuration
let reportList = JSON.parse(localStorage.getItem('app_reports')) || [];
let favoriteList = JSON.parse(localStorage.getItem('app_favorites')) || [];
let sauceLibrary = JSON.parse(localStorage.getItem('app_sauces')) || [
  { id: 's1', category: '基本情報', text: '・1998年生まれ\n・経済学部所属' }
];

// Profile configuration (Guest Mode backup)
let userProfile = JSON.parse(localStorage.getItem('app_user_profile')) || {
  email: 'student@example.com',
  avatarSeed: 'student'
};

// Persona config (Local backup)
const defaultRulePrompt = `【厳守する出力ルール】\n1. カッコや鍵カッコの横の空白、‐‐のようなAIらしい表記は一切使わない。\n2. 各段落の先頭（1文目）は、必ず全角スペース「　」を1マス分入れて字下げすること。\n3. 段落と段落の間には、空行（中身のない空白の行）を絶対に挟まない。改行（Shift+Enter）のみで次の段落へ繋ぐこと。\n\n【出力イメージ（お手本）】\n　私の長所は〜〜です。〜〜をしました。\n　また、私は〜〜です。〜〜から評価を受けました。\n　さらに、私は〜〜。`;

let personaConfig = JSON.parse(localStorage.getItem('app_persona_config')) || {
  users: '',
  feature: '',
  prompt: defaultRulePrompt,
  customApiKey: '',
  model: 'openai/gpt-oss-120b:free',
  themeColor: 'indigo'
};

// Color Themes Configurations
const themeSchemes = {
  indigo: { h: 243, s: 75, l: 59 },
  emerald: { h: 162, s: 70, l: 40 },
  rose: { h: 336, s: 74, l: 50 },
  amber: { h: 35, s: 92, l: 43 },
  ocean: { h: 200, s: 95, l: 39 },
  charcoal: { h: 217, s: 19, l: 27 }
};

function applyThemeColor(themeName) {
  const scheme = themeSchemes[themeName] || themeSchemes.indigo;
  const { h, s, l } = scheme;
  
  const root = document.documentElement;
  root.style.setProperty('--primary', `hsl(${h}, ${s}%, ${l}%)`);
  root.style.setProperty('--primary-hover', `hsl(${h}, ${s}%, ${l - 9}%)`);
  root.style.setProperty('--primary-glow', `hsla(${h}, ${s}%, ${l}%, 0.15)`);
  
  const nextH = themeName === 'charcoal' ? h : h + 22;
  root.style.setProperty('--primary-gradient', `linear-gradient(135deg, hsl(${h}, ${s}%, ${l}%) 0%, hsl(${nextH}, ${s}%, ${l}%) 100%)`);
  root.style.setProperty('--primary-gradient-hover', `linear-gradient(135deg, hsl(${h}, ${s}%, ${l - 9}%) 0%, hsl(${nextH}, ${s}%, ${l - 9}%) 100%)`);

  // Update active state in picker UI
  document.querySelectorAll('.color-dot').forEach(dot => dot.classList.remove('active'));
  const activeDot = document.getElementById(`dot-${themeName}`);
  if (activeDot) activeDot.classList.add('active');
}

window.selectThemeColor = function(themeName) {
  personaConfig.themeColor = themeName;
  applyThemeColor(themeName);
  localStorage.setItem('app_persona_config', JSON.stringify(personaConfig));
  syncDataToCloud();
};

// Google Login States
let googleToken = localStorage.getItem('app_google_token') || null;
let googleProfile = null;
let googleClientId = '';
let isKvEnabled = false;

// 2. Lifecycle Initialization
window.addEventListener('DOMContentLoaded', () => {
  // Load configuration into form inputs
  document.getElementById('cfg-users').value = personaConfig.users || '';
  document.getElementById('cfg-feature').value = personaConfig.feature || '';
  document.getElementById('cfg-prompt').value = personaConfig.prompt || defaultRulePrompt;
  document.getElementById('cfg-api-key').value = personaConfig.customApiKey || '';
  document.getElementById('cfg-model').value = personaConfig.model || 'openai/gpt-oss-120b:free';

  // Apply theme color
  applyThemeColor(personaConfig.themeColor || 'indigo');

  // Initialize Lists
  renderSauceLibrary();
  renderThemeHistory();
  renderResults();
  renderFavorites();

  // Load API config and initialize Google Auth
  initGoogleLogin();
  
  if (googleToken) {
    loadUserDataOnStart();
  } else {
    updateProfileUI();
  }
  
  // Set up global modal close click handlers
  document.getElementById('profile-modal').addEventListener('click', (e) => {
    if (e.target.id === 'profile-modal') {
      toggleProfileModal(false);
    }
  });
});

// 3. Google Sign-In & Data Synchronization
async function initGoogleLogin() {
  try {
    const res = await fetch('/api/config');
    const config = await res.json();
    googleClientId = config.googleClientId;
    isKvEnabled = config.kvEnabled;

    if (window.google) {
      google.accounts.id.initialize({
        client_id: googleClientId,
        callback: handleCredentialResponse
      });
      renderGoogleButton();
    }
  } catch (e) {
    console.error('Failed to load Google Sign-In config:', e);
  }
}

function renderGoogleButton() {
  const container = document.getElementById("google-login-btn");
  if (!container) return;
  
  if (googleToken) {
    container.style.display = "none";
  } else {
    container.style.display = "block";
    google.accounts.id.renderButton(
      container,
      { theme: "outline", size: "medium", shape: "pill", text: "signin_with" }
    );
  }
}

async function handleCredentialResponse(response) {
  const token = response.credential;
  googleToken = token;
  localStorage.setItem('app_google_token', token);
  
  toggleLoader(true, "アカウント情報をロード中...");
  try {
    const res = await fetch('/api/get-user-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token })
    });
    
    if (!res.ok) {
      throw new Error(await res.text());
    }
    
    const resData = await res.json();
    googleProfile = resData.profile;
    
    // If user has data stored in the Cloud KV, load it
    if (resData.data && (resData.data.personaConfig || resData.data.sauceLibrary)) {
      if (resData.data.reportList) reportList = resData.data.reportList;
      if (resData.data.favoriteList) favoriteList = resData.data.favoriteList;
      if (resData.data.sauceLibrary) sauceLibrary = resData.data.sauceLibrary;
      if (resData.data.personaConfig) {
        personaConfig = resData.data.personaConfig;
        
        document.getElementById('cfg-users').value = personaConfig.users || '';
        document.getElementById('cfg-feature').value = personaConfig.feature || '';
        document.getElementById('cfg-prompt').value = personaConfig.prompt || defaultRulePrompt;
        document.getElementById('cfg-api-key').value = personaConfig.customApiKey || '';
        document.getElementById('cfg-model').value = personaConfig.model || 'openai/gpt-oss-120b:free';
        
        applyThemeColor(personaConfig.themeColor || 'indigo');
      }
      
      saveAllDataToLocal();
    } else {
      // First time Google login: sync current local storage data to the cloud KV!
      await syncDataToCloud();
    }
    
    updateProfileUI();
    renderGoogleButton();
    renderSauceLibrary();
    renderThemeHistory();
    renderResults();
    renderFavorites();
  } catch (err) {
    alert("ログインに失敗しました: " + err.message);
    googleLogout();
  } finally {
    toggleLoader(false);
  }
}

async function loadUserDataOnStart() {
  try {
    const res = await fetch('/api/get-user-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: googleToken })
    });
    
    if (res.ok) {
      const resData = await res.json();
      googleProfile = resData.profile;
      
      // Load cloud data if present
      if (resData.data && (resData.data.personaConfig || resData.data.sauceLibrary)) {
        if (resData.data.reportList) reportList = resData.data.reportList;
        if (resData.data.favoriteList) favoriteList = resData.data.favoriteList;
        if (resData.data.sauceLibrary) sauceLibrary = resData.data.sauceLibrary;
        if (resData.data.personaConfig) {
          personaConfig = resData.data.personaConfig;
          
          document.getElementById('cfg-users').value = personaConfig.users || '';
          document.getElementById('cfg-feature').value = personaConfig.feature || '';
          document.getElementById('cfg-prompt').value = personaConfig.prompt || defaultRulePrompt;
          document.getElementById('cfg-api-key').value = personaConfig.customApiKey || '';
          document.getElementById('cfg-model').value = personaConfig.model || 'openai/gpt-oss-120b:free';
          
          applyThemeColor(personaConfig.themeColor || 'indigo');
        }
        saveAllDataToLocal();
      }
      
      updateProfileUI();
      renderGoogleButton();
      renderSauceLibrary();
      renderThemeHistory();
      renderResults();
      renderFavorites();
    } else {
      // Token invalid or expired
      googleLogout();
    }
  } catch (e) {
    console.error('Failed to sync on load. Fallback to local cache.', e);
    // Server down/offline: fallback to local cache
    updateProfileUI();
    renderGoogleButton();
  }
}

async function syncDataToCloud() {
  if (!googleToken || !isKvEnabled) return;
  try {
    await fetch('/api/save-user-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idToken: googleToken,
        data: {
          personaConfig,
          sauceLibrary,
          reportList,
          favoriteList
        }
      })
    });
  } catch (e) {
    console.error('Failed to sync data to Cloudflare KV:', e);
  }
}

function saveAllDataToLocal() {
  localStorage.setItem('app_reports', JSON.stringify(reportList));
  localStorage.setItem('app_favorites', JSON.stringify(favoriteList));
  localStorage.setItem('app_sauces', JSON.stringify(sauceLibrary));
  localStorage.setItem('app_persona_config', JSON.stringify(personaConfig));
}

window.googleLogout = function() {
  googleToken = null;
  googleProfile = null;
  localStorage.removeItem('app_google_token');
  window.location.reload(); // Reload to clear all states cleanly
};

// 4. Tab Navigation
window.switchTab = function(tabId) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  
  document.getElementById(tabId).classList.add('active');
  
  const tabButtonMap = {
    'tab-data': 'tab-btn-data',
    'tab-generate': 'tab-btn-generate',
    'tab-favorites': 'tab-btn-favorites'
  };
  const activeBtnId = tabButtonMap[tabId];
  if (activeBtnId) {
    document.getElementById(activeBtnId).classList.add('active');
  }

  if (tabId === 'tab-generate') renderResults();
  if (tabId === 'tab-favorites') renderFavorites();
  if (tabId === 'tab-data') renderThemeHistory();
};

// 5. Profile Management (Guest Mode settings)
window.toggleProfileModal = function(show) {
  if (googleToken && googleProfile) {
    alert("Googleアカウント連携中はプロフィールを直接編集できません。Googleのプロフィール画像が自動で反映されます。");
    return;
  }
  const modal = document.getElementById('profile-modal');
  if (show) {
    document.getElementById('edit-email').value = userProfile.email;
    document.getElementById('edit-avatar-seed').value = userProfile.avatarSeed;
    
    document.querySelectorAll('.avatar-option').forEach(img => {
      img.classList.remove('active');
      if (img.getAttribute('onclick').includes(userProfile.avatarSeed)) {
        img.classList.add('active');
      }
    });
    modal.classList.add('active');
  } else {
    modal.classList.remove('active');
  }
};

window.selectAvatarOption = function(element, seed) {
  document.querySelectorAll('.avatar-option').forEach(img => img.classList.remove('active'));
  element.classList.add('active');
  document.getElementById('edit-avatar-seed').value = seed;
};

window.saveProfileChanges = function() {
  const emailInput = document.getElementById('edit-email').value.trim();
  const seedInput = document.getElementById('edit-avatar-seed').value;

  if (!emailInput) {
    alert('メールアドレスを入力してください。');
    return;
  }

  userProfile.email = emailInput;
  userProfile.avatarSeed = seedInput;

  localStorage.setItem('app_user_profile', JSON.stringify(userProfile));
  updateProfileUI();
  toggleProfileModal(false);
};

function updateProfileUI() {
  const displayAvatar = document.getElementById('display-user-avatar');
  const displayEmail = document.getElementById('display-user-email');
  const profileTypeBadge = document.getElementById('profile-type-badge');
  const btnLogout = document.getElementById('btn-logout');

  if (googleToken && googleProfile) {
    displayAvatar.src = googleProfile.picture || `https://api.dicebear.com/7.x/bottts/svg?seed=${googleProfile.email}`;
    displayEmail.innerText = googleProfile.name || googleProfile.email;
    displayAvatar.title = `Googleアカウント: ${googleProfile.email}`;
    profileTypeBadge.innerHTML = `<i class="fa-solid fa-cloud-check" style="color:var(--accent);"></i> クラウド保存中`;
    btnLogout.style.display = 'block';
  } else {
    const avatarUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=${userProfile.avatarSeed}`;
    displayAvatar.src = avatarUrl;
    displayEmail.innerText = userProfile.email;
    displayAvatar.title = `ゲスト: ${userProfile.email}`;
    profileTypeBadge.innerHTML = `<i class="fa-solid fa-user-pen"></i> ゲスト(編集)`;
    btnLogout.style.display = 'none';
  }
}

// 6. Persona / Configuration
window.saveConfig = function() {
  const status = document.getElementById('cfg-status');
  status.innerText = "保存中...";
  status.style.opacity = '1';

  personaConfig.users = document.getElementById('cfg-users').value.trim();
  personaConfig.feature = document.getElementById('cfg-feature').value.trim();
  personaConfig.prompt = document.getElementById('cfg-prompt').value;
  personaConfig.customApiKey = document.getElementById('cfg-api-key').value.trim();
  personaConfig.model = document.getElementById('cfg-model').value;

  localStorage.setItem('app_persona_config', JSON.stringify(personaConfig));
  
  // Sync to Cloud KV
  syncDataToCloud();

  setTimeout(() => {
    status.innerText = "設定を保存しました！";
    setTimeout(() => {
      status.style.opacity = '0';
    }, 2000);
  }, 500);
};

// 7. Source Information (Sauce) Management
window.renderSauceLibrary = function() {
  const libContainer = document.getElementById('sauce-library-container');
  if (sauceLibrary.length === 0) {
    libContainer.innerHTML = `
      <div style="grid-column: 1/-1; text-align:center; padding: 2rem; color: var(--text-muted);">
        <i class="fa-regular fa-folder-open" style="font-size: 2.5rem; margin-bottom: 0.5rem; display:block;"></i>
        保存されたソースエピソードはありません。上のフォームから登録してください。
      </div>`;
  } else {
    libContainer.innerHTML = sauceLibrary.map(s => `
      <div class="sauce-item">
        <div class="sauce-header">
          <span class="sauce-tag"><i class="fa-solid fa-tag"></i> ${escapeHTML(s.category)}</span>
          <button class="btn btn-danger" onclick="deleteSauceItem('${s.id}')" style="padding:4px 8px; font-size:0.75rem;"><i class="fa-solid fa-trash"></i> 削除</button>
        </div>
        <textarea onchange="updateSauceTextInline('${s.id}', this.value)" placeholder="詳細テキストを入力してください" rows="3">${escapeHTML(s.text)}</textarea>
      </div>
    `).join('');
  }
  renderSauceSelectorsOnly();
};

window.renderSauceSelectorsOnly = function() {
  const selectorContainer = document.getElementById('sauce-selector');
  if (sauceLibrary.length === 0) {
    selectorContainer.innerHTML = `<span style="color:var(--text-muted); font-size:0.85rem;">ソースライブラリが空です。カテゴリとエピソードを登録してください。</span>`;
    return;
  }
  selectorContainer.innerHTML = sauceLibrary.map(s => `
    <label class="checkbox-label" for="chk-${s.id}">
      <input type="checkbox" id="chk-${s.id}" name="selected-sauces" value="${s.id}">
      <div>
        <strong>【${escapeHTML(s.category)}】</strong>
        <span style="font-size:0.8rem; color:var(--text-muted); display:block; max-height:36px; overflow:hidden; text-overflow:ellipsis; white-space: nowrap;">
          ${escapeHTML(s.text) || '(データ空欄)'}
        </span>
      </div>
    </label>
  `).join('');
};

window.addSauceItem = function() {
  const cat = document.getElementById('new-sauce-cat').value.trim();
  const text = document.getElementById('new-sauce-text').value.trim();
  
  if (!cat) {
    alert("カテゴリ名を入力してください。");
    return;
  }

  const existing = sauceLibrary.find(s => s.category === cat);
  if (existing) {
    existing.text = text;
  } else {
    sauceLibrary.push({ id: 's_' + Date.now(), category: cat, text: text });
  }
  
  saveSauceData();
  document.getElementById('new-sauce-cat').value = '';
  document.getElementById('new-sauce-text').value = '';
  renderSauceLibrary();
};

window.addNewCategoryOnly = function() {
  const cat = document.getElementById('new-sauce-cat').value.trim();
  if (!cat) {
    alert("カテゴリ名を入力してください。");
    return;
  }
  if (sauceLibrary.some(s => s.category === cat)) {
    alert("そのカテゴリは既に存在します。");
    return;
  }
  
  sauceLibrary.push({ id: 's_' + Date.now(), category: cat, text: '' });
  saveSauceData();
  document.getElementById('new-sauce-cat').value = '';
  renderSauceLibrary();
};

window.updateSauceTextInline = function(id, text) {
  const item = sauceLibrary.find(s => s.id === id);
  if (item) {
    item.text = text;
    saveSauceData();
    renderSauceSelectorsOnly();
  }
};

window.deleteSauceItem = function(id) {
  if (!confirm("このカテゴリとソース情報をライブラリから削除しますか？")) return;
  sauceLibrary = sauceLibrary.filter(s => s.id !== id);
  saveSauceData();
  renderSauceLibrary();
};

function saveSauceData() {
  localStorage.setItem('app_sauces', JSON.stringify(sauceLibrary));
  syncDataToCloud();
}

// 8. Theme History
window.renderThemeHistory = function() {
  const container = document.getElementById('theme-history-list');
  if (reportList.length === 0) {
    container.innerHTML = `<span style="color:var(--text-muted); font-size:0.85rem; padding:5px;">生成履歴がありません。</span>`;
    return;
  }
  const themes = [...new Set(reportList.map(r => r.theme).filter(t => t))];
  container.innerHTML = themes.map(t => `
    <div class="theme-chip" onclick="setThemeFromHistory('${escapeJSQuote(t)}')">
      <i class="fa-regular fa-file-lines" style="color:var(--primary);"></i> ${escapeHTML(t)}
    </div>
  `).join('');
};

window.setThemeFromHistory = function(themeText) {
  document.getElementById('input-theme').value = themeText;
};

// 9. Report Generation & Server Interactivity
window.toggleLoader = function(show, message = "処理中...") {
  const loader = document.getElementById('global-loader');
  const msgEl = document.getElementById('loader-message');
  msgEl.innerText = message;
  if (show) {
    loader.classList.add('active');
  } else {
    loader.classList.remove('active');
  }
};

window.addAndGenerate = async function() {
  const theme = document.getElementById('input-theme').value.trim();
  let limit = document.getElementById('input-limit').value.trim();
  
  if (!theme) {
    alert("テーマは必須項目です。");
    return;
  }

  if (!limit) {
    limit = "200";
    document.getElementById('input-limit').value = "200";
  }

  const checkedBoxes = document.querySelectorAll('input[name="selected-sauces"]:checked');
  let combinedSauceText = "";
  checkedBoxes.forEach(box => {
    const target = sauceLibrary.find(s => s.id === box.value);
    if (target && target.text) {
      combinedSauceText += `【${target.category}】\n${target.text}\n\n`;
    }
  });

  const newId = 'id_' + Date.now();
  const newReport = { 
    id: newId, 
    theme: theme, 
    limit: limit, 
    sauce: combinedSauceText, 
    currentText: "生成中...", 
    history: [], 
    isComparing: false 
  };
  
  reportList.unshift(newReport);
  saveData();
  renderThemeHistory();
  switchTab('tab-generate');

  toggleLoader(true, "自己分析ヘルパーが執筆中...");

  try {
    const response = await fetch('/api/generate-report', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        theme,
        limit,
        sauceText: combinedSauceText,
        users: personaConfig.users,
        feature: personaConfig.feature,
        prompt: personaConfig.prompt,
        customApiKey: personaConfig.customApiKey,
        model: personaConfig.model
      })
    });

    const data = await response.json();
    toggleLoader(false);

    if (response.ok) {
      updateReportText(newId, data.result);
    } else {
      updateReportText(newId, `エラーが発生しました: ${data.error || '不明なエラー'}`);
    }
  } catch (err) {
    toggleLoader(false);
    updateReportText(newId, `通信エラーが発生しました: ${err.message}`);
  }
};

window.regenerate = async function(id) {
  const report = reportList.find(r => r.id === id);
  if (!report) return;

  if (report.currentText && !report.currentText.includes("生成中...") && !report.currentText.includes("エラー")) {
    report.history.push(report.currentText);
  }

  report.currentText = "再生成中...";
  report.isComparing = true;
  renderResults();

  toggleLoader(true, "自己分析ヘルパーが再執筆中...");

  try {
    const response = await fetch('/api/generate-report', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        theme: report.theme,
        limit: report.limit,
        sauceText: report.sauce,
        users: personaConfig.users,
        feature: personaConfig.feature,
        prompt: personaConfig.prompt,
        customApiKey: personaConfig.customApiKey,
        model: personaConfig.model
      })
    });

    const data = await response.json();
    toggleLoader(false);

    if (response.ok) {
      let text = data.result;
      if (text && !text.startsWith('　')) {
        text = '　' + text.trim();
      }
      report.currentText = text;
    } else {
      report.currentText = `エラーが発生しました: ${data.error || '不明なエラー'}`;
    }
    saveData();
    renderResults();
  } catch (err) {
    toggleLoader(false);
    report.currentText = `通信エラーが発生しました: ${err.message}`;
    saveData();
    renderResults();
  }
};

function updateReportText(id, text) {
  const report = reportList.find(r => r.id === id);
  if (report) {
    if (text && !text.startsWith('　') && !text.includes("エラー") && !text.includes("通信エラー")) {
      text = '　' + text.trim();
    }
    report.currentText = text;
    saveData();
    renderResults();
  }
}

window.selectText = function(id, type) {
  const report = reportList.find(r => r.id === id);
  if (!report) return;

  if (type === 'old') {
    const oldText = report.history.pop();
    report.currentText = oldText;
  }
  report.isComparing = false;
  saveData();
  renderResults();
};

window.toggleFavorite = function(id, encodedText, theme) {
  const text = decodeURIComponent(atob(encodedText));
  const index = favoriteList.findIndex(f => f.id === id);
  if (index > -1) {
    favoriteList.splice(index, 1);
  } else {
    favoriteList.push({ id, text, theme, date: new Date().toLocaleDateString() });
  }
  localStorage.setItem('app_favorites', JSON.stringify(favoriteList));
  syncDataToCloud();
  renderResults();
};

window.deleteReport = function(id) {
  if (!confirm("このレポート履歴を削除しますか？")) return;
  reportList = reportList.filter(r => r.id !== id);
  saveData();
  renderThemeHistory();
  renderResults();
};

window.copyToClipboard = function(text) {
  if (!navigator.clipboard) {
    const t = document.createElement("textarea");
    document.body.appendChild(t);
    t.value = text;
    t.select();
    document.execCommand("copy");
    document.body.removeChild(t);
  } else {
    navigator.clipboard.writeText(text).catch(err => {
      console.error('Failed to copy: ', err);
    });
  }
  alert("クリップボードにコピーしました！");
};

function saveData() {
  localStorage.setItem('app_reports', JSON.stringify(reportList));
  syncDataToCloud();
}

// 10. Render Interface
window.renderResults = function() {
  const container = document.getElementById('generation-container');
  if (reportList.length === 0) {
    container.innerHTML = `
      <div class="card" style="text-align:center; padding: 3rem; color: var(--text-muted);">
        <i class="fa-solid fa-file-pen" style="font-size: 3rem; margin-bottom: 0.75rem; color:var(--primary); display:block;"></i>
        まだ生成されたレポートはありません。<br>「① データ準備」タブのフォームから作成を実行してください。
      </div>`;
    return;
  }

  container.innerHTML = reportList.map(r => {
    const isFav = favoriteList.some(f => f.id === r.id);
    const hasHistory = r.history && r.history.length > 0;
    const encodedText = btoa(encodeURIComponent(r.currentText));
    
    let compareBlock = "";
    if (r.isComparing && hasHistory && !r.currentText.includes("再生成中...") && !r.currentText.includes("エラー")) {
      const oldText = r.history[r.history.length - 1];
      compareBlock = `
        <div class="compare-container">
          <div class="compare-box" onclick="selectText('${r.id}', 'old')">
            <span class="compare-badge"><i class="fa-solid fa-circle-arrow-left"></i> 前回の文章を選択</span>
            <div style="font-size:0.875rem; color:var(--text-muted); white-space:pre-wrap; margin-top:0.5rem;">${escapeHTML(oldText)}</div>
          </div>
          <div class="compare-box" onclick="selectText('${r.id}', 'new')" style="border-color: var(--primary);">
            <span class="compare-badge new">今回の文章（最新）を選択 <i class="fa-solid fa-circle-arrow-right"></i></span>
            <div style="font-size:0.875rem; color:var(--text-main); white-space:pre-wrap; margin-top:0.5rem;">${escapeHTML(r.currentText)}</div>
          </div>
        </div>
      `;
    }

    return `
      <div class="card result-card">
        <div class="result-title-row">
          <div>
            <h4 style="margin:0 0 4px 0;">テーマ: ${escapeHTML(r.theme)}</h4>
            <span class="badge badge-primary">${r.limit}字制限</span>
          </div>
          <i class="${isFav ? 'fa-solid' : 'fa-regular'} fa-star favorite-star ${isFav ? 'active' : ''}" 
             onclick="toggleFavorite('${r.id}', '${encodedText}', '${escapeJSQuote(r.theme)}')"></i>
        </div>
        
        ${compareBlock ? compareBlock : `<div class="result-text">${escapeHTML(r.currentText)}</div>`}
        
        <div class="card-actions">
          <button class="btn btn-secondary" onclick="copyToClipboard(decodeURIComponent(atob('${encodedText}')))">
            <i class="fa-solid fa-copy"></i> 全文コピー
          </button>
          <button class="btn btn-primary" onclick="regenerate('${r.id}')" ${r.currentText.includes("中...") ? 'disabled' : ''}>
            <i class="fa-solid fa-arrows-rotate"></i> 再生成
          </button>
          <button class="btn btn-danger" onclick="deleteReport('${r.id}')" style="padding: 0.65rem 0.9rem;">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
};

window.renderFavorites = function() {
  const container = document.getElementById('favorites-container');
  if (favoriteList.length === 0) {
    container.innerHTML = `
      <div class="card" style="text-align:center; padding: 3rem; color: var(--text-muted);">
        <i class="fa-solid fa-star" style="font-size: 3rem; margin-bottom: 0.75rem; color: var(--warning); display:block;"></i>
        お気に入りに登録されたレポート文章はまだありません。<br>「② レポート生成」結果の星マークをクリックすると追加されます。
      </div>`;
    return;
  }
  container.innerHTML = favoriteList.map(f => {
    const encodedFavText = btoa(encodeURIComponent(f.text));
    return `
      <div class="card" style="border-left: 5px solid var(--warning);">
        <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:8px; display:flex; justify-content:space-between;">
          <span><strong>テーマ: ${escapeHTML(f.theme)}</strong></span>
          <span><i class="fa-regular fa-calendar"></i> ${f.date} 保存</span>
        </div>
        <div class="result-text" style="background-color:var(--warning-light); border-color:hsl(45, 93%, 88%);">${escapeHTML(f.text)}</div>
        <div class="card-actions">
          <button class="btn btn-secondary" onclick="copyToClipboard(decodeURIComponent(atob('${encodedFavText}')))">
            <i class="fa-solid fa-copy"></i> 全文コピー
          </button>
        </div>
      </div>
    `;
  }).join('');
};

// 11. Sanitization Helpers
function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

function escapeJSQuote(str) {
  if (!str) return '';
  return str.replace(/'/g, "\\'");
}
