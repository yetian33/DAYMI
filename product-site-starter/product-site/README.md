# 静态产品展示站（VS Code 入门）

## 快速启动
1. 安装 VS Code 与扩展：**Live Server**。
2. 下载本项目到本地，使用 VS Code 打开文件夹。
3. 右键 `index.html` → **Open with Live Server**（或在状态栏点击“Go Live”）。
4. 浏览器自动打开 `http://127.0.0.1:5500/`（端口以你的环境为准）。

## 结构
```
product-site/
├─ index.html        # 页面结构（HTML）
├─ styles.css        # 样式（CSS）
├─ script.js         # 交互逻辑（JS：搜索/分类/弹窗/主题）
├─ products.json     # 产品数据（可直接编辑或由后台导出）
└─ assets/
   └─ images/        # 产品图片（放 jpg/png/webp）
```

## 修改产品
- 编辑 `products.json`，新增/修改产品条目（图片路径放在 `assets/images/`）。
- 推荐把图片压缩为 1200px 宽以内，格式用 `webp` 更省流量。

## 部署（任选其一）
- **GitHub Pages**：仓库 → Settings → Pages → Source 选 `main` 分支根目录。几分钟后得到公网网址。
- **Netlify**：拖拽整个文件夹到 app.netlify.com，自动部署，支持自定义域名。
- **Vercel**：新建项目，导入仓库，一键部署。

## 自定义
- 替换 `index.html` 里的标题与描述。
- 在 `styles.css` 里微调主题色、字体与卡片风格。
- 如需多语言，可在 `products.json` 中加入 `title_zh`, `title_pt` 等字段，自行在 `script.js` 选择显示。
