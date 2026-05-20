// .claude/skills/我要干活了/scripts/skill-checker.cjs
const fs = require('fs');
const Path = require('path');
const ProcessGuard = require('./process-guard.cjs');

class SkillChecker {
    static checkRequiredSkills() {
        const config = ProcessGuard.loadConfig();
        const requiredSkills = config.requiredSkills || [];
        const skillMap = config.skillMap || {};

        console.log('🔍 检查必需的 skills...\n');

        const results = {
            allPresent: true,
            missing: [],
            present: []
        };

        // 检查每一个必需的 skill
        for (const skillId of requiredSkills) {
            const exists = this.checkSkillExists(skillId);
            if (exists) {
                results.present.push(skillId);
                console.log(`✅ ${skillId}`);
            } else {
                results.missing.push(skillId);
                results.allPresent = false;
                console.log(`❌ ${skillId} - 缺失`);
            }
        }

        // 检查 skillMap 中引用的 skills
        console.log('\n📋 检查 skillMap 引用...');
        for (const [key, skillId] of Object.entries(skillMap)) {
            if (!skillId.includes('内置')) {
                const exists = this.checkSkillExists(skillId);
                if (!exists && !results.missing.includes(skillId)) {
                    results.missing.push(skillId);
                    results.allPresent = false;
                    console.log(`❌ ${skillId} (${key}) - 缺失`);
                } else if (exists && !results.present.includes(skillId)) {
                    results.present.push(skillId);
                    console.log(`✅ ${skillId} (${key})`);
                }
            }
        }

        console.log('\n' + '─'.repeat(50));
        if (results.allPresent) {
            console.log('✅ 所有必需的 skills 都已安装！');
        } else {
            console.log(`❌ 缺失 ${results.missing.length} 个必需的 skills！`);
            console.log('\n请先安装以下 skills，然后再继续：');
            results.missing.forEach(skillId => {
                console.log(`   - ${skillId}`);
            });
        }

        return results;
    }

    static checkSkillExists(skillId) {
        // skillId 格式: "namespace:skill-name"
        const parts = skillId.split(':');
        if (parts.length !== 2) return false;

        const namespace = parts[0];
        const skillName = parts[1];

        // 检查可能的位置
        const possiblePaths = [
            // 位置1: .claude/skills/{namespace}/{skillName}.md
            Path.join(process.cwd(), '.claude', 'skills', namespace, `${skillName}.md`),
            // 位置2: .claude/skills/{namespace}/{skillName}/index.md
            Path.join(process.cwd(), '.claude', 'skills', namespace, skillName, 'index.md'),
            // 位置3: .claude/skills/{skillName}.md
            Path.join(process.cwd(), '.claude', 'skills', `${skillName}.md`),
        ];

        for (const checkPath of possiblePaths) {
            if (fs.existsSync(checkPath)) {
                return true;
            }
        }

        return false;
    }

    static getMissingSkills() {
        const results = this.checkRequiredSkills();
        return results.missing;
    }

    static hasAllRequiredSkills() {
        const results = this.checkRequiredSkills();
        return results.allPresent;
    }
}

module.exports = SkillChecker;

if (require.main === module) {
    SkillChecker.checkRequiredSkills();
}
