import os, paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('47.97.66.45', username='root', password=os.environ['ECS_PWD'], timeout=30)
sftp = c.open_sftp()

sftp.put('dist-patch.tar.gz', '/root/dist-patch.tar.gz')
sftp.close()
print('sftp done')

# 不走 Dockerfile.patch + force-recreate(会从镜像起新容器,丢掉 docker cp 的 invest 后端代码)
# 改:docker cp dist → 解压到 nginx html → supervisorctl restart nginx(只重启 nginx 进程,容器不动)
cmd = (
    "set -eo pipefail && "
    "docker cp /root/dist-patch.tar.gz context-lab:/tmp/dist-patch.tar.gz && "
    "docker exec context-lab sh -c 'rm -rf /usr/share/nginx/html/* && tar -xzf /tmp/dist-patch.tar.gz -C /usr/share/nginx/html/' && "
    "docker exec context-lab supervisorctl restart nginx && "
    "echo 'dist deployed + nginx restarted' && "
    "sleep 2 && "
    "echo '===HEALTH===' && curl -s http://localhost/api/db/health && echo '' && "
    "echo '===INVEST_STILL_THERE===' && (curl -s http://localhost/api/agents | grep -o invest | head -1 || echo NO_INVEST) && "
    "echo '===LASTAGENT_IN_BUNDLE===' && docker exec context-lab sh -c 'grep -rl lastAgentId /usr/share/nginx/html/assets/*.js 2>/dev/null | head -1 || echo NO_MATCH'"
)
_, so, se = c.exec_command(cmd, timeout=90)
print('STDOUT:', so.read().decode())
err = se.read().decode()
if err.strip():
    print('STDERR:', err[-1500:])
print('exit:', so.channel.recv_exit_status())
c.close()
print('frontend patch done')
