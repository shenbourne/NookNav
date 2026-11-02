# Nav Site

[![Static Badge](https://img.shields.io/badge/github-Nav--Site-181717?style=flat&logo=github&logoColor=white)
](https://github.com/shenbourne/Nav-Site)
[![Static Badge](https://img.shields.io/badge/docker-shenbourne%2Fnav--site-2496ED?style=flat&logo=docker&logoColor=white)](https://hub.docker.com/repository/docker/shenbourne/nav-site)

一个简洁美观的个人导航网站，支持分类管理、链接收藏、暗色模式等功能。基于 Vue 3 + Express 5 构建，支持 Docker 一键部署。

![![demo.png](demo/demo.png)](https://nav.shenb.net/)

demo 网页：https://nav.shenb.net/

## ✨ 功能特性

### 🏠 主页

![homepage.png](demo/homepage.png)

- **分类导航** - 支持两级分类体系（一级分类 + 二级分类），Emoji 图标选择器
- **双布局模式** - 分页模式和一栏流式布局，适配不同使用习惯
- **全局搜索** - 按标题、描述、URL 快速定位链接
- **暗色模式** - 支持亮色/暗色/跟随系统三种主题
- **悬停提示** - 鼠标悬停卡片时浮现 tooltip 显示完整标题和描述
- **点击弹窗** - 点击卡片打开详情窗口，集中展示链接信息

### ⚙️ 后台管理

![backend.png](demo/backend.png)

- **JWT 认证** - 安全的登录机制，支持密码修改
- **分类管理** - 拖拽排序、增删改一级/二级分类
- **链接管理** - 添加/编辑/删除/跨分类移动链接
- **自动获取元数据** - 输入 URL 自动抓取网站标题、描述和图标
- **本地图标库** - 从本地图标库智能匹配网站图标
- **站点设置** - 自定义站点标题、Logo，浏览器标签栏图标同步
- **数据持久化** - JSON 文件存储，备份迁移方便

### 📝 卡片编辑

![editor.png](demo/editor.png)

- **基础信息** - 标题、URL、描述（纯文本）、图标
- **支持平台** - 标记支持的平台（Windows / macOS / Linux / iOS / Android / Web）
- **图片集** - 可添加多个图片链接，支持拖拽排序
- **详细介绍** - Markdown 格式富文本编辑
- **自定义按钮** - 可添加多个自定义快捷按钮，图标集成 Simple Icons

### 🎯 卡片详情

![details.png](demo/details.png)

- **链接介绍** - 大尺寸图标 + 标题 + 概述
- **快捷访问** - "官网" + 自定义按钮
- **平台标签** - 展示支持的平台（留空时不显示）
- **图片轮播** - 图片集，支持手动翻页、自动轮播，支持多种翻页模式
- **详细介绍** - Markdown 渲染的详细介绍

## 🚀 快速开始

### 🧰 本地开发

**安装依赖**

```bash
# 后端
cd backend
npm install

# 前端
cd ../frontend
npm install
```

**启动服务**

```bash
# 启动后端 (端口 3000)
cd backend
node server.js

# 启动前端 (端口 5173)
cd frontend
npm run dev
```

访问 `http://localhost:5173` 即可使用。

**首次启动时会自动创建管理员账号**

- 用户名：`admin`
- 密码：**随机生成**，仅在同一次启动日志中打印一次

如需指定初始密码，启动前设置环境变量 `NAV_ADMIN_PASSWORD`（至少 12 个字符）。

> 认证配置文件 `backend/data/auth-config.json` 已被排除出版本控制，不再随仓库发布。

### 📦 Docker 部署

```bash
# 使用 Docker Compose 一键部署
docker compose up -d
```

``` yaml
# docker-compose.yml

services:
  nav-site:
    image: "shenbourne/nav-site:latest"
    ports:
      - "3000:3000"
    volumes:
      - ./backend/data:/app/data
    environment:
      - NAV_JWT_SECRET=${NAV_JWT_SECRET:-}   # 留空则首次启动自动生成并保存
      - NAV_ADMIN_PASSWORD=${NAV_ADMIN_PASSWORD:-}  # 仅在首次创建账号时使用
      - TRUST_PROXY=${TRUST_PROXY:-}         # 位于反向代理之后时填 1
    restart: unless-stopped
```

访问 `http://localhost:3000` 即可使用。

数据通过 volume 持久化到 `./backend/data` 目录，包括导航数据、认证配置和上传的文件。

**首次启动时会自动创建管理员账号**

- 用户名：`admin`
- 密码：**随机生成**，仅在启动日志中打印一次（或由 `NAV_ADMIN_PASSWORD` 指定）

### 🔐 安全配置

| 环境变量 | 作用 | 说明 |
|----------|------|------|
| `NAV_JWT_SECRET` | JWT 签名密钥 | 留空则自动生成 32 字节随机密钥并持久化；至少 32 字节，密钥轮换后所有旧令牌失效 |
| `NAV_ADMIN_PASSWORD` | 初始管理员密码 | 仅首次创建账号时生效，至少 12 个字符 |
| `TRUST_PROXY` | 反向代理层数 | 限流按客户端 IP 统计，部署在 Nginx 等代理后请设为 `1` |

服务启动时会自动完成以下加固，无需手工操作：

- 检测到旧版公开的签名密钥或 `admin123` 默认密码时自动轮换；
- 修改密码/用户名后递增令牌版本，已签发的旧令牌立即失效；
- 登录接口按 IP 与账号双维度限流，密码比较改为异步 bcrypt；
- 修改密码执行服务端强度校验（≥12 字符、非用户名、非常见弱口令）；
- 网页元数据抓取拒绝内网、回环、链路本地及云元数据地址，并逐个校验重定向目标；
- Logo 上传按文件头识别真实类型，仅保留 PNG/JPEG/GIF/WebP，上传目录禁止执行主动内容；
- Markdown、平台图标和自定义按钮 SVG 在渲染前统一做白名单净化。

## 🖼️ 图片本地存储

管理后台的「图片存储」提供两个独立开关：**图标本地存储默认开启，图片集本地存储默认关闭**。保存设置后，已有和后续新增、编辑的远程图片会在后台转换为 WebP；启动服务时也会补齐缺失副本。页面显示迁移进度、失败详情，并可重试失败图片。

原网址始终保留，编辑链接时可通过网址栏末尾的无边框按钮打开原图。关闭策略后恢复原网址，本地副本继续保留，再次开启时直接复用。转换失败时继续使用原图，不影响链接保存。

- 图标文件：`backend/data/uploads/icons/`，包含亮色和暗色图标，使用无损 WebP。旧有损缓存会在服务启动或迁移触发时从原网址重新生成，成功后自动切换。
- 图片集文件：`backend/data/uploads/gallery/`。
- 支持常见位图、SVG 和 ICO 输入；保留透明度及可解码的 GIF/WebP 动画。
- 单图下载上限 10 MB，解码上限 4000 万像素；仅下载 HTTP(S) 公网地址。
- Docker 沿用现有 `backend/data` 数据卷；备份时需同时保留 JSON 数据和 `uploads` 文件夹。

## 📝 链接数据结构

链接对象包含以下字段：

```json
{
  "id": "lnk_xxxxxx",
  "title": "网站标题",
  "url": "https://example.com",
  "description": "简短描述（纯文本）",
  "favicon": "https://example.com/favicon.ico",
  "platforms": ["Windows", "macOS", "Linux"],
  "imageGallery": ["https://example.com/img1.png", "https://example.com/img2.png"],
  "detailDescription": "# 详细介绍\n\n支持 **Markdown** 格式",
  "customButtons": [
    {
      "id": "btn_xxxxxx",
      "label": "文档",
      "url": "https://docs.example.com",
      "iconSlug": "gitbook",
      "iconSvg": "..."
    }
  ]
}
```

## ⚙️ 技术栈

| 模块 | 技术 |
|------|------|
| 前端框架 | Vue 3 (Composition API) |
| 状态管理 | Pinia |
| 构建工具 | Vite 7 |
| HTTP 客户端 | Axios |
| 拖拽排序 | vuedraggable |
| 后端框架 | Express 5 |
| 认证 | JWT + bcryptjs |
| 文件上传 | Multer |
| 网页解析 | Cheerio |
| 数据存储 | JSON 文件 |
| 容器化 | Docker (多阶段构建) |


## ⛓️ API 概览

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/api/categories` | 获取所有分类及链接 | 否 |
| POST | `/api/categories` | 创建一级分类 | 是 |
| PUT | `/api/categories/:id` | 更新一级分类 | 是 |
| DELETE | `/api/categories/:id` | 删除一级分类 | 是 |
| POST | `/api/categories/:catId/subcategories` | 创建二级分类 | 是 |
| POST | `/api/categories/:catId/subcategories/:subId/links` | 创建链接 | 是 |
| PUT | `/api/categories/:catId/subcategories/:subId/links/:linkId` | 更新链接 | 是 |
| POST | `/api/links/move` | 跨分类移动链接 | 是 |
| GET | `/api/settings` | 获取站点设置 | 否 |
| PUT | `/api/settings` | 更新站点设置 | 是 |
| POST | `/api/settings/logo` | 上传 Logo | 是 |
| GET | `/api/settings/image-storage` | 查询图片本地存储进度 | 是 |
| POST | `/api/settings/image-storage/retry` | 重试图片本地存储 | 是 |
| POST | `/api/fetch-meta` | 抓取网页元数据 | 是 |
| POST | `/api/auth/login` | 登录 | 否 |
| PUT | `/api/auth/password` | 修改密码 | 是 |
| PUT | `/api/auth/username` | 修改用户名 | 是 |

## 📜 许可证

本项目采用 GNU AGPLv3 协议开源。
