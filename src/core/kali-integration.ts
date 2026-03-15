export type KaliEnvironmentStatus = {
    available: boolean;
    binary: string;
    distro: string;
    distros: string[];
    distroInstalled: boolean;
    error: string | null;
};

export type KaliRunResult = {
    ok: boolean;
    distro: string;
    command: string;
    args: string[];
    stdout: string;
    stderr: string;
    exitCode: number | null;
    signal?: string | null;
};

export declare class KaliIntegration {
    constructor(opts?: Record<string, unknown>);
    getDistroName(): string;
    getBinary(): string;
    buildOpenShellCommand(): string;
    buildInteractiveCommand(command: string): string;
    dryRun(command: string): {
        distro: string;
        binary: string;
        command: string;
        args: string[];
        printable: string;
    };
    openInteractiveShell(options?: Record<string, unknown>): Promise<unknown>;
    checkEnvironment(): Promise<KaliEnvironmentStatus>;
    run(command: string, options?: Record<string, unknown>): Promise<KaliRunResult>;
    stream(command: string, options?: Record<string, unknown>): {
        child: unknown;
        promise: Promise<KaliRunResult>;
        cancel: () => void;
        onStdout: (listener: (chunk: string) => void) => () => boolean;
        onStderr: (listener: (chunk: string) => void) => () => boolean;
        onExit: (listener: (result: KaliRunResult) => void) => () => boolean;
    };
}
