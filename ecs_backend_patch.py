import os, paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('47.97.66.45', username='root', password=os.environ['ECS_PWD'], timeout=30)
sftp = c.open_sftp()

sftp.put('backend/runtime/base_agent.py', '/root/base_agent.py.new')
sftp.close()
print('sftp put done')

cmd = (
    'set -eo pipefail && '
    'docker cp context-lab:/app/backend/runtime/base_agent.py /root/base_agent.py.bak && '
    'echo "backup -> /root/base_agent.py.bak" && '
    'docker cp /root/base_agent.py.new context-lab:/app/backend/runtime/base_agent.py && '
    'echo "cp new base_agent.py done" && '
    'docker exec context-lab supervisorctl restart uvicorn && '
    'sleep 6 && '
    'echo "===GREP_USER_CONTENT===" && '
    'docker exec context-lab sh -c "grep -c user_content /app/backend/runtime/base_agent.py" && '
    'echo "===HEALTH===" && curl -s http://localhost/api/db/health && echo ""'
)
_, so, se = c.exec_command(cmd, timeout=90)
print('STDOUT:', so.read().decode())
err = se.read().decode()
if err.strip():
    print('STDERR:', err[-1500:])
print('exit:', so.channel.recv_exit_status())
c.close()
print('patch done')
