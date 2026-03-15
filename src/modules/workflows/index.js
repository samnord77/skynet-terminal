const workflowRegistry = Object.freeze([
    {
        id: "kali-readiness",
        title: "Preparation Kali",
        description: "Confirmer l'identite de la distro, le contexte utilisateur et le dossier de travail avant une session.",
        reportTemplate: "Resumer la version de la distro, l'utilisateur courant et le chemin du workspace.",
        steps: [
            {
                title: "Identifier la distro",
                command: "uname -a && printf '\\n' && cat /etc/os-release | sed -n '1,6p'",
                expectedOutput: "Noyau et metadonnees de la distro."
            },
            {
                title: "Verifier le contexte utilisateur",
                command: "whoami && pwd",
                expectedOutput: "Utilisateur Kali courant et dossier de travail."
            }
        ]
    },
    {
        id: "host-inventory",
        title: "Inventaire de l'hote",
        description: "Capturer l'etat de base du systeme, des paquets et du systeme de fichiers.",
        reportTemplate: "Lister l'identite de l'hote, l'etat des paquets et le contenu du dossier courant.",
        steps: [
            {
                title: "Identite de l'hote",
                command: "hostnamectl status || hostname",
                expectedOutput: "Nom de la machine et details de la plateforme."
            },
            {
                title: "Etat des paquets",
                command: "dpkg-query -W | head -n 20",
                expectedOutput: "Premiers paquets installes pour reference."
            },
            {
                title: "Etat du workspace",
                command: "pwd && ls -la",
                expectedOutput: "Dossier courant et contenu principal."
            }
        ]
    },
    {
        id: "network-baseline",
        title: "Base reseau",
        description: "Collecter l'etat local des interfaces, routes et sockets en ecoute.",
        reportTemplate: "Resumer les interfaces, les routes et les services locaux en ecoute.",
        steps: [
            {
                title: "Interfaces",
                command: "ip -brief addr",
                expectedOutput: "Liste concise des interfaces et adresses IP."
            },
            {
                title: "Routage",
                command: "ip route",
                expectedOutput: "Routes actuelles et passerelle par defaut."
            },
            {
                title: "Services en ecoute",
                command: "ss -tulpen",
                expectedOutput: "Sockets TCP et UDP en ecoute."
            }
        ]
    },
    {
        id: "service-status",
        title: "Etat des services",
        description: "Inspecter les services actifs et les journaux recents.",
        reportTemplate: "Resumer les services actifs et les messages de journal notables.",
        steps: [
            {
                title: "Services actifs",
                command: "systemctl --type=service --state=running --no-pager",
                expectedOutput: "Services actuellement actifs dans Kali."
            },
            {
                title: "Journal recent",
                command: "journalctl -n 40 --no-pager",
                expectedOutput: "Entrees recentes du journal pour la session."
            }
        ]
    }
]);

function getWorkflowRegistry() {
    return workflowRegistry.map(workflow => ({
        ...workflow,
        steps: workflow.steps.map(step => ({ ...step }))
    }));
}

function findWorkflowDefinition(id) {
    return workflowRegistry.find(workflow => workflow.id === id) || null;
}

function buildWorkflowPlan(id) {
    const workflow = findWorkflowDefinition(id);
    if (!workflow) {
        throw new Error(`Workflow inconnu "${id}"`);
    }

    return {
        id: `workflow-${workflow.id}-${Date.now().toString(36)}`,
        goal: workflow.title,
        summary: workflow.description,
        approvalState: "pending",
        commands: workflow.steps.map(step => ({
            title: step.title,
            command: step.command,
            expectedOutput: step.expectedOutput
        })),
        steps: workflow.steps.map((step, index) => ({
            id: `${workflow.id}-step-${index + 1}`,
            title: step.title,
            command: step.command,
            explanation: step.expectedOutput,
            expectedOutput: step.expectedOutput,
            visualTyping: true
        })),
        reportTemplate: workflow.reportTemplate
    };
}

module.exports = {
    workflowRegistry,
    getWorkflowRegistry,
    findWorkflowDefinition,
    buildWorkflowPlan
};
