// .claude/skills/我要干活了/scripts/project-tracker.js
const fs = require('fs');
const Path = require('path');
const ProcessGuard = require('./process-guard');
const MarkdownToHTML = require('./markdown-to-html');

class ProjectTracker {
    static async findAvailablePlans() {
        const config = ProcessGuard.loadConfig();
        const planDir = config.planDir;

        if (!fs.existsSync(planDir)) {
            fs.mkdirSync(planDir, { recursive: true });
            return [];
        }

        const files = fs.readdirSync(planDir);
        const planFiles = files.filter(file =>
            file.match(/\d{4}-\d{2}-\d{2}-.*-implementation\.md/)
        );

        // 按日期排序，最新的在前
        return planFiles.sort().reverse();
    }

    static async getProjectStats() {
        const config = ProcessGuard.loadConfig();
        const trackingMatrix = Path.join(config.trackingMatrix);

        if (!fs.existsSync(trackingMatrix)) {
            return {
                totalRequirements: 0,
                completedRequirements: 0,
                inProgressRequirements: 0,
                pendingRequirements: 0
            };
        }

        const content = fs.readFileSync(trackingMatrix, 'utf8');
        return this.analyzeMatrixContent(content);
    }

    static analyzeMatrixContent(content) {
        let totalRequirements = 0;
        let completedRequirements = 0;
        let inProgressRequirements = 0;
        let pendingRequirements = 0;

        // 简单的正则分析
        const lines = content.split('\n');
        const rqLines = lines.filter(line => line.includes('RQ-'));

        rqLines.forEach(line => {
            totalRequirements++;

            if (line.includes('✅') || line.includes('已完成')) completedRequirements++;
            if (line.includes('🚧') || line.includes('进行中')) inProgressRequirements++;
            if (line.includes('📝') || line.includes('待开始')) pendingRequirements++;
        });

        return {
            totalRequirements,
            completedRequirements,
            inProgressRequirements,
            pendingRequirements
        };
    }

    static async updateProjectMatrix(planFile, status) {
        const config = ProcessGuard.loadConfig();
        const matrixPath = Path.join(config.trackingMatrix);

        if (!fs.existsSync(matrixPath)) {
            this.initializeProjectTrackingMatrix();
        }

        const content = fs.readFileSync(matrixPath, 'utf8');

        if (!content.includes(planFile)) {
            const stats = await this.getProjectStats();
            const nextRQ = `RQ-${String(stats.totalRequirements + 1).padStart(3, '0')}`;

            const newEntry = `| ${nextRQ} | ${Path.basename(planFile, '.md')} | 【待添加】 | 【${planFile}】 | ${status === 'in_progress' ? '🚧 进行中' : '📝 待开始'} |\n`;

            fs.writeFileSync(matrixPath, content + newEntry);
            // 自动生成HTML文件
            this.generateHTMLFile(matrixPath);
        }
    }

    static async initializeProjectTrackingMatrix() {
        const config = ProcessGuard.loadConfig();
        const matrixPath = Path.join(config.trackingMatrix);

        const defaultContent = `# 项目执行跟踪矩阵

## 📊 项目概览

**项目名称：** ${config.projectName}
**项目状态：** 开发中
**开始日期：** ${new Date().toISOString().split('T')[0]}

## 🎯 需求规格 → 计划 → 执行 跟踪矩阵

| 需求编号 | 需求名称 | 需求规格文件 | 计划文件 | 任务执行 | 状态 |
|---------|---------|-------------|---------|---------|------|
`;

        fs.writeFileSync(matrixPath, defaultContent);
        // 自动生成HTML文件
        this.generateHTMLFile(matrixPath);
    }

    static generateHTMLFile(markdownPath) {
        const htmlPath = markdownPath.replace('.md', '.html');
        MarkdownToHTML.convertMarkdownFile(markdownPath);
        console.log(`✅ 已生成 ${htmlPath}`);
    }

    static getCurrentExecutionPlan() {
        const currentExecutionPath = 'docs/superpowers/current-execution.json';
        if (fs.existsSync(currentExecutionPath)) {
            try {
                const currentExecution = JSON.parse(fs.readFileSync(currentExecutionPath, 'utf8'));
                return currentExecution.active_plan;
            } catch (error) {
                console.error('Failed to read current execution:', error.message);
            }
        }
        return null;
    }
}

module.exports = ProjectTracker;
