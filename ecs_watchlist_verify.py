import os, paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('47.97.66.45', username='root', password=os.environ['ECS_PWD'], timeout=30)
cmd = (
    "set -eo pipefail && "
    "echo '===POST===' && curl -s -X POST http://localhost/api/db/watchlist -H 'Content-Type: application/json' -d '{\"ts_code\":\"TEST.SH\",\"name\":\"测试股\"}' && echo '' && "
    "echo '===GET===' && curl -s http://localhost/api/db/watchlist && echo '' && "
    "echo '===DUP_STATUS===' && curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost/api/db/watchlist -H 'Content-Type: application/json' -d '{\"ts_code\":\"TEST.SH\",\"name\":\"测试股\"}' && echo '' && "
    "echo '===DELETE===' && curl -s -X DELETE http://localhost/api/db/watchlist/TEST.SH && echo '' && "
    "echo '===GET_AFTER===' && curl -s http://localhost/api/db/watchlist && echo ''"
)
_, so, se = c.exec_command(cmd, timeout=30)
print(so.read().decode())
err = se.read().decode()
if err.strip():
    print('STDERR:', err[-500:])
c.close()
