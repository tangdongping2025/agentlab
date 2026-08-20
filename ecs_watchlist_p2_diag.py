import os, paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('47.97.66.45', username='root', password=os.environ['ECS_PWD'], timeout=30)
sftp = c.open_sftp()
sftp.put('diag_quotes.py', '/root/diag_quotes.py')
sftp.close()
cmd = (
    "docker cp /root/diag_quotes.py context-lab:/tmp/diag_quotes.py && "
    "docker exec context-lab python /tmp/diag_quotes.py"
)
_, so, se = c.exec_command(cmd, timeout=60)
print('STDOUT:', so.read().decode())
err = se.read().decode()
if err.strip():
    print('STDERR:', err[-1500:])
c.close()
