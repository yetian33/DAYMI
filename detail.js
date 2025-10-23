// detail.js — lógica da página de detalhes + tema
(function () {

  const resolveAssetPath = (() => {
    if (typeof window.__DAYMI_RESOLVE_ASSET__ === 'function') {
      return window.__DAYMI_RESOLVE_ASSET__;
    }
    const { pathname } = window.location;
    let base = '';
    if (/\/produtos\//.test(pathname)) {
      base = '../';
    } else if (/\/product\//.test(pathname)) {
      const segments = pathname.split('/').filter(Boolean);
      const productIndex = segments.indexOf('product');
      if (productIndex !== -1) {
        const extra = segments.length - productIndex - 1;
        base = '../'.repeat(extra + 1);
      } else {
        base = '../';
      }
    }
    return (path = '') => {
      if (!path) return path;
      if (/^(?:[a-z]+:)?\/\//i.test(path) || path.startsWith('data:')) return path;
      let clean = path.trim();
      if (clean.startsWith('/')) clean = clean.slice(1);
      if (!clean) return base;
      return `${base}${clean}`;
    };
  })();

  // Dados
  const params = new URLSearchParams(location.search);
  let pid = params.get('id');

  if (!pid) {
    const segments = location.pathname.split('/').filter(Boolean);
    const productIndex = segments.indexOf('product');
    if (productIndex !== -1 && segments[productIndex + 1]) {
      pid = decodeURIComponent(segments[productIndex + 1]);
    }
  }

  const backLink = document.querySelector('.back');
  if (backLink) {
    // 用当前详情页 URL 里带过来的 search/cat/page 拼一个“带参首页”
    const fallback = new URL(resolveAssetPath('produtos/'), window.location.href);
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
        window.location.href = resolveAssetPath('produtos/');
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
  const downloadBtn = document.getElementById('downloadPdfBtn');

  let productData = null;
  let specsForPdf = [];
  let currentImageForPdf = null;
  let productImagesForPdf = [];
  const imageDataCache = new Map();

  if (downloadBtn) {
    downloadBtn.disabled = true;
  }

  async function resolveImageData(src) {
    if (!src) return null;

    try {
      if (src.startsWith('data:')) {
        const dimensionsFromDataUrl = await new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
          img.onerror = reject;
          img.src = src;
        });
        return { dataUrl: src, ...dimensionsFromDataUrl };
      }

      const response = await fetch(src);
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const blob = await response.blob();

      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const dimensions = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
        img.onerror = reject;
        img.src = dataUrl;
      });

      return { dataUrl, ...dimensions };
    } catch (err) {
      console.warn('Não foi possível preparar a imagem para o PDF', err);
      return null;
    }
  }

  function slugify(text) {
    return (text || 'produto')
      .toString()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'produto';
  }

  async function downloadProductPdf() {
    if (!downloadBtn) return;
    if (!productData) {
      alert('Aguarde o carregamento do produto para gerar o PDF.');
      return;
    }

    const pdfLib = window.jspdf;
    const jsPDF = pdfLib && pdfLib.jsPDF;
    if (!jsPDF) {
      alert('Biblioteca de PDF não carregada. Recarregue a página e tente novamente.');
      return;
    }

    const textSpan = downloadBtn ? downloadBtn.querySelector('span:last-child') : null;
    const originalText = textSpan ? textSpan.textContent : '';
    const originalAria = downloadBtn ? downloadBtn.getAttribute('aria-busy') : null;

    if (downloadBtn) {
      downloadBtn.setAttribute('aria-busy', 'true');
      downloadBtn.disabled = true;
      if (textSpan) textSpan.textContent = 'Gerando PDF…';
    }

    try {
      const getImageData = async (src) => {
        if (!src) return null;
        if (imageDataCache.has(src)) {
          return imageDataCache.get(src);
        }
        const data = await resolveImageData(src);
        imageDataCache.set(src, data);
        return data;
      };

      const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const marginX = 48;
      const marginY = 56;
      const bodyLineHeight = 18;
      const titleFontSize = 22;

      const titleText = productData.title || productData.id || 'Produto';
      const uniqueImages = Array.from(new Set((productImagesForPdf || []).filter(Boolean)));
      if (currentImageForPdf) {
        const existingIndex = uniqueImages.indexOf(currentImageForPdf);
        if (existingIndex > 0) {
          uniqueImages.splice(existingIndex, 1);
          uniqueImages.unshift(currentImageForPdf);
        } else if (existingIndex === -1) {
          uniqueImages.unshift(currentImageForPdf);
        }
      }

      const heroImageSrc = uniqueImages[0] || null;
      const galleryImages = uniqueImages.slice(1, 5);

      const contentWidth = pageWidth - marginX * 2;
      let cursorY = marginY;

      const logoSrc = resolveAssetPath('assets/icons/daymi-3.png');
      const logoData = await getImageData(logoSrc);
      let logoRender = null;
      if (logoData) {
        const { dataUrl: logoUrl, width: logoWidth, height: logoHeight } = logoData;
        const logoMaxWidth = contentWidth * 0.32;
        const logoMaxHeight = 96;
        const logoRatio = Math.min(logoMaxWidth / logoWidth, logoMaxHeight / logoHeight, 1);
        const drawLogoWidth = logoWidth * logoRatio;
        const drawLogoHeight = logoHeight * logoRatio;
        const logoX = marginX + (contentWidth - drawLogoWidth) / 2;
        let logoFormat = 'PNG';
        if (/image\/jpeg/i.test(logoUrl)) logoFormat = 'JPEG';
        else if (/image\/webp/i.test(logoUrl)) logoFormat = 'WEBP';
        logoRender = {
          url: logoUrl,
          format: logoFormat,
          width: drawLogoWidth,
          height: drawLogoHeight,
          x: logoX
        };
        doc.addImage(logoRender.url, logoRender.format, logoRender.x, cursorY, logoRender.width, logoRender.height);
        cursorY += logoRender.height + 32;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(titleFontSize);
      const titleMaxWidth = contentWidth;
      const titleLines = doc.splitTextToSize(titleText, titleMaxWidth);
      doc.text(titleLines, marginX, cursorY);

      const titleLineHeight = doc.getLineHeightFactor() * doc.internal.getFontSize();
      const titleBlockHeight = titleLineHeight * titleLines.length;
      cursorY += titleBlockHeight + 18;

      if (productData.category) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(14);
        doc.setTextColor(110);
        doc.text(productData.category, marginX, cursorY);
        doc.setTextColor(0);
        cursorY += 24;
      }

      const heroMaxWidth = contentWidth;
      const heroMaxHeight = pageHeight * 0.42;
      const heroTop = cursorY;
      let heroHeightDrawn = 0;

      const heroImageData = await getImageData(heroImageSrc);
      if (heroImageData) {
        const { dataUrl, width, height } = heroImageData;
        const ratio = Math.min(heroMaxWidth / width, heroMaxHeight / height, 1);
        const drawWidth = width * ratio;
        const drawHeight = height * ratio;
        const imageX = marginX + (heroMaxWidth - drawWidth) / 2;
        const imageY = heroTop;
        let format = 'JPEG';
        if (/image\/png/i.test(dataUrl)) format = 'PNG';
        else if (/image\/webp/i.test(dataUrl)) format = 'WEBP';
        doc.addImage(dataUrl, format, imageX, imageY, drawWidth, drawHeight);
        heroHeightDrawn = drawHeight;
      } else {
        const placeholderHeight = heroMaxHeight * 0.6;
        doc.setDrawColor(180);
        doc.setLineWidth(1);
        doc.roundedRect(marginX, heroTop, heroMaxWidth, placeholderHeight, 10, 10, 'D');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(12);
        doc.text('Imagem não disponível', marginX + heroMaxWidth / 2, heroTop + placeholderHeight / 2, { align: 'center' });
        heroHeightDrawn = placeholderHeight;
      }

      cursorY = heroTop + heroHeightDrawn + 32;

      const textWidth = pageWidth - marginX * 2;
      const metaLines = [
        `Categoria: ${productData.category || '—'}`,
        productData.code ? `Código: ${productData.code}` : null,
        productData.barcode ? `Código de barras: ${productData.barcode}` : null,
        productData.reference ? `Referência: ${productData.reference}` : null
      ].filter(Boolean);

      if (metaLines.length) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.text('Informações', marginX, cursorY);
        cursorY += 24;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(12);
        metaLines.forEach(line => {
          doc.text(line, marginX, cursorY);
          cursorY += bodyLineHeight;
        });

        cursorY += 10;
      }

      const descriptionText = (productData.description && productData.description.trim()) ? productData.description : '—';
      if (descriptionText) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.text('Descrição', marginX, cursorY);
        cursorY += 24;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(12);
        const descLines = doc.splitTextToSize(descriptionText, textWidth);
        descLines.forEach(line => {
          doc.text(line, marginX, cursorY);
          cursorY += bodyLineHeight;
        });

        cursorY += 10;
      }

      if (specsForPdf.length) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.text('Especificações', marginX, cursorY);
        cursorY += 24;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(12);
        specsForPdf.forEach(([k, v]) => {
          const specLines = doc.splitTextToSize(`${k}: ${v}`, textWidth);
          specLines.forEach(line => {
            doc.text(line, marginX, cursorY);
            cursorY += bodyLineHeight;
          });
          cursorY += 4;
        });
      }

      doc.addPage();

      let secondCursorY = marginY;

      if (logoRender) {
        doc.addImage(logoRender.url, logoRender.format, logoRender.x, secondCursorY, logoRender.width, logoRender.height);
        secondCursorY += logoRender.height + 32;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(titleFontSize);
      const secondTitleLines = doc.splitTextToSize(titleText, titleMaxWidth);
      doc.text(secondTitleLines, marginX, secondCursorY);
      const secondTitleLineHeight = doc.getLineHeightFactor() * doc.internal.getFontSize();
      const secondTitleBlockHeight = secondTitleLineHeight * secondTitleLines.length;
      secondCursorY += secondTitleBlockHeight + 18;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(14);
      doc.setTextColor(110);
      doc.text('Galeria complementar', marginX, secondCursorY);
      doc.setTextColor(0);

      const galleryStartY = secondCursorY + 18;
      const availableWidth = pageWidth - marginX * 2;
      const availableHeight = pageHeight - galleryStartY - marginY;
      const columns = 2;
      const gap = 24;
      const rows = Math.max(1, Math.ceil((galleryImages.length || 4) / columns));
      const cellWidth = (availableWidth - gap * (columns - 1)) / columns;
      const cellHeight = (availableHeight - gap * (rows - 1)) / rows;

      if (!galleryImages.length) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(12);
        doc.text('Imagens adicionais não disponíveis.', marginX, galleryStartY);
      } else {
        for (let i = 0; i < galleryImages.length; i++) {
          const src = galleryImages[i];
          const row = Math.floor(i / columns);
          const col = i % columns;
          const cellX = marginX + col * (cellWidth + gap);
          const cellY = galleryStartY + row * (cellHeight + gap);

          const imgData = await getImageData(src);
          if (imgData) {
            const { dataUrl, width, height } = imgData;
            const ratio = Math.min(cellWidth / width, cellHeight / height, 1);
            const drawWidth = width * ratio;
            const drawHeight = height * ratio;
            const offsetX = cellX + (cellWidth - drawWidth) / 2;
            const offsetY = cellY + (cellHeight - drawHeight) / 2;
            let format = 'JPEG';
            if (/image\/png/i.test(dataUrl)) format = 'PNG';
            else if (/image\/webp/i.test(dataUrl)) format = 'WEBP';
            doc.addImage(dataUrl, format, offsetX, offsetY, drawWidth, drawHeight);
          } else {
            doc.setDrawColor(200);
            doc.setLineWidth(1);
            doc.rect(cellX, cellY, cellWidth, cellHeight, 'D');
          }
        }
      }

      const filename = `${slugify(titleText)}.pdf`;
      doc.save(filename);
    } catch (err) {
      console.error('Erro ao gerar PDF do produto', err);
      alert('Não foi possível gerar o PDF. Tente novamente.');
    } finally {
      if (downloadBtn) {
        if (textSpan) textSpan.textContent = originalText;
        if (originalAria === null) downloadBtn.removeAttribute('aria-busy');
        else downloadBtn.setAttribute('aria-busy', originalAria);
        downloadBtn.disabled = false;
      }
    }
  }

  if (downloadBtn) {
    downloadBtn.addEventListener('click', downloadProductPdf);
  }

  if (!pid) {
    if (title) title.textContent = 'ID do produto não informado';
    if (desc) desc.textContent = 'Acesse este detalhe clicando em um produto na página inicial.';
    if (mainImage) mainImage.alt = 'Sem produto';
    return;
  }

  fetch(resolveAssetPath('products.json'))
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
      const imgs = (Array.isArray(p.images) && p.images.length ? p.images : (p.image ? [p.image] : []))
        .map(src => resolveAssetPath(src));
      const vids = (Array.isArray(p.videos) ? p.videos : (p.video ? [p.video] : []))
        .map(src => resolveAssetPath(src));
      const posters = (Array.isArray(p.videoPosters) ? p.videoPosters : (p.videoPoster ? [p.videoPoster] : []))
        .map(src => resolveAssetPath(src));

      const media = [
        ...imgs.map((src) => ({ type: 'img', src })),
        ...vids.map((src, i) => ({ type: 'video', src, poster: posters[i] || posters[0] }))
      ];

      productImagesForPdf = Array.from(new Set(imgs.filter(Boolean)));

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
        currentImageForPdf = src;
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
        currentImageForPdf = null;
        if (mainImage) mainImage.alt = 'Sem imagem';
      } else {
        // 默认优先显示图片；没有图片时显示第一个视频
        const first = media[0].type === 'img' ? media[0] : (media.find(m => m.type === 'img') || media[0]);
        const firstImg = media.find(m => m.type === 'img');
        currentImageForPdf = firstImg ? firstImg.src : (first.type === 'img' ? first.src : null);
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
                currentImageForPdf = m.src;
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

      productData = p;
      specsForPdf = rows.map(([k, v]) => [k, String(v)]);
      if (downloadBtn) {
        downloadBtn.disabled = false;
        downloadBtn.removeAttribute('aria-busy');
      }
    })
    .catch(err => {
      if (title) title.textContent = 'Falha ao carregar';
      if (desc) desc.textContent = 'Não foi possível ler products.json.';
      productData = null;
      specsForPdf = [];
      productImagesForPdf = [];
      if (downloadBtn) {
        downloadBtn.disabled = true;
        downloadBtn.removeAttribute('aria-busy');
      }
      console.error(err);
    });
})();
