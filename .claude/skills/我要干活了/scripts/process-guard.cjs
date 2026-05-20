// .claude/skills/我要干活了/scripts/process-guard.cjs
const fs = require('fs');
const execSync = require('child_process').execSync;
const Path = require('path');

class ProcessGuard {
    static checkGitStatus() {
        try {
            const changes = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
            return changes;
        } catch (error) {
            console.error('Git status check failed:', error.message);
            return '';
        }
    }

    static checkDocumentation() {
        const config = this.loadConfig();
        const specDir = config.specDir;
        const planDir = config.planDir;

        return {
            hasSpecs: fs.existsSync(specDir),
            hasPlans: fs.existsSync(planDir)
        };
    }

    static loadConfig() {
        const configPath = Path.join(__dirname, '..', 'config', 'default.json');
        if (fs.existsSync(configPath)) {
            try {
                const configContent = fs.readFileSync(configPath, 'utf8');
                return JSON.parse(configContent);
            } catch (error) {
                console.error('Failed to load config:', error.message);
            }
        }
        return this.getDefaultConfig();
    }

    static getDefaultConfig() {
        return {
            projectName: '智能项目',
            projectRoot: process.cwd(),
            trackingMatrix: '项目执行跟踪矩阵.md',
            specDir: 'docs/superpowers/specs',
            planDir: 'docs/superpowers/plans',
            docFormats: {
                specPattern: 'YYYY-MM-DD-*-design.md',
                planPattern: 'YYYY-MM-DD-*-implementation.md'
            },
            fastModeThreshold: 50,
            requireSpecFor: ['feature', 'optimize'],
            requirePlanFor: ['feature', 'optimize'],
            skillMap: {
                brainstorming: 'superpowers:brainstorming',
                'writing-plans': 'superpowers:writing-plans',
                'executing-plans': 'superpowers:executing-plans',
                'subagent-driven': 'superpowers:subagent-driven-development',
                'finishing-branch': 'superpowers:finishing-a-development-branch'
            }
        };
    }

    static getChangesByType() {
        try {
            const gitDiff = execSync('git diff HEAD~1 HEAD --numstat', { encoding: 'utf8' });
            const lines = gitDiff.split('\n').filter(line => line);

            const changes = {
                added: 0,
                removed: 0,
                modified: 0,
                total: 0,
                fileTypes: {
                    src: 0,
                    test: 0,
                    docs: 0
                }
            };

            lines.forEach(line => {
                const parts = line.split(/\s+/);
                if (parts.length > 2) {
                    const additions = parseInt(parts[0]) || 0;
                    const deletions = parseInt(parts[1]) || 0;
                    const fileName = parts[2];

                    changes.added += additions;
                    changes.removed += deletions;
                    changes.total += additions + deletions;

                    if (fileName.startsWith('src/')) changes.fileTypes.src++;
                    if (fileName.startsWith('__tests__/') || fileName.endsWith('.test.')) changes.fileTypes.test++;
                    if (fileName.startsWith('docs/') || fileName.endsWith('.md')) changes.fileTypes.docs++;
                }
            });

            return changes;
        } catch (error) {
            console.error('Failed to get git diff:', error.message);
            return {
                added: 0,
                removed: 0,
                modified: 0,
                total: 0,
                fileTypes: {
                    src: 0,
                    test: 0,
                    docs: 0
                }
            };
        }
    }
}

module.exports = ProcessGuard;
