import os, paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('47.97.66.45', username='root', password=os.environ['ECS_PWD'], timeout=30)
sftp = c.open_sftp()

sftp.put('backend-watchlist-patch.tar.gz', '/root/backend-watchlist-patch.tar.gz')
sftp.put('dist-watchlist-patch.tar.gz', '/root/dist-watchlist-patch.tar.gz')
sftp.close()
print('sftp done (backend + dist tar)')

cmd = (
    "set -eo pipefail && "
    "docker cp /root/backend-watchlist-patch.tar.gz context-lab:/tmp/backend-watchlist-patch.tar.gz && "
    "docker exec context-lab tar -xzf /tmp/backend-watchlist-patch.tar.gz -C /app/ && "
    "echo 'backend tar extracted' && "
    "docker exec context-lab supervisorctl restart uvicorn && "
    "sleep 7 && "
    "docker cp /root/dist-watchlist-patch.tar.gz context-lab:/tmp/dist-watchlist-patch.tar.gz && "
    "docker exec context-lab sh -c 'rm -rf /usr/share/nginx/html/* && tar -xzf /tmp/dist-watchlist-patch.tar.gz -C /usr/share/nginx/html/' && "
    "docker exec context-lab supervisorctl restart nginx && "
    "sleep 2 && "
    "echo '===HEALTH===' && curl -s http://localhost/api/db/health && echo '' && "
    "echo '===WATCHLIST_GET===' && curl -s http://localhost/api/db/watchlist && echo '' && "
    "echo '===INVEST_TABS===' && (curl -s http://localhost/api/agents | grep -o '自选股' | head -1 || echo NO_TAB) && "
    "echo '===WATCHLIST_API_IN_BUNDLE===' && docker exec context-lab sh -c 'grep -l watchlist /usr/share/nginx/html/assets/*.js 2>/dev/null | head -1 || echo NO_MATCH' && "
    "echo '===PIN_BTN_IN_BUNDLE===' && docker exec context-lab sh -c 'grep -l watchlist-pin-btn /usr/share/nginx/html/assets/*.js 2>/dev/null | head -1 || echo NO_MATCH'"
)
_, so, se = c.exec_command(cmd, timeout=120)
print('STDOUT:', so.read().decode())
err = se.read().decode()
if err.strip():
    print('STDERR:', err[-1500:])
print('exit:', so.channel.recv_exit_status())
c.close()
print('watchlist deploy done')
