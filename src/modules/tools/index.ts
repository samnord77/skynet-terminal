export type ToolDefinition = {
    id: string;
    name: string;
    binary: string;
    category: string;
    description: string;
    examples: string[];
};

export declare const toolRegistry: readonly ToolDefinition[];
export declare function getToolRegistry(): ToolDefinition[];
export declare function findToolDefinition(id: string): ToolDefinition | null;
