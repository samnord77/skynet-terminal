export type AiPlanCommand = {
    title: string;
    command: string;
    expectedOutput: string;
};

export type AiPlanStep = {
    id: string;
    title: string;
    command: string;
    explanation: string;
    expectedOutput: string;
    visualTyping: boolean;
};

export type AiPlan = {
    id: string;
    goal: string;
    summary: string;
    approvalState: string;
    commands: AiPlanCommand[];
    steps: AiPlanStep[];
};

export declare class AiEngine {
    constructor(opts?: Record<string, unknown>);
    getProvider(): string;
    getProviderLabel(): string;
    getEndpoint(): string;
    getModel(): string;
    getApiKey(): string;
    generatePlan(input: string, context?: Record<string, unknown>): Promise<AiPlan>;
    explainCommand(command: string, context?: Record<string, unknown>): Promise<string>;
    chat(messages: Array<{ role: string; content: string }>, context?: Record<string, unknown>): Promise<string>;
    summarizeSession(log: unknown[]): Promise<string>;
    static extractJsonObject(raw: string): Record<string, unknown>;
}
