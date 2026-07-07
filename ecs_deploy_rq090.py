import os, paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('47.97.66.45', username='root', password=os.environ['ECS_PWD'], timeout=30)
sftp = c.open_sftp()

sftp.put('backend-patch-rq090.tar.gz', '/root/backend-patch-rq090.tar.gz')
sftp.put('dist-patch-rq090.tar.gz', '/root/dist-patch-rq090.tar.gz')
sftp.close()
print('sftp done')

cmd = (
    "set -eo pipefail && "
    "docker cp /root/backend-patch-rq090.tar.gz context-lab:/tmp/backend-patch-rq090.tar.gz && "
    "docker exec context-lab tar -xzf /tmp/backend-patch-rq090.tar.gz -C /app/ && "
    "echo 'backend tar extracted' && "
    "docker exec context-lab supervisorctl restart uvicorn && "
    "sleep 7 && "
    "docker cp /root/dist-patch-rq090.tar.gz context-lab:/tmp/dist-patch-rq090.tar.gz && "
    "docker exec context-lab sh -c 'rm -rf /usr/share/nginx/html/* && tar -xzf /tmp/dist-patch-rq090.tar.gz -C /usr/share/nginx/html/' && "
    "docker exec context-lab supervisorctl restart nginx && "
    "sleep 2 && "
    "echo '===HEALTH===' && curl -s http://localhost/api/db/health && echo '' && "
    "echo '===WATCHLIST===' && curl -s http://localhost/api/db/watchlist && echo '' && "
    "echo '===STOCK_DETAIL===' && curl -s --max-time 60 http://localhost/api/db/watchlist/stock-detail/600519.SH | head -c 300 && echo '' && "
    "echo '===DONE==='"
)
_, so, se = c.exec_command(cmd, timeout=180)
print('STDOUT:', so.read().decode())
err = se.read().decode()
if err.strip():
    print('STDERR:', err[-1500:])
print('exit:', so.channel.recv_exit_status())
c.close()
print('rq090 deploy done')
