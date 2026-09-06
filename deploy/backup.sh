#!/bin/sh
set -e

# Plan 6 Task 6——这台 VM 上现有的 Postgres 实例都没有备份（design spec
# §12.5 明确指出的已知缺口），这个项目不该重蹈。用 deploy 用户的 crontab
# 每天调一次，不是常驻 sidecar 容器：只是定期往已经在跑的 db 容器里
# shell 一下，不引入新的常驻进程（跟"后端保持无状态"是同一个精神，
# 见 design spec §10.3a）。

COMPOSE_DIR=/home/deploy/justsayit
BACKUP_DIR="${COMPOSE_DIR}/backups"
STAMP=$(date +%Y%m%d-%H%M%S)

cd "${COMPOSE_DIR}"
# POSTGRES_USER/POSTGRES_DB 不再硬编码——从同目录的 .env 读（CI 每次部署
# 都会重新生成这份文件，跟 docker-compose.yml 用的是同一份数据源）。
. ./.env

# `docker compose exec`（服务名），不是 `docker exec`（容器名）——compose
# 没给这个服务设 container_name，实际容器名会带 compose 项目名前缀
# （比如 justsayit-justsayit-db-1），硬编码服务名以外的名字大概率对不上。
# -T 关掉伪 TTY 分配：cron 里没有附着的 TTY，且往 gzip 管道里写二进制/
# 文本输出时开着 TTY 分配有干扰输出的已知风险。
docker compose exec -T justsayit-db pg_dump -U "${POSTGRES_USER}" "${POSTGRES_DB}" \
  | gzip > "${BACKUP_DIR}/justsayit-${STAMP}.sql.gz"

# 只留最近 14 份每日备份，更早的删掉。
find "${BACKUP_DIR}" -name 'justsayit-*.sql.gz' -mtime +14 -delete
