class AiEngine {
    constructor(opts = {}) {
        this.getSettings = opts.getSettings || (() => ({}));
        this.getToolRegistry = opts.getToolRegistry || (() => []);
        this.getWorkflowRegistry = opts.getWorkflowRegistry || (() => []);
        this.fetchImpl = opts.fetchImpl || (typeof fetch === "function" ? fetch.bind(globalThis) : null);
    }

    getProvider() {
        const settings = this.getSettings();
        return String(settings.aiProvider || "lmstudio").toLowerCase() === "openai" ? "openai" : "lmstudio";
    }

    getProviderLabel() {
        return this.getProvider() === "openai" ? "OpenAI" : "LM Studio";
    }

    getEndpoint() {
        const settings = this.getSettings();
        if (this.getProvider() === "openai") {
            return settings.openaiEndpoint || "https://api.openai.com/v1";
        }
        return settings.lmStudioEndpoint || "http://127.0.0.1:1234/v1";
    }

    getModel() {
        const settings = this.getSettings();
        if (this.getProvider() === "openai") {
            return settings.openaiModel || "gpt-5.2-chat-latest";
        }
        return settings.lmStudioModel || "local-model";
    }

    getApiKey() {
        const settings = this.getSettings();
        return String(settings.openaiApiKey || "").trim();
    }

    _instructionRole() {
        return this.getProvider() === "openai" ? "developer" : "system";
    }

    async generatePlan(input, context = {}) {
        const content = await this._requestJsonPlan(input, context);
        return this._normalizePlan(content, input);
    }

    async explainCommand(command, context = {}) {
        const messages = [
            {
                role: this._instructionRole(),
                content: "You explain Kali and Linux commands used inside Skynet Terminal. Keep explanations concise, practical and neutral."
            },
            {
                role: "user",
                content: JSON.stringify({
                    command,
                    context
                })
            }
        ];

        return this._requestChat(messages, 0.2);
    }

    async chat(messages, context = {}) {
        const conversation = Array.isArray(messages) ? messages : [];
        const payload = [
            {
                role: this._instructionRole(),
                content: "You are the assistant inside Skynet Terminal. Respond like a concise, practical ChatGPT-style helper for Windows, Kali WSL, terminals, code, debugging and system questions. Keep answers directly useful."
            },
            ...conversation.map(message => ({
                role: message.role || "user",
                content: typeof message.content === "string" ? message.content : JSON.stringify(message.content || "")
            }))
        ];

        if (context && Object.keys(context).length > 0) {
            payload.splice(1, 0, {
                role: this._instructionRole(),
                content: `Runtime context: ${JSON.stringify(context)}`
            });
        }

        return this._requestChat(payload, 0.4);
    }

    async summarizeSession(log) {
        const messages = [
            {
                role: this._instructionRole(),
                content: "Summarize a Skynet Terminal session into a short operator report with key commands, notable outputs and follow-up ideas."
            },
            {
                role: "user",
                content: JSON.stringify({
                    entries: (log || []).slice(-40)
                })
            }
        ];

        return this._requestChat(messages, 0.3);
    }

    async _requestJsonPlan(input, context) {
        const toolHints = this.getToolRegistry().map(tool => ({
            id: tool.id,
            name: tool.name,
            binary: tool.binary,
            category: tool.category
        }));

        const workflowHints = this.getWorkflowRegistry().map(workflow => ({
            id: workflow.id,
            title: workflow.title
        }));

        const schema = {
            goal: "string",
            summary: "string",
            approvalState: "pending",
            commands: [
                {
                    title: "string",
                    command: "string",
                    expectedOutput: "string"
                }
            ],
            steps: [
                {
                    id: "string",
                    title: "string",
                    command: "string",
                    explanation: "string",
                    expectedOutput: "string",
                    visualTyping: true
                }
            ]
        };

        const messages = [
            {
                role: this._instructionRole(),
                content: "You are the assistant inside Skynet Terminal. Return JSON only. Build step-by-step Kali workspace plans for environment setup, inventory, diagnostics, package checks, system inspection and session reporting. Do not add markdown fences."
            },
            {
                role: "user",
                content: JSON.stringify({
                    input,
                    context,
                    availableTools: toolHints,
                    availableWorkflows: workflowHints,
                    schema
                })
            }
        ];

        const raw = await this._requestChat(messages, 0.2);
        return this.constructor.extractJsonObject(raw);
    }

    async _requestChat(messages, temperature) {
        if (!this.fetchImpl) {
            throw new Error("fetch() n'est pas disponible dans ce contexte renderer.");
        }

        if (this.getProvider() === "openai" && !this.getApiKey()) {
            throw new Error("La cle API OpenAI est manquante dans les parametres.");
        }

        const response = await this.fetchImpl(this._buildApiUrl("/chat/completions"), {
            method: "POST",
            headers: this._buildHeaders(),
            body: JSON.stringify({
                model: this.getModel(),
                temperature,
                messages
            })
        });

        if (!response.ok) {
            const provider = this.getProviderLabel();
            throw new Error(`La requete ${provider} a echoue avec le statut ${response.status}.`);
        }

        const payload = await response.json();
        const message = payload
            && Array.isArray(payload.choices)
            && payload.choices[0]
            && payload.choices[0].message
            && payload.choices[0].message.content;

        if (!message) {
            throw new Error(`${this.getProviderLabel()} a renvoye une reponse vide.`);
        }

        return message;
    }

    _buildHeaders() {
        const headers = {
            "Content-Type": "application/json"
        };

        if (this.getProvider() === "openai") {
            headers.Authorization = `Bearer ${this.getApiKey()}`;
        }

        return headers;
    }

    _buildApiUrl(pathname) {
        const endpoint = this.getEndpoint().replace(/\/$/, "");
        if (endpoint.endsWith("/v1")) {
            return `${endpoint}${pathname}`;
        }
        return `${endpoint}/v1${pathname}`;
    }

    _normalizePlan(content, fallbackGoal) {
        const commands = Array.isArray(content.commands) ? content.commands : [];
        const steps = Array.isArray(content.steps) ? content.steps : commands.map((entry, index) => ({
            id: `plan-step-${index + 1}`,
            title: entry.title || `Step ${index + 1}`,
            command: entry.command || "",
            explanation: entry.expectedOutput || "",
            expectedOutput: entry.expectedOutput || "",
            visualTyping: true
        }));

        return {
            id: `plan-${Date.now().toString(36)}`,
            goal: content.goal || fallbackGoal,
            summary: content.summary || fallbackGoal,
            approvalState: content.approvalState || "pending",
            commands: commands.map((entry, index) => ({
                title: entry.title || `Command ${index + 1}`,
                command: entry.command || "",
                expectedOutput: entry.expectedOutput || ""
            })),
            steps: steps.map((entry, index) => ({
                id: entry.id || `plan-step-${index + 1}`,
                title: entry.title || `Step ${index + 1}`,
                command: entry.command || "",
                explanation: entry.explanation || "",
                expectedOutput: entry.expectedOutput || "",
                visualTyping: entry.visualTyping !== false
            }))
        };
    }

    static extractJsonObject(raw) {
        if (typeof raw !== "string") {
            throw new Error("La reponse IA n'est pas du texte.");
        }

        const trimmed = raw.trim();

        try {
            return JSON.parse(trimmed);
        } catch (error) {
            const blockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
            if (blockMatch && blockMatch[1]) {
                return JSON.parse(blockMatch[1].trim());
            }

            const start = trimmed.indexOf("{");
            const end = trimmed.lastIndexOf("}");
            if (start !== -1 && end !== -1 && end > start) {
                return JSON.parse(trimmed.slice(start, end + 1));
            }

            throw error;
        }
    }
}

module.exports = {
    AiEngine
};
