#!/bin/sh
set -e

# prisma migrate deploy——不是 db push、不是 migrate dev：非交互、生产安全，
# 应用 prisma/migrations/ 里已有的迁移，DB 已是最新时是空操作，重启/重新
# 部署（没有新迁移）重复跑这一步是安全的。
npx prisma migrate deploy

exec node server.js
