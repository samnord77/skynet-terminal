export type TerminalOutputEvent = {
    data: string;
    termId: number;
    cwd?: string;
};

export type TerminalCommandEvent = {
    command: string;
    termId: number;
    mode: "line" | "visual-preview" | "visual-run";
};

export type TerminalServiceOptions = {
    getTerminal?: () => any;
    getKeyboard?: () => any;
    getCurrentTermIndex?: () => number;
    getSettings?: () => Record<string, unknown>;
    delay?: (ms: number) => Promise<void>;
};

export declare class TerminalService {
    constructor(opts?: TerminalServiceOptions);
    getActiveTerminal(): any;
    getCurrentCwd(): string;
    focus(): void;
    onOutput(listener: (event: TerminalOutputEvent) => void): () => void;
    onCommand(listener: (event: TerminalCommandEvent) => void): () => void;
    typeText(text: string, options?: Record<string, unknown>): Promise<{ typed: string; termId: number }>;
    pressEnter(options?: Record<string, unknown>): Promise<void>;
    sendLine(command: string): Promise<{ command: string; termId: number; executed: boolean }>;
    runVisualCommand(command: string, options?: Record<string, unknown>): Promise<{ command: string; termId: number; executed: boolean }>;
    openShell(command: string, options?: Record<string, unknown>): Promise<{ command: string; termId: number; executed: boolean }>;
    refreshOutputBinding(): any;
    destroy(): void;
}
