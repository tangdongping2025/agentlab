# Claude SDK Agent 沙箱

这是 `claude-sdk` agent 的默认工作目录(cwd)。agent 用内置工具(Read/Glob/Grep/Bash/Edit/WebSearch)在此目录内操作。

- `sample.py` 是 agent 可以阅读/修改/运行的示例文件。
- agent 产出的文件也落在这里。

注意:Bash 理论可 `cd ..` 逃逸(已知风险,v1 本地优先接受)。
