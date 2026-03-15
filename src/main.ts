export type WorkspaceBridge = {
    terminal: unknown;
    kali: unknown;
    ai: unknown;
    getWorkspaceState: () => {
        settings: Record<string, unknown>;
        tools: unknown[];
        workflows: unknown[];
    };
    refreshStatus: () => Promise<Record<string, unknown>>;
    openKaliShell: (options?: Record<string, unknown>) => Promise<unknown>;
    runKaliCommand: (command: string, options?: Record<string, unknown>) => Promise<unknown>;
    runWorkflow: (id: string, options?: Record<string, unknown>) => Promise<unknown>;
    executeWorkflow: (id: string, options?: Record<string, unknown>) => Promise<unknown>;
    executePlanStep: (step: { command: string }, options?: Record<string, unknown>) => Promise<unknown>;
    generatePlan: (input: string, context?: Record<string, unknown>) => Promise<unknown>;
    explainCommand: (command: string, context?: Record<string, unknown>) => Promise<string>;
    chat: (messages: Array<{ role: string; content: string }>, context?: Record<string, unknown>) => Promise<string>;
    summarizeSession: () => Promise<string>;
    getRecentSessionEntries: (limit?: number) => unknown[];
    buildSessionReport: () => {
        generatedAt: string;
        distro: string;
        endpoint: string;
        model: string;
        cwd: string;
        entries: unknown[];
        markdown: string;
    };
    getSessionLog: () => unknown[];
};

export declare function createWorkspaceBridge(opts?: Record<string, unknown>): WorkspaceBridge;
