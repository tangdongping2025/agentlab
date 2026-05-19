// load-claude-config.js
// 从本机 Claude 配置中读取 API 密钥和其他设置
import fs from 'fs';
import path from 'path';
import os from 'os';

function findClaudeConfig() {
  // Windows 配置位置
  const windowsPath = path.join(os.homedir(), '.claude', 'settings.json');

  if (fs.existsSync(windowsPath)) {
    return windowsPath;
  }

  // 其他系统的路径可以在这里添加

  console.error('❌ 未找到 Claude 配置文件');
  process.exit(1);
}

function loadClaudeConfig() {
  const configPath = findClaudeConfig();
  console.log(`📄 读取 Claude 配置: ${configPath}`);

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  // 提取环境变量
  const env = config.env || {};

  return {
    apiKey: env.ANTHROPIC_AUTH_TOKEN,
    baseURL: env.ANTHROPIC_BASE_URL,
    model: config.model || 'sonnet'
  };
}

function generateEnvFile(config) {
  const envPath = path.join(process.cwd(), '.env');

  // 读取已有的 .env 中非自动生成的变量，保留它们
  const preserveKeys = new Set([
    'VITE_CLAUDE_API_KEY', 'VITE_CLAUDE_BASE_URL', 'VITE_CLAUDE_MODEL', 'VITE_MAX_CONTEXT_SIZE'
  ]);
  const preserved = [];
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.substring(0, eqIdx).trim();
      if (!preserveKeys.has(key)) {
        preserved.push(line);
      }
    }
  }

  const autoContent = `# Claude API 配置 - 自动从 Claude 配置加载
# 本文件由 scripts/load-claude-config.js 自动生成
# 请勿手动编辑

# Claude API Key (从本机 Claude 配置加载)
VITE_CLAUDE_API_KEY=${config.apiKey || ''}

# Claude API Base URL (从本机 Claude 配置加载)
VITE_CLAUDE_BASE_URL=${config.baseURL || 'https://api.anthropic.com'}

# Claude 模型 (从本机 Claude 配置加载)
VITE_CLAUDE_MODEL=${config.model === 'opus' ? 'claude-3-opus-20240229' :
                    config.model === 'sonnet[1m]' ? 'claude-3-5-sonnet-20240620' :
                    config.model === 'haiku' ? 'claude-3-haiku-20240307' :
                    'claude-3-5-sonnet-20240620'}

# 最大上下文大小
VITE_MAX_CONTEXT_SIZE=1048576
`;

  const envContent = preserved.length > 0
    ? autoContent + '\n' + preserved.join('\n') + '\n'
    : autoContent;

  fs.writeFileSync(envPath, envContent, 'utf8');
  console.log(`✅ 已生成 .env 文件: ${envPath}`);
}

try {
  const claudeConfig = loadClaudeConfig();

  if (!claudeConfig.apiKey) {
    console.error('❌ 未在 Claude 配置中找到 API 密钥');
    process.exit(1);
  }

  console.log('✅ 成功读取 Claude 配置:');
  console.log(`   - API Key: ${claudeConfig.apiKey.substring(0, 8)}...`);
  console.log(`   - Base URL: ${claudeConfig.baseURL}`);
  console.log(`   - Model: ${claudeConfig.model}`);

  generateEnvFile(claudeConfig);

} catch (error) {
  console.error('❌ 加载 Claude 配置失败:', error.message);
  process.exit(1);
}
