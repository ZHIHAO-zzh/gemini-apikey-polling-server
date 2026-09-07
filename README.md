# ⚡ Google Gemini API Key 严格持久化轮询与负载均衡网关

> 一款基于 **Node.js + SQLite (WAL) + Fastify + Vue 3 (Material Design 3)** 全栈打造的 Google Gemini 官方原生 API Key 智能轮询负载均衡网关系统。

---

## ✨ 核心特性

- 🔄 **严格持久化状态轮询 (Strict Persistent Round-Robin)**
  - 区别于普通内存轮询，每次请求调用的 API Key 游标都会**实时持久化写入 SQLite 数据库**。
  - 无论间隔数秒还是数天，亦或系统遭遇重启，下一个进入的请求**绝对接续上一次的下一个 Key**，绝不重置回第一个。
- 🎯 **单 Key 停留配额控制 (Per-Key Usage Quota per Turn)**
  - 支持配置每个 Key 在当前轮询停留期间**累计正常成功调用 N 次后**才切换至下一个 Key（默认为 `1`）。
  - 中间若遇到客户端业务报错（如 400 参数错误）不浪费成功配额，确保多 Key 负载绝对均衡。
- 🛡️ **智能故障转移与冷却保护 (Failover & Auto-Cooldown)**
  - 遇到 `429 Too Many Requests / Quota Exceeded` 或网络故障时，自动在重试上限内切换下一个有效 Key 重试。
  - 触发限流或达到连续错误阈值的 Key 自动进入冷却倒计时，冷却结束后无感自动恢复。
- 🎨 **清新简约 Material 3 (MD3) 设计控制台**
  - **总览概览**：实时展示吞吐量、成功率、活跃 Key 数量、平均延迟与首字延迟 (TTFT)、24小时时序图与模型调用占比。
  - **Key 池管理**：纯数字 ID 编号（`Key #1`, `Key #2`...），支持单条添加、**批量多行文本直接粘贴导入**、脱敏展示、单 Key 连通性测试与延迟测定、一键解冻重置。
  - **请求审计日志**：自动实时刷新，清晰展示每次调用分配的 Key ID、请求时间、模型、状态码、首字 TTFT 延迟、总耗时、重试次数、客户端 IP 及上游错误明细。
- 🌐 **100% 纯粹 Google 官方原生协议**
  - 纯透明流式转发 Google Generative Language 官方 API（支持 `/v1beta/models/...:generateContent`、`:streamGenerateContent`、`/v1beta/models`、`/v1/...`、`/gemini/...`）。
  - 原生完整保留 `thought_signature`（思维签名）、Thinking Process（思维链打字机）、Tool Calling（多轮工具调用）、多模态与长上下文，零协议损耗，无缝对接各类 Coding Agent。
- 🔌 **网络代理支持 (Proxy)**
  - 内置 HTTP / HTTPS / SOCKS5 代理配置与连通性测试，方便国内网络无障碍访问 Google API。
- 🔒 **安全保护**
  - 可选 Master Gateway Token 保护对外网关。
  - 可选管理员密码保护 Web 控制台。
- 🐳 **Docker Compose 一键启动**
  - 零外部数据库依赖（自带 WAL 模式高性能 SQLite），一条命令开箱即用。

---

## 🚀 快速启动

### 方式一：使用 Docker 远程预构建镜像（最推荐，免本地编译）

无需安装 Node.js 环境，直接使用已打包好的远程镜像启动：

```bash
docker compose -f docker-compose.remote.yml up -d
```

---

### 方式二：本地 Docker 源码构建启动

如果你想在本地基于源码构建镜像运行：

```bash
docker compose up -d --build
```

启动完成后：
- **Web 管理控制台**：浏览器访问 `http://localhost:3000/`
- **Gemini API 代理地址**：`http://localhost:3000/v1beta/...`

> 数据库文件会自动持久化保存在当前目录下的 `./data` 文件夹中。

---

### 方式三：本地 Node.js 源码启动

需要 Node.js 18+ 或 20+：

```bash
# 1. 安装依赖
npm install

# 2. 构建前端与后端
npm run build

# 3. 启动生产服务
npm start
```

#### 本地全栈开发模式 (支持热重载)：
```bash
npm run dev
```

---

## 💻 客户端与 Coding Agent 接入示例

你可以直接将任何现有的 Gemini 客户端、SDK 或 Coding Agent 接入本网关。

### 1. cURL / 原生 HTTP 请求

```bash
# 生成文本 / 多模态调用
curl http://localhost:3000/v1beta/models/gemini-2.5-flash:generateContent \
  -H "Content-Type: application/json" \
  -H "x-goog-api-key: YOUR_GATEWAY_TOKEN" \
  -d '{
    "contents": [{"parts": [{"text": "你好，Gemini！"}]}]
  }'

# 获取可用模型列表
curl http://localhost:3000/v1beta/models \
  -H "x-goog-api-key: YOUR_GATEWAY_TOKEN"
```

---

### 2. Python 官方 SDK (`google-generativeai` / `google-genai`)

```python
import google.generativeai as genai

# 将 api_endpoint 指向你的网关地址
genai.configure(
    api_key="YOUR_GATEWAY_TOKEN",  # 若网关未设置 Master Token 可填任意字符
    client_options={"api_endpoint": "localhost:3000"}
)

model = genai.GenerativeModel("gemini-2.5-flash")
response = model.generate_content("讲一个简短的程序员笑话")
print(response.text)
```

---

### 3. Node.js 官方 SDK (`@google/genai` / `@google/generative-ai`)

```typescript
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI("YOUR_GATEWAY_TOKEN");
const model = genAI.getGenerativeModel(
  { model: "gemini-2.5-flash" },
  { baseUrl: "http://localhost:3000" }
);

const result = await model.generateContent("你好！");
console.log(result.response.text());
```

---

### 4. Coding Agent（Pi / Cline / RooCode / Cursor / Aider / LobeChat 等）

在各类支持 Google Gemini 的客户端中：
- **Provider / 模型供应商**：选择 **Google Gemini**（或 Google Generative AI）；
- **API Key**：填入你在系统设置中配置的 `Gateway Master Token`（未设置可填任意字符）；
- **Base URL / API Endpoint**：填入 `http://localhost:3000`（或 `http://localhost:3000/v1beta`）。

---

## ⚙️ 环境变量与高级配置

在 `docker-compose.yml` 或 `.env` 中可配置以下环境变量：

| 环境变量 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `PORT` | `3000` | 网关服务监听端口 |
| `HOST` | `0.0.0.0` | 监听主机地址 |
| `DATA_DIR` | `./data` | SQLite 数据库文件持久化目录 |
| `GATEWAY_TOKEN` | 留空 | 客户端调用网关必须提供的 Master 密钥（留空则公开无鉴权） |
| `ADMIN_PASSWORD` | 留空 | Web 控制台管理员登录密码（留空则免密） |
| `PROXY_URL` | 留空 | 上游代理（支持 `http://127.0.0.1:7890` 或 `socks5://...`） |

在 Web 控制台的 **“系统设置”** 页面中，你可以随时热更新以下运行参数：
- **严格持久化轮询开关**：开启/关闭严格游标持久化。
- **单 Key 停留成功调用次数 (停留配额)**：轮询到某个 Key 时，必须累计正常成功调用 N 次后才切换至下一个 Key（默认 `1` 次）。
- **最大重试次数 (Max Retries)**：遇到 429 或网络错误时同一请求的最大故障转移重试次数（默认 `3` 次）。
- **限流冷却时长 (Cooldown Duration)**：触发 429 后的 Key 冻结冷却秒数（默认 `60` 秒）。
- **连续错误阈值 (Error Threshold)**：单个 Key 连续错误达到指定次数后自动进入冷却保护。
- **日志保留天数**：过期请求审计日志定时自动清理。

---

## 📂 项目结构

```
├── Dockerfile                  # 多阶段轻量生产 Docker 镜像构建
├── docker-compose.yml          # 一键部署编排文件
├── .gitignore                  # Git 忽略规则
├── src/                        # 后端 Fastify + SQLite 服务源码
│   ├── index.ts                # 服务入口与定时调度
│   ├── config.ts               # 配置与环境变量解析
│   ├── db/                     # SQLite 数据库初始化与 WAL 模式仓库
│   ├── services/
│   │   ├── key-pool.ts         # 严格持久化状态轮询调度、单Key停留配额与冷却计算
│   │   └── proxy-forwarder.ts  # Google Gemini 官方 API 原生透明转发、流式处理与重试
│   ├── routes/                 # 代理转发与管理后台 API 路由
│   └── middlewares/            # 鉴权中间件
└── web/                        # Vue 3 + Tailwind CSS + Material 3 风格管理后台
    ├── src/
    │   ├── views/              # 概览仪表盘、Key池管理、审计日志、系统设置
    │   └── api/                # 前后端交互 API 封装
    └── vite.config.ts          # Vite 构建配置
```

---

## 📄 开源许可证

本项目基于 [MIT License](LICENSE) 开源发布。
