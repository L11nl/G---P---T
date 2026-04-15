class PlaywrightCodeGenerator {
    constructor() {
        this.codeLines = [];
        this.stepCounter = 1; 
        this.lastCommand = "";
        this.pendingStep = null;
    }
    
    addStep(comment) {
        this.pendingStep = `\n    // === الخطوة ${this.stepCounter}: ${comment} ===`;
    }
    
    addCommand(cmd) {
        if (this.lastCommand === cmd && cmd.trim() !== "") {
            this.pendingStep = null; 
            return;
        }
        if (this.pendingStep) {
            this.codeLines.push(this.pendingStep);
            this.stepCounter++;
            this.pendingStep = null;
        }
        this.codeLines.push(`    ${cmd}`);
        console.log(`[Generated Code]: ${cmd}`);
        this.lastCommand = cmd;
    }

    addRawBlock(comment, linesArr) {
        this.codeLines.push(`\n    // === الخطوة ${this.stepCounter}: ${comment} ===`);
        this.stepCounter++;
        for (const line of linesArr) {
            this.codeLines.push(`    ${line}`);
        }
        this.lastCommand = linesArr[linesArr.length - 1];
    }
    
    getFinalScript() {
        return `// ==========================================\n// 🤖 سكربت Playwright التحليلي المستخرج\n// ==========================================\n\nconst { chromium } = require('playwright');\n\n(async () => {\n    const browser = await chromium.launch({ headless: false });\n    const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });\n    const page = await context.newPage();\n${this.codeLines.join('\n')}\n\n    // await browser.close();\n})();`;
    }
}

module.exports = PlaywrightCodeGenerator;
