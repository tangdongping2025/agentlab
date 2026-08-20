import os, tarfile, paramiko

PWD = os.environ['ECS_PWD']
HOST = '47.97.66.45'

# 1. 打包前端 dist
with tarfile.open('dist-patch-kline.tar.gz', 'w:gz') as t:
    t.add('dist', arcname='dist')
print('dist tar done')

# 2. 打包后端 watchlist.py(保留容器内路径)
with tarfile.open('backend-patch-kline.tar.gz', 'w:gz') as t:
    t.add('backend/routers/watchlist.py', arcname='backend/routers/watchlist.py')
print('backend tar done')

# 3. 连接 ECS
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username='root', password=PWD, timeout=30)
sftp = c.open_sftp()
c.exec_command('mkdir -p /root/build')[1].channel.recv_exit_status()
sftp.put('dist-patch-kline.tar.gz', '/root/build/dist-patch-kline.tar.gz')
sftp.put('backend-patch-kline.tar.gz', '/root/build/backend-patch-kline.tar.gz')

# Dockerfile.patch 同时换前端 dist 和后端 watchlist.py,一次 build 到位
dockerfile = (
    "FROM context-lab:latest\n"
    "RUN rm -rf /usr/share/nginx/html/*\n"
    "COPY dist/ /usr/share/nginx/html/\n"
    "COPY backend/routers/watchlist.py /app/backend/routers/watchlist.py\n"
)
with sftp.open('/root/build/Dockerfile.patch', 'w') as f:
    f.write(dockerfile)
sftp.close()
print('sftp done')

# 4. 解压 → rollback tag → build 新镜像 → force-recreate
cmd = (
    "set -eo pipefail && "
    "cd /root/build && "
    "tar -xzf dist-patch-kline.tar.gz && "
    "tar -xzf backend-patch-kline.tar.gz && "
    "echo '===CTX===' && ls -la dist/index.html backend/routers/watchlist.py && "
    "docker tag context-lab:latest context-lab:rollback && "
    "echo 'rollback tagged' && "
    "docker build -f Dockerfile.patch -t context-lab:latest . && "
    "cd /root && docker compose up -d --no-deps --force-recreate context-lab && "
    "sleep 6 && "
    "echo '===HEALTH===' && curl -s http://localhost/api/db/health && echo '' && "
    "echo '===INDEXJS===' && curl -s http://localhost/ | grep -oE 'index-[A-Za-z0-9_-]+\\.js' | head -1 && "
    "echo '===KLINE===' && curl -s --max-time 60 'http://localhost/api/db/watchlist/stock-detail/600519.SH/kline?limit=5' | head -c 500 && echo '' && "
    "echo '===DONE==='"
)
_, so, se = c.exec_command(cmd, timeout=600)
print('STDOUT:', so.read().decode())
err = se.read().decode()
if err.strip():
    print('STDERR:', err[-2500:])
print('exit:', so.channel.recv_exit_status())
c.close()
print('kline deploy done')
