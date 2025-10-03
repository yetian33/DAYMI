// detail.js — lógica da página de detalhes + tema
(function () {

  // Dados
  const params = new URLSearchParams(location.search);
  const pid = params.get('id');

  const backLink = document.querySelector('.back');
  if (backLink) {
    // 用当前详情页 URL 里带过来的 search/cat/page 拼一个“带参首页”
    const fallback = new URL('index.html', location.href);
    ['search', 'cat', 'page'].forEach(k => {
      const v = params.get(k);
      if (v) fallback.searchParams.set(k, v);
    });
    // 让浏览器悬停时也能看到目标链接
    backLink.href = fallback.toString();

    backLink.addEventListener('click', (e) => {
      e.preventDefault();
      // 如果我们掌握了任何参数，就直接按“带参首页”回跳（最稳）
      if (fallback.search) {
        window.location.href = backLink.href;
      } else if (history.length > 1) {
        // 否则再尝试纯 history.back()
        history.back();
      } else {
        window.location.href = 'index.html';
      }
    });
  }


  const mainImage = document.getElementById('mainImage');
  const thumbs = document.getElementById('thumbs');
  const title = document.getElementById('title');
  const desc = document.getElementById('desc');
  const category = document.getElementById('category');
  const specsTable = document.getElementById('specsTable');
  const extraMeta = document.getElementById('extraMeta');

  if (!pid) {
    if (title) title.textContent = 'ID do produto não informado';
    if (desc) desc.textContent = 'Acesse este detalhe clicando em um produto na página inicial.';
    if (mainImage) mainImage.alt = 'Sem produto';
    return;
  }

  fetch('products.json')
    .then(res => res.json())
    .then(data => {
      const list = data.products || [];
      const p = list.find(x => x.id === pid);
      if (!p) {
        if (title) title.textContent = 'Produto não encontrado';
        if (desc) desc.textContent = 'Volte à página inicial e selecione novamente.';
        return;
      }

      // Básico
      if (title) title.textContent = p.title || p.id || 'Produto';
      if (desc) desc.textContent = p.description || '';
      if (category) category.textContent = p.category || '—';

      // Galeria（支持图片 + 视频）
      const imgs = Array.isArray(p.images) && p.images.length ? p.images : (p.image ? [p.image] : []);
      const vids = Array.isArray(p.videos) ? p.videos : (p.video ? [p.video] : []);
      const posters = Array.isArray(p.videoPosters) ? p.videoPosters : (p.videoPoster ? [p.videoPoster] : []);

      const media = [
        ...imgs.map((src) => ({ type: 'img', src })),
        ...vids.map((src, i) => ({ type: 'video', src, poster: posters[i] || posters[0] }))
      ];

      const mainVideo = document.getElementById('mainVideo');

      function showImage(src) {
        if (mainVideo) {
          mainVideo.pause();
          mainVideo.style.display = 'none';
        }
        if (mainImage) {
          mainImage.src = src;
          mainImage.style.display = 'block';
        }
      }

      function showVideo(src, poster) {
        if (mainImage) {
          mainImage.style.display = 'none';
        }
        if (mainVideo) {
          // 重置后再切换，避免残留上一段视频的进度
          mainVideo.pause();
          mainVideo.removeAttribute('src'); // 先清空再设新 src 更稳
          if (poster) mainVideo.setAttribute('poster', poster); else mainVideo.removeAttribute('poster');
          mainVideo.src = src;
          mainVideo.style.display = 'block';
          // 不自动播放，尊重浏览器与用户策略（可按需改为 mainVideo.play().catch(()=>{})）
        }
      }

      if (!media.length) {
        if (mainImage) mainImage.alt = 'Sem imagem';
      } else {
        // 默认优先显示图片；没有图片时显示第一个视频
        const first = media[0].type === 'img' ? media[0] : (media.find(m => m.type === 'img') || media[0]);
        if (first.type === 'img') {
          showImage(first.src);
          if (title && mainImage) mainImage.alt = title.textContent || 'Imagem';
        } else {
          showVideo(first.src, first.poster);
        }

        if (thumbs) {
          thumbs.innerHTML = '';
          media.forEach((m, i) => {
            let thumbEl;

            if (m.type === 'img') {
              // 图片缩略图
              thumbEl = document.createElement('img');
              thumbEl.src = m.src;
              thumbEl.alt = (title && title.textContent ? title.textContent : 'Imagem') + ' - ' + (i + 1);
            } else {
              // 视频缩略图：优先用 poster，没有就用一个占位块
              if (m.poster) {
                thumbEl = document.createElement('div');
                thumbEl.style.position = 'relative';
                thumbEl.style.borderRadius = '.5rem';
                thumbEl.style.overflow = 'hidden';
                thumbEl.innerHTML = `
            <img src="${m.poster}" alt="Vídeo ${i + 1}" style="display:block;width:100%;aspect-ratio:1;object-fit:cover;background:#0003;border-radius:.5rem;">
            <span style="
              position:absolute;inset:auto 8px 8px auto;
              background:rgba(0,0,0,.6);color:#fff;font-size:.8rem;
              padding:.2rem .4rem;border-radius:.4rem;">▶</span>`;
              } else {
                thumbEl = document.createElement('div');
                thumbEl.className = 'video-thumb';
                thumbEl.textContent = '▶ Vídeo';
              }
              // 让视频缩略图整体看起来像图片（受 .thumbs img 的样式影响）
              thumbEl.style.cursor = 'pointer';
              thumbEl.style.border = '2px solid transparent';
              thumbEl.style.background = '#0003';
              thumbEl.style.aspectRatio = '1';
            }

            // 选中态
            if (i === 0) {
              thumbEl.classList && thumbEl.classList.add('active');
              // 非 <img> 的选中边框也要高亮
              if (m.type === 'video') thumbEl.style.borderColor = 'var(--brand)';
            }

            // 点击切换
            thumbEl.addEventListener('click', () => {
              if (m.type === 'img') {
                showImage(m.src);
              } else {
                showVideo(m.src, m.poster);
              }
              // 更新选中态
              thumbs.querySelectorAll('img, .video-thumb, .thumbs div').forEach(el => {
                el.classList && el.classList.remove('active');
                if (el.style) el.style.borderColor = 'transparent';
              });
              thumbEl.classList && thumbEl.classList.add('active');
              if (m.type === 'video') thumbEl.style.borderColor = 'var(--brand)';
            });

            thumbs.appendChild(thumbEl);
          });
        }
      }

      // Especificações
      const specs = p.specs || p.params || null;
      const rows = [];

      // 改这里：显示 Código 而不是 Modelo
      if (p.code || p.código || p.id) {
        rows.push(['Código', p.code || p.código || p.id]);
      }

      if (p.power) rows.push(['Potência', p.power]);
      if (p.colorTemp) rows.push(['Temperatura de cor', p.colorTemp]);
      if (p.cri) rows.push(['CRI', p.cri]);
      if (p.lumen) rows.push(['Lúmen', p.lumen]);

      if (specs && typeof specs === 'object') {
        for (const k of Object.keys(specs)) {
          const v = specs[k];
          rows.push([k, String(v)]);
        }
      }

      if (!rows.length) {
        rows.push(['ID', p.id || '-']);
        rows.push(['Título', p.title || '-']);
        rows.push(['Categoria', p.category || '-']);
      }

      if (specsTable) {
        specsTable.innerHTML = rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('');
      }


      // Outras infos
      const metaBits = [];
      if (p.barcode) metaBits.push(`<span class="badge">Código de barras: ${p.barcode}</span>`);
      if (p.code) metaBits.push(`<span class="badge">Código: ${p.code}</span>`);
      if (p.reference) metaBits.push(`<span class="badge">Referência: ${p.reference}</span>`);
      if (extraMeta) extraMeta.innerHTML = metaBits.join(' ');
    })
    .catch(err => {
      if (title) title.textContent = 'Falha ao carregar';
      if (desc) desc.textContent = 'Não foi possível ler products.json.';
      console.error(err);
    });
})();
