const toolRegistry = Object.freeze([
    {
        id: "bash",
        name: "GNU Bash",
        binary: "bash",
        category: "shell",
        description: "Shell Kali interactif utilise pour les scripts, alias et workflows.",
        examples: ["bash --version", "bash -lc 'echo ready'"]
    },
    {
        id: "hostnamectl",
        name: "hostnamectl",
        binary: "hostnamectl",
        category: "system",
        description: "Afficher l'identite de l'hote et les informations de plateforme depuis Kali.",
        examples: ["hostnamectl status"]
    },
    {
        id: "ip",
        name: "iproute2",
        binary: "ip",
        category: "network",
        description: "Inspecter les interfaces, les adresses et les routes.",
        examples: ["ip -brief addr", "ip route"]
    },
    {
        id: "ss",
        name: "ss",
        binary: "ss",
        category: "network",
        description: "Afficher les sockets locaux et les services en ecoute.",
        examples: ["ss -tulpen"]
    },
    {
        id: "systemctl",
        name: "systemctl",
        binary: "systemctl",
        category: "services",
        description: "Inspecter l'etat des services dans la distro.",
        examples: ["systemctl --type=service --state=running"]
    },
    {
        id: "journalctl",
        name: "journalctl",
        binary: "journalctl",
        category: "logs",
        description: "Lire les entrees du journal systeme et les logs recents.",
        examples: ["journalctl -n 50 --no-pager"]
    },
    {
        id: "curl",
        name: "curl",
        binary: "curl",
        category: "web",
        description: "Verifier les en-tetes HTTP et les reponses simples de tes endpoints.",
        examples: ["curl -I https://example.com"]
    },
    {
        id: "git",
        name: "Git",
        binary: "git",
        category: "dev",
        description: "Controle de version et inspection de depot depuis le workspace Kali.",
        examples: ["git status", "git remote -v"]
    },
    {
        id: "python3",
        name: "Python 3",
        binary: "python3",
        category: "dev",
        description: "Lancer des scripts locaux, parser des sorties et prototyper dans Kali.",
        examples: ["python3 --version"]
    },
    {
        id: "dpkg-query",
        name: "dpkg-query",
        binary: "dpkg-query",
        category: "packages",
        description: "Lister les paquets installes et leurs versions dans la distro Kali.",
        examples: ["dpkg-query -W | head"]
    }
]);

function getToolRegistry() {
    return toolRegistry.map(tool => ({
        ...tool,
        examples: tool.examples.slice()
    }));
}

function findToolDefinition(id) {
    return toolRegistry.find(tool => tool.id === id) || null;
}

module.exports = {
    toolRegistry,
    getToolRegistry,
    findToolDefinition
};
