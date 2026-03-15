const { TerminalService } = require("./core/terminal.js");
const { KaliIntegration } = require("./core/kali-integration.js");
const { AiEngine } = require("./core/ai-engine.js");
const { getToolRegistry, findToolDefinition } = require("./modules/tools/index.js");
const { getWorkflowRegistry, findWorkflowDefinition, buildWorkflowPlan } = require("./modules/workflows/index.js");

function createWorkspaceBridge(opts = {}) {
    const getSettings = opts.getSettings || (() => ({}));
    const sessionLog = [];

    const terminal = new TerminalService({
        getTerminal: opts.getTerminal,
        getKeyboard: opts.getKeyboard,
        getCurrentTermIndex: opts.getCurrentTermIndex,
        getSettings,
        delay: opts.delay
    });

    const kali = new KaliIntegration({
        getSettings,
        terminalService: terminal
    });

    const ai = new AiEngine({
        getSettings,
        getToolRegistry,
        getWorkflowRegistry
    });

    terminal.onOutput(payload => {
        sessionLog.push({
            type: "output",
            ts: new Date().toISOString(),
            ...payload
        });
    });

    terminal.onCommand(payload => {
        sessionLog.push({
            type: "command",
            ts: new Date().toISOString(),
            ...payload
        });
    });

    const record = (type, payload) => {
        sessionLog.push({
            type,
            ts: new Date().toISOString(),
            ...payload
        });
    };

    const getWorkspaceState = () => ({
        settings: {
            aiProvider: ai.getProvider(),
            aiProviderLabel: ai.getProviderLabel(),
            kaliDistro: kali.getDistroName(),
            aiEndpoint: ai.getEndpoint(),
            aiModel: ai.getModel(),
            workspaceTypingDelay: getSettings().workspaceTypingDelay || 28
        },
        tools: getToolRegistry(),
        workflows: getWorkflowRegistry()
    });

    const refreshStatus = async () => {
        const environment = await kali.checkEnvironment();
        return {
            ...environment,
            cwd: terminal.getCurrentCwd(),
            aiProvider: ai.getProvider(),
            aiProviderLabel: ai.getProviderLabel(),
            aiEndpoint: ai.getEndpoint(),
            aiModel: ai.getModel()
        };
    };

    const openKaliShell = async options => {
        record("workspace-shell", {
            distro: kali.getDistroName()
        });
        return kali.openInteractiveShell(options);
    };

    const runKaliCommand = async (command, options = {}) => {
        const preview = kali.dryRun(command);
        record("workspace-run", {
            command,
            printable: preview.printable,
            mode: options.visual === false ? "background" : "visual"
        });

        if (options.visual === false) {
            return kali.run(command, options);
        }

        return terminal.runVisualCommand(preview.printable, options);
    };

    const runWorkflow = async (id, options = {}) => {
        const plan = buildWorkflowPlan(id);
        record("workflow-plan", {
            workflowId: id
        });

        if (options.execute === true && plan.steps[0]) {
            await runKaliCommand(plan.steps[0].command, options);
        }

        return plan;
    };

    const executeWorkflow = async (id, options = {}) => {
        const plan = await runWorkflow(id, {
            ...options,
            execute: false
        });
        const results = [];

        for (const step of plan.steps) {
            results.push(await executePlanStep(step, options));
        }

        record("workflow-run", {
            workflowId: id,
            steps: plan.steps.length
        });

        return {
            plan,
            results
        };
    };

    const executePlanStep = async (step, options = {}) => {
        if (!step || !step.command) {
            throw new Error("Missing plan step command.");
        }
        return runKaliCommand(step.command, options);
    };

    const generatePlan = async (input, context = {}) => {
        const environment = await kali.checkEnvironment().catch(() => ({
            available: false,
            distro: kali.getDistroName()
        }));

        const plan = await ai.generatePlan(input, {
            cwd: terminal.getCurrentCwd(),
            environment,
            tools: getToolRegistry().map(tool => ({
                id: tool.id,
                binary: tool.binary,
                name: tool.name
            })),
            workflows: getWorkflowRegistry().map(workflow => ({
                id: workflow.id,
                title: workflow.title
            })),
            ...context
        });

        record("ai-plan", {
            input,
            planId: plan.id
        });

        return plan;
    };

    const explainCommand = async (command, context = {}) => {
        record("ai-explain", {
            command
        });
        return ai.explainCommand(command, {
            cwd: terminal.getCurrentCwd(),
            ...context
        });
    };

    const chat = async (messages, context = {}) => {
        record("ai-chat", {
            turns: Array.isArray(messages) ? messages.length : 0
        });
        return ai.chat(messages, {
            cwd: terminal.getCurrentCwd(),
            distro: kali.getDistroName(),
            ...context
        });
    };

    const summarizeSession = async () => {
        record("ai-summary", {
            entries: sessionLog.length
        });
        return ai.summarizeSession(sessionLog);
    };

    const getRecentSessionEntries = (limit = 24) => {
        return sessionLog.slice(-limit);
    };

    const buildSessionReport = () => {
        const entries = getRecentSessionEntries(80);
        const lines = [
            "# Rapport Workspace Skynet Terminal",
            "",
            `Genere le: ${new Date().toISOString()}`,
            `Distro Kali: ${kali.getDistroName()}`,
            `Provider IA: ${ai.getProviderLabel()}`,
            `Endpoint IA: ${ai.getEndpoint()}`,
            `Modele IA: ${ai.getModel() || "(non defini)"}`,
            `Dossier courant: ${terminal.getCurrentCwd() || "-"}`,
            "",
            "## Entrees de session",
            ""
        ];

        entries.forEach(entry => {
            const body = (entry.data || entry.command || entry.printable || entry.input || entry.planId || entry.workflowId || "")
                .toString()
                .replace(/\r/g, "")
                .trim();

            lines.push(`- [${entry.ts}] ${entry.type}`);
            if (body) {
                lines.push(`  ${body.split("\n").join("\n  ")}`);
            }
        });

        return {
            generatedAt: new Date().toISOString(),
            distro: kali.getDistroName(),
            endpoint: ai.getEndpoint(),
            model: ai.getModel(),
            cwd: terminal.getCurrentCwd(),
            entries,
            markdown: lines.join("\n")
        };
    };

    return {
        terminal,
        kali,
        ai,
        getWorkspaceState,
        refreshStatus,
        openKaliShell,
        runKaliCommand,
        runWorkflow,
        executeWorkflow,
        executePlanStep,
        generatePlan,
        explainCommand,
        chat,
        summarizeSession,
        getRecentSessionEntries,
        buildSessionReport,
        getToolDefinition: findToolDefinition,
        getWorkflowDefinition: findWorkflowDefinition,
        getSessionLog: () => sessionLog.slice()
    };
}

module.exports = {
    createWorkspaceBridge
};
