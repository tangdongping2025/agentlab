import os, paramiko

token = None
with open('backend/.env', encoding='utf-8') as f:
    for line in f:
        s = line.strip()
        if s.startswith('TUSHARE_TOKEN='):
            token = s.split('=', 1)[1].strip().strip('"').strip("'")
            break
if not token:
    raise SystemExit('TUSHARE_TOKEN not found in backend/.env')
print('token loaded (masked)')

env_content = f'TUSHARE_TOKEN={token}\n'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('47.97.66.45', username='root', password=os.environ['ECS_PWD'], timeout=30)
sftp = c.open_sftp()

sftp.put('invest-patch.tar.gz', '/root/invest-patch.tar.gz')
with sftp.open('/root/backend.env', 'w') as f:
    f.write(env_content)
sftp.close()
print('sftp done (tar + .env)')

cmd = (
    "set -eo pipefail && "
    "docker cp /root/invest-patch.tar.gz context-lab:/tmp/invest-patch.tar.gz && "
    "docker exec context-lab tar -xzf /tmp/invest-patch.tar.gz -C /app/ && "
    "echo 'tar extracted' && "
    "docker cp /root/backend.env context-lab:/app/backend/.env && "
    "echo '.env cp done' && "
    "docker exec context-lab supervisorctl restart uvicorn && "
    "sleep 6 && "
    "echo '===HEALTH===' && curl -s http://localhost/api/db/health && echo '' && "
    "echo '===INVEST_IN_AGENTS===' && (curl -s http://localhost/api/agents | grep -o invest | head -1 || echo NO_INVEST) && "
    "echo '===TUSHARE_TOKEN===' && docker exec context-lab sh -c '[ -n \"$TUSHARE_TOKEN\" ] && echo TOKEN_SET || echo TOKEN_MISSING' && "
    "echo '===INVEST_FILE===' && docker exec context-lab ls -la /app/backend/agents/invest_agent.py && "
    "echo '===TUSHARE_TOOL===' && docker exec context-lab ls -la /app/backend/runtime/tools/tushare.py && "
    "echo '===SKILL_DIR===' && docker exec context-lab ls /app/backend/skills/tushare-data/ && "
    "echo '===USER_CONTENT===' && docker exec context-lab sh -c 'grep -c user_content /app/backend/runtime/base_agent.py'"
)
_, so, se = c.exec_command(cmd, timeout=90)
print('STDOUT:', so.read().decode())
err = se.read().decode()
if err.strip():
    print('STDERR:', err[-1500:])
print('exit:', so.channel.recv_exit_status())
c.close()
print('invest patch done')
