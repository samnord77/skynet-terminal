export type WorkflowStep = {
    title: string;
    command: string;
    expectedOutput: string;
};

export type WorkflowDefinition = {
    id: string;
    title: string;
    description: string;
    reportTemplate: string;
    steps: WorkflowStep[];
};

export declare const workflowRegistry: readonly WorkflowDefinition[];
export declare function getWorkflowRegistry(): WorkflowDefinition[];
export declare function findWorkflowDefinition(id: string): WorkflowDefinition | null;
export declare function buildWorkflowPlan(id: string): {
    id: string;
    goal: string;
    summary: string;
    approvalState: string;
    commands: Array<{
        title: string;
        command: string;
        expectedOutput: string;
    }>;
    steps: Array<{
        id: string;
        title: string;
        command: string;
        explanation: string;
        expectedOutput: string;
        visualTyping: boolean;
    }>;
    reportTemplate: string;
};
