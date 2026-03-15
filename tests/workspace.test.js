const assert = require("assert");
const { KaliIntegration } = require("../src/core/kali-integration.js");
const { AiEngine } = require("../src/core/ai-engine.js");
const { getToolRegistry } = require("../src/modules/tools/index.js");
const { buildWorkflowPlan } = require("../src/modules/workflows/index.js");
const { createWorkspaceBridge } = require("../src/main.js");

async function run() {
    const kali = new KaliIntegration({
        getSettings: () => ({
            kaliDistro: "kali-linux"
        })
    });

    assert.strictEqual(
        kali.buildInteractiveCommand("echo 'hello'"),
        "wsl.exe -d kali-linux -- bash -lc 'echo ''hello'''"
    );

    const parsed = AiEngine.extractJsonObject("```json\n{\"goal\":\"Check host\",\"steps\":[]}\n```");
    assert.strictEqual(parsed.goal, "Check host");

    const openAiEngine = new AiEngine({
        getSettings: () => ({
            aiProvider: "openai",
            openaiEndpoint: "https://api.openai.com/v1",
            openaiModel: "gpt-5.2-chat-latest",
            openaiApiKey: "sk-test"
        })
    });
    assert.strictEqual(openAiEngine.getProvider(), "openai");
    assert.strictEqual(openAiEngine.getProviderLabel(), "OpenAI");
    assert.strictEqual(openAiEngine.getEndpoint(), "https://api.openai.com/v1");
    assert.strictEqual(openAiEngine.getModel(), "gpt-5.2-chat-latest");
    assert.strictEqual(openAiEngine.getApiKey(), "sk-test");

    const plan = buildWorkflowPlan("network-baseline");
    assert.strictEqual(plan.steps.length, 3);
    assert.strictEqual(plan.steps[0].title, "Interfaces");

    const tools = getToolRegistry();
    assert.ok(tools.some(tool => tool.id === "bash"));

    const bridge = createWorkspaceBridge({
        getSettings: () => ({
            kaliDistro: "kali-linux",
            lmStudioEndpoint: "http://127.0.0.1:1234/v1",
            lmStudioModel: "local-model"
        }),
        getTerminal: () => ({
            cwd: "/home/kali",
            write: () => {},
            writelr: () => {},
            socket: {
                addEventListener: () => {},
                removeEventListener: () => {}
            },
            term: {
                focus: () => {}
            }
        }),
        getKeyboard: () => null,
        getCurrentTermIndex: () => 0
    });

    const state = bridge.getWorkspaceState();
    assert.strictEqual(state.settings.kaliDistro, "kali-linux");
    assert.ok(Array.isArray(state.tools) && state.tools.length > 0);
    assert.ok(Array.isArray(state.workflows) && state.workflows.length > 0);

    const report = bridge.buildSessionReport();
    assert.strictEqual(report.distro, "kali-linux");
    assert.ok(report.markdown.includes("Rapport Workspace Skynet Terminal"));

    const workflowPlan = await bridge.runWorkflow("kali-readiness");
    assert.strictEqual(workflowPlan.goal, "Preparation Kali");
    assert.ok(Array.isArray(bridge.getRecentSessionEntries()));

    console.log("workspace tests passed");
}

run().catch(error => {
    console.error(error);
    process.exit(1);
});
