"""ECS LLM 配置同步为 deepseek:改 supervisor app.conf 的 environment 注入 LLM_*(覆盖容器 env)。"""
import subprocess, json, os, re, tempfile

venv_py = r'D:\我的个人区间\Projects\context-lab\backend\.venv\Scripts\python.exe'
out = subprocess.check_output([venv_py, '-c',
    'from config import settings; import json; print(json.dumps({"key":settings.llm_api_key,"url":settings.llm_base_url,"model":settings.llm_model}))'],
    cwd=r'D:\我的个人区间\Projects\context-lab\backend')
cfg = json.loads(out)
key, url, model = cfg['key'], cfg['url'], cfg['model']
print(f'本地: url={url}  model={model}  key={key[:12]}...')

import paramiko
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('47.97.66.45', username='root', password=os.environ['ECS_PWD'], timeout=30)

# 1. 容器内 app.conf → 宿主机 /tmp
_, so, se = c.exec_command('docker cp context-lab:/etc/supervisor/conf.d/app.conf /tmp/app.conf && echo CP_OK', timeout=20)
print(so.read().decode())

# 2. sftp 取回 → 改 environment 行 → 传回
local_conf = os.path.join(tempfile.gettempdir(), 'app_local.conf')
sftp = c.open_sftp()
sftp.get('/tmp/app.conf', local_conf)
with open(local_conf, encoding='utf-8') as f:
    content = f.read()
new_env = f'environment=IS_SANDBOX="1",LLM_API_KEY="{key}",LLM_BASE_URL="{url}",LLM_MODEL="{model}"'
content2 = re.sub(r'^environment=.*', new_env, content, flags=re.MULTILINE)
assert content2 != content, 'environment 行未匹配到'
with open(local_conf, 'w', encoding='utf-8') as f:
    f.write(content2)
sftp.put(local_conf, '/tmp/app.conf')
sftp.close()
os.remove(local_conf)
print('app.conf 改完传回')

# 3. 宿主机 → 容器 + supervisor 重载 + 重启 uvicorn
cmd = ('docker cp /tmp/app.conf context-lab:/etc/supervisor/conf.d/app.conf && '
       'docker exec context-lab supervisorctl reread && '
       'docker exec context-lab supervisorctl update && '
       'docker exec context-lab supervisorctl restart uvicorn && '
       'sleep 6 && echo RELOADED')
_, so, se = c.exec_command(cmd, timeout=50)
print(so.read().decode())
err = se.read().decode()
if err.strip():
    print('STDERR:', err[:400])

# 4. 验证 uvicorn 进程的实际 env(不是容器 env)
_, so, se = c.exec_command(
    r'''docker exec context-lab sh -c "cat /proc/$(pgrep -f 'uvicorn main:app' | head -1)/environ | tr '\0' '\n' | grep -E '^LLM_'"''',
    timeout=20)
print('uvicorn 进程 LLM env:')
print(so.read().decode())
c.close()
