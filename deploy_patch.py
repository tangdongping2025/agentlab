import os, tarfile, paramiko

with tarfile.open('dist-patch.tar.gz', 'w:gz') as tar:
    tar.add('dist', arcname='dist')
print('tar done')

dockerfile = "FROM context-lab:latest\nRUN rm -rf /usr/share/nginx/html/*\nCOPY dist/ /usr/share/nginx/html/\n"

pwd = os.environ['ECS_PWD']
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('47.97.66.45', username='root', password=pwd, timeout=30)
sftp = c.open_sftp()

c.exec_command('mkdir -p /root/build')[1].channel.recv_exit_status()
sftp.put('dist-patch.tar.gz', '/root/build/dist-patch.tar.gz')
with sftp.open('/root/build/Dockerfile.patch', 'w') as f:
    f.write(dockerfile)
sftp.close()
print('sftp done')

cmd = (
    'set -eo pipefail && '
    'cd /root/build && tar -xzf dist-patch.tar.gz && '
    'docker tag context-lab:latest context-lab:rollback && '
    'docker build -f Dockerfile.patch -t context-lab:latest . && '
    'cd /root && docker compose up -d --no-deps --force-recreate context-lab && '
    'sleep 4 && '
    'echo "===HEALTH===" && curl -s http://localhost/api/db/health && echo "" && '
    'echo "===INDEXJS===" && curl -s http://localhost/ | grep -oE "index-[A-Za-z0-9_-]+\\.js" | head -1'
)
stdin, stdout, stderr = c.exec_command(cmd, timeout=180)
exit_code = stdout.channel.recv_exit_status()
print('STDOUT:', stdout.read().decode())
err = stderr.read().decode()
if err.strip():
    print('STDERR:', err[-2000:])
print('exit:', exit_code)

stdin, stdout, stderr = c.exec_command(
    'docker exec context-lab sh -c "grep -rl 100dvh /usr/share/nginx/html/assets/*.css >/dev/null 2>&1 && echo CSS_OK; grep -rl 100dvh /usr/share/nginx/html/assets/*.js >/dev/null 2>&1 && echo JS_OK"'
)
print('VERIFY:', stdout.read().decode())

c.close()
print('done')
