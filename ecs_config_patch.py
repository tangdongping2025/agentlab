import os, paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('47.97.66.45', username='root', password=os.environ['ECS_PWD'], timeout=30)
sftp = c.open_sftp()

sftp.put('backend/config.py', '/root/config.py.new')
sftp.put('backend/runtime/tools/tushare.py', '/root/tushare.py.new')
sftp.close()
print('sftp done (config.py + tushare.py)')

cmd = (
    "set -eo pipefail && "
    "docker cp /root/config.py.new context-lab:/app/backend/config.py && "
    "docker cp /root/tushare.py.new context-lab:/app/backend/runtime/tools/tushare.py && "
    "echo 'cp done' && "
    "docker exec context-lab supervisorctl restart uvicorn && "
    "sleep 6 && "
    "echo '===HEALTH===' && curl -s http://localhost/api/db/health && echo '' && "
    "echo '===TOKEN_CHECK===' && docker exec context-lab python -c 'import sys; sys.path.insert(0,\"/app/backend\"); from config import settings; print(\"TOKEN_SET\" if settings.tushare_token else \"TOKEN_MISSING\")' && "
    "echo '===INVEST===' && (curl -s http://localhost/api/agents | grep -o invest | head -1 || echo NO_INVEST)"
)
_, so, se = c.exec_command(cmd, timeout=90)
print('STDOUT:', so.read().decode())
err = se.read().decode()
if err.strip():
    print('STDERR:', err[-1500:])
print('exit:', so.channel.recv_exit_status())
c.close()
print('config patch done')
