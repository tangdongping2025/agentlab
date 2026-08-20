import os, paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('47.97.66.45', username='root', password=os.environ['ECS_PWD'], timeout=30)
sftp = c.open_sftp()

sftp.put('backend-watchlist-p2-patch.tar.gz', '/root/backend-watchlist-p2-patch.tar.gz')
sftp.put('dist-watchlist-p2-patch.tar.gz', '/root/dist-watchlist-p2-patch.tar.gz')
sftp.close()
print('sftp done (backend + dist)')

cmd = (
    "set -eo pipefail && "
    "docker cp /root/backend-watchlist-p2-patch.tar.gz context-lab:/tmp/backend-watchlist-p2-patch.tar.gz && "
    "docker exec context-lab tar -xzf /tmp/backend-watchlist-p2-patch.tar.gz -C /app/ && "
    "echo 'backend tar extracted' && "
    "docker exec context-lab supervisorctl restart uvicorn && "
    "sleep 7 && "
    "docker cp /root/dist-watchlist-p2-patch.tar.gz context-lab:/tmp/dist-watchlist-p2-patch.tar.gz && "
    "docker exec context-lab sh -c 'rm -rf /usr/share/nginx/html/* && tar -xzf /tmp/dist-watchlist-p2-patch.tar.gz -C /usr/share/nginx/html/' && "
    "docker exec context-lab supervisorctl restart nginx && "
    "sleep 2 && "
    "echo '===HEALTH===' && curl -s http://localhost/api/db/health && echo '' && "
    "echo '===QUOTES_EMPTY===' && curl -s http://localhost/api/db/watchlist/quotes && echo '' && "
    "echo '===ADD_TEST===' && curl -s -X POST http://localhost/api/db/watchlist -H 'Content-Type: application/json' -d '{\"ts_code\":\"600519.SH\",\"name\":\"贵州茅台\"}' && echo '' && "
    "echo '===QUOTES_REAL===' && curl -s http://localhost/api/db/watchlist/quotes && echo '' && "
    "echo '===QUOTES_REFRESH===' && curl -s 'http://localhost/api/db/watchlist/quotes?refresh=true' | head -c 300 && echo '' && "
    "echo '===CLEANUP===' && curl -s -X DELETE http://localhost/api/db/watchlist/600519.SH && echo ''"
)
_, so, se = c.exec_command(cmd, timeout=120)
print('STDOUT:', so.read().decode())
err = se.read().decode()
if err.strip():
    print('STDERR:', err[-1500:])
print('exit:', so.channel.recv_exit_status())
c.close()
print('p2 deploy done')
