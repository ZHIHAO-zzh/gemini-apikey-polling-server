# ================================
# 阶段 1: 构建前端和后端
# ================================
FROM node:20-slim AS builder

WORKDIR /app

# 安装构建依赖
COPY package*.json ./
RUN npm ci

# 复制源码
COPY . .

# 构建前端与后端
RUN npm run build

# ================================
# 阶段 2: 生产运行环境
# ================================
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DATA_DIR=/app/data

# 只安装生产依赖
COPY package*.json ./
RUN npm ci --only=production

# 从构建阶段复制编译产物
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

# 创建持久化数据目录挂载点
RUN mkdir -p /app/data

EXPOSE 3000

VOLUME ["/app/data"]

CMD ["node", "dist/index.js"]
