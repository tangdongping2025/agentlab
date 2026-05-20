// .claude/skills/我要干活了/scripts/requirement-detector.cjs
const fs = require('fs');
const ProcessGuard = require('./process-guard.cjs');

class RequirementDetector {
    static detectRequirementType(description) {
        const desc = description.toLowerCase();

        if (desc.includes('fix') || desc.includes('bug') || desc.includes('修复')) {
            return 'bug';
        }

        if (desc.includes('optimize') || desc.includes('improve') || desc.includes('优化') || desc.includes('改进')) {
            return 'optimize';
        }

        if (desc.includes('feature') || desc.includes('new') || desc.includes('功能') || desc.includes('新增')) {
            return 'feature';
        }

        return 'feature'; // 默认是feature类型
    }

    static analyzeChangeSize() {
        try {
            const changes = ProcessGuard.getChangesByType();
            const config = ProcessGuard.loadConfig();

            if (changes.total > config.fastModeThreshold) {
                return 'large';
            }

            return 'small';
        } catch (error) {
            console.error('Failed to analyze change size:', error.message);
            return 'unknown';
        }
    }

    static getNextRequirementNumber() {
        const config = ProcessGuard.loadConfig();
        const matrixPath = config.trackingMatrix;

        if (!fs.existsSync(matrixPath)) {
            return 'RQ-001';
        }

        const content = fs.readFileSync(matrixPath, 'utf8');
        const rqMatches = content.match(/RQ-(\d+)/g);

        if (!rqMatches || rqMatches.length === 0) {
            return 'RQ-001';
        }

        const maxNumber = Math.max(...rqMatches.map(m => parseInt(m.split('-')[1])));
        const nextNumber = maxNumber + 1;
        return `RQ-${String(nextNumber).padStart(3, '0')}`;
    }

    static checkDocumentationRequirements(description) {
        const type = this.detectRequirementType(description);
        const config = ProcessGuard.loadConfig();

        const needsSpec = config.requireSpecFor.includes(type);
        const needsPlan = config.requirePlanFor.includes(type);

        return {
            type: type,
            needsSpec: needsSpec,
            needsPlan: needsPlan,
            recommendation: needsSpec ? '建议先使用Brainstorming创建需求规格' : '可以直接执行'
        };
    }
}

module.exports = RequirementDetector;
