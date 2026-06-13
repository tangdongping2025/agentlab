// load-claude-config.js
// 首次运行时从本机 Claude 配置生成 .env；若 .env 已有 API 配置则保留不动
import fs from 'fs';
import path from 'path';
import os from 'os';

const ENV_PATH = path.join(process.cwd(), '.env');
const API_KEYS = ['VITE_CLAUDE_API_KEY', 'VITE_CLAUDE_BASE_URL', 'VITE_CLAUDE_MODEL'];

function readExistingEnv() {
  if (!fs.existsSync(ENV_PATH)) return {};
  const map = {};
  for (const line of fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    map[trimmed.substring(0, eqIdx).trim()] = trimmed.substring(eqIdx + 1);
  }
  return map;
}

function findClaudeConfig() {
  const p = path.join(os.homedir(), '.claude', 'settings.json');
  if (fs.existsSync(p)) return p;
  return null;
}

function loadClaudeConfig() {
  const configPath = findClaudeConfig();
  if (!configPath) return null;
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const env = config.env || {};
  return {
    apiKey: env.ANTHROPIC_AUTH_TOKEN,
    baseURL: env.ANTHROPIC_BASE_URL,
  };
}

try {
  const existing = readExistingEnv();

  // .env 已有 API 配置 → 跳过，保留手动值
  if (existing.VITE_CLAUDE_API_KEY && existing.VITE_CLAUDE_BASE_URL) {
    console.log('✅ .env 已有 API 配置，保留不动');
    console.log(`   - API Key: ${existing.VITE_CLAUDE_API_KEY.substring(0, 8)}...`);
    console.log(`   - Base URL: ${existing.VITE_CLAUDE_BASE_URL}`);
    console.log(`   - Model: ${existing.VITE_CLAUDE_MODEL || 'claude-sonnet-4-6'}`);
    process.exit(0);
  }

  // 尝试从全局配置生成
  let apiKey, baseURL;
  const claudeConfig = loadClaudeConfig();
  if (claudeConfig) {
    apiKey = claudeConfig.apiKey;
    baseURL = claudeConfig.baseURL;
  } else {
    // CI 环境（无全局配置）→ 从环境变量取，都没有则用占位值
    apiKey = process.env.VITE_CLAUDE_API_KEY || 'placeholder';
    baseURL = process.env.VITE_CLAUDE_BASE_URL || 'https://api.anthropic.com';
    console.log('⚠️ 未找到 Claude 全局配置，使用环境变量或占位值');
  }

  console.log('📄 生成 .env');

  const preserved = Object.entries(existing)
    .filter(([k]) => !API_KEYS.includes(k) && k !== 'VITE_MAX_CONTEXT_SIZE')
    .map(([k, v]) => `${k}=${v}`);

  const content = `# Claude API 配置（手动维护，脚本不再覆盖）
# 修改后重启 dev server 生效

VITE_CLAUDE_API_KEY=${apiKey}
VITE_CLAUDE_BASE_URL=${baseURL || 'https://api.anthropic.com'}
VITE_CLAUDE_MODEL=claude-sonnet-4-6
VITE_MAX_CONTEXT_SIZE=1048576
${preserved.length ? preserved.join('\n') + '\n' : ''}`;

  fs.writeFileSync(ENV_PATH, content, 'utf8');
  console.log(`✅ 已生成 .env: ${ENV_PATH}`);
} catch (error) {
  console.error('❌ 加载配置失败:', error.message);
  process.exit(1);
}
