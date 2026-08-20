import os, paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('47.97.66.45', username='root', password=os.environ['ECS_PWD'], timeout=30)

cmds = [
    'docker ps --format "{{.Names}} {{.Status}}"',
    'docker exec context-lab ls -la /app/backend/runtime/base_agent.py 2>&1',
    'docker exec context-lab supervisorctl status 2>&1',
    'docker exec context-lab sh -c "grep -c user_content /app/backend/runtime/base_agent.py || echo NO_USER_CONTENT"',
    'docker exec context-lab sh -c "grep -n \\"messages.append(LLMMessage(role=.user.\\" /app/backend/runtime/base_agent.py"',
]
for cmd in cmds:
    _, so, se = c.exec_command(cmd, timeout=30)
    print('>>>', cmd)
    print(so.read().decode())
    err = se.read().decode()
    if err.strip():
        print('ERR:', err[:500])
c.close()
print('check done')
