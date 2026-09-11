# syntax=docker/dockerfile:1
#
# Plan 6 Task 2 — multi-stage build for arm64 (Oracle VM, Ampere A1).
# Base image pinned to node:24-alpine to match package.json's
# `engines.node: ">=24 <25"` exactly.

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# 必须先生成 Prisma client 再 build——服务端代码从 src/generated/prisma
# import，build 时就要能解析到，不是运行时才需要。
# EN: Prisma client must be generated before build — server code imports from
# src/generated/prisma, and that import needs to resolve at build time, not
# just at runtime.
RUN npx prisma generate
# next.config.ts 里有详细注释：build 脚本已经带 --webpack，不能删——
# Serwist 的 injectManifest 只在 webpack 编译管线里跑，Turbopack 下
# public/sw.js 不会被重新生成，PWA 会静默失去可安装性/离线能力。
# EN: See next.config.ts for the full explanation — the build script already
# carries --webpack, don't remove it. Serwist's injectManifest only runs in the
# webpack pipeline; under Turbopack public/sw.js wouldn't be regenerated and the
# PWA would silently lose installability/offline support.
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# Next standalone server.js 默认可能只监听 localhost——显式绑定到
# 0.0.0.0，否则容器外（同一个 Docker 网络里的 Caddy）连不到它。
# EN: The Next standalone server.js may default to listening on localhost only —
# bind explicitly to 0.0.0.0, otherwise anything outside the container (Caddy on
# the same Docker network) can't reach it.
ENV HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001 -G nodejs

# Next.js standalone 产物：自包含的 server.js + 按依赖追踪裁剪过的
# node_modules。static 资源和 public/ 目录 standalone 不会自动带，
# 必须手动拷贝到 server.js 期望的相对路径。
# EN: Next.js standalone output is a self-contained server.js plus a
# dependency-trace-pruned node_modules. Static assets and public/ aren't
# included automatically — they must be copied by hand to the relative paths
# server.js expects.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

# 已知坑（design spec §12.5）：standalone 的依赖追踪不会带上 Prisma CLI
# （没有任何应用代码 import 它，只是被当命令行工具调用）也不会带上
# schema.prisma/migrations——启动时执行的 `prisma migrate deploy` 两样都
# 要用到。CLI 自己还有一整棵依赖树（@prisma/engines、@prisma/config、
# mysql2、postgres 等）——试过从 build 阶段只挑 node_modules/prisma 一个
# 目录复制，运行时报 `Cannot find module './cli.js'`（CLI 的依赖没跟着
# 一起来）。改成在这一层单独装一份；版本号从仓库自己的 package.json 动态
# 取（拷到 /tmp 读完就丢，不覆盖 standalone 产物自带的那份 /app/package.json——
# 两者字段不一定一致，覆盖有风险），不在 Dockerfile 里硬编码第二份版本号、
# 免得升级时忘记同步。
# EN: Known pitfall (design spec §12.5): standalone's dependency trace doesn't
# pull in the Prisma CLI (no application code imports it — it's only ever
# invoked as a command-line tool), nor schema.prisma/migrations — both are
# needed by the `prisma migrate deploy` run at container start. The CLI has its
# own dependency tree (@prisma/engines, @prisma/config, mysql2, postgres, etc.)
# — copying just node_modules/prisma from the build stage was tried and failed
# at runtime with `Cannot find module './cli.js'` (the CLI's own deps didn't
# come along). Installing a separate copy in this layer instead; the version is
# read dynamically from the repo's own package.json (copied to /tmp, read, then
# discarded — deliberately not overwriting the /app/package.json that ships
# with the standalone output, since the two don't necessarily agree field-for-
# field and overwriting it would be risky). Version is not hardcoded a second
# time in the Dockerfile, so it can't drift out of sync on upgrade.
COPY package.json /tmp/package.json
RUN PRISMA_VERSION=$(node -p "require('/tmp/package.json').devDependencies.prisma") \
  && DOTENV_VERSION=$(node -p "require('/tmp/package.json').devDependencies.dotenv") \
  && npm install --no-save "prisma@${PRISMA_VERSION}" "dotenv@${DOTENV_VERSION}" \
  && rm /tmp/package.json
# prisma.config.ts（仓库根目录，不在 prisma/ 里）——CLI 靠它拿 DATABASE_URL：
# schema.prisma 的 datasource 块故意没写 url（应用运行时走 driver adapter，
# 见 src/lib/server/db.ts 的注释），migrate deploy 等 CLI 命令走的是这份
# 独立配置，缺了这个文件会报 "datasource.url property is required"。
# 它 `import 'dotenv/config'`，容器里没有 .env 文件会静默跳过，不报错，
# 但 dotenv 这个包本身必须能 resolve，所以上一步一并装了它。
# EN: prisma.config.ts (repo root, not under prisma/) is how the CLI gets
# DATABASE_URL: schema.prisma's datasource block deliberately omits url (the
# app uses a driver adapter at runtime instead — see the comment in
# src/lib/server/db.ts), and CLI commands like migrate deploy go through this
# separate config. Missing this file fails with "datasource.url property is
# required". It does `import 'dotenv/config'`, which silently no-ops if there's
# no .env file in the container — but the dotenv package itself still has to
# resolve, hence installing it in the previous step too.
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/prisma ./prisma
# src/generated/prisma 同理显式拷贝一份，不假设 webpack 打包一定完整
# 内联了它引用的所有文件。
# EN: src/generated/prisma is copied explicitly for the same reason — don't
# assume the webpack bundle necessarily inlined every file it references.
COPY --from=build /app/src/generated/prisma ./src/generated/prisma

COPY deploy/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && chown -R nextjs:nodejs /app

USER nextjs
EXPOSE 3000

# wget 是 alpine busybox 自带的，不需要额外装包。用 127.0.0.1 而不是
# localhost——实测过，alpine 的 wget 在容器内解析 localhost 会先取 ::1
# （IPv6），应用只绑了 IPv4 的 0.0.0.0，会拿到 "Connection refused"，
# 即使从宿主机通过端口映射访问完全正常（Docker 的端口转发直接打 IPv4，
# 不经过容器内部的 localhost 解析）。
# EN: wget ships with alpine's busybox, no extra package needed. Using
# 127.0.0.1 instead of localhost — verified in practice that alpine's wget
# resolves localhost to ::1 (IPv6) first inside the container, while the app
# only binds IPv4 0.0.0.0, producing "Connection refused" — even though
# accessing it from the host via port mapping works fine (Docker's port
# forwarding hits IPv4 directly, bypassing the container's internal localhost
# resolution).
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
