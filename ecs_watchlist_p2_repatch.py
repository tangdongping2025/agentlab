import os, paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('47.97.66.45', username='root', password=os.environ['ECS_PWD'], timeout=30)
sftp = c.open_sftp()
sftp.put('backend-watchlist-p2-repatch.tar.gz', '/root/backend-watchlist-p2-repatch.tar.gz')
sftp.close()
print('sftp done')
cmd = (
    "set -eo pipefail && "
    "docker cp /root/backend-watchlist-p2-repatch.tar.gz context-lab:/tmp/rep.tar.gz && "
    "docker exec context-lab tar -xzf /tmp/rep.tar.gz -C /app/ && "
    "docker exec context-lab supervisorctl restart uvicorn && "
    "sleep 7 && "
    "echo '===HEALTH===' && curl -s http://localhost/api/db/health && echo '' && "
    "echo '===ADD===' && curl -s -X POST http://localhost/api/db/watchlist -H 'Content-Type: application/json' -d '{\"ts_code\":\"600519.SH\",\"name\":\"贵州茅台\"}' >/dev/null && "
    "echo '===QUOTES===' && curl -s http://localhost/api/db/watchlist/quotes && echo '' && "
    "echo '===CLEANUP===' && curl -s -X DELETE http://localhost/api/db/watchlist/600519.SH && echo ''"
)
_, so, se = c.exec_command(cmd, timeout=120)
print('STDOUT:', so.read().decode())
err = se.read().decode()
if err.strip():
    print('STDERR:', err[-1000:])
print('exit:', so.channel.recv_exit_status())
c.close()
