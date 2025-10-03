// === Dados, busca, categorias (2 级分组), paginação, tema（首页 + 详情）===

// Util
const $ = (id) => document.getElementById(id);

// Estado global
let PRODUCTS = [];
let FILTERED = [];
let currentPage = 1;
const pageSize = 20; // 每页 20 个

// —— 两级分类树（示例，可按需调整） ——
const CATEGORY_TREE = {
  VASOS: ['MODERNO', 'DESIGN ESPECIAL'],
  ENFEITES: ['ANIMAL', 'BAILARINA', 'PERSONAGEM', 'FUNCIONAL', 'ABSTRATAS'],
};

// Debounce
function debounce(fn, delay = 250) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}
const debouncedSearch = debounce(() => applyFilters(), 250);

// 主题：加载 & 切换（统一时序动效）
function loadTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  if (saved === 'light') document.documentElement.classList.add('light');
}
function switchTheme() {
  // 切换 light / dark
  document.documentElement.classList.toggle('light');
  const isLight = document.documentElement.classList.contains('light');
  localStorage.setItem('theme', isLight ? 'light' : 'dark');

  // 只保留按钮脉冲动画，不再触发 Logo 动画
  try {
    const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const tbtn = document.getElementById('toggleTheme');
    const tbtnTop = document.getElementById('toggleThemeTop');
    const pulse = (btn) => {
      if (!btn) return;
      btn.classList.add('theme-click'); // 按钮脉冲
      btn.addEventListener('animationend', () => btn.classList.remove('theme-click'), { once: true });
    };
    if (!prefersReduced) {
      pulse(tbtn);
      pulse(tbtnTop);
    }
  } catch (_) { }
}

// DOM refs
function els() {
  return {
    grid: $('grid'),
    pagination: $('pagination'),
    searchInput: $('searchInput'),
    categorySelect: $('categorySelect'),
    dialog: $('productDialog'),
    dialogClose: $('dialogClose'),
    toggleTheme: $('toggleTheme'),
    toggleThemeTop: $('toggleThemeTop'),
    searchBtn: $('searchBtn'),
    clearInputBtn: $('clearInputBtn'),
    yearEl: $('year'),
    // 详情
    app: $('app'),
    searchContainer: $('searchContainer'),
    searchCount: $('searchCount'),
    dialogImage: $('dialogImage'),
    dialogTitle: $('dialogTitle'),
    dialogDesc: $('dialogDesc'),
    dialogCategory: $('dialogCategory'),
  };
}

// —— 分类解析 ——
function parseCategory(p) {
  if (p.categoryMajor && p.categoryMinor) {
    return {
      major: String(p.categoryMajor).toUpperCase().trim(),
      minor: String(p.categoryMinor).toUpperCase().trim()
    };
  }
  const raw = (p.category || '').toString();
  const [a, b] = raw.split('/').map(s => (s || '').trim().toUpperCase());
  return { major: a || '', minor: b || '' };
}

// 加载产品
async function loadProducts() {
  const { grid, searchInput } = els();
  try {
    const res = await fetch('products.json');
    const data = await res.json();
    PRODUCTS = (data && Array.isArray(data.products)) ? data.products : [];

    renderCategoryOptions();

const params = new URLSearchParams(location.search);

// 1) 恢复搜索词
const q = params.get('search') || '';
if (searchInput) searchInput.value = decodeURIComponent(q);

// 2) 恢复分类和值（比如 group:/sub:）
const { categorySelect } = els();
const cat = params.get('cat') || '';
if (categorySelect && cat) categorySelect.value = cat;

// 3) 恢复页码
const page = parseInt(params.get('page'), 10);
if (!Number.isNaN(page) && page > 0) currentPage = page;

    // 首次渲染 + 分页
    applyFilters(true);

    // === Hero 文案与背景 ===
    renderHero();

    // === 更新产品总数（新增） ===
    updateProductCount();
  } catch (e) {
    console.error('Falha ao carregar produtos:', e);
    if (grid) grid.innerHTML = '<p style="color:var(--muted)">Não foi possível carregar os dados. Verifique o arquivo products.json.</p>';
  }
}

// 渲染分类下拉（含二级）
function renderCategoryOptions() {
  const { categorySelect } = els();
  if (!categorySelect) return;

  categorySelect.innerHTML = `<option value="">Todas las categorias</option>`;
  categorySelect.innerHTML = `<option value="">Todas as categorias</option>`; // 保持你原文

  for (const major of Object.keys(CATEGORY_TREE)) {
    const opt = document.createElement('option');
    opt.value = `group:${major}`;
    opt.textContent = `${major} — todas`;
    categorySelect.appendChild(opt);
  }

  for (const [major, minors] of Object.entries(CATEGORY_TREE)) {
    const og = document.createElement('optgroup');
    og.label = major;
    for (const m of minors) {
      const o = document.createElement('option');
      o.value = `sub:${major}|${m}`;
      o.textContent = m;
      og.appendChild(o);
    }
    categorySelect.appendChild(og);
  }
}

// 首页/详情共用网格渲染
function renderGrid(items) {
  const { grid, dialog, dialogImage, dialogTitle, dialogDesc, dialogCategory } = els();
  if (!grid) return;
  grid.innerHTML = '';
  if (!items.length) {
    grid.innerHTML = `<p style="color:var(--muted)">Nenhum produto encontrado.</p>`;
    return;
  }
  for (const p of items) {
    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML = `
      <img class="thumb" src="${p.image}" alt="${p.title}" loading="lazy">
      <div class="card-body">
        <h3 class="card-title">${p.title}</h3>
        <div class="muted">Código: ${p.id}</div>
        <div class="muted">Marca: DAYMI</div>
      </div>
    `;

    // ★ 新增：卡片也有按压跟手
    bindPressFX(card);

    // 点击 -> 详情页（忽略文字选择复制）
   card.addEventListener('click', (e) => {
  const selection = window.getSelection();
  if (selection && selection.toString().length > 0) return;

  const { searchInput, categorySelect } = els();
  const q = searchInput ? searchInput.value : '';
  const cat = categorySelect ? categorySelect.value : '';
  const url = new URL('product.html', location.href);
  url.searchParams.set('id', p.id);
  if (q)   url.searchParams.set('search', q);
  if (cat) url.searchParams.set('cat', cat);
  url.searchParams.set('page', String(currentPage)); // 关键：带上当前页
  window.location.href = url.toString();
});



    // Alt + 点击 -> 预览对话框
    card.addEventListener('click', (e) => {
      if (e.altKey && dialog && dialogImage && dialogTitle) {
        e.preventDefault();
        dialogImage.src = p.image;
        dialogImage.alt = p.title;
        dialogTitle.textContent = p.title;
        dialogDesc.textContent = p.description || '';
        dialogCategory.textContent = p.category || '';
        dialog.showModal();
      }
    });

    grid.appendChild(card);
  }
}

// 分页
function renderPagination(totalItems) {
  const { pagination } = els();
  if (!pagination) return;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(currentPage, totalPages);
  currentPage = page;

  if (totalPages <= 1) {
    pagination.innerHTML = '';
    return;
  }

  const frag = document.createDocumentFragment();

  const prev = document.createElement('button');
  prev.className = 'page-btn';
  prev.innerHTML = '‹';
  prev.setAttribute('aria-label', 'Página anterior');
  prev.disabled = page <= 1;
  prev.addEventListener('click', () => goToPage(page - 1));
  frag.appendChild(prev);

  for (let i = 1; i <= totalPages; i++) {
    const btn = document.createElement('button');
    btn.className = 'page-btn';
    btn.textContent = String(i);
    if (i === page) {
      btn.classList.add('active');
      btn.setAttribute('aria-current', 'page');
    }
    btn.addEventListener('click', () => goToPage(i));
    frag.appendChild(btn);
  }

  const next = document.createElement('button');
  next.className = 'page-btn';
  next.innerHTML = '›';
  next.setAttribute('aria-label', 'Próxima página');
  next.disabled = page >= totalPages;
  next.addEventListener('click', () => goToPage(page + 1));
  frag.appendChild(next);

  pagination.innerHTML = '';
  pagination.appendChild(frag);
}

function goToPage(page) {
  const totalPages = Math.max(1, Math.ceil(FILTERED.length / pageSize));
  currentPage = Math.min(Math.max(1, page), totalPages);
  renderPage();
}

function renderPage() {
  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize;
  const pageItems = FILTERED.slice(start, end);
  renderGrid(pageItems);
  renderPagination(FILTERED.length);
}

// Normalização simples
function norm(s) {
  return (s ?? '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

// Filtro + 详情页搜索容器显隐
function applyFilters(firstLoad = false) {
  const { searchInput, categorySelect, app, searchContainer, clearInputBtn } = els();
  const isDetail = !!app;

  const q = norm(searchInput ? searchInput.value : '');
  const cat = categorySelect ? categorySelect.value : '';

  if (clearInputBtn) clearInputBtn.style.display = q ? 'block' : 'none';

  FILTERED = PRODUCTS.filter(p => {
    const specsText = p.specs && typeof p.specs === 'object'
      ? Object.entries(p.specs).map(([k, v]) => `${k}:${v}`).join(' ')
      : '';
    const paramsText = p.params && typeof p.params === 'object'
      ? Object.entries(p.params).map(([k, v]) => `${k}:${v}`).join(' ')
      : '';

    const haystack = [
      p.title, p.description, p.category,
      p.id, p.model,
      p.code, p.barcode, p.reference,
      specsText, paramsText
    ].map(norm).join(' ');

    const matchQ = !q || haystack.includes(q);

    let matchC = true;
    if (cat) {
      const { major, minor } = parseCategory(p);
      if (cat.startsWith('group:')) {
        const m = cat.slice(6);
        matchC = major === m;
      } else if (cat.startsWith('sub:')) {
        const [, pair] = cat.split(':');
        const [m1, m2] = pair.split('|');
        matchC = (major === m1 && minor === m2);
      } else {
        matchC = (p.category === cat);
      }
    }

    return matchQ && matchC;
  });

  if (!firstLoad) currentPage = 1;

  if (isDetail && searchContainer) {
    const shouldShow = !!(q || cat);
    searchContainer.style.display = shouldShow ? '' : 'none';
  }

  renderPage();
  updateProductCount(); // ★ 每次筛选后刷新统计
  updateSearchCount();    // 详情页“Resultados da pesquisa”右侧统计
}

// ====== Hero 逻辑 ======
function pickFeaturedProduct() {
  return PRODUCTS.find(p => p.image) || PRODUCTS[0];
}
// ===== Hero 轮播 =====
// ===== Hero 轮播（改为使用 assets/16-9 下的固定图片）=====
// 替换 script.js 中的 renderHero()
function renderHero() {
  const hero = document.querySelector('.hero');
  const heroMedia = document.getElementById('heroMedia');
  const heroTitle = document.getElementById('heroTitle');
  const heroLink = document.getElementById('heroLink');
  const dotsWrap = document.getElementById('heroDots');
  const btnPrev = document.getElementById('heroPrev');
  const btnNext = document.getElementById('heroNext');
  if (!hero || !heroMedia || !heroTitle || !heroLink || !dotsWrap) return;

  // 你的素材列表：可混合不同比例（示例）
  // script.js -> renderHero() 里
  const slides = [
    { image: 'assets/16-9/1.png', title: 'Banner 1', sub: '描述1', alt: 'Banner 1', link: 'product.html?id=XWL0065' },
    { image: 'assets/16-9/2.png', title: 'Banner 2', sub: '描述2', alt: 'Banner 2', link: 'product.html?id=XWL0044' },
    { image: 'assets/16-9/3.png', title: 'Banner 3', sub: '描述3', alt: 'Banner 3', link: 'product.html?id=XWL0045' },
    { image: 'assets/16-9/4.png', title: 'Banner 4', sub: '描述4', alt: 'Banner 4', link: 'product.html?id=XWL0042' },
    { image: 'assets/16-9/5.png', title: 'Banner 4', sub: '描述4', alt: 'Banner 4', link: 'product.html?id=XWL0006-B' },

  ].filter(s => !!s.image);


  if (!slides.length) return;

  let idx = 0;
  const INTERVAL = 5000;
  let timer = null;

  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // —— 预加载并缓存图片天然宽高，避免重复 onload —— //
  const cache = new Map(); // url -> {w,h,src}
  function loadMeta(src) {
    return new Promise((resolve, reject) => {
      if (cache.has(src)) return resolve(cache.get(src));
      const img = new Image();
      img.onload = () => {
        const meta = { w: img.naturalWidth || img.width, h: img.naturalHeight || img.height, src };
        cache.set(src, meta);
        resolve(meta);
      };
      img.onerror = reject;
      img.src = src;
    });
  }

  // 设置容器比例 = 当前图比例（例如 1536/1024）
//  function setHeroRatio(w, h) {
  //  hero.style.aspectRatio = `${w} / ${h}`;
//    hero.style.maxHeight = '100vh'; // 防止超高（可按需调整/删除）
  //}

  // 固定使用 16:9，不再随图片天然宽高变动
function setHeroRatio() {
  hero.style.aspectRatio = '16 / 9';
  hero.style.maxHeight = '80vh'; // 你也可以改 90vh/80vh
}
 

  async function renderSlide(i, withFade = true) {
    const s = slides[i];
    if (!s) return;

    try {
      const meta = await loadMeta(s.image);
      setHeroRatio(meta.w, meta.h);
     //setHeroRatio(); // 固定 16:9
    } catch {
      // 回退（如果图片元信息失败，给个常见比例）
     hero.style.aspectRatio = '16 / 9';
    }

    if (withFade && !reduceMotion) heroMedia.classList.add('is-fading');
    heroMedia.style.backgroundImage = `url('${s.image}')`;
    heroTitle.textContent = s.title || '';
    heroLink.href = s.link || '#';

    // 更新圆点选中态
    dotsWrap.querySelectorAll('.hero-dot').forEach((d, di) => {
      d.setAttribute('aria-selected', di === i ? 'true' : 'false');
    });

    if (withFade && !reduceMotion) {
      setTimeout(() => heroMedia.classList.remove('is-fading'), 240);
    }
  }

  // 圆点
  dotsWrap.innerHTML = '';
  slides.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.className = 'hero-dot';
    dot.type = 'button';
    dot.setAttribute('role', 'tab');
    dot.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
    dot.addEventListener('click', () => { idx = i; renderSlide(idx); restart(); });
    dotsWrap.appendChild(dot);
  });

  function next() { idx = (idx + 1) % slides.length; renderSlide(idx); }
  function prev() { idx = (idx - 1 + slides.length) % slides.length; renderSlide(idx); }

  function start() { if (!reduceMotion) { stop(); timer = setInterval(next, INTERVAL); } }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }
  function restart() { stop(); start(); }

  if (btnPrev) btnPrev.addEventListener('click', () => { prev(); restart(); });
  if (btnNext) btnNext.addEventListener('click', () => { next(); restart(); });

  // 初始渲染
  renderSlide(0, false);
  start();
}






// ===== 按钮水波纹 + 按压反馈 =====
function addRipple(e) {
  const btn = e.currentTarget;
  const rect = btn.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) * 0.4;
  const ripple = document.createElement('span');
  ripple.className = 'ripple';
  ripple.style.width = ripple.style.height = size + 'px';
  const cx = (e.clientX ?? (e.changedTouches && e.changedTouches[0]?.clientX) ?? (rect.left + rect.width / 2));
  const cy = (e.clientY ?? (e.changedTouches && e.changedTouches[0]?.clientY) ?? (rect.top + rect.height / 2));
  ripple.style.left = (cx - rect.left - size / 2) + 'px';
  ripple.style.top = (cy - rect.top - size / 2) + 'px';
  btn.appendChild(ripple);
  setTimeout(() => ripple.remove(), 500);
}
function pressFeedback(btn) { btn.classList.add('press'); setTimeout(() => btn.classList.remove('press'), 120); }
function bindButtonFX(el) {
  if (!el) return;
  el.addEventListener('click', addRipple);
  el.addEventListener('mousedown', () => pressFeedback(el));
  el.addEventListener('touchstart', () => pressFeedback(el));
}
// 跟手按压动效：按住左键/触摸时缩小，松开/离开恢复
function bindPressFX(el) {
  if (!el) return;
  el.classList.add('holdable');

  // 仅左键按下
  el.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    el.classList.add('is-pressing');
  });
  // 松开或滑离
  el.addEventListener('mouseup', () => el.classList.remove('is-pressing'));
  el.addEventListener('mouseleave', () => el.classList.remove('is-pressing'));

  // 触摸
  el.addEventListener('touchstart', () => el.classList.add('is-pressing'), { passive: true });
  el.addEventListener('touchend', () => el.classList.remove('is-pressing'));
  el.addEventListener('touchcancel', () => el.classList.remove('is-pressing'));

  // 键盘可达性（空格/回车）
  el.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') el.classList.add('is-pressing');
  });
  el.addEventListener('keyup', (e) => {
    if (e.key === ' ' || e.key === 'Enter') el.classList.remove('is-pressing');
  });

  // 仍保留你的水波纹效果
  el.addEventListener('click', addRipple);
}


// ====== 产品总数 / 当前结果数 ======
function updateProductCount() {
  const el = document.getElementById('productCount');
  if (!el) return;

  const total = PRODUCTS.length;
  const current = FILTERED.length;

  if (current === total) {
    el.textContent = `Todos | ${total} Produtos`;
  } else {
    el.innerHTML = `Todos | ${total} Produtos <span>(Exibindo ${current} resultados)</span>`;
  }
}

// === 页面初始化绑定交互效果 ===
window.addEventListener('DOMContentLoaded', () => {
  const { searchBtn, clearInputBtn } = els();

  // 给 Limpar 按钮绑定点击动效
  bindButtonFX(searchBtn);
  bindButtonFX(clearInputBtn);

  // ★ 新增：按住缩小、松开还原
  bindPressFX(searchBtn);       // “Limpar”
  bindPressFX(clearInputBtn);   // “×” 清除

  // Hero 区域的 “查看详情” CTA 按钮
  const heroLink = document.getElementById('heroLink');
  bindButtonFX(heroLink);
  bindPressFX(heroLink);        // ★ 新增跟手按压

  // 给产品卡片绑定点击动效（轻微缩放）
  document.addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (card) {
      pressFeedback(card);
    }
  });
});



function updateSearchCount() {
  const { searchContainer, searchCount } = els();
  if (!searchCount) return;

  // 只有当“Resultados da pesquisa”区域显示时，才展示右侧统计
  const visible = searchContainer && searchContainer.style.display !== 'none';
  if (!visible) {
    searchCount.textContent = '';
    searchCount.style.display = 'none';
    return;
  }

  // 和首页一致的文案效果
  const total = PRODUCTS.length;
  const current = FILTERED.length;

  // ——与首页保持一致——
  // 如果当前结果 == 总数 → “Todos | X Produtos”
  // 否则也使用 “Todos | X Produtos” 的格式（你要的是同款效果）
  const text = `Todos | ${current === total ? total : current} Produtos`;

  searchCount.textContent = text;
  searchCount.style.display = ''; // 显示
}


// ====== 事件绑定 & 初始化 ======
function bindEvents() {
  const {
    toggleTheme, toggleThemeTop,
    searchInput, categorySelect,
    searchBtn, clearInputBtn,
    dialog, dialogClose, yearEl
  } = els();

  // 主题按钮
  if (toggleTheme) {
    bindButtonFX(toggleTheme);
    toggleTheme.addEventListener('click', switchTheme);
  }
  if (toggleThemeTop) {
    bindButtonFX(toggleThemeTop);
    toggleThemeTop.addEventListener('click', switchTheme);
  }

  // 搜索/筛选
  if (searchInput) searchInput.addEventListener('input', debouncedSearch);
  if (categorySelect) categorySelect.addEventListener('change', () => applyFilters());
  if (searchBtn) {
    bindButtonFX(searchBtn);
    searchBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      if (categorySelect) categorySelect.value = '';
      applyFilters();
    });
  }
  if (clearInputBtn) {
    clearInputBtn.addEventListener('click', () => {
      if (searchInput) {
        searchInput.value = '';
        clearInputBtn.style.display = 'none';
        applyFilters();
      }
    });
  }

  // 预览对话框
  if (dialog && dialogClose) {
    dialogClose.addEventListener('click', () => dialog.close());
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); dialog.close(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && dialog.open) dialog.close();
    });
  }

  // 年份
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // —— 额外绑定：Hero CTA & 卡片 ——
  // 1) Hero 的“查看详情”按钮（index.html 里有 id="heroLink"）
  const heroLink = document.getElementById('heroLink');
  if (heroLink) bindButtonFX(heroLink);

  // 2) 产品卡片：给网格容器代理绑定，让每张卡片有按压反馈和 ripple
  document.addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (card) {
      // 立即给卡片按压反馈 + 水波纹
      pressFeedback(card);
      addRipple.call(card, e);
    }
  });

}

// DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  loadTheme();
  bindEvents();
  loadProducts();


  // —— 只在首页触发 Logo 掉落动画 ——
  if (location.pathname.endsWith('index.html') || location.pathname === '/' || location.pathname === '') {
    setupLogoDrop();
  }
});

// === Top Bar 滚动显隐逻辑 ===
let lastScrollY = window.scrollY;
window.addEventListener('scroll', () => {
  const currentY = window.scrollY;
  const topBar = document.querySelector('.top-bar');
  if (!topBar) return;
  if (currentY > lastScrollY) {
    // 向下滚动 -> 隐藏
    topBar.classList.add('hide');
  } else {
    // 向上滚动 -> 显示
    topBar.classList.remove('hide');
  }
  lastScrollY = currentY;
});

// === 让顶栏 Logo 水平位置随容器对齐（可选，原代码保留） ===
(function driftingLogo() {
  const logo = document.querySelector('.top-logo');
  if (!logo) return;
  function positionLogo() {
    const vw = window.innerWidth;
    const maxContainer = 1100;     // 和 .container 一致
    const containerW = Math.min(maxContainer, vw * 0.94);
    const leftGap = (vw - containerW) / 2; // 容器左侧空白
    const padding = 8;             // 再往里缩一点点
    const left = Math.max(12, leftGap + padding);
    logo.style.left = left + 'px';
  }
  positionLogo();
  window.addEventListener('resize', positionLogo, { passive: true });
})();

// === Logo 掉落动画触发（新增的稳定实现） ===
function setupLogoDrop() {
  try {
    const logos = document.querySelectorAll('.top-logo');
    if (!logos.length) return;

    // 页面加载：播放一次（移除->强制重排->再添加）
    logos.forEach(logo => {
      logo.classList.remove('logo-drop');
      // 强制重排以保证每次进入页面都会重新播放动画
      void logo.offsetWidth;
      logo.classList.add('logo-drop');
    });

    // 点击 logo 跳首页：在离开当前页前移除动画类，等到首页加载后再由上面的逻辑播放
    logos.forEach(logo => {
      const a = logo.closest('a');
      if (!a) return;
      a.addEventListener('click', () => {
        logo.classList.remove('logo-drop');
      });
    });
  } catch (e) {
    console.warn('Logo 动画未应用（不影响其它功能）:', e);
  }
}
