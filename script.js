// === Dados, busca, categorias (2 级分组), paginação, tema（首页 + 详情）===

// Util
const $ = (id) => document.getElementById(id);

const BASE_URL = (() => {
  try {
    const current = document.currentScript || document.querySelector('script[src*="script.js"]');
    if (current && current.src) {
      return new URL('.', current.src);
    }
  } catch (_) { }
  try {
    return new URL('.', window.location.href);
  } catch (_) {
    return new URL('.', window.location.origin || '/');
  }
})();

const BASE_PATH = BASE_URL.toString();

function resolveAssetPath(path = '') {
  if (!path) return BASE_PATH;
  if (/^(?:[a-z]+:)?\/\//i.test(path) || path.startsWith('data:')) return path;
  const clean = path.trim();
  try {
    return new URL(clean, BASE_URL).toString();
  } catch (_) {
    return clean;
  }
}

window.__DAYMI_BASE_PATH__ = BASE_PATH;
window.__DAYMI_RESOLVE_ASSET__ = resolveAssetPath;

document.documentElement.classList.add('has-js');

const CATEGORY_SLUGS = {
  'group:VASOS': 'vasos',
  'group:ENFEITES': 'enfeites',
  'sub:VASOS|MODERNO': 'vaso-moderno',
  'sub:VASOS|DESIGN ESPECIAL': 'vaso-design-especial',
  'sub:ENFEITES|ANIMAL': 'enfeites-animal',
  'sub:ENFEITES|BAILARINA': 'enfeites-bailarina',
  'sub:ENFEITES|PERSONAGEM': 'enfeites-personagem',
  'sub:ENFEITES|FUNCIONAL': 'enfeites-funcional',
  'sub:ENFEITES|ABSTRATAS': 'enfeites-abstratas',
};

const SLUG_TO_CATEGORY = Object.entries(CATEGORY_SLUGS).reduce((acc, [cat, slug]) => {
  acc[slug] = cat;
  return acc;
}, {});

const PRODUTOS_BASE_URL = (() => {
  try {
    return new URL('./produtos/', BASE_URL);
  } catch (_) {
    return null;
  }
})();

const PRODUTOS_BASE_PATHNAME = (() => {
  if (!PRODUTOS_BASE_URL) return '/produtos/';
  const { pathname } = PRODUTOS_BASE_URL;
  return pathname.endsWith('/') ? pathname : `${pathname}/`;
})();

const PRODUTOS_INDEX_PATHNAME = (() => {
  if (!PRODUTOS_BASE_URL) return '/produtos/index.html';
  const url = new URL('./index.html', PRODUTOS_BASE_URL);
  return url.pathname;
})();

function ensureTrailingSlash(pathname) {
  if (!pathname.endsWith('/')) return `${pathname}/`;
  return pathname;
}

function getProdutosBasePathname() {
  if (window.location.pathname === PRODUTOS_INDEX_PATHNAME) {
    return PRODUTOS_INDEX_PATHNAME;
  }
  return PRODUTOS_BASE_PATHNAME;
}

function buildSlugPathname(slug) {
  if (!slug) return getProdutosBasePathname();
  try {
    const url = new URL(`./${slug}/`, PRODUTOS_BASE_URL || BASE_URL);
    return ensureTrailingSlash(url.pathname);
  } catch (_) {
    const base = ensureTrailingSlash(getProdutosBasePathname());
    const joined = `${base}${slug}`;
    return ensureTrailingSlash(joined);
  }
}

function getSlugInfoFromPath(pathname = window.location.pathname) {
  if (!pathname) return null;
  const normalized = pathname.replace(/index\.html$/i, '');
  const match = normalized.toLowerCase().match(/\/produtos\/([^/]+)\/?$/);
  if (!match) return null;
  const slug = decodeURIComponent(match[1]);
  const category = SLUG_TO_CATEGORY[slug];
  if (!category) return null;
  return { slug, category };
}

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

const LOGO_REPLAY_KEY = 'daymiLogoReplay';

// 主题：加载 & 切换（统一时序动效）
function loadTheme() {
  const saved = localStorage.getItem('theme') || 'light'; // 默认亮色
  if (saved === 'light') {
    document.documentElement.classList.add('light');
  } else {
    document.documentElement.classList.remove('light');
  }
}

// 确保初次访问时默认是亮色主题
if (!localStorage.getItem('theme')) {
  localStorage.setItem('theme', 'light');
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
    const res = await fetch(resolveAssetPath('products.json'));
    const data = await res.json();
    PRODUCTS = (data && Array.isArray(data.products)) ? data.products : [];

    renderCategoryOptions();

const params = new URLSearchParams(location.search);
const slugInfo = getSlugInfoFromPath();

// 1) 恢复搜索词
const q = params.get('search') || '';
if (searchInput) searchInput.value = decodeURIComponent(q);

// 2) 恢复分类和值（比如 group:/sub:）
const { categorySelect } = els();
let cat = params.get('cat') || '';
if (!cat && slugInfo) {
  cat = slugInfo.category;
}
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

function setupTopSearchForm() {
  const form = document.querySelector('.top-search');
  if (!form) return;
  form.addEventListener('submit', (event) => {
    const { grid } = els();
    if (!grid) return;
    event.preventDefault();
    applyFilters();
  });
}

function setupProductMenuLinks() {
  const links = document.querySelectorAll('[data-cat-target]');
  if (!links.length) return;
  links.forEach(link => {
    link.addEventListener('click', (event) => {
      const { categorySelect, grid } = els();
      if (!grid || !categorySelect) return;
      event.preventDefault();
      const value = link.getAttribute('data-cat-target') || '';
      categorySelect.value = value;
      applyFilters();
    });
  });
}

function setupNavDropdowns() {
  const navItems = document.querySelectorAll('.nav-item.has-dropdown');
  if (!navItems.length) return;

  const closingTimers = new WeakMap();
  const mobileMedia = window.matchMedia ? window.matchMedia('(max-width: 820px)') : null;
  const isMobileViewport = () => !!(mobileMedia && mobileMedia.matches);

  const openItem = (item) => {
    if (!item) return;

    if (closingTimers.has(item)) {
      clearTimeout(closingTimers.get(item));
      closingTimers.delete(item);
    }

    item.classList.remove('is-closing');
    item.classList.add('is-open');

    const trigger = item.querySelector('.nav-link');
    if (trigger) {
      trigger.setAttribute('aria-expanded', 'true');
    }
  };

  const closeItem = (item) => {
    if (!item) return;

    item.classList.remove('is-open');
    item.classList.add('is-closing');

    if (closingTimers.has(item)) {
      clearTimeout(closingTimers.get(item));
    }

    const timer = setTimeout(() => {
      item.classList.remove('is-closing');
      closingTimers.delete(item);
    }, 220);

    closingTimers.set(item, timer);

    const trigger = item.querySelector('.nav-link');
    if (trigger) {
      trigger.setAttribute('aria-expanded', 'false');
    }
    if (trigger && typeof trigger.blur === 'function') {
      trigger.blur();
    }
  };

  const closeOthers = (current) => {
    navItems.forEach((item) => {
      if (item !== current) closeItem(item);
    });
  };

  navItems.forEach((item) => {
    const trigger = item.querySelector('.nav-link');
    const dropdownLinks = item.querySelectorAll('.dropdown-link');

    if (trigger && trigger.tagName === 'BUTTON') {
      trigger.setAttribute('aria-expanded', 'false');
      trigger.addEventListener('click', (event) => {
        event.preventDefault();
        const shouldOpen = !item.classList.contains('is-open');
        closeOthers(item);
        if (shouldOpen) {
          openItem(item);
        } else {
          closeItem(item);
        }
      });
    } else if (trigger) {
      trigger.setAttribute('aria-expanded', 'false');
      trigger.addEventListener('focus', () => closeOthers(item));
      trigger.addEventListener('click', (event) => {
        if (!isMobileViewport()) return;
        if (item.classList.contains('is-open')) return;
        event.preventDefault();
        closeOthers(item);
        openItem(item);
      });
    }

    dropdownLinks.forEach((link) => {
      link.addEventListener('click', () => {
        closeItem(item);
        requestAnimationFrame(() => {
          if (typeof link.blur === 'function') link.blur();
        });
      });
    });
  });

  document.addEventListener('click', (event) => {
    const target = event.target;
    navItems.forEach((item) => {
      if (!item.contains(target)) closeItem(item);
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      navItems.forEach((item) => closeItem(item));
    }
  });

  document.addEventListener('nav:close', () => {
    navItems.forEach((item) => closeItem(item));
  });
}

function setupNavToggle() {
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.getElementById('mainNav') || document.querySelector('.main-nav');
  if (!toggle || !nav) return;

  const overlay = document.querySelector('.nav-overlay');
  const body = document.body;

  const updateState = (isOpen) => {
    toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    toggle.setAttribute('aria-label', isOpen ? 'Fechar menu' : 'Abrir menu');
  };

  const closeNav = () => {
    if (!body.classList.contains('nav-open')) return;
    body.classList.remove('nav-open');
    updateState(false);
    let closeEvent;
    try {
      closeEvent = new CustomEvent('nav:close');
    } catch (_) {
      closeEvent = document.createEvent('Event');
      closeEvent.initEvent('nav:close', true, true);
    }
    document.dispatchEvent(closeEvent);
  };

  const openNav = () => {
    if (body.classList.contains('nav-open')) return;
    body.classList.add('nav-open');
    updateState(true);
  };

  toggle.addEventListener('click', () => {
    const willOpen = !body.classList.contains('nav-open');
    if (willOpen) {
      openNav();
      const firstFocusable = nav.querySelector('a, button');
      if (firstFocusable) {
        try {
          firstFocusable.focus({ preventScroll: true });
        } catch (_) {
          firstFocusable.focus();
        }
      }
    } else {
      closeNav();
      try {
        toggle.focus({ preventScroll: true });
      } catch (_) {
        toggle.focus();
      }
    }
  });

  if (overlay) {
    overlay.addEventListener('click', () => closeNav());
  }

  nav.querySelectorAll('a[href]').forEach((link) => {
    link.addEventListener('click', () => {
      if (!body.classList.contains('nav-open')) return;
      closeNav();
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeNav();
    }
  });

  const desktopMedia = window.matchMedia ? window.matchMedia('(min-width: 821px)') : null;
  if (desktopMedia) {
    const handleDesktopChange = (event) => {
      if (event.matches) {
        closeNav();
      }
    };
    if (typeof desktopMedia.addEventListener === 'function') {
      desktopMedia.addEventListener('change', handleDesktopChange);
    } else if (typeof desktopMedia.addListener === 'function') {
      desktopMedia.addListener(handleDesktopChange);
    }
  }

  updateState(false);
}

function updateUrlParams() {
  const { grid, searchInput, categorySelect } = els();
  if (!grid) return;
  if (typeof history === 'undefined' || typeof history.replaceState !== 'function') return;
  const isDetailPage = document.documentElement.classList.contains('detail-page');
  const params = new URLSearchParams(location.search);
  // 保留其他（例如详情页的 id），只更新搜索相关参数
  params.delete('search');
  params.delete('cat');
  params.delete('page');
  const q = searchInput ? searchInput.value.trim() : '';
  const cat = categorySelect ? categorySelect.value : '';
  if (q) params.set('search', q);
  const slugForCat = CATEGORY_SLUGS[cat];
  if (!slugForCat && cat) params.set('cat', cat);
  if (currentPage > 1) params.set('page', String(currentPage));
  const query = params.toString();
  const targetPathname = isDetailPage
    ? window.location.pathname
    : (slugForCat ? buildSlugPathname(slugForCat) : getProdutosBasePathname());
  const newUrl = query ? `${targetPathname}?${query}` : targetPathname;
  const currentUrl = `${location.pathname}${location.search}`;
  if (newUrl !== currentUrl) {
    history.replaceState({}, '', newUrl);
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
    const cardImage = resolveAssetPath(p.image || '');
    card.innerHTML = `
      <img class="thumb" src="${cardImage}" alt="${p.title}" loading="lazy">
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
      const detailPath = resolveAssetPath('product/');
      const url = new URL(detailPath, window.location.href);
      url.searchParams.set('id', p.id);
      if (q) url.searchParams.set('search', q);
      if (cat) url.searchParams.set('cat', cat);
      url.searchParams.set('page', String(currentPage)); // 关键：带上当前页
      window.location.href = url.toString();
    });



    // Alt + 点击 -> 预览对话框
    card.addEventListener('click', (e) => {
      if (e.altKey && dialog && dialogImage && dialogTitle) {
        e.preventDefault();
        dialogImage.src = cardImage;
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
  updateUrlParams();
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

  if (clearInputBtn) clearInputBtn.style.display = q ? 'inline-flex' : 'none';

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
  const heroSub = document.querySelector('.hero-sub');
  const heroEyebrow = document.querySelector('.hero-eyebrow');
  const heroLink = document.getElementById('heroLink');
  const dotsWrap = document.getElementById('heroDots');
  const btnPrev = document.getElementById('heroPrev');
  const btnNext = document.getElementById('heroNext');
  if (!hero || !heroMedia || !heroTitle || !heroLink || !dotsWrap) return;

  const defaultTitle = heroTitle.dataset.defaultText || heroTitle.textContent || '';
  const defaultSub = heroSub ? (heroSub.dataset.defaultText || heroSub.textContent || '') : '';
  const defaultEyebrow = heroEyebrow ? heroEyebrow.textContent || '' : '';

  // 你的素材列表：可混合不同比例（示例）
  // script.js -> renderHero() 里
  const slides = [
    { image: resolveAssetPath('assets/16-9/1.png'), title: 'Banner 1', sub: '描述1', alt: 'Banner 1', link: resolveAssetPath('product/?id=XWL0065') },
    { image: resolveAssetPath('assets/16-9/2.png'), title: 'Banner 2', sub: '描述2', alt: 'Banner 2', link: resolveAssetPath('product/?id=XWL0044') },
    { image: resolveAssetPath('assets/16-9/3.png'), title: 'Banner 3', sub: '描述3', alt: 'Banner 3', link: resolveAssetPath('product/?id=XWL0045') },
    { image: resolveAssetPath('assets/16-9/4.png'), title: 'Banner 4', sub: '描述4', alt: 'Banner 4', link: resolveAssetPath('product/?id=XWL0042') },
    { image: resolveAssetPath('assets/16-9/5.png'), title: 'Banner 5', sub: '描述4', alt: 'Banner 5', link: resolveAssetPath('product/?id=XWL0006-B') },

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

  async function renderSlide(i, withFade = true) {
    const s = slides[i];
    if (!s) return;

    try {
      await loadMeta(s.image);
    } catch { /* ignore metadata errors */ }

    if (withFade && !reduceMotion) heroMedia.classList.add('is-fading');
    heroMedia.style.backgroundImage = `url('${s.image}')`;
    hero.classList.add('hero-ready');

    heroTitle.textContent = s.title || defaultTitle;
    if (heroSub) heroSub.textContent = s.sub || defaultSub;
    if (heroEyebrow) heroEyebrow.textContent = s.eyebrow || defaultEyebrow;
    heroLink.href = s.link || '#';
    if (s.title) {
      heroLink.setAttribute('aria-label', `Ver detalhes de ${s.title}`);
    } else {
      heroLink.removeAttribute('aria-label');
    }

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

  setupLogoReturnFlag();
  setupTopSearchForm();
  setupProductMenuLinks();
  setupNavToggle();
  setupNavDropdowns();
}

function initScrollReveal() {
  const revealEls = document.querySelectorAll('.reveal-on-scroll');
  if (!revealEls.length) return;

  const root = document.documentElement;
  const reduceMotionQuery = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  const reduceMotion = !!(reduceMotionQuery && reduceMotionQuery.matches);
  if (reduceMotion) {
    root.classList.add('prefers-reduced-motion');
    revealEls.forEach((el) => el.classList.add('is-visible'));
    return;
  }

  if (!('IntersectionObserver' in window)) {
    revealEls.forEach((el) => el.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const target = entry.target;
      const { revealDelay, revealDistance } = target.dataset;
      if (revealDelay) target.style.setProperty('--reveal-delay', `${revealDelay}ms`);
      if (revealDistance) target.style.setProperty('--reveal-distance', revealDistance);
      target.classList.add('is-visible');
      obs.unobserve(target);
    });
  }, {
    threshold: 0.2,
    rootMargin: '0px 0px -12% 0px',
  });

  revealEls.forEach((el) => {
    const { revealDelay, revealDistance } = el.dataset;
    if (revealDelay) el.style.setProperty('--reveal-delay', `${revealDelay}ms`);
    if (revealDistance) el.style.setProperty('--reveal-distance', revealDistance);
    observer.observe(el);
  });
}

// DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  loadTheme();
  bindEvents();
  loadProducts();

  const isHome = location.pathname.endsWith('index.html') || location.pathname === '/' || location.pathname === '';
  const shouldReplayLogo = isHome && consumeLogoReplayFlag();
  setupLogoSlide({ playOnLoad: shouldReplayLogo });
  initScrollReveal();
});

// 顶栏高度 → 动态写入 CSS 变量，正文自动避让
function updateTopbarHeight() {
  const topBar = document.querySelector('.top-bar');
  if (!topBar) return;
  const h = topBar.offsetHeight || 44; // 兜底
  document.documentElement.style.setProperty('--topbar-height', h + 'px');
}
window.addEventListener('load', updateTopbarHeight, { once: true });
window.addEventListener('resize', updateTopbarHeight);
updateTopbarHeight();


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

// === Logo 点击滑落动画 ===
function setupLogoSlide(options = {}) {
  const { playOnLoad = false } = options;
  try {
    const logoWrappers = document.querySelectorAll('.logo-anim');
    if (!logoWrappers.length) return;

    const playSlide = (node) => {
      node.classList.remove('logo-slide');
      // 强制重排以保证动画每次都重新开始
      void node.offsetWidth;
      node.classList.add('logo-slide');
    };

    // 点击/键盘激活时触发滑落效果
    logoWrappers.forEach((wrapper) => {
      const link = wrapper.closest('a');
      if (!link) return;

      const trigger = () => playSlide(wrapper);
      let pointerActive = false;
      let pointerTriggered = false;
      let keyboardTriggered = false;

      if (window.PointerEvent) {
        const resetPointerState = () => {
          pointerActive = false;
          pointerTriggered = false;
        };

        link.addEventListener('pointerdown', (event) => {
          if (event.button !== 0) return;
          pointerActive = true;
          pointerTriggered = false;
        });
        link.addEventListener('pointerup', (event) => {
          if (event.button !== 0) return;
          if (!pointerActive) return;
          pointerActive = false;
          pointerTriggered = true;
          trigger();
        });
        link.addEventListener('pointercancel', resetPointerState);
        link.addEventListener('pointerleave', resetPointerState);
      }

      link.addEventListener('click', () => {
        if (pointerTriggered) {
          pointerTriggered = false;
          return;
        }
        if (pointerActive) {
          pointerActive = false;
          return;
        }
        if (keyboardTriggered) {
          keyboardTriggered = false;
          return;
        }
        trigger();
      });

      link.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          keyboardTriggered = true;
          trigger();
        }
      });
    });

    if (playOnLoad) {
      requestAnimationFrame(() => {
        logoWrappers.forEach((wrapper) => playSlide(wrapper));
      });
    }
  } catch (e) {
    console.warn('Logo 动画未应用（不影响其它功能）:', e);
  }
}

function setupLogoReturnFlag() {
  try {
    const logoLinks = document.querySelectorAll('a[href$="index.html"], a[href="/"], a[href="./"], a[href="../"]');
    if (!logoLinks.length) return;

    const markReplay = () => {
      try {
        sessionStorage.setItem(LOGO_REPLAY_KEY, '1');
      } catch (_) {
        /* 忽略隐私模式下的异常 */
      }
    };

    logoLinks.forEach((link) => {
      if (!link.querySelector('.logo-anim')) return;

      link.addEventListener('pointerdown', markReplay);
      link.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          markReplay();
        }
      });
    });
  } catch (err) {
    console.warn('Logo 返回动画标记失败:', err);
  }
}

function consumeLogoReplayFlag() {
  try {
    const shouldReplay = sessionStorage.getItem(LOGO_REPLAY_KEY) === '1';
    if (shouldReplay) {
      sessionStorage.removeItem(LOGO_REPLAY_KEY);
    }
    return shouldReplay;
  } catch (_) {
    return false;
  }
}
