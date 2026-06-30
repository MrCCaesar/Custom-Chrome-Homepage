// ============================================================
//  Chrome 新标签页扩展 - 主逻辑
// ============================================================

// ---------- 搜索引擎配置 ----------
const SEARCH_ENGINES = {
    google: {
        name: 'Google',
        url: 'https://www.google.com/search?q=',
    },
    bing: {
        name: 'Bing',
        url: 'https://www.bing.com/search?q=',
    },
    baidu: {
        name: '百度',
        url: 'https://www.baidu.com/s?wd=',
    },
    duckduckgo: {
        name: 'DuckDuckGo',
        url: 'https://duckduckgo.com/?q=',
    },
    github: {
        name: 'GitHub',
        url: 'https://github.com/search?q=',
    },
};

// ---------- 默认数据 ----------
const DEFAULT_SETTINGS = {
    searchEngine: 'google',
    searchPosition: 40,       // 搜索栏垂直位置百分比
    iconSize: 'medium',       // small | medium | large
    backgroundImage: '',      // data URL
    editMode: false,          // 编辑模式 vs 显示模式
};

const DEFAULT_BOOKMARKS = [
    {
        name: '常用工具',
        backgroundImage: '',
        links: [
            { name: 'GitHub', url: 'https://github.com', icon: '' },
            { name: 'Google', url: 'https://www.google.com', icon: '' },
            { name: 'B站', url: 'https://www.bilibili.com', icon: '' },
        ],
    },
    {
        name: '社交媒体',
        backgroundImage: '',
        links: [
            { name: '微博', url: 'https://weibo.com', icon: '' },
            { name: '知乎', url: 'https://www.zhihu.com', icon: '' },
        ],
    },
];

// ---------- 全局状态 ----------
let settings = { ...DEFAULT_SETTINGS };
let bookmarks = JSON.parse(JSON.stringify(DEFAULT_BOOKMARKS));
let editMode = false;  // 当前编辑/显示模式状态

// ============================================================
//  存储操作 ─ 分层架构
//  · chrome.storage.sync: 轻量设置 + 书签结构（跨设备自动同步）
//  · chrome.storage.local: 背景图 Data URL（数据量大，仅本地）
// ============================================================
const SYNC_SETTINGS_KEY = 'syncSettings_v2';
const SYNC_BOOKMARKS_KEY = 'syncBookmarks_v2';
const LOCAL_BG_KEY = 'localBg_v2';

// 背景图内存缓存（避免读写竞争）
let localBgCache = { global: '', groups: {} };

async function loadData() {
    // 1. 旧格式迁移
    await migrateOldData();

    // 2. 加载同步数据（设置 + 书签结构）
    const syncResult = await chrome.storage.sync.get([SYNC_SETTINGS_KEY, SYNC_BOOKMARKS_KEY]);
    if (syncResult[SYNC_SETTINGS_KEY]) {
        settings = { ...DEFAULT_SETTINGS, ...syncResult[SYNC_SETTINGS_KEY] };
    }
    if (syncResult[SYNC_BOOKMARKS_KEY] && syncResult[SYNC_BOOKMARKS_KEY].length > 0) {
        bookmarks = syncResult[SYNC_BOOKMARKS_KEY];
    }

    // 3. 加载本地背景图
    const localResult = await chrome.storage.local.get([LOCAL_BG_KEY]);
    localBgCache = localResult[LOCAL_BG_KEY] || { global: '', groups: {} };

    // 4. 合并背景图到运行时数据
    settings.backgroundImage = localBgCache.global || '';
    bookmarks.forEach((g, i) => {
        g.backgroundImage = localBgCache.groups[String(i)] || '';
    });
}

async function migrateOldData() {
    const oldResult = await chrome.storage.local.get(['settings', 'bookmarks']);
    if (!oldResult.settings && !oldResult.bookmarks) return;

    const oldSettings = oldResult.settings || {};
    const oldBookmarks = oldResult.bookmarks || [];

    // 构建新格式
    const syncSettings = {
        searchEngine: oldSettings.searchEngine || DEFAULT_SETTINGS.searchEngine,
        searchPosition: oldSettings.searchPosition ?? DEFAULT_SETTINGS.searchPosition,
        iconSize: oldSettings.iconSize || DEFAULT_SETTINGS.iconSize,
        editMode: oldSettings.editMode || false,
    };
    const syncBookmarks = oldBookmarks.map((g) => ({ ...g, backgroundImage: '' }));
    const bgData = {
        global: oldSettings.backgroundImage || '',
        groups: {},
    };
    oldBookmarks.forEach((g, i) => {
        if (g.backgroundImage) bgData.groups[String(i)] = g.backgroundImage;
    });

    // 写入新位置
    await chrome.storage.sync.set({ [SYNC_SETTINGS_KEY]: syncSettings, [SYNC_BOOKMARKS_KEY]: syncBookmarks }).catch(() => { });
    await chrome.storage.local.set({ [LOCAL_BG_KEY]: bgData });
    // 清理旧数据
    await chrome.storage.local.remove(['settings', 'bookmarks']);
}

async function saveSettings() {
    const syncSettings = {
        searchEngine: settings.searchEngine,
        searchPosition: settings.searchPosition,
        iconSize: settings.iconSize,
        editMode: settings.editMode,
    };
    await chrome.storage.sync.set({ [SYNC_SETTINGS_KEY]: syncSettings }).catch(() => { });
    // 同时持久化全局背景图
    localBgCache.global = settings.backgroundImage || '';
    await chrome.storage.local.set({ [LOCAL_BG_KEY]: localBgCache });
}

async function saveBookmarks() {
    const syncBookmarks = bookmarks.map((g) => ({ ...g, backgroundImage: '' }));
    await chrome.storage.sync.set({ [SYNC_BOOKMARKS_KEY]: syncBookmarks }).catch(() => { });
    // 同时持久化分组背景图
    localBgCache.groups = {};
    bookmarks.forEach((g, i) => {
        if (g.backgroundImage) localBgCache.groups[String(i)] = g.backgroundImage;
    });
    await chrome.storage.local.set({ [LOCAL_BG_KEY]: localBgCache });
}

// ============================================================
//  导出 / 导入 全部配置
// ============================================================
function exportAllData() {
    const exportObj = {
        version: 2,
        exportedAt: new Date().toISOString(),
        syncSettings: {
            searchEngine: settings.searchEngine,
            searchPosition: settings.searchPosition,
            iconSize: settings.iconSize,
            editMode: settings.editMode,
        },
        syncBookmarks: bookmarks.map((g) => ({ ...g, backgroundImage: '' })),
        localBg: {
            global: settings.backgroundImage || '',
            groups: localBgCache.groups || {},
        },
    };

    const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.download = `chrome-homepage-backup-${ts}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

async function importAllData(file) {
    try {
        const text = await file.text();
        const data = JSON.parse(text);

        if (!data.version || !data.syncSettings) {
            alert('无效的备份文件格式');
            return;
        }

        // 合并设置
        settings = { ...DEFAULT_SETTINGS, ...data.syncSettings };
        // 合并书签
        if (data.syncBookmarks && data.syncBookmarks.length > 0) {
            bookmarks = data.syncBookmarks;
        }
        // 合并背景图
        localBgCache = data.localBg || { global: '', groups: {} };
        settings.backgroundImage = localBgCache.global || '';
        bookmarks.forEach((g, i) => {
            g.backgroundImage = localBgCache.groups[String(i)] || '';
        });

        // 写入存储
        const syncSettings = {
            searchEngine: settings.searchEngine,
            searchPosition: settings.searchPosition,
            iconSize: settings.iconSize,
            editMode: settings.editMode,
        };
        await chrome.storage.sync.set({ [SYNC_SETTINGS_KEY]: syncSettings, [SYNC_BOOKMARKS_KEY]: bookmarks.map(g => ({ ...g, backgroundImage: '' })) }).catch(() => { });
        await chrome.storage.local.set({ [LOCAL_BG_KEY]: localBgCache });

        // 刷新界面
        editMode = settings.editMode || false;
        applySettings();
        applyMode();
        renderAll();
        alert('✅ 配置导入成功！');
    } catch (err) {
        alert('❌ 导入失败：' + err.message);
    }
}

// ============================================================
//  初始化
// ============================================================
async function init() {
    await loadData();
    editMode = settings.editMode || false;
    applySettings();
    applyMode();
    renderAll();
    bindEvents();
    removeChromeNtpElements();
    observeChromeNtpElements();
}

function applySettings() {
    // 应用图标尺寸
    document.body.setAttribute('data-icon-size', settings.iconSize);
    // 应用搜索栏位置
    updateSearchPosition();
    // 应用背景
    applyBackground();
    // 搜索引擎下拉
    document.getElementById('search-engine-select').value = settings.searchEngine;
    // 搜索栏位置滑块
    document.getElementById('search-pos-slider').value = settings.searchPosition;
    document.getElementById('search-pos-label').textContent = settings.searchPosition + '%';
    // 图标尺寸按钮
    document.querySelectorAll('.size-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.size === settings.iconSize);
    });
}

function updateSearchPosition() {
    const container = document.getElementById('search-container');
    container.style.marginTop = settings.searchPosition + 'vh';
}

function applyBackground() {
    const bgLayer = document.getElementById('bg-layer');
    if (settings.backgroundImage) {
        bgLayer.style.backgroundImage = `url(${settings.backgroundImage})`;
        bgLayer.classList.add('has-bg');
    } else {
        bgLayer.style.backgroundImage = '';
        bgLayer.classList.remove('has-bg');
    }
}

function applyMode() {
    if (editMode) {
        document.body.classList.add('edit-mode');
    } else {
        document.body.classList.remove('edit-mode');
    }
}

function toggleEditMode() {
    editMode = !editMode;
    settings.editMode = editMode;
    applyMode();
    // 切换模式时关闭所有弹窗和设置面板
    closeAllModals();
    toggleSettings(false);
    saveSettings();
}

// ============================================================
//  渲染
// ============================================================
function renderAll() {
    renderBookmarks();
}

function renderBookmarks() {
    const container = document.getElementById('bookmarks-container');
    container.innerHTML = '';

    bookmarks.forEach((group, groupIndex) => {
        const groupEl = createGroupElement(group, groupIndex);
        container.appendChild(groupEl);
    });

    // 程序化绑定图片加载/错误事件（避免 CSP 内联事件违规）
    attachImageEvents();
}

function attachImageEvents() {
    document.querySelectorAll('.link-icon-img').forEach((img) => {
        // 初始状态：图片隐藏，占位符可见
        img.style.display = 'none';
        const wrapper = img.parentElement;
        const placeholder = wrapper ? wrapper.querySelector('.link-icon-placeholder') : null;

        img.addEventListener('load', () => {
            img.style.display = 'block';
            if (placeholder) placeholder.style.display = 'none';
        });

        img.addEventListener('error', () => {
            img.style.display = 'none';
            if (placeholder) placeholder.style.display = 'flex';
        });

        // 如果图片已缓存/已加载完成，立即触发相应状态
        if (img.complete) {
            if (img.naturalWidth > 0) {
                img.style.display = 'block';
                if (placeholder) placeholder.style.display = 'none';
            } else {
                img.style.display = 'none';
                if (placeholder) placeholder.style.display = 'flex';
            }
        }
    });
}

function createGroupElement(group, groupIndex) {
    const div = document.createElement('div');
    div.className = 'bookmark-group';
    if (group.backgroundImage) {
        div.classList.add('has-group-bg');
    }

    const bgStyle = group.backgroundImage
        ? `background-image: url(${escapeAttr(group.backgroundImage)});`
        : '';

    div.innerHTML = `
    ${group.backgroundImage ? `<div class="group-bg" style="${bgStyle}"></div><div class="group-bg-overlay"></div>` : ''}
    <div class="group-header">
      <span class="group-title" data-group-index="${groupIndex}" title="点击编辑分组名称">${escapeHtml(group.name)}</span>
      <div class="group-actions edit-only">
        <button class="group-bg-btn${group.backgroundImage ? ' has-bg' : ''}" data-action="group-bg" data-group-index="${groupIndex}" title="分组背景图">🖼</button>
        ${group.backgroundImage ? `<button class="group-bg-clear-btn" data-action="group-bg-clear" data-group-index="${groupIndex}" title="清除分组背景">✕</button>` : ''}
      </div>
      <div class="group-actions edit-only">
        <button class="group-action-btn" data-action="edit-group" data-group-index="${groupIndex}" title="重命名">✎</button>
        <button class="group-action-btn delete" data-action="delete-group" data-group-index="${groupIndex}" title="删除分组">✕</button>
      </div>
    </div>
    <div class="link-list">
      ${group.links.map((link, linkIndex) => createLinkCard(link, groupIndex, linkIndex)).join('')}
    </div>
    <button class="add-link-btn edit-only" data-action="add-link" data-group-index="${groupIndex}">+ 添加链接</button>
  `;
    return div;
}

function createLinkCard(link, groupIndex, linkIndex) {
    const iconSrc = link.icon || getFaviconUrl(link.url);
    const fallbackEmoji = getFallbackEmoji(link.name);

    return `
    <a class="link-card" href="${escapeAttr(link.url)}" title="${escapeAttr(link.name)}&#10;${escapeAttr(link.url)}"
       data-group-index="${groupIndex}" data-link-index="${linkIndex}">
      <div class="link-icon-wrapper">
        <img src="${escapeAttr(iconSrc)}" alt="${escapeAttr(link.name)}" class="link-icon-img">
        <span class="link-icon-placeholder">${fallbackEmoji}</span>
      </div>
      <span class="link-name">${escapeHtml(link.name)}</span>
      <button class="link-delete-btn" data-action="delete-link" data-group-index="${groupIndex}" data-link-index="${linkIndex}">✕</button>
    </a>
  `;
}

// ============================================================
//  辅助函数
// ============================================================
function getHostname(url) {
    try {
        return new URL(url).hostname;
    } catch {
        return url;
    }
}

function getFaviconUrl(url) {
    // 使用 Google favicon 服务自动获取图标
    try {
        const hostname = new URL(url).hostname;
        return `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
    } catch {
        return '';
    }
}

function getFallbackEmoji(name) {
    const map = {
        'github': '🐙',
        'google': '🔍',
        'b站': '📺',
        'bilibili': '📺',
        '微博': '📢',
        '知乎': '💡',
        '百度': '🔎',
        '淘宝': '🛒',
        '京东': '📦',
        '豆瓣': '📚',
        '微信': '💬',
        'qq': '🐧',
        '网易': '📧',
        '腾讯': '🎮',
        '抖音': '🎵',
        '小红书': '📕',
        'csdn': '📝',
        'stackoverflow': '📚',
        'youtube': '▶️',
        'twitter': '🐦',
        'facebook': '📘',
        'instagram': '📷',
        'reddit': '🤖',
        'linkedin': '💼',
        'gmail': '✉️',
        'outlook': '📧',
        'notion': '📋',
        'figma': '🎨',
        'vscode': '💻',
    };
    const lower = name.toLowerCase();
    for (const [key, emoji] of Object.entries(map)) {
        if (lower.includes(key)) return emoji;
    }
    return '🌐';
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function escapeAttr(str) {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ============================================================
//  事件绑定
// ============================================================
function bindEvents() {
    // ---------- 模式切换 ----------
    document.getElementById('mode-toggle').addEventListener('click', toggleEditMode);

    // ---------- 搜索 ----------
    const searchInput = document.getElementById('search-input');
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const query = searchInput.value.trim();
            if (query) {
                const engine = SEARCH_ENGINES[settings.searchEngine];
                window.location.href = engine.url + encodeURIComponent(query);
            }
        }
    });

    // ---------- 背景按钮 (仅编辑模式) ----------
    document.getElementById('bg-btn').addEventListener('click', () => {
        if (!editMode) return;
        toggleSettings();
    });

    // ---------- 设置面板 ----------
    document.getElementById('settings-close').addEventListener('click', () => {
        toggleSettings(false);
    });

    // ---------- 导出 / 导入 ----------
    document.getElementById('export-btn').addEventListener('click', exportAllData);
    document.getElementById('import-btn').addEventListener('click', () => {
        document.getElementById('import-file-input').click();
    });
    document.getElementById('import-file-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) importAllData(file);
        e.target.value = '';
    });

    // 搜索引擎切换
    document.getElementById('search-engine-select').addEventListener('change', (e) => {
        settings.searchEngine = e.target.value;
        saveSettings();
    });

    // 搜索栏位置调节
    document.getElementById('search-pos-slider').addEventListener('input', (e) => {
        settings.searchPosition = parseInt(e.target.value);
        document.getElementById('search-pos-label').textContent = settings.searchPosition + '%';
        updateSearchPosition();
        saveSettings();
    });

    // 背景图片上传
    document.getElementById('bg-upload-btn').addEventListener('click', () => {
        document.getElementById('bg-file-input').click();
    });
    document.getElementById('bg-file-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                settings.backgroundImage = ev.target.result;
                applyBackground();
                saveSettings();
            };
            reader.readAsDataURL(file);
        }
    });

    // 清除背景
    document.getElementById('bg-clear-btn').addEventListener('click', () => {
        settings.backgroundImage = '';
        applyBackground();
        saveSettings();
    });

    // 图标尺寸切换
    document.querySelectorAll('.size-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            settings.iconSize = btn.dataset.size;
            document.querySelectorAll('.size-btn').forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            document.body.setAttribute('data-icon-size', settings.iconSize);
            saveSettings();
        });
    });

    // ---------- 书签区域事件委托 (编辑操作仅编辑模式生效) ----------
    document.getElementById('bookmarks-container').addEventListener('click', (e) => {
        const target = e.target.closest('[data-action]');
        if (!target) return;

        const action = target.dataset.action;
        if (!editMode) return;  // 显示模式下忽略所有编辑操作
        const groupIndex = parseInt(target.dataset.groupIndex);

        switch (action) {
            case 'edit-group':
                openGroupModal(groupIndex);
                break;
            case 'delete-group':
                deleteGroup(groupIndex);
                break;
            case 'add-link':
                openLinkModal(groupIndex);
                break;
            case 'delete-link':
                e.preventDefault();
                e.stopPropagation();
                const linkIndex = parseInt(target.dataset.linkIndex);
                deleteLink(groupIndex, linkIndex);
                break;
            case 'group-bg':
                openGroupBgUpload(groupIndex);
                break;
            case 'group-bg-clear':
                clearGroupBg(groupIndex);
                break;
        }
    });

    // ---------- 分组背景图上传 ----------
    document.getElementById('group-bg-file-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const groupIndex = parseInt(e.target.dataset.groupIndex || 0);
        const reader = new FileReader();
        reader.onload = (ev) => {
            if (!bookmarks[groupIndex]) bookmarks[groupIndex].backgroundImage = '';
            bookmarks[groupIndex].backgroundImage = ev.target.result;
            saveBookmarks().then(() => renderBookmarks());
        };
        reader.readAsDataURL(file);
        e.target.value = '';  // 允许重复选择同一文件
    });

    // 分组标题点击 - 仅编辑模式下可编辑
    document.getElementById('bookmarks-container').addEventListener('click', (e) => {
        if (!editMode) return;
        const titleEl = e.target.closest('.group-title');
        if (titleEl) {
            const groupIndex = parseInt(titleEl.dataset.groupIndex);
            openGroupModal(groupIndex);
        }
    });

    // 链接卡片点击 - 中键/ctrl 不拦截，左键正常打开
    // (浏览器默认行为已处理 <a> 标签)

    // ---------- 弹窗关闭 ----------
    document.querySelectorAll('.modal-close').forEach((btn) => {
        btn.addEventListener('click', () => {
            closeAllModals();
        });
    });

    // 点击弹窗遮罩关闭
    document.querySelectorAll('.modal').forEach((modal) => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeAllModals();
            }
        });
    });

    // ---------- 链接保存 ----------
    document.getElementById('link-save-btn').addEventListener('click', saveLink);

    // ---------- 分组名称保存 ----------
    document.getElementById('group-save-btn').addEventListener('click', saveGroupName);

    // ---------- 添加分组 ----------
    document.getElementById('add-group-btn').addEventListener('click', addGroup);

    // ---------- 键盘快捷键 ----------
    document.addEventListener('keydown', (e) => {
        // ESC 关闭弹窗/设置
        if (e.key === 'Escape') {
            closeAllModals();
            toggleSettings(false);
        }
    });
}

// ============================================================
//  设置面板
// ============================================================
function toggleSettings(show) {
    const panel = document.getElementById('settings-panel');
    if (show === undefined) {
        panel.classList.toggle('hidden');
    } else if (show) {
        panel.classList.remove('hidden');
    } else {
        panel.classList.add('hidden');
    }
}

// ============================================================
//  弹窗
// ============================================================
function closeAllModals() {
    document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden'));
}

function openLinkModal(groupIndex, linkIndex = -1) {
    document.getElementById('link-group-index').value = groupIndex;
    document.getElementById('link-edit-index').value = linkIndex;

    if (linkIndex >= 0) {
        // 编辑模式
        const link = bookmarks[groupIndex].links[linkIndex];
        document.getElementById('modal-title').textContent = '编辑链接';
        document.getElementById('link-name-input').value = link.name;
        document.getElementById('link-url-input').value = link.url;
        document.getElementById('link-icon-input').value = link.icon || '';
    } else {
        // 新增模式
        document.getElementById('modal-title').textContent = '添加链接';
        document.getElementById('link-name-input').value = '';
        document.getElementById('link-url-input').value = '';
        document.getElementById('link-icon-input').value = '';
    }
    document.getElementById('link-modal').classList.remove('hidden');
    document.getElementById('link-name-input').focus();
}

function openGroupModal(groupIndex) {
    document.getElementById('group-edit-index').value = groupIndex;
    document.getElementById('group-name-input').value = bookmarks[groupIndex].name;
    document.getElementById('group-modal').classList.remove('hidden');
    document.getElementById('group-name-input').focus();
    document.getElementById('group-name-input').select();
}

// ============================================================
//  数据操作
// ============================================================
function saveLink() {
    const groupIndex = parseInt(document.getElementById('link-group-index').value);
    const linkIndex = parseInt(document.getElementById('link-edit-index').value);
    const name = document.getElementById('link-name-input').value.trim();
    let url = document.getElementById('link-url-input').value.trim();
    const icon = document.getElementById('link-icon-input').value.trim();

    if (!name || !url) {
        alert('请填写网站名称和地址');
        return;
    }

    // 自动补全协议
    if (!/^https?:\/\//i.test(url)) {
        url = 'https://' + url;
    }

    const linkData = { name, url, icon };

    if (linkIndex >= 0) {
        bookmarks[groupIndex].links[linkIndex] = linkData;
    } else {
        bookmarks[groupIndex].links.push(linkData);
    }

    saveBookmarks().then(() => {
        renderBookmarks();
        closeAllModals();
    });
}

function deleteLink(groupIndex, linkIndex) {
    if (confirm(`确定要删除「${bookmarks[groupIndex].links[linkIndex].name}」吗？`)) {
        bookmarks[groupIndex].links.splice(linkIndex, 1);
        saveBookmarks().then(() => renderBookmarks());
    }
}

function saveGroupName() {
    const groupIndex = parseInt(document.getElementById('group-edit-index').value);
    const name = document.getElementById('group-name-input').value.trim();

    if (!name) {
        alert('请输入分组名称');
        return;
    }

    bookmarks[groupIndex].name = name;
    saveBookmarks().then(() => {
        renderBookmarks();
        closeAllModals();
    });
}

function deleteGroup(groupIndex) {
    if (confirm(`确定要删除「${bookmarks[groupIndex].name}」分组及其所有链接吗？`)) {
        bookmarks.splice(groupIndex, 1);
        saveBookmarks().then(() => renderBookmarks());
    }
}

function addGroup() {
    bookmarks.push({
        name: '新分组',
        backgroundImage: '',
        links: [],
    });
    saveBookmarks().then(() => {
        renderBookmarks();
        // 自动打开新分组的命名弹窗
        setTimeout(() => openGroupModal(bookmarks.length - 1), 100);
    });
}

// ============================================================
//  分组背景图操作
// ============================================================
let _pendingGroupBgIndex = 0;

function openGroupBgUpload(groupIndex) {
    _pendingGroupBgIndex = groupIndex;
    const input = document.getElementById('group-bg-file-input');
    input.dataset.groupIndex = groupIndex;
    input.click();
}

function clearGroupBg(groupIndex) {
    bookmarks[groupIndex].backgroundImage = '';
    saveBookmarks().then(() => renderBookmarks());
}

// ============================================================
//  移除 Chrome 注入的底部条带元素
// ============================================================
function removeChromeNtpElements() {
    // 1. 按已知选择器移除
    const selectors = [
        'ntp-app', '#ntp-app',
        '#customize-chrome', '#customizeChromeButton', '#customizeChrome',
        '[id*="customize-chrome"]', '[id*="CustomizeChrome"]', '[id*="customize-chrome-button"]',
        '#most-visited', '#attribution', '[id*="attr"]', '.attribution',
        '#info-bar', '#bottom-bar', '#credits',
        'chrome-ntp-attribution',
        // Chrome 可能注入的 iframe
        'iframe[src*="chrome"]',
    ];
    selectors.forEach((sel) => {
        try {
            document.querySelectorAll(sel).forEach((el) => {
                el.style.display = 'none';
                el.style.height = '0px';
                el.style.overflow = 'hidden';
                el.remove();
            });
        } catch (_) { /* ignore */ }
    });

    // 2. 遍历 body 直接子元素，移除不在我们 HTML 中定义的元素
    const ourIds = new Set([
        'bg-layer', 'mode-toggle', 'bg-btn', 'settings-panel',
        'main-content', 'link-modal', 'group-modal',
        'group-bg-file-input',
    ]);
    document.body.querySelectorAll('*').forEach((el) => {
        const id = el.id;
        // 保留我们的元素
        if (id && ourIds.has(id)) return;
        // 保留我们内部动态创建的元素（有特定 class）
        if (el.closest('#main-content')) return;
        if (el.closest('#settings-panel')) return;
        if (el.closest('#link-modal') || el.closest('#group-modal')) return;
        if (el.closest('#mode-toggle') || el.closest('#bg-btn')) return;
        if (el.closest('#bg-layer')) return;

        // 检查是否包含 Chrome NTP 特征文本
        const text = (el.textContent || '').trim();
        if (text && (
            text.includes('Custom Homepage') ||
            text.includes('自定义Chrome') ||
            text.includes('自定义 Chrome') ||
            text.includes('Customize Chrome') ||
            text.includes('Customize this page')
        )) {
            // 找到最外层不是我们元素的容器并移除
            let target = el;
            while (target.parentElement && target.parentElement !== document.body && target.parentElement !== document.documentElement) {
                const pId = target.parentElement.id;
                if (pId && ourIds.has(pId)) break;
                target = target.parentElement;
            }
            target.style.display = 'none';
            target.remove();
        }
    });

    // 3. 处理 shadow DOM（Chrome 可能将 NTP UI 放在 shadow root 中）
    try {
        document.querySelectorAll('*').forEach((el) => {
            if (el.shadowRoot) {
                el.shadowRoot.querySelectorAll('*').forEach((child) => {
                    const childText = (child.textContent || '').trim();
                    if (childText.includes('Customize Chrome') || childText.includes('自定义')) {
                        child.remove();
                    }
                });
            }
        });
    } catch (_) { /* ignore */ }
}

function observeChromeNtpElements() {
    // 持续监听 DOM 变化 10 秒
    const observer = new MutationObserver(() => {
        removeChromeNtpElements();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 10000);
}

// ============================================================
//  启动
// ============================================================
document.addEventListener('DOMContentLoaded', init);
