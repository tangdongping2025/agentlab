// .claude/skills/我要干活了/scripts/state-manager.cjs
const fs = require('fs');
const Path = require('path');

class StateManager {
    static getStatePath() {
        return Path.join(__dirname, '..', 'state.json');
    }

    static getCurrentState() {
        const statePath = this.getStatePath();
        if (!fs.existsSync(statePath)) {
            return this.getDefaultState();
        }
        try {
            const content = fs.readFileSync(statePath, 'utf8');
            return JSON.parse(content);
        } catch (error) {
            console.error('读取状态失败:', error.message);
            return this.getDefaultState();
        }
    }

    static getDefaultState() {
        return {
            currentState: 'INIT',
            currentRQ: null,
            completedSteps: [],
            lastUpdated: new Date().toISOString()
        };
    }

    static saveState(state) {
        const statePath = this.getStatePath();
        state.lastUpdated = new Date().toISOString();
        fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
        console.log('✅ 状态已保存:', state.currentState);
    }

    static transitionTo(newState, options = {}) {
        const state = this.getCurrentState();
        const validTransitions = this.getValidTransitions();

        if (!validTransitions[state.currentState]?.includes(newState)) {
            throw new Error(`非法状态转换: ${state.currentState} → ${newState}`);
        }

        state.currentState = newState;

        if (options.currentRQ !== undefined) {
            state.currentRQ = options.currentRQ;
        }

        if (options.addStep) {
            state.completedSteps.push(options.addStep);
        }

        if (options.resetSteps) {
            state.completedSteps = [];
        }

        this.saveState(state);
        return state;
    }

    static getValidTransitions() {
        return {
            'INIT': ['NEED_RQ_NUMBER', 'INIT'],
            'NEED_RQ_NUMBER': ['NEED_BRAINSTORMING', 'INIT'],
            'NEED_BRAINSTORMING': ['NEED_PLAN', 'INIT'],
            'NEED_PLAN': ['NEED_BRANCH', 'INIT'],
            'NEED_BRANCH': ['EXECUTING_TASKS', 'INIT'],
            'EXECUTING_TASKS': ['WAITING_VALIDATION', 'INIT'],
            'WAITING_VALIDATION': ['DONE', 'INIT'],
            'DONE': ['INIT']
        };
    }

    static canDo(action) {
        const state = this.getCurrentState();
        const permissions = this.getStatePermissions();
        return permissions[state.currentState]?.canDo.includes(action) || false;
    }

    static cannotDo(action) {
        const state = this.getCurrentState();
        const permissions = this.getStatePermissions();
        return permissions[state.currentState]?.cannotDo.includes(action) || false;
    }

    static getStatePermissions() {
        return {
            'INIT': {
                canDo: ['查看项目状态', '选择操作'],
                cannotDo: ['写代码', '分配RQ', '执行需求']
            },
            'NEED_RQ_NUMBER': {
                canDo: ['收集需求信息', '分配RQ编号', '更新跟踪矩阵'],
                cannotDo: ['跳过RQ分配', '开始写代码']
            },
            'NEED_BRAINSTORMING': {
                canDo: ['调用Brainstorming', '生成规格文档'],
                cannotDo: ['跳过Brainstorming', '直接写代码']
            },
            'NEED_PLAN': {
                canDo: ['调用Writing-Plans', '生成计划文档'],
                cannotDo: ['跳过计划', '直接执行']
            },
            'NEED_BRANCH': {
                canDo: ['创建分支', '检查Git状态'],
                cannotDo: ['在main分支写代码', '跳过分支']
            },
            'EXECUTING_TASKS': {
                canDo: ['执行任务', '代码审查', '更新进度'],
                cannotDo: ['跳过审查', '并行执行']
            },
            'WAITING_VALIDATION': {
                canDo: ['启动DevServer', '展示验证点'],
                cannotDo: ['标记完成', '跳过验证']
            },
            'DONE': {
                canDo: ['清理状态', '回到INIT'],
                cannotDo: []
            }
        };
    }

    static resetToInit() {
        this.saveState(this.getDefaultState());
    }

    static getNextRQNumber() {
        const ProcessGuard = require('./process-guard.cjs');
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
}

module.exports = StateManager;

if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    if (command === 'get') {
        console.log('当前状态:', StateManager.getCurrentState());
    } else if (command === 'reset') {
        StateManager.resetToInit();
        console.log('已重置到INIT状态');
    } else if (command === 'next-rq') {
        console.log('下一个RQ编号:', StateManager.getNextRQNumber());
    } else {
        console.log('使用方法:');
        console.log('  node state-manager.cjs get      - 查看当前状态');
        console.log('  node state-manager.cjs reset    - 重置到INIT状态');
        console.log('  node state-manager.cjs next-rq  - 获取下一个RQ编号');
    }
}
