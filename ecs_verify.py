import os, paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('47.97.66.45', username='root', password=os.environ['ECS_PWD'], timeout=30)
cmds = [
    "docker exec context-lab python -c \"import sys,asyncio;sys.path.insert(0,'/app/backend');from runtime.tools.tushare import TushareTool;t=TushareTool();r=asyncio.run(t.execute(api_name='stock_basic',params={'ts_code':'600519.SH'}));print('TUSHARE_OK',r[:150])\"",
]
for cmd in cmds:
    _, so, se = c.exec_command(cmd, timeout=20)
    print('>>>', cmd)
    print(so.read().decode())
c.close()
print('verify done')
