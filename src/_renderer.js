// Disable eval()
window.eval = global.eval = function () {
    throw new Error("eval() is disabled for security reasons.");
};
// Security helper :)
window._escapeHtml = text => {
    let map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => {return map[m];});
};
window._encodePathURI = uri => {
    return encodeURI(uri).replace(/#/g, "%23");
};
window._purifyCSS = str => {
    if (typeof str === "undefined") return "";
    if (typeof str !== "string") {
        str = str.toString();
    }
    return str.replace(/[<]/g, "");
};
window._escapeJsSingleQuoted = text => {
    return String(text || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
};
window._delay = ms => {
    return new Promise((resolve, reject) => {
        setTimeout(resolve, ms);
    });
};

// Initiate basic error handling
window.onerror = (msg, path, line, col, error) => {
    document.getElementById("boot_screen").innerHTML += `${error} :  ${msg}<br/>==> at ${path}  ${line}:${col}`;
};

const path = require("path");
const fs = require("fs");
const os = require("os");
const electron = require("electron");
const remote = require("@electron/remote");
const { createWorkspaceBridge } = require("./main.js");
const ipc = electron.ipcRenderer;

const settingsDir = remote.app.getPath("userData");
const themesDir = path.join(settingsDir, "themes");
const keyboardsDir = path.join(settingsDir, "keyboards");
const fontsDir = path.join(settingsDir, "fonts");
const settingsFile = path.join(settingsDir, "settings.json");
const shortcutsFile = path.join(settingsDir, "shortcuts.json");
const lastWindowStateFile = path.join(settingsDir, "lastWindowState.json");

// Load config
window.settings = require(settingsFile);
window.shortcuts = require(shortcutsFile);
window.lastWindowState = require(lastWindowStateFile);
window.appMeta = Object.freeze({
    name: "Skynet Terminal",
    shortName: "SKYNET",
    repoUrl: "https://github.com/samnord77/skynet-terminal",
    releaseApiPath: "/repos/samnord77/skynet-terminal/releases/latest"
});

window.ensureWorkspaceSettings = () => {
    const defaults = {
        aiProvider: "lmstudio",
        kaliDistro: "kali-linux",
        lmStudioEndpoint: "http://127.0.0.1:1234/v1",
        lmStudioModel: "",
        openaiEndpoint: "https://api.openai.com/v1",
        openaiModel: "gpt-5.2-chat-latest",
        openaiApiKey: "",
        workspaceTypingDelay: 28
    };
    let changed = false;

    Object.keys(defaults).forEach(key => {
        if (typeof window.settings[key] === "undefined" || window.settings[key] === null || window.settings[key] === "") {
            window.settings[key] = defaults[key];
            changed = true;
        }
    });

    if (changed) {
        fs.writeFileSync(settingsFile, JSON.stringify(window.settings, "", 4));
    }
};

window.ensureWorkspaceSettings();

window.ensureBuiltinShortcuts = () => {
    const requiredShortcuts = [
        { type: "app", trigger: "Ctrl+Shift+O", action: "COMMAND_CENTER", enabled: true },
        { type: "app", trigger: "Ctrl+Shift+W", action: "KALI_WORKSPACE", enabled: true }
    ];
    let changed = false;

    requiredShortcuts.forEach(shortcut => {
        if (!window.shortcuts.some(entry => entry.type === shortcut.type && entry.action === shortcut.action)) {
            window.shortcuts.push(shortcut);
            changed = true;
        }
    });

    if (changed) {
        fs.writeFileSync(shortcutsFile, JSON.stringify(window.shortcuts, "", 4));
    }
};

window.ensureBuiltinShortcuts();

window.workspaceState = {
    status: null,
    lastPlan: null,
    lastExplanation: "",
    lastSummary: "",
    lastError: "",
    lastInfo: "Workspace pret.",
    prompt: "",
    commandInput: "",
    chatInput: "",
    chatHistory: [],
    chatBusy: false,
    lastReportPath: ""
};

window.workspaceChatQuickPrompts = [
    {
        label: "Expliquer ma commande",
        prompt: "Explique en francais la commande Kali actuellement saisie, ses risques et ce qu'elle retourne."
    },
    {
        label: "Resume de session",
        prompt: "Resume la session courante, les actions deja faites et les prochaines etapes utiles."
    },
    {
        label: "Planifier une tache",
        prompt: "Aide-moi a preparer un plan clair pour la tache suivante dans le workspace Kali : "
    },
    {
        label: "Comparer les providers IA",
        prompt: "Explique la difference pratique entre OpenAI et LM Studio dans cette application."
    }
];

window.skynetSession = {
    host: os.hostname(),
    platform: `${os.type()} ${os.release()}`,
    theme: window.settings.theme,
    cwd: window.settings.cwd || remote.app.getPath("home")
};

window.updateSkynetStatus = updates => {
    Object.assign(window.skynetSession, updates);

    const labels = {
        host: `HOST ${window.skynetSession.host}`,
        platform: `OS ${window.skynetSession.platform}`,
        theme: `THEME ${window.skynetSession.theme}`,
        cwd: `CWD ${window.skynetSession.cwd}`
    };

    Object.keys(labels).forEach(key => {
        const element = document.getElementById(`skynet_status_${key}`);
        if (element) {
            element.textContent = labels[key];
        }
    });
};

window.shouldUseFastBoot = () => {
    return Boolean(window.settings.nointro || window.settings.nointroOverride);
};

window.uiDelay = ms => {
    return window._delay(window.shouldUseFastBoot() ? Math.min(ms, 40) : ms);
};

window.modulesReady = Promise.resolve();
window.ensureSkynetModulesReady = async () => {
    if (!window._modulesInitialized && typeof window.initializeSkynetModules === "function") {
        window.modulesReady = window.initializeSkynetModules();
    }
    if (window.modulesReady && typeof window.modulesReady.then === "function") {
        await window.modulesReady;
    }
};

window.minimizeSkynetWindow = () => {
    electron.remote.getCurrentWindow().minimize();
};

window.quitSkynetApp = () => {
    electron.remote.app.quit();
};

window.toggleSkynetWindowMode = () => {
    window.toggleFullScreen();
    window.syncWindowChrome();
};

window.toggleKeyboardPanel = () => {
    const keyboard = document.getElementById("keyboard");
    if (!keyboard) return;

    keyboard.classList.toggle("collapsed");
    window.syncWindowChrome();

    if (window.term && typeof window.currentTerm !== "undefined" && window.term[window.currentTerm]) {
        setTimeout(() => {
            window.term[window.currentTerm].fit();
            window.term[window.currentTerm].term.focus();
        }, 60);
    }
};

window.syncWindowChrome = () => {
    const chrome = document.getElementById("skynet_window_chrome");
    if (!chrome) return;

    const fullscreenButton = document.getElementById("skynet_window_toggle");
    const keyboardButton = document.getElementById("skynet_keyboard_toggle");
    const isFullscreen = electron.remote.getCurrentWindow().isFullScreen();
    const keyboard = document.getElementById("keyboard");
    const keyboardHidden = keyboard ? keyboard.classList.contains("collapsed") : false;

    if (fullscreenButton) {
        fullscreenButton.textContent = isFullscreen ? "FENETRE" : "PLEIN ECRAN";
    }

    if (keyboardButton) {
        keyboardButton.textContent = keyboardHidden ? "CLAVIER +" : "CLAVIER -";
    }
};

window.initWindowChrome = () => {
    if (document.getElementById("skynet_window_chrome")) return;

    document.body.insertAdjacentHTML("beforeend", `
        <div id="skynet_window_chrome">
            <button id="skynet_keyboard_toggle" onclick="window.toggleKeyboardPanel()">CLAVIER -</button>
            <button onclick="window.minimizeSkynetWindow()">REDUIRE</button>
            <button id="skynet_window_toggle" onclick="window.toggleSkynetWindowMode()">PLEIN ECRAN</button>
            <button class="danger" onclick="window.quitSkynetApp()">QUITTER</button>
        </div>
    `);

    window.syncWindowChrome();
};

window.getSkynetCommand = action => {
    if (process.platform === "win32") {
        switch(action) {
            case "SYSTEM_SCAN":
                return "Get-ComputerInfo | Select-Object CsName,WindowsProductName,WindowsVersion,OsArchitecture";
            case "NETWORK_SCAN":
                return "ipconfig /all";
            case "LIST_FILES":
                return "Get-ChildItem -Force";
            case "SHOW_CWD":
                return "Get-Location";
            case "CLEAR_SCREEN":
                return "cls";
            default:
                return "";
        }
    }

    switch(action) {
        case "SYSTEM_SCAN":
            return "uname -a && whoami";
        case "NETWORK_SCAN":
            return "ip addr || ifconfig";
        case "LIST_FILES":
            return "ls -la";
        case "SHOW_CWD":
            return "pwd";
        case "CLEAR_SCREEN":
            return "clear";
        default:
            return "";
    }
};

window.runSkynetCommand = action => {
    const command = window.getSkynetCommand(action);
    if (!command || !window.term || !window.term[window.currentTerm]) return;

    window.term[window.currentTerm].writelr(command);
    window.term[window.currentTerm].term.focus();
};

window.openGeoMapWindow = payload => {
    if (!payload || !payload.ip || !Number.isFinite(Number(payload.latitude)) || !Number.isFinite(Number(payload.longitude))) {
        return false;
    }

    ipc.send("openGeoWindow", {
        ip: String(payload.ip),
        latitude: Number(payload.latitude),
        longitude: Number(payload.longitude),
        city: String(payload.city || ""),
        country: String(payload.country || ""),
        region: String(payload.region || ""),
        source: String(payload.source || "network")
    });
    return true;
};

window.renderWorkspaceStatusCards = status => {
    if (!status) {
        return `<div class="workspace_statuschip"><strong>Workspace</strong><span>Verification de WSL, Kali et du provider IA...</span></div>`;
    }

    const items = [
        {
            label: "WSL",
            value: status.available ? "PRET" : "ABSENT"
        },
        {
            label: "DISTRO",
            value: status.distroInstalled ? status.distro : `${status.distro} INTROUVABLE`
        },
        {
            label: "CWD",
            value: status.cwd || window.settings.cwd || "-"
        },
        {
            label: "PROVIDER IA",
            value: status.aiProviderLabel || (window.settings.aiProvider === "openai" ? "OpenAI" : "LM Studio")
        },
        {
            label: "ENDPOINT IA",
            value: status.aiEndpoint || (window.settings.aiProvider === "openai" ? window.settings.openaiEndpoint : window.settings.lmStudioEndpoint)
        },
        {
            label: "MODELE IA",
            value: status.aiModel || (window.settings.aiProvider === "openai" ? (window.settings.openaiModel || "(non defini)") : (window.settings.lmStudioModel || "(non defini)"))
        }
    ];

    return items.map(item => {
        return `<div class="workspace_statuschip">
            <strong>${window._escapeHtml(item.label)}</strong>
            <span>${window._escapeHtml(String(item.value || "-"))}</span>
        </div>`;
    }).join("");
};

window.renderWorkspaceTools = tools => {
    return tools.map(tool => {
        const example = tool.examples[0] || tool.binary;
        return `<div class="workspace_card">
            <strong>${window._escapeHtml(tool.name)}</strong>
            <span>${window._escapeHtml(tool.description)}</span>
            <span class="workspace_muted">${window._escapeHtml(tool.binary)} · ${window._escapeHtml(tool.category)}</span>
            <button onclick="window.prefillWorkspaceCommand('${window._escapeJsSingleQuoted(example)}')">Utiliser l'exemple</button>
        </div>`;
    }).join("");
};

window.renderWorkspaceWorkflows = workflows => {
    return workflows.map(workflow => {
        return `<div class="workspace_card">
            <strong>${window._escapeHtml(workflow.title)}</strong>
            <span>${window._escapeHtml(workflow.description)}</span>
            <div class="workspace_actions">
                <button onclick="window.loadWorkspaceWorkflow('${workflow.id}')">Ouvrir le plan</button>
                <button onclick="window.runWorkspaceWorkflowNow('${workflow.id}')">Lancer</button>
            </div>
        </div>`;
    }).join("");
};

window.renderWorkspacePlan = plan => {
    if (!plan || !Array.isArray(plan.steps) || !plan.steps.length) {
        return `<div class="workspace_panel"><strong>Aucun plan actif</strong><span>Genere un plan IA ou ouvre un workflow integre.</span></div>`;
    }

    const steps = plan.steps.map((step, index) => {
        return `<div class="workspace_card">
            <strong>${window._escapeHtml(step.title)}</strong>
            <span>${window._escapeHtml(step.command)}</span>
            <span class="workspace_muted">${window._escapeHtml(step.expectedOutput || step.explanation || "")}</span>
            <div class="workspace_actions">
                <button onclick="window.executeWorkspacePlanStep(${index})">Ecrire + lancer</button>
                <button onclick="window.prefillWorkspaceCommand('${window._escapeJsSingleQuoted(step.command)}')">Copier dans la saisie</button>
            </div>
        </div>`;
    }).join("");

    return `<div class="workspace_panel">
        <strong>${window._escapeHtml(plan.goal || "Plan workspace")}</strong>
        <span>${window._escapeHtml(plan.summary || "")}</span>
        <div class="workspace_actions">
            <button onclick="window.executeWorkspacePlan()">Lancer tout le plan</button>
        </div>
    </div>
    <div class="workspace_steps">${steps}</div>`;
};

window.renderWorkspaceRecentLog = () => {
    if (!window.workspaceBridge) {
        return `<div class="workspace_panel"><strong>Journal de session</strong><span>Le bridge workspace est indisponible.</span></div>`;
    }

    const entries = window.workspaceBridge.getRecentSessionEntries(12);
    if (!entries.length) {
        return `<div class="workspace_panel"><strong>Journal de session</strong><span>Aucune activite pour le moment.</span></div>`;
    }

    const lines = entries.map(entry => {
        const payload = (entry.command || entry.printable || entry.data || entry.input || entry.workflowId || entry.planId || "")
            .toString()
            .replace(/\s+/g, " ")
            .trim();
        return `[${entry.ts}] ${entry.type}${payload ? ` :: ${payload}` : ""}`;
    }).join("\n");

    return `<div class="workspace_panel"><strong>Activite recente</strong><div class="workspace_log">${window._escapeHtml(lines)}</div></div>`;
};

window.renderWorkspaceMessages = () => {
    let html = "";

    if (window.workspaceState.lastError) {
        html += `<div class="workspace_panel"><strong>Derniere erreur</strong><span>${window._escapeHtml(window.workspaceState.lastError)}</span></div>`;
    }

    if (window.workspaceState.lastInfo) {
        html += `<div class="workspace_panel"><strong>Statut</strong><span>${window._escapeHtml(window.workspaceState.lastInfo)}</span></div>`;
    }

    if (window.workspaceState.lastExplanation) {
        html += `<div class="workspace_panel"><strong>Explication IA</strong><div class="workspace_log">${window._escapeHtml(window.workspaceState.lastExplanation)}</div></div>`;
    }

    if (window.workspaceState.lastSummary) {
        html += `<div class="workspace_panel"><strong>Resume de session</strong><div class="workspace_log">${window._escapeHtml(window.workspaceState.lastSummary)}</div></div>`;
    }

    if (window.workspaceState.lastReportPath) {
        html += `<div class="workspace_panel"><strong>Dernier rapport exporte</strong><span>${window._escapeHtml(window.workspaceState.lastReportPath)}</span><div class="workspace_actions"><button onclick="require('electron').shell.showItemInFolder('${window._escapeJsSingleQuoted(window.workspaceState.lastReportPath)}')">Afficher dans le dossier</button></div></div>`;
    }

    html += window.renderWorkspaceRecentLog();

    return html;
};

window.getWorkspaceChatEntries = () => {
    return Array.isArray(window.workspaceState.chatHistory) ? window.workspaceState.chatHistory : [];
};

window.createWorkspaceChatEntry = (role, content, extra = {}) => {
    return {
        id: `${role}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        role,
        content: String(content || ""),
        createdAt: new Date().toISOString(),
        provider: extra.provider || (role === "assistant" ? (window.settings.aiProvider === "openai" ? "OpenAI" : "LM Studio") : "Vous")
    };
};

window.buildWorkspaceChatPayload = () => {
    return window.getWorkspaceChatEntries().slice(-18).map(entry => ({
        role: entry.role,
        content: entry.content
    }));
};

window.formatWorkspaceChatContent = text => {
    const escaped = window._escapeHtml(String(text || ""));
    const codeBlocks = [];
    let formatted = escaped.replace(/```(?:[^\n`]*)\n?([\s\S]*?)```/g, (match, code) => {
        const id = codeBlocks.length;
        codeBlocks.push(`<pre class="workspace_chat_code"><code>${code.trim()}</code></pre>`);
        return `__SKYNET_CODE_BLOCK_${id}__`;
    });

    formatted = formatted.replace(/`([^`]+)`/g, "<code class=\"workspace_chat_inline\">$1</code>");
    formatted = formatted.replace(/\n/g, "<br>");

    codeBlocks.forEach((block, index) => {
        formatted = formatted.replace(`__SKYNET_CODE_BLOCK_${index}__`, block);
    });

    return formatted;
};

window.getWorkspaceChatMeta = entry => {
    const label = entry.role === "assistant"
        ? (entry.provider || (window.settings.aiProvider === "openai" ? "OpenAI" : "LM Studio"))
        : "Vous";
    const stamp = entry.createdAt
        ? new Date(entry.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
        : "--:--";
    return `${label} · ${stamp}`;
};

window.prefillWorkspaceChatInput = (text, send = false) => {
    const prompt = String(text || "");
    window.workspaceState.chatInput = prompt;
    const input = document.getElementById("workspaceChatInput");
    if (input) {
        input.value = prompt;
        input.focus();
        input.setSelectionRange(prompt.length, prompt.length);
    }

    if (send) {
        return window.sendWorkspaceChat();
    }

    return false;
};

window.handleWorkspaceChatComposerKeydown = event => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        window.sendWorkspaceChat();
    }
};

window.copyWorkspaceChatMessage = index => {
    const entry = window.getWorkspaceChatEntries()[index];
    if (!entry) return false;
    electron.clipboard.writeText(entry.content || "");
    window.workspaceState.lastInfo = "Message copie dans le presse-papiers.";
    window.workspaceState.lastError = "";
    return window.renderKaliWorkspace(false);
};

window.extractWorkspaceCommandCandidate = content => {
    const text = String(content || "").trim();
    if (!text) return "";

    const fencedMatch = text.match(/```(?:bash|shell|sh|pwsh|powershell|cmd)?\s*([\s\S]*?)```/i);
    const candidate = fencedMatch ? fencedMatch[1] : text;
    const lines = candidate
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line && !line.startsWith("#") && !line.startsWith("- "));

    return lines[0] || "";
};

window.useWorkspaceChatAsCommand = index => {
    const entry = window.getWorkspaceChatEntries()[index];
    if (!entry) return false;

    const command = window.extractWorkspaceCommandCandidate(entry.content);
    if (!command) {
        window.workspaceState.lastError = "Aucune commande exploitable n'a ete detectee dans ce message.";
        return window.renderKaliWorkspace(false);
    }

    window.prefillWorkspaceCommand(command);
    window.workspaceState.lastInfo = "Commande recuperee depuis la reponse IA.";
    window.workspaceState.lastError = "";
    return window.renderKaliWorkspace(false);
};

window.scrollWorkspaceChatToBottom = () => {
    const log = document.querySelector("#skynetWorkspace .workspace_chat_log");
    if (log) {
        log.scrollTop = log.scrollHeight;
    }
};

window.renderWorkspaceChat = () => {
    const history = window.getWorkspaceChatEntries();
    const providerLabel = window.settings.aiProvider === "openai" ? "OpenAI" : "LM Studio";
    const modelLabel = (window.workspaceState.status && window.workspaceState.status.aiModel)
        || (window.settings.aiProvider === "openai" ? window.settings.openaiModel : window.settings.lmStudioModel)
        || "modele non defini";
    const quickPrompts = window.workspaceChatQuickPrompts.map(prompt => (
        `<button class="workspace_chip" onclick="window.prefillWorkspaceChatInput('${window._escapeJsSingleQuoted(prompt.prompt)}')">${window._escapeHtml(prompt.label)}</button>`
    )).join("");

    const messages = history.length ? history.map((entry, index) => {
        const isAssistant = entry.role === "assistant";
        const displayName = isAssistant ? "Assistant Skynet" : "Vous";
        const actions = isAssistant ? `
            <div class="workspace_chat_message_actions">
                <button onclick="window.copyWorkspaceChatMessage(${index})">Copier</button>
                <button onclick="window.useWorkspaceChatAsCommand(${index})">Vers commande</button>
            </div>` : "";

        return `<article class="workspace_chat_message ${isAssistant ? "assistant" : "user"}">
            <div class="workspace_chat_avatar">${isAssistant ? "IA" : "VO"}</div>
            <div class="workspace_chat_bubble">
                <div class="workspace_chat_message_head">
                    <strong>${displayName}</strong>
                    <span>${window._escapeHtml(window.getWorkspaceChatMeta(entry))}</span>
                </div>
                <div class="workspace_chat_message_body">${window.formatWorkspaceChatContent(entry.content || "")}</div>
                ${actions}
            </div>
        </article>`;
    }).join("") : `
        <div class="workspace_chat_empty">
            <div class="workspace_chat_empty_badge">${window._escapeHtml(providerLabel)}</div>
            <h3>Assistant IA pret</h3>
            <p>Pose une question sur Windows, Kali, les commandes, le projet ou demande une explication pas a pas. Les reponses peuvent ensuite etre copiees ou transformees en commande.</p>
            <div class="workspace_chat_quickprompts">${quickPrompts}</div>
        </div>`;

    const typingIndicator = window.workspaceState.chatBusy ? `
        <article class="workspace_chat_message assistant pending">
            <div class="workspace_chat_avatar">IA</div>
            <div class="workspace_chat_bubble">
                <div class="workspace_chat_message_head">
                    <strong>Assistant Skynet</strong>
                    <span>${window._escapeHtml(providerLabel)} · en cours</span>
                </div>
                <div class="workspace_chat_typing">
                    <span></span><span></span><span></span>
                </div>
            </div>
        </article>` : "";

    return `<div class="workspace_panel workspace_chat_shell">
        <div class="workspace_chat_header">
            <div>
                <strong>Chat IA</strong>
                <span>Conversation locale du workspace avec ${window._escapeHtml(providerLabel)}</span>
            </div>
            <div class="workspace_chat_badges">
                <span class="workspace_chat_badge">${window._escapeHtml(providerLabel)}</span>
                <span class="workspace_chat_badge">${window._escapeHtml(modelLabel)}</span>
                <span class="workspace_chat_badge">${history.length} message(s)</span>
            </div>
        </div>
        <div class="workspace_chat_log">
            ${messages}
            ${typingIndicator}
        </div>
        <div class="workspace_chat_quickprompts">${quickPrompts}</div>
        <div class="workspace_chat_composer">
            <textarea id="workspaceChatInput" rows="5" placeholder="Ecris comme dans ChatGPT : demande une explication, un plan, une traduction ou une aide sur une commande..." onkeydown="window.handleWorkspaceChatComposerKeydown(event)" oninput="window.workspaceState.chatInput = this.value">${window._escapeHtml(window.workspaceState.chatInput || "")}</textarea>
            <div class="workspace_chat_toolbar">
                <span class="workspace_muted">Ctrl+Entree pour envoyer</span>
                <div class="workspace_actions">
                    <button onclick="window.sendWorkspaceChat()" ${window.workspaceState.chatBusy ? "disabled" : ""}>Envoyer</button>
                    <button onclick="window.clearWorkspaceChat()" ${window.workspaceState.chatBusy ? "disabled" : ""}>Nouveau chat</button>
                </div>
            </div>
        </div>
    </div>`;
};

window.renderKaliWorkspace = async (refreshStatus = false) => {
    const root = document.getElementById("skynetWorkspace");
    if (!root || !window.workspaceBridge) return;

    if (refreshStatus || !window.workspaceState.status) {
        try {
            window.workspaceState.status = await window.workspaceBridge.refreshStatus();
            window.workspaceState.lastError = "";
        } catch (error) {
            window.workspaceState.status = {
                available: false,
                distro: window.settings.kaliDistro,
                distroInstalled: false,
                aiProvider: window.settings.aiProvider,
                aiProviderLabel: window.settings.aiProvider === "openai" ? "OpenAI" : "LM Studio",
                aiEndpoint: window.settings.aiProvider === "openai" ? window.settings.openaiEndpoint : window.settings.lmStudioEndpoint,
                aiModel: window.settings.aiProvider === "openai" ? window.settings.openaiModel : window.settings.lmStudioModel,
                error: error.message
            };
            window.workspaceState.lastError = error.message;
        }
    }

    const state = window.workspaceBridge.getWorkspaceState();

    root.innerHTML = `<p class="workspace_intro">Bridge local vers WSL2 Kali, terminal visuel et assistants IA. Les outils installes dans la distro restent disponibles manuellement dans le shell, et ce panneau ajoute du chat, des plans, des explications et des workflows.</p>
        <div class="workspace_status">
            ${window.renderWorkspaceStatusCards(window.workspaceState.status)}
        </div>
        <div class="workspace_section">
            <div class="workspace_actions">
                <button onclick="window.openWorkspaceShell()">Ouvrir le shell Kali</button>
                <button onclick="window.renderKaliWorkspace(true)">Actualiser le statut</button>
                <button onclick="window.summarizeWorkspaceSession()">Resumer la session</button>
                <button onclick="window.exportWorkspaceReport()">Exporter le rapport</button>
            </div>
        </div>
        <div class="workspace_section">
            <div class="workspace_panel">
                <strong>Demande de plan IA</strong>
                <textarea id="workspacePrompt" rows="4" placeholder="Decris la verification, l'inventaire ou la tache que tu veux preparer" oninput="window.workspaceState.prompt = this.value">${window._escapeHtml(window.workspaceState.prompt || "")}</textarea>
                <div class="workspace_actions">
                    <button onclick="window.generateWorkspacePlan()">Generer le plan</button>
                </div>
            </div>
        </div>
        <div class="workspace_section">
            ${window.renderWorkspaceChat()}
        </div>
        <div class="workspace_section">
            <div class="workspace_panel">
                <strong>Commande Kali</strong>
                <input id="workspaceCommandInput" type="text" value="${window._escapeHtml(window.workspaceState.commandInput || "")}" placeholder="uname -a" oninput="window.workspaceState.commandInput = this.value" />
                <div class="workspace_actions">
                    <button onclick="window.runWorkspaceCommand()">Ecrire + lancer</button>
                    <button onclick="window.explainWorkspaceCommand()">Expliquer</button>
                </div>
            </div>
        </div>
        <div class="workspace_section">
            <strong>Workflows integres</strong>
            <div class="workspace_grid">
                ${window.renderWorkspaceWorkflows(state.workflows)}
            </div>
        </div>
        <div class="workspace_section">
            <strong>Outils du workspace</strong>
            <div class="workspace_tools">
                ${window.renderWorkspaceTools(state.tools)}
            </div>
        </div>
        <div class="workspace_section">
            <strong>Sortie du plan</strong>
            ${window.renderWorkspacePlan(window.workspaceState.lastPlan)}
        </div>
        <div class="workspace_section">
            ${window.renderWorkspaceMessages()}
        </div>`;

    requestAnimationFrame(() => {
        window.scrollWorkspaceChatToBottom();
    });
};

window.openKaliWorkspace = async () => {
    if (!window.workspaceBridge) {
        return false;
    }

    if (document.getElementById("skynetWorkspace")) {
        return window.renderKaliWorkspace(true);
    }

    window.keyboard.detach();
    new Modal({
        type: "custom",
        title: `Workspace Kali <i>(v${electron.remote.app.getVersion()})</i>`,
        html: `<div id="skynetWorkspace"><p class="workspace_intro">Chargement du workspace...</p></div>`,
        buttons: [
            {label: "Actualiser", action: "window.renderKaliWorkspace(true)"},
            {label: "Parametres", action: "window.openSettings()"}
        ]
    }, () => {
        window.keyboard.attach();
        window.term[window.currentTerm].term.focus();
    });

    return window.renderKaliWorkspace(true);
};

window.prefillWorkspaceCommand = command => {
    window.workspaceState.commandInput = command;
    const input = document.getElementById("workspaceCommandInput");
    if (input) {
        input.value = command;
    }
};

window.openWorkspaceShell = async () => {
    try {
        await window.workspaceBridge.openKaliShell({
            typingDelay: Number(window.settings.workspaceTypingDelay) || 28
        });
        window.workspaceState.lastInfo = `${window.settings.kaliDistro} a ete ouvert dans l'onglet actif du terminal.`;
        window.workspaceState.lastError = "";
    } catch (error) {
        window.workspaceState.lastError = error.message;
    }

    return window.renderKaliWorkspace(true);
};

window.loadWorkspaceWorkflow = async workflowId => {
    try {
        window.workspaceState.lastPlan = await window.workspaceBridge.runWorkflow(workflowId);
        window.workspaceState.lastExplanation = "";
        window.workspaceState.lastSummary = "";
        window.workspaceState.lastInfo = `Workflow ${workflowId} charge.`;
        window.workspaceState.lastError = "";
    } catch (error) {
        window.workspaceState.lastError = error.message;
    }

    return window.renderKaliWorkspace(false);
};

window.runWorkspaceWorkflowNow = async workflowId => {
    try {
        const result = await window.workspaceBridge.executeWorkflow(workflowId, {
            typingDelay: Number(window.settings.workspaceTypingDelay) || 28,
            visual: true
        });
        window.workspaceState.lastPlan = result.plan;
        window.workspaceState.lastInfo = `Workflow ${workflowId} execute.`;
        window.workspaceState.lastError = "";
    } catch (error) {
        window.workspaceState.lastError = error.message;
    }

    return window.renderKaliWorkspace(true);
};

window.executeWorkspacePlan = async () => {
    if (!window.workspaceState.lastPlan || !Array.isArray(window.workspaceState.lastPlan.steps) || !window.workspaceState.lastPlan.steps.length) {
        window.workspaceState.lastError = "Charge ou genere d'abord un plan.";
        return window.renderKaliWorkspace(false);
    }

    try {
        for (let i = 0; i < window.workspaceState.lastPlan.steps.length; i++) {
            const step = window.workspaceState.lastPlan.steps[i];
            await window.workspaceBridge.executePlanStep(step, {
                typingDelay: Number(window.settings.workspaceTypingDelay) || 28,
                visual: true
            });
        }
        window.workspaceState.lastInfo = `${window.workspaceState.lastPlan.steps.length} etapes du plan ont ete executees.`;
        window.workspaceState.lastError = "";
    } catch (error) {
        window.workspaceState.lastError = error.message;
    }

    return window.renderKaliWorkspace(true);
};

window.executeWorkspacePlanStep = async stepIndex => {
    try {
        const step = window.workspaceState.lastPlan.steps[stepIndex];
        await window.workspaceBridge.executePlanStep(step, {
            typingDelay: Number(window.settings.workspaceTypingDelay) || 28,
            visual: true
        });
        window.workspaceState.lastInfo = `Etape ${stepIndex + 1} executee : ${step.title}.`;
        window.workspaceState.lastError = "";
    } catch (error) {
        window.workspaceState.lastError = error.message;
    }

    return window.renderKaliWorkspace(true);
};

window.runWorkspaceCommand = async () => {
    const command = (window.workspaceState.commandInput || "").trim();
    if (!command) {
        window.workspaceState.lastError = "Entre d'abord une commande Kali.";
        return window.renderKaliWorkspace(false);
    }

    try {
        await window.workspaceBridge.runKaliCommand(command, {
            typingDelay: Number(window.settings.workspaceTypingDelay) || 28,
            visual: true
        });
        window.workspaceState.lastInfo = `Commande ecrite et lancee : ${command}`;
        window.workspaceState.lastError = "";
    } catch (error) {
        window.workspaceState.lastError = error.message;
    }

    return window.renderKaliWorkspace(true);
};

window.generateWorkspacePlan = async () => {
    const prompt = (window.workspaceState.prompt || "").trim();
    if (!prompt) {
        window.workspaceState.lastError = "Decris la tache que tu veux faire preparer par l'IA.";
        return window.renderKaliWorkspace(false);
    }

    try {
        window.workspaceState.lastPlan = await window.workspaceBridge.generatePlan(prompt);
        window.workspaceState.lastExplanation = "";
        window.workspaceState.lastSummary = "";
        window.workspaceState.lastInfo = "Plan IA genere.";
        window.workspaceState.lastError = "";
    } catch (error) {
        window.workspaceState.lastError = error.message;
    }

    return window.renderKaliWorkspace(false);
};

window.explainWorkspaceCommand = async () => {
    const command = (window.workspaceState.commandInput || "").trim();
    if (!command) {
        window.workspaceState.lastError = "Entre une commande a expliquer.";
        return window.renderKaliWorkspace(false);
    }

    try {
        window.workspaceState.lastExplanation = await window.workspaceBridge.explainCommand(command);
        window.workspaceState.lastInfo = `Commande expliquee : ${command}`;
        window.workspaceState.lastError = "";
    } catch (error) {
        window.workspaceState.lastError = error.message;
    }

    return window.renderKaliWorkspace(false);
};

window.summarizeWorkspaceSession = async () => {
    try {
        window.workspaceState.lastSummary = await window.workspaceBridge.summarizeSession();
        window.workspaceState.lastInfo = "Resume de session mis a jour.";
        window.workspaceState.lastError = "";
    } catch (error) {
        window.workspaceState.lastError = error.message;
    }

    return window.renderKaliWorkspace(false);
};

window.sendWorkspaceChat = async () => {
    if (window.workspaceState.chatBusy) {
        return false;
    }

    const input = (window.workspaceState.chatInput || "").trim();
    if (!input) {
        window.workspaceState.lastError = "Entre d'abord un message pour l'assistant IA.";
        return window.renderKaliWorkspace(false);
    }

    try {
        const history = window.getWorkspaceChatEntries().slice(-23);
        history.push(window.createWorkspaceChatEntry("user", input));
        window.workspaceState.chatHistory = history;
        window.workspaceState.chatInput = "";
        window.workspaceState.chatBusy = true;
        window.workspaceState.lastInfo = `Envoi du message a ${window.settings.aiProvider === "openai" ? "OpenAI" : "LM Studio"}...`;
        window.workspaceState.lastError = "";

        await window.renderKaliWorkspace(false);
        await window._delay(0);

        const reply = await window.workspaceBridge.chat(window.buildWorkspaceChatPayload(), {
            status: window.workspaceState.status || {},
            currentCommand: window.workspaceState.commandInput || ""
        });

        window.workspaceState.chatHistory = window.getWorkspaceChatEntries().concat(
            window.createWorkspaceChatEntry("assistant", reply, {
                provider: window.settings.aiProvider === "openai" ? "OpenAI" : "LM Studio"
            })
        ).slice(-24);
        window.workspaceState.lastInfo = "L'assistant IA a repondu.";
    } catch (error) {
        window.workspaceState.lastError = error.message;
    } finally {
        window.workspaceState.chatBusy = false;
    }

    return window.renderKaliWorkspace(false);
};

window.clearWorkspaceChat = () => {
    window.workspaceState.chatHistory = [];
    window.workspaceState.chatInput = "";
    window.workspaceState.chatBusy = false;
    window.workspaceState.lastInfo = "Nouvelle conversation prete.";
    window.workspaceState.lastError = "";
    return window.renderKaliWorkspace(false);
};

window.exportWorkspaceReport = async () => {
    try {
        const reportDir = path.join(settingsDir, "workspace-reports");
        fs.mkdirSync(reportDir, { recursive: true });

        const report = window.workspaceBridge.buildSessionReport();
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const markdownPath = path.join(reportDir, `workspace-report-${stamp}.md`);
        const jsonPath = path.join(reportDir, `workspace-report-${stamp}.json`);

        fs.writeFileSync(markdownPath, report.markdown, "utf-8");
        fs.writeFileSync(jsonPath, JSON.stringify(report, "", 2), "utf-8");

        window.workspaceState.lastReportPath = markdownPath;
        window.workspaceState.lastInfo = "Rapport workspace exporte.";
        window.workspaceState.lastError = "";
    } catch (error) {
        window.workspaceState.lastError = error.message;
    }

    return window.renderKaliWorkspace(false);
};

window.openCommandCenter = () => {
    if (document.getElementById("skynetOpsCenter")) return;

    const themes = fs.readdirSync(themesDir)
        .filter(file => file.endsWith(".json"))
        .map(file => file.replace(".json", ""))
        .sort()
        .slice(0, 8);

    const quickActions = [
        {
            label: "Workspace Kali",
            description: "Ouvre le pont WSL2 Kali et les assistants IA.",
            action: "WORKSPACE"
        },
        {
            label: "Scan systeme",
            description: "Resume la machine et la version active.",
            action: "SYSTEM_SCAN"
        },
        {
            label: "Scan reseau",
            description: "Affiche les interfaces et l'etat reseau.",
            action: "NETWORK_SCAN"
        },
        {
            label: "Lister les fichiers",
            description: "Liste les fichiers du dossier courant.",
            action: "LIST_FILES"
        },
        {
            label: "Afficher le dossier",
            description: "Affiche le dossier courant du shell.",
            action: "SHOW_CWD"
        },
        {
            label: "Effacer l'ecran",
            description: "Nettoie immediatement le terminal.",
            action: "CLEAR_SCREEN"
        },
        {
            label: "Ouvrir le depot",
            description: "Ouvre le depot GitHub Skynet Terminal.",
            action: "REPO"
        }
    ];

    const actionCards = quickActions.map(item => {
        let clickHandler = `window.runSkynetCommand('${item.action}')`;
        if (item.action === "REPO") {
            clickHandler = `require('electron').shell.openExternal('${window.appMeta.repoUrl}')`;
        }
        if (item.action === "WORKSPACE") {
            clickHandler = "window.openKaliWorkspace()";
        }

        return `<div class="skynet_card">
            <strong>${item.label}</strong>
            <span>${item.description}</span>
            <button onclick="${clickHandler}">Executer</button>
        </div>`;
    }).join("");

    const themeCards = themes.map(theme => {
        return `<div class="skynet_card">
            <strong>${theme}</strong>
            <span>Appliquer ce theme et recharger l'interface.</span>
            <button onclick="window.themeChanger('${theme}')">Activer</button>
        </div>`;
    }).join("");

    window.keyboard.detach();
    new Modal({
        type: "custom",
        title: `Centre Ops Skynet <i>(v${electron.remote.app.getVersion()})</i>`,
        html: `<div id="skynetOpsCenter">
                <p>Centre de commandes rapide pour lancer des diagnostics, retrouver le contexte du shell et changer de theme sans quitter l'interface.</p>
                <h5>Actions rapides</h5>
                <div class="skynet_ops_grid">${actionCards}</div>
                <h5>Changement de theme</h5>
                <div class="skynet_theme_grid">${themeCards}</div>
            </div>`,
        buttons: [
            {label: "Parametres", action: "window.openSettings()"},
            {label: "Recharger l'interface", action: "window.location.reload(true);"}
        ]
    }, () => {
        window.keyboard.attach();
        window.term[window.currentTerm].term.focus();
    });
};

// Load CLI parameters
if (remote.process.argv.includes("--nointro")) {
    window.settings.nointroOverride = true;
} else {
    window.settings.nointroOverride = false;
}
if (electron.remote.process.argv.includes("--nocursor")) {
    window.settings.nocursorOverride = true;
} else {
    window.settings.nocursorOverride = false;
}

// Retrieve theme override (hotswitch)
ipc.once("getThemeOverride", (e, theme) => {
    if (theme !== null) {
        window.settings.theme = theme;
        window.settings.nointroOverride = true;
        _loadTheme(require(path.join(themesDir, window.settings.theme+".json")));
    } else {
        _loadTheme(require(path.join(themesDir, window.settings.theme+".json")));
    }
});
ipc.send("getThemeOverride");
// Same for keyboard override/hotswitch
ipc.once("getKbOverride", (e, layout) => {
    if (layout !== null) {
        window.settings.keyboard = layout;
        window.settings.nointroOverride = true;
    }
});
ipc.send("getKbOverride");

// Load UI theme
window._loadTheme = theme => {

    if (document.querySelector("style.theming")) {
        document.querySelector("style.theming").remove();
    }

    // Load fonts
    let mainFont = new FontFace(theme.cssvars.font_main, `url("${path.join(fontsDir, theme.cssvars.font_main.toLowerCase().replace(/ /g, '_')+'.woff2').replace(/\\/g, '/')}")`);
    let lightFont = new FontFace(theme.cssvars.font_main_light, `url("${path.join(fontsDir, theme.cssvars.font_main_light.toLowerCase().replace(/ /g, '_')+'.woff2').replace(/\\/g, '/')}")`);
    let termFont = new FontFace(theme.terminal.fontFamily, `url("${path.join(fontsDir, theme.terminal.fontFamily.toLowerCase().replace(/ /g, '_')+'.woff2').replace(/\\/g, '/')}")`);

    document.fonts.add(mainFont);
    document.fonts.load("12px "+theme.cssvars.font_main);
    document.fonts.add(lightFont);
    document.fonts.load("12px "+theme.cssvars.font_main_light);
    document.fonts.add(termFont);
    document.fonts.load("12px "+theme.terminal.fontFamily);

    document.querySelector("head").innerHTML += `<style class="theming">
    :root {
        --font_main: "${window._purifyCSS(theme.cssvars.font_main)}";
        --font_main_light: "${window._purifyCSS(theme.cssvars.font_main_light)}";
        --font_mono: "${window._purifyCSS(theme.terminal.fontFamily)}";
        --color_r: ${window._purifyCSS(theme.colors.r)};
        --color_g: ${window._purifyCSS(theme.colors.g)};
        --color_b: ${window._purifyCSS(theme.colors.b)};
        --color_black: ${window._purifyCSS(theme.colors.black)};
        --color_light_black: ${window._purifyCSS(theme.colors.light_black)};
        --color_grey: ${window._purifyCSS(theme.colors.grey)};

        /* Used for error and warning modals */
        --color_red: ${window._purifyCSS(theme.colors.red) || "red"};
        --color_yellow: ${window._purifyCSS(theme.colors.yellow) || "yellow"};
    }

    body {
        font-family: var(--font_main), sans-serif;
        cursor: ${(window.settings.nocursorOverride || window.settings.nocursor) ? "none" : "default"} !important;
    }

    * {
   	   ${(window.settings.nocursorOverride || window.settings.nocursor) ? "cursor: none !important;" : ""}
	}

    ${window._purifyCSS(theme.injectCSS || "")}
    </style>`;

    window.theme = theme;
    window.theme.r = theme.colors.r;
    window.theme.g = theme.colors.g;
    window.theme.b = theme.colors.b;
};

function initGraphicalErrorHandling() {
    window.edexErrorsModals = [];
    window.onerror = (msg, path, line, col, error) => {
        let errorModal = new Modal({
            type: "error",
            title: error,
            message: `${msg}<br/>        at ${path}  ${line}:${col}`
        });
        window.edexErrorsModals.push(errorModal);

        ipc.send("log", "error", `${error}: ${msg}`);
        ipc.send("log", "debug", `at ${path} ${line}:${col}`);
    };
}

function waitForFonts() {
    return new Promise(resolve => {
        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            resolve();
        };
        const fallbackTimeout = setTimeout(finish, 1500);

        if (document.readyState !== "complete" || document.fonts.status !== "loaded") {
            document.addEventListener("readystatechange", () => {
                if (document.readyState === "complete") {
                    if (document.fonts.status === "loaded") {
                        clearTimeout(fallbackTimeout);
                        finish();
                    } else {
                        document.fonts.onloadingdone = () => {
                            if (document.fonts.status === "loaded") {
                                clearTimeout(fallbackTimeout);
                                finish();
                            }
                        };
                    }
                }
            });
        } else {
            clearTimeout(fallbackTimeout);
            finish();
        }
    });
}

// A proxy function used to add multithreading to systeminformation calls - see backend process manager @ _multithread.js
function initSystemInformationProxy() {
    const { nanoid } = require("nanoid/non-secure");

    window.si = new Proxy({}, {
        apply: () => {throw new Error("Cannot use sysinfo proxy directly as a function")},
        set: () => {throw new Error("Cannot set a property on the sysinfo proxy")},
        get: (target, prop, receiver) => {
            return function(...args) {
                let callback = (typeof args[args.length - 1] === "function") ? true : false;

                return new Promise((resolve, reject) => {
                    let id = nanoid();
                    ipc.once("systeminformation-reply-"+id, (e, res) => {
                        if (callback) {
                            args[args.length - 1](res);
                        }
                        resolve(res);
                    });
                    ipc.send("systeminformation-call", prop, id, ...args);
                });
            };
        }
    });
}

// Init audio
window.audioManager = new AudioManager();

// See #223
electron.remote.app.focus();
window.initWindowChrome();

let i = 0;
if (window.settings.nointro || window.settings.nointroOverride) {
    initGraphicalErrorHandling();
    initSystemInformationProxy();
    document.getElementById("boot_screen").remove();
    document.body.setAttribute("class", "");
    waitForFonts().then(initUI);
} else {
    displayLine();
}

// Startup boot log
function displayLine() {
    let bootScreen = document.getElementById("boot_screen");
    let log = fs.readFileSync(path.join(__dirname, "assets", "misc", "boot_log.txt")).toString().split('\n');

    function isArchUser() {
        return require("os").platform() === "linux"
                && fs.existsSync("/etc/os-release")
                && fs.readFileSync("/etc/os-release").toString().includes("arch");
    }

    if (typeof log[i] === "undefined") {
        setTimeout(displayTitleScreen, 300);
        return;
    }

    if (log[i] === "Boot Complete") {
        window.audioManager.granted.play();
    } else {
        window.audioManager.stdout.play();
    }
    bootScreen.innerHTML += log[i]+"<br/>";
    i++;

    switch(true) {
        case i === 2:
            bootScreen.innerHTML += `Skynet Terminal Kernel version ${electron.remote.app.getVersion()} boot at ${Date().toString()}; root:xnu-1699.22.73~1/RELEASE_X86_64`;
        case i === 4:
            setTimeout(displayLine, 500);
            break;
        case i > 4 && i < 25:
            setTimeout(displayLine, 30);
            break;
        case i === 25:
            setTimeout(displayLine, 400);
            break;
        case i === 42:
            setTimeout(displayLine, 300);
            break;
        case i > 42 && i < 82:
            setTimeout(displayLine, 25);
            break;
        case i === 83:
            if (isArchUser())
                bootScreen.innerHTML += "btw i use arch<br/>";
            setTimeout(displayLine, 25);
            break;
        case i >= log.length-2 && i < log.length:
            setTimeout(displayLine, 300);
            break;
        default:
            setTimeout(displayLine, Math.pow(1 - (i/1000), 3)*25);
    }
}

// Show "logo" and background grid
async function displayTitleScreen() {
    let bootScreen = document.getElementById("boot_screen");
    if (bootScreen === null) {
        bootScreen = document.createElement("section");
        bootScreen.setAttribute("id", "boot_screen");
        bootScreen.setAttribute("style", "z-index: 9999999");
        document.body.appendChild(bootScreen);
    }
    bootScreen.innerHTML = "";
    window.audioManager.theme.play();

    await _delay(400);

    document.body.setAttribute("class", "");
    bootScreen.setAttribute("class", "center");
    bootScreen.innerHTML = "<h1>SKYNET TERMINAL</h1>";
    let title = document.querySelector("section > h1");

    await _delay(200);

    document.body.setAttribute("class", "solidBackground");

    await _delay(100);

    title.setAttribute("style", `background-color: rgb(${window.theme.r}, ${window.theme.g}, ${window.theme.b});border-bottom: 5px solid rgb(${window.theme.r}, ${window.theme.g}, ${window.theme.b});`);

    await _delay(300);

    title.setAttribute("style", `border: 5px solid rgb(${window.theme.r}, ${window.theme.g}, ${window.theme.b});`);

    await _delay(100);

    title.setAttribute("style", "");
    title.setAttribute("class", "glitch");

    await _delay(500);

    document.body.setAttribute("class", "");
    title.setAttribute("class", "");
    title.setAttribute("style", `border: 5px solid rgb(${window.theme.r}, ${window.theme.g}, ${window.theme.b});`);

    await _delay(1000);
    if (window.term) {
        bootScreen.remove();
        return true;
    }
    initGraphicalErrorHandling();
    initSystemInformationProxy();
    waitForFonts().then(() => {
        bootScreen.remove();
        initUI();
    });
}

// Returns the user's desired display name
async function getDisplayName() {
    let user = settings.username || null;
    if (user)
        return user;

    try {
        user = await require("username")();
    } catch (e) {}

    return user;
}

window.initializeSkynetModules = async () => {
    if (window._modulesInitialized) return;
    window._modulesInitialized = true;
    window.mods = {};

    const modules = [
        { key: "clock", ctor: Clock, parentId: "mod_column_left" },
        { key: "sysinfo", ctor: Sysinfo, parentId: "mod_column_left" },
        { key: "hardwareInspector", ctor: HardwareInspector, parentId: "mod_column_left" },
        { key: "cpuinfo", ctor: Cpuinfo, parentId: "mod_column_left" },
        { key: "ramwatcher", ctor: RAMwatcher, parentId: "mod_column_left" },
        { key: "toplist", ctor: Toplist, parentId: "mod_column_left" },
        { key: "netstat", ctor: Netstat, parentId: "mod_column_right" },
        { key: "globe", ctor: LocationGlobe, parentId: "mod_column_right" },
        { key: "conninfo", ctor: Conninfo, parentId: "mod_column_right" }
    ];

    document.querySelectorAll(".mod_column").forEach(element => {
        element.setAttribute("class", "mod_column activated");
    });

    for (const descriptor of modules) {
        await window.uiDelay(window.shouldUseFastBoot() ? 8 : 140);
        const parent = document.getElementById(descriptor.parentId);
        window.mods[descriptor.key] = new descriptor.ctor(descriptor.parentId);

        if (parent && parent.lastElementChild) {
            parent.lastElementChild.style.animationPlayState = "running";
        }
        window.audioManager.panels.play();
    }
};

// Create the UI's html structure and initialize the terminal client and the keyboard
async function initUI() {
    document.body.insertAdjacentHTML("beforeend", `<section class="mod_column" id="mod_column_left">
        <h3 class="title"><p>PANNEAU</p><p>SYSTEME</p></h3>
    </section>
    <section id="main_shell" style="height:0%;width:0%;opacity:0;margin-bottom:30vh;" augmented-ui="bl-clip tr-clip exe">
        <h3 class="title" style="opacity:0;"><p>TERMINAL</p><p>SHELL PRINCIPAL</p></h3>
        <h1 id="main_shell_greeting"></h1>
    </section>
    <section class="mod_column" id="mod_column_right">
        <h3 class="title"><p>PANNEAU</p><p>RESEAU</p></h3>
    </section>`);

    await window.uiDelay(10);

    window.audioManager.expand.play();
    document.getElementById("main_shell").setAttribute("style", "height:0%;margin-bottom:30vh;");

    await window.uiDelay(500);

    document.getElementById("main_shell").setAttribute("style", "margin-bottom: 30vh;");
    document.querySelector("#main_shell > h3.title").setAttribute("style", "");

    await window.uiDelay(700);

    document.getElementById("main_shell").setAttribute("style", "opacity: 0;");
    document.body.insertAdjacentHTML("beforeend", `
    <section id="filesystem" style="width: 0px;" class="${window.settings.hideDotfiles ? "hideDotfiles" : ""} ${window.settings.fsListView ? "list-view" : ""}">
    </section>
    <section id="keyboard" style="opacity:0;">
    </section>`);
    window.keyboard = new Keyboard({
        layout: path.join(keyboardsDir, settings.keyboard+".json"),
        container: "keyboard"
    });

    await window.uiDelay(10);

    document.getElementById("main_shell").setAttribute("style", "");

    await window.uiDelay(270);

    let greeter = document.getElementById("main_shell_greeting");

    getDisplayName().then(user => {
        if (user) {
            greeter.innerHTML += `Bon retour, <em>${user}</em>`;
        } else {
            greeter.innerHTML += "Bon retour";
        }
    });

    greeter.setAttribute("style", "opacity: 1;");

    document.getElementById("filesystem").setAttribute("style", "");
    document.getElementById("keyboard").setAttribute("style", "");
    document.getElementById("keyboard").setAttribute("class", "animation_state_1");
    window.audioManager.keyboard.play();

    await window.uiDelay(100);

    document.getElementById("keyboard").setAttribute("class", "animation_state_1 animation_state_2");

    await window.uiDelay(1000);

    greeter.setAttribute("style", "opacity: 0;");

    await window.uiDelay(100);

    document.getElementById("keyboard").setAttribute("class", "");

    await window.uiDelay(400);

    greeter.remove();
    await window.uiDelay(100);

    // Initialize the terminal
    let shellContainer = document.getElementById("main_shell");
    shellContainer.innerHTML += `
        <div id="main_shell_toolbar">
            <div id="main_shell_statusline">
                <span id="skynet_status_host"></span>
                <span id="skynet_status_platform"></span>
                <span id="skynet_status_theme"></span>
                <span id="skynet_status_cwd"></span>
            </div>
            <div id="main_shell_actions">
                <button onclick="window.openKaliWorkspace()">WORKSPACE KALI</button>
                <button onclick="window.openCommandCenter()">CENTRE OPS</button>
                <button onclick="window.openSettings()">PARAMETRES</button>
                <button onclick="window.toggleKeyboardPanel()">CLAVIER</button>
            </div>
        </div>
        <ul id="main_shell_tabs">
            <li id="shell_tab0" onclick="window.focusShellTab(0);" class="active"><p>SHELL PRINCIPAL</p></li>
            <li id="shell_tab1" onclick="window.focusShellTab(1);"><p>VIDE</p></li>
            <li id="shell_tab2" onclick="window.focusShellTab(2);"><p>VIDE</p></li>
            <li id="shell_tab3" onclick="window.focusShellTab(3);"><p>VIDE</p></li>
            <li id="shell_tab4" onclick="window.focusShellTab(4);"><p>VIDE</p></li>
        </ul>
        <div id="main_shell_innercontainer">
            <pre id="terminal0" class="active"></pre>
            <pre id="terminal1"></pre>
            <pre id="terminal2"></pre>
            <pre id="terminal3"></pre>
            <pre id="terminal4"></pre>
        </div>`;
    window.term = {
        0: new Terminal({
            role: "client",
            parentId: "terminal0",
            port: window.settings.port || 3000
        })
    };
    window.currentTerm = 0;
    window.term[0].onprocesschange = p => {
        document.getElementById("shell_tab0").innerHTML = `<p>PRINCIPAL - ${p}</p>`;
    };
    // Prevent losing hardware keyboard focus on the terminal when using touch keyboard
    window.onmouseup = e => {
        if (window.keyboard.linkedToTerm) window.term[window.currentTerm].term.focus();
    };
    window.term[0].term.writeln("\033[1m"+`Bienvenue dans Skynet Terminal v${electron.remote.app.getVersion()} - Electron v${process.versions.electron}`+"\033[0m");
    window.workspaceBridge = createWorkspaceBridge({
        getTerminal: () => window.term && window.term[window.currentTerm],
        getKeyboard: () => window.keyboard,
        getCurrentTermIndex: () => window.currentTerm,
        getSettings: () => window.settings,
        delay: window._delay
    });
    window.updateSkynetStatus({});
    window.syncWindowChrome();

    await window.uiDelay(100);

    window.fsDisp = new FilesystemDisplay({
        parentId: "filesystem"
    });

    await window.uiDelay(200);

    document.getElementById("filesystem").setAttribute("style", "opacity: 1;");

    // Resend terminal CWD to fsDisp if we're hot reloading
    if (window.performance.navigation.type === 1) {
        window.term[window.currentTerm].resendCWD();
    }

    window.modulesReady = window.initializeSkynetModules();
    setTimeout(() => {
        window.updateCheck = new UpdateChecker();
    }, window.shouldUseFastBoot() ? 180 : 1200);
}

window.themeChanger = theme => {
    ipc.send("setThemeOverride", theme);
    setTimeout(() => {
        window.location.reload(true);
    }, 100);
};

window.remakeKeyboard = layout => {
    document.getElementById("keyboard").innerHTML = "";
    window.keyboard = new Keyboard({
        layout: path.join(keyboardsDir, layout+".json" || settings.keyboard+".json"),
        container: "keyboard"
    });
    ipc.send("setKbOverride", layout);
};

window.focusShellTab = number => {
    window.audioManager.folder.play();

    if (number !== window.currentTerm && window.term[number]) {
        window.currentTerm = number;

        document.querySelectorAll(`ul#main_shell_tabs > li:not(:nth-child(${number+1}))`).forEach(e => {
            e.setAttribute("class", "");
        });
        document.getElementById("shell_tab"+number).setAttribute("class", "active");

        document.querySelectorAll(`div#main_shell_innercontainer > pre:not(:nth-child(${number+1}))`).forEach(e => {
            e.setAttribute("class", "");
        });
        document.getElementById("terminal"+number).setAttribute("class", "active");

        window.term[number].fit();
        window.term[number].term.focus();
        window.term[number].resendCWD();
        if (window.workspaceBridge && window.workspaceBridge.terminal) {
            window.workspaceBridge.terminal.refreshOutputBinding();
        }

        window.fsDisp.followTab();
    } else if (number > 0 && number <= 4 && window.term[number] !== null && typeof window.term[number] !== "object") {
        window.term[number] = null;

        document.getElementById("shell_tab"+number).innerHTML = "<p>CHARGEMENT...</p>";
        ipc.send("ttyspawn", "true");
        ipc.once("ttyspawn-reply", (e, r) => {
            if (r.startsWith("ERROR")) {
                document.getElementById("shell_tab"+number).innerHTML = "<p>ERREUR</p>";
            } else if (r.startsWith("SUCCESS")) {
                let port = Number(r.substr(9));

                window.term[number] = new Terminal({
                    role: "client",
                    parentId: "terminal"+number,
                    port
                });

                window.term[number].onclose = e => {
                    delete window.term[number].onprocesschange;
                    document.getElementById("shell_tab"+number).innerHTML = "<p>VIDE</p>";
                    document.getElementById("terminal"+number).innerHTML = "";
                    window.term[number].term.dispose();
                    delete window.term[number];
                    window.useAppShortcut("PREVIOUS_TAB");
                };

                window.term[number].onprocesschange = p => {
                    document.getElementById("shell_tab"+number).innerHTML = `<p>#${number+1} - ${p}</p>`;
                };

                document.getElementById("shell_tab"+number).innerHTML = `<p>::${port}</p>`;
                setTimeout(() => {
                    window.focusShellTab(number);
                }, 500);
            }
        });
    }
};

// Settings editor
window.openSettings = async () => {
    if (document.getElementById("settingsEditor")) return;
    await window.ensureSkynetModulesReady();
    const currentIface = (window.mods && window.mods.netstat && window.mods.netstat.iface) ? window.mods.netstat.iface : (window.settings.iface || "auto");

    // Build lists of available keyboards, themes, monitors
    let keyboards = "", themes = "", monitors = "", ifaces = "";
    fs.readdirSync(keyboardsDir).forEach(kb => {
        if (!kb.endsWith(".json")) return;
        kb = kb.replace(".json", "");
        if (kb === window.settings.keyboard) return;
        keyboards += `<option>${kb}</option>`;
    });
    fs.readdirSync(themesDir).forEach(th => {
        if (!th.endsWith(".json")) return;
        th = th.replace(".json", "");
        if (th === window.settings.theme) return;
        themes += `<option>${th}</option>`;
    });
    for (let i = 0; i < electron.remote.screen.getAllDisplays().length; i++) {
        if (i !== window.settings.monitor) monitors += `<option>${i}</option>`;
    }
    let nets = await window.si.networkInterfaces();
    nets.forEach(net => {
        if (net.iface !== currentIface) ifaces += `<option>${net.iface}</option>`;
    });

    // Unlink the tactile keyboard from the terminal emulator to allow filling in the settings fields
    window.keyboard.detach();

    new Modal({
        type: "custom",
        title: `Parametres <i>(v${electron.remote.app.getVersion()})</i>`,
        html: `<table id="settingsEditor">
                    <tr>
                        <th>Cle</th>
                        <th>Description</th>
                        <th>Valeur</th>
                    </tr>
                    <tr>
                        <td>shell</td>
                        <td>Programme a lancer comme shell du terminal</td>
                        <td><input type="text" id="settingsEditor-shell" value="${window.settings.shell}"></td>
                    </tr>
                    <tr>
                        <td>shellArgs</td>
                        <td>Arguments a passer au shell</td>
                        <td><input type="text" id="settingsEditor-shellArgs" value="${window.settings.shellArgs || ''}"></td>
                    </tr>
                    <tr>
                        <td>kaliDistro</td>
                        <td>Nom de la distro WSL utilisee par le workspace Kali</td>
                        <td><input type="text" id="settingsEditor-kaliDistro" value="${window.settings.kaliDistro || "kali-linux"}"></td>
                    </tr>
                    <tr>
                        <td>aiProvider</td>
                        <td>Provider IA a utiliser dans le chat et les plans</td>
                        <td><select id="settingsEditor-aiProvider">
                            <option value="lmstudio" ${(window.settings.aiProvider || "lmstudio") === "lmstudio" ? "selected" : ""}>LM Studio</option>
                            <option value="openai" ${(window.settings.aiProvider || "lmstudio") === "openai" ? "selected" : ""}>OpenAI</option>
                        </select></td>
                    </tr>
                    <tr>
                        <td>lmStudioEndpoint</td>
                        <td>Endpoint local LM Studio compatible avec l'API OpenAI</td>
                        <td><input type="text" id="settingsEditor-lmStudioEndpoint" value="${window.settings.lmStudioEndpoint || "http://127.0.0.1:1234/v1"}"></td>
                    </tr>
                    <tr>
                        <td>lmStudioModel</td>
                        <td>Modele a utiliser dans LM Studio pour les plans, explications et le chat</td>
                        <td><input type="text" id="settingsEditor-lmStudioModel" value="${window.settings.lmStudioModel || ""}"></td>
                    </tr>
                    <tr>
                        <td>openaiEndpoint</td>
                        <td>Endpoint OpenAI officiel</td>
                        <td><input type="text" id="settingsEditor-openaiEndpoint" value="${window.settings.openaiEndpoint || "https://api.openai.com/v1"}"></td>
                    </tr>
                    <tr>
                        <td>openaiModel</td>
                        <td>Modele OpenAI a utiliser pour le chat, les plans et les explications</td>
                        <td><input type="text" id="settingsEditor-openaiModel" value="${window.settings.openaiModel || "gpt-5.2-chat-latest"}"></td>
                    </tr>
                    <tr>
                        <td>openaiApiKey</td>
                        <td>Cle API OpenAI utilisee si le provider IA est OpenAI</td>
                        <td><input type="password" id="settingsEditor-openaiApiKey" value="${window.settings.openaiApiKey || ""}"></td>
                    </tr>
                    <tr>
                        <td>cwd</td>
                        <td>Dossier de travail de depart</td>
                        <td><input type="text" id="settingsEditor-cwd" value="${window.settings.cwd}"></td>
                    </tr>
                    <tr>
                        <td>env</td>
                        <td>Surcharge personnalisee des variables d'environnement</td>
                        <td><input type="text" id="settingsEditor-env" value="${window.settings.env}"></td>
                    </tr>
                    <tr>
                        <td>username</td>
                        <td>Nom utilisateur affiche au demarrage</td>
                        <td><input type="text" id="settingsEditor-username" value="${window.settings.username}"></td>
                    </tr>
                    <tr>
                        <td>keyboard</td>
                        <td>Disposition du clavier virtuel</td>
                        <td><select id="settingsEditor-keyboard">
                            <option>${window.settings.keyboard}</option>
                            ${keyboards}
                        </select></td>
                    </tr>
                    <tr>
                        <td>theme</td>
                        <td>Nom du theme a charger</td>
                        <td><select id="settingsEditor-theme">
                            <option>${window.settings.theme}</option>
                            ${themes}
                        </select></td>
                    </tr>
                    <tr>
                        <td>termFontSize</td>
                        <td>Taille du texte du terminal en pixels</td>
                        <td><input type="number" id="settingsEditor-termFontSize" value="${window.settings.termFontSize}"></td>
                    </tr>
                    <tr>
                        <td>workspaceTypingDelay</td>
                        <td>Delai entre les caracteres tapes automatiquement dans le workspace</td>
                        <td><input type="number" id="settingsEditor-workspaceTypingDelay" value="${window.settings.workspaceTypingDelay || 28}"></td>
                    </tr>
                    <tr>
                        <td>audio</td>
                        <td>Activer les effets sonores</td>
                        <td><select id="settingsEditor-audio">
                            <option>${window.settings.audio}</option>
                            <option>${!window.settings.audio}</option>
                        </select></td>
                    </tr>
                    <tr>
                        <td>audioVolume</td>
                        <td>Volume par defaut des effets sonores (0.0 - 1.0)</td>
                        <td><input type="number" id="settingsEditor-audioVolume" value="${window.settings.audioVolume || '1.0'}"></td>
                    </tr>
                    <tr>
                        <td>disableFeedbackAudio</td>
                        <td>Desactiver les sons recurrents de retour (surtout entree/sortie)</td>
                        <td><select id="settingsEditor-disableFeedbackAudio">
                            <option>${window.settings.disableFeedbackAudio}</option>
                            <option>${!window.settings.disableFeedbackAudio}</option>
                        </select></td>
                    </tr>
                    <tr>
                        <td>port</td>
                        <td>Port local utilise pour la connexion UI-shell</td>
                        <td><input type="number" id="settingsEditor-port" value="${window.settings.port}"></td>
                    </tr>
                    <tr>
                        <td>pingAddr</td>
                        <td>Adresse IPv4 utilisee pour tester la connectivite Internet</td>
                        <td><input type="text" id="settingsEditor-pingAddr" value="${window.settings.pingAddr || "1.1.1.1"}"></td>
                    </tr>
                    <tr>
                        <td>clockHours</td>
                        <td>Format de l'horloge (12/24 heures)</td>
                        <td><select id="settingsEditor-clockHours">
                            <option>${(window.settings.clockHours === 12) ? "12" : "24"}</option>
                            <option>${(window.settings.clockHours === 12) ? "24" : "12"}</option>
                        </select></td>
                    <tr>
                        <td>monitor</td>
                        <td>Ecran sur lequel ouvrir l'interface (par defaut : ecran principal)</td>
                        <td><select id="settingsEditor-monitor">
                            ${(typeof window.settings.monitor !== "undefined") ? "<option>"+window.settings.monitor+"</option>" : ""}
                            ${monitors}
                        </select></td>
                    </tr>
                    <tr>
                        <td>nointro</td>
                        <td>Ignorer le logo et le journal de boot${(window.settings.nointroOverride) ? " (force par l'option CLI actuelle)" : ""}</td>
                        <td><select id="settingsEditor-nointro">
                            <option>${window.settings.nointro}</option>
                            <option>${!window.settings.nointro}</option>
                        </select></td>
                    </tr>
                    <tr>
                        <td>nocursor</td>
                        <td>Masquer le curseur de la souris${(window.settings.nocursorOverride) ? " (force par l'option CLI actuelle)" : ""}</td>
                        <td><select id="settingsEditor-nocursor">
                            <option>${window.settings.nocursor}</option>
                            <option>${!window.settings.nocursor}</option>
                        </select></td>
                    </tr>
                    <tr>
                        <td>iface</td>
                        <td>Forcer l'interface utilisee pour la surveillance reseau</td>
                        <td><select id="settingsEditor-iface">
                            <option>${currentIface}</option>
                            ${ifaces}
                        </select></td>
                    </tr>
                    <tr>
                        <td>allowWindowed</td>
                        <td>Autoriser le mode fenetre avec F11</td>
                        <td><select id="settingsEditor-allowWindowed">
                            <option>${window.settings.allowWindowed}</option>
                            <option>${!window.settings.allowWindowed}</option>
                        </select></td>
                    </tr>
                    <tr>
                        <td>keepGeometry</td>
                        <td>Tenter de garder un ratio 16:9 en mode fenetre</td>
                        <td><select id="settingsEditor-keepGeometry">
                            <option>${(window.settings.keepGeometry === false) ? 'false' : 'true'}</option>
                            <option>${(window.settings.keepGeometry === false) ? 'true' : 'false'}</option>
                        </select></td>
                    </tr>
                    <tr>
                        <td>excludeThreadsFromToplist</td>
                        <td>Exclure les threads de la liste des processus</td>
                        <td><select id="settingsEditor-excludeThreadsFromToplist">
                            <option>${window.settings.excludeThreadsFromToplist}</option>
                            <option>${!window.settings.excludeThreadsFromToplist}</option>
                        </select></td>
                    </tr>
                    <tr>
                        <td>hideDotfiles</td>
                        <td>Masquer les fichiers et dossiers commencant par un point</td>
                        <td><select id="settingsEditor-hideDotfiles">
                            <option>${window.settings.hideDotfiles}</option>
                            <option>${!window.settings.hideDotfiles}</option>
                        </select></td>
                    </tr>
                    <tr>
                        <td>fsListView</td>
                        <td>Afficher les fichiers en liste detaillee au lieu d'une grille</td>
                        <td><select id="settingsEditor-fsListView">
                            <option>${window.settings.fsListView}</option>
                            <option>${!window.settings.fsListView}</option>
                        </select></td>
                    </tr>
                    <tr>
                        <td>experimentalGlobeFeatures</td>
                        <td>Activer les fonctions experimentales du globe reseau</td>
                        <td><select id="settingsEditor-experimentalGlobeFeatures">
                            <option>${window.settings.experimentalGlobeFeatures}</option>
                            <option>${!window.settings.experimentalGlobeFeatures}</option>
                        </select></td>
                    </tr>
                    <tr>
                        <td>experimentalFeatures</td>
                        <td>Activer les fonctions web experimentales de Chrome (DANGEREUX)</td>
                        <td><select id="settingsEditor-experimentalFeatures">
                            <option>${window.settings.experimentalFeatures}</option>
                            <option>${!window.settings.experimentalFeatures}</option>
                        </select></td>
                    </tr>
                </table>
                <h6 id="settingsEditorStatus">Valeurs chargees depuis la memoire</h6>
                <br>`,
        buttons: [
            {label: "Ouvrir dans l'editeur externe", action:`electron.shell.openPath('${settingsFile}');electronWin.minimize();`},
            {label: "Enregistrer", action: "window.writeSettingsFile()"},
            {label: "Recharger l'interface", action: "window.location.reload(true);"},
            {label: "Redemarrer Skynet", action: "electron.remote.app.relaunch();electron.remote.app.quit();"}
        ]
    }, () => {
        // Link the keyboard back to the terminal
        window.keyboard.attach();

        // Focus back on the term
        window.term[window.currentTerm].term.focus();
    });
};

window.writeFile = (path) => {
    fs.writeFile(path, document.getElementById("fileEdit").value, "utf-8", () => {
        document.getElementById("fedit-status").innerHTML = "<i>Fichier enregistre.</i>";
    });
};

window.writeSettingsFile = () => {
    window.settings = {
        shell: document.getElementById("settingsEditor-shell").value,
        shellArgs: document.getElementById("settingsEditor-shellArgs").value,
        kaliDistro: document.getElementById("settingsEditor-kaliDistro").value,
        aiProvider: document.getElementById("settingsEditor-aiProvider").value,
        lmStudioEndpoint: document.getElementById("settingsEditor-lmStudioEndpoint").value,
        lmStudioModel: document.getElementById("settingsEditor-lmStudioModel").value,
        openaiEndpoint: document.getElementById("settingsEditor-openaiEndpoint").value,
        openaiModel: document.getElementById("settingsEditor-openaiModel").value,
        openaiApiKey: document.getElementById("settingsEditor-openaiApiKey").value,
        cwd: document.getElementById("settingsEditor-cwd").value,
        env: document.getElementById("settingsEditor-env").value,
        username: document.getElementById("settingsEditor-username").value,
        keyboard: document.getElementById("settingsEditor-keyboard").value,
        theme: document.getElementById("settingsEditor-theme").value,
        termFontSize: Number(document.getElementById("settingsEditor-termFontSize").value),
        workspaceTypingDelay: Number(document.getElementById("settingsEditor-workspaceTypingDelay").value),
        audio: (document.getElementById("settingsEditor-audio").value === "true"),
        audioVolume: Number(document.getElementById("settingsEditor-audioVolume").value),
        disableFeedbackAudio: (document.getElementById("settingsEditor-disableFeedbackAudio").value === "true"),
        pingAddr: document.getElementById("settingsEditor-pingAddr").value,
        clockHours: Number(document.getElementById("settingsEditor-clockHours").value),
        port: Number(document.getElementById("settingsEditor-port").value),
        monitor: Number(document.getElementById("settingsEditor-monitor").value),
        nointro: (document.getElementById("settingsEditor-nointro").value === "true"),
        nocursor: (document.getElementById("settingsEditor-nocursor").value === "true"),
        iface: document.getElementById("settingsEditor-iface").value,
        allowWindowed: (document.getElementById("settingsEditor-allowWindowed").value === "true"),
        forceFullscreen: window.settings.forceFullscreen,
        keepGeometry: (document.getElementById("settingsEditor-keepGeometry").value === "true"),
        excludeThreadsFromToplist: (document.getElementById("settingsEditor-excludeThreadsFromToplist").value === "true"),
        hideDotfiles: (document.getElementById("settingsEditor-hideDotfiles").value === "true"),
        fsListView: (document.getElementById("settingsEditor-fsListView").value === "true"),
        experimentalGlobeFeatures: (document.getElementById("settingsEditor-experimentalGlobeFeatures").value === "true"),
        experimentalFeatures: (document.getElementById("settingsEditor-experimentalFeatures").value === "true")
    };

    Object.keys(window.settings).forEach(key => {
        if (window.settings[key] === "undefined") {
            delete window.settings[key];
        }
    });

    fs.writeFileSync(settingsFile, JSON.stringify(window.settings, "", 4));
    document.getElementById("settingsEditorStatus").innerText = "Nouvelles valeurs ecrites dans settings.json a "+new Date().toTimeString();
};

window.toggleFullScreen = () => {
    let useFullscreen = (electronWin.isFullScreen() ? false : true);
    electronWin.setFullScreen(useFullscreen);

    //Update settings
    window.lastWindowState["useFullscreen"] = useFullscreen;

    fs.writeFileSync(lastWindowStateFile, JSON.stringify(window.lastWindowState, "", 4));
    window.syncWindowChrome();
};

// Display available keyboard shortcuts and custom shortcuts helper
window.openShortcutsHelp = () => {
    if (document.getElementById("settingsEditor")) return;

    const shortcutsDefinition = {
        "COPY": "Copier la selection du terminal.",
        "PASTE": "Coller le presse-papiers systeme dans le terminal.",
        "NEXT_TAB": "Passer a l'onglet terminal suivant.",
        "PREVIOUS_TAB": "Revenir a l'onglet terminal precedent.",
        "TAB_X": "Aller a l'onglet terminal <strong>X</strong>, ou le creer s'il n'existe pas encore.",
        "SETTINGS": "Ouvrir l'editeur de parametres.",
        "SHORTCUTS": "Afficher et modifier les raccourcis clavier.",
        "COMMAND_CENTER": "Ouvrir le Centre Ops Skynet avec diagnostics rapides et changement de theme.",
        "KALI_WORKSPACE": "Ouvrir le Workspace Kali pour WSL2, OpenAI, LM Studio et les plans visuels.",
        "FUZZY_SEARCH": "Rechercher des entrees dans le dossier courant.",
        "FS_LIST_VIEW": "Basculer entre vue liste et vue grille dans le navigateur de fichiers.",
        "FS_DOTFILES": "Afficher ou masquer les fichiers caches dans le navigateur de fichiers.",
        "KB_PASSMODE": "Activer ou desactiver le mode mot de passe du clavier virtuel pour masquer la saisie visuelle.",
        "DEV_DEBUG": "Ouvrir les outils de developpement Chromium.",
        "DEV_RELOAD": "Recharger l'interface."
    };

    let appList = "";
    window.shortcuts.filter(e => e.type === "app").forEach(cut => {
        let action = (cut.action.startsWith("TAB_")) ? "TAB_X" : cut.action;

        appList += `<tr>
                        <td>${(cut.enabled) ? 'OUI' : 'NON'}</td>
                        <td><input disabled type="text" maxlength=25 value="${cut.trigger}"></td>
                        <td>${shortcutsDefinition[action]}</td>
                    </tr>`;
    });

    let customList = "";
    window.shortcuts.filter(e => e.type === "shell").forEach(cut => {
        customList += `<tr>
                            <td>${(cut.enabled) ? 'OUI' : 'NON'}</td>
                            <td><input disabled type="text" maxlength=25 value="${cut.trigger}"></td>
                            <td>
                                <input disabled type="text" placeholder="Lancer une commande terminal..." value="${cut.action}">
                                <input disabled type="checkbox" name="shortcutsHelpNew_Enter" ${(cut.linebreak) ? 'checked' : ''}>
                                <label for="shortcutsHelpNew_Enter">Entree</label>
                            </td>
                        </tr>`;
    });

    window.keyboard.detach();
    new Modal({
        type: "custom",
        title: `Raccourcis clavier disponibles <i>(v${electron.remote.app.getVersion()})</i>`,
        html: `<h5>Avec le clavier virtuel ou un clavier physique, tu peux utiliser les raccourcis suivants :</h5>
                <details open id="shortcutsHelpAccordeon1">
                    <summary>Raccourcis de l'emulateur</summary>
                    <table class="shortcutsHelp">
                        <tr>
                            <th>Actif</th>
                            <th>Declencheur</th>
                            <th>Action</th>
                        </tr>
                        ${appList}
                    </table>
                </details>
                <br>
                <details id="shortcutsHelpAccordeon2">
                    <summary>Raccourcis de commandes personnalisees</summary>
                    <table class="shortcutsHelp">
                        <tr>
                            <th>Actif</th>
                            <th>Declencheur</th>
                            <th>Commande</th>
                        <tr>
                       ${customList}
                    </table>
                </details>
                <br>`,
        buttons: [
            {label: "Ouvrir le fichier des raccourcis", action:`electron.shell.openPath('${shortcutsFile}');electronWin.minimize();`},
            {label: "Recharger l'interface", action: "window.location.reload(true);"},
        ]
    }, () => {
        window.keyboard.attach();
        window.term[window.currentTerm].term.focus();
    });

    let wrap1 = document.getElementById('shortcutsHelpAccordeon1');
    let wrap2 = document.getElementById('shortcutsHelpAccordeon2');

    wrap1.addEventListener('toggle', e => {
        wrap2.open = !wrap1.open;
    });

    wrap2.addEventListener('toggle', e => {
        wrap1.open = !wrap2.open;
    });
};

window.useAppShortcut = action => {
    switch(action) {
        case "COPY":
            window.term[window.currentTerm].clipboard.copy();
            return true;
        case "PASTE":
            window.term[window.currentTerm].clipboard.paste();
            return true;
        case "NEXT_TAB":
                if (window.term[window.currentTerm+1]) {
                    window.focusShellTab(window.currentTerm+1);
                } else if (window.term[window.currentTerm+2]) {
                    window.focusShellTab(window.currentTerm+2);
                } else if (window.term[window.currentTerm+3]) {
                    window.focusShellTab(window.currentTerm+3);
                } else if (window.term[window.currentTerm+4]) {
                    window.focusShellTab(window.currentTerm+4);
                } else {
                    window.focusShellTab(0);
                }
            return true;
        case "PREVIOUS_TAB":
                let i = window.currentTerm || 4;
                if (window.term[i] && i !== window.currentTerm) {
                    window.focusShellTab(i);
                } else if (window.term[i-1]) {
                    window.focusShellTab(i-1);
                } else if (window.term[i-2]) {
                    window.focusShellTab(i-2);
                } else if (window.term[i-3]) {
                    window.focusShellTab(i-3);
                } else if (window.term[i-4]) {
                    window.focusShellTab(i-4);
                }
            return true;
        case "TAB_1":
            window.focusShellTab(0);
            return true;
        case "TAB_2":
            window.focusShellTab(1);
            return true;
        case "TAB_3":
            window.focusShellTab(2);
            return true;
        case "TAB_4":
            window.focusShellTab(3);
            return true;
        case "TAB_5":
            window.focusShellTab(4);
            return true;
        case "SETTINGS":
            window.openSettings();
            return true;
        case "SHORTCUTS":
            window.openShortcutsHelp();
            return true;
        case "COMMAND_CENTER":
            window.openCommandCenter();
            return true;
        case "KALI_WORKSPACE":
            window.openKaliWorkspace();
            return true;
        case "FUZZY_SEARCH":
            window.activeFuzzyFinder = new FuzzyFinder();
            return true;
        case "FS_LIST_VIEW":
            window.fsDisp.toggleListview();
            return true;
        case "FS_DOTFILES":
            window.fsDisp.toggleHidedotfiles();
            return true;
        case "KB_PASSMODE":
            window.keyboard.togglePasswordMode();
            return true;
        case "DEV_DEBUG":
            electron.remote.getCurrentWindow().webContents.toggleDevTools();
            return true;
        case "DEV_RELOAD":
            window.location.reload(true);
            return true;
        default:
            console.warn(`Unknown "${action}" app shortcut action`);
            return false;
    }
};

// Global keyboard shortcuts
const globalShortcut = electron.remote.globalShortcut;
globalShortcut.unregisterAll();

window.registerKeyboardShortcuts = () => {
    window.shortcuts.forEach(cut => {
        if (!cut.enabled) return;

        if (cut.type === "app") {
            if (cut.action === "TAB_X") {
                for (let i = 1; i <= 5; i++) {
                    let trigger = cut.trigger.replace("X", i);
                    let dfn = () => { window.useAppShortcut(`TAB_${i}`) };
                    globalShortcut.register(trigger, dfn);
                }
            } else {
                globalShortcut.register(cut.trigger, () => {
                    window.useAppShortcut(cut.action);
                });
            }
        } else if (cut.type === "shell") {
            globalShortcut.register(cut.trigger, () => {
                let fn = (cut.linebreak) ? "writelr" : "write";
                window.term[window.currentTerm][fn](cut.action);
            });
        } else {
            console.warn(`${cut.trigger} has unknown type`);
        }
    });
};
window.registerKeyboardShortcuts();

// See #361
window.addEventListener("focus", () => {
    window.registerKeyboardShortcuts();
});

window.addEventListener("blur", () => {
    globalShortcut.unregisterAll();
});

// Prevent showing menu, exiting fullscreen or app with keyboard shortcuts
document.addEventListener("keydown", e => {
    if (e.key === "Alt") {
        e.preventDefault();
    }
    if (e.code.startsWith("Alt") && e.ctrlKey && e.shiftKey) {
        e.preventDefault();
    }
    if (e.key === "F11" && !settings.allowWindowed) {
        e.preventDefault();
    }
    if (e.code === "KeyD" && e.ctrlKey) {
        e.preventDefault();
    }
    if (e.code === "KeyA" && e.ctrlKey) {
        e.preventDefault();
    }
});

// Fix #265
window.addEventListener("keyup", e => {
    if (require("os").platform() === "win32" && e.key === "F4" && e.altKey === true) {
        electron.remote.app.quit();
    }
});

// Fix double-tap zoom on touchscreens
electron.webFrame.setVisualZoomLevelLimits(1, 1);

// Resize terminal with window
window.onresize = () => {
    if (typeof window.currentTerm !== "undefined") {
        if (typeof window.term[window.currentTerm] !== "undefined") {
            window.term[window.currentTerm].fit();
        }
    }
};

// See #413
window.resizeTimeout = null;
let electronWin = electron.remote.getCurrentWindow();
electronWin.on("resize", () => {
    if (settings.keepGeometry === false) return;
    clearTimeout(window.resizeTimeout);
    window.resizeTimeout = setTimeout(() => {
        let win = electron.remote.getCurrentWindow();
        if (win.isFullScreen()) return false;
        if (win.isMaximized()) {
            win.unmaximize();
            win.setFullScreen(true);
            return false;
        }

        let size = win.getSize();

        if (size[0] >= size[1]) {
            win.setSize(size[0], parseInt(size[0] * 9 / 16));
        } else {
            win.setSize(size[1], parseInt(size[1] * 9 / 16));
        }
    }, 100);
});

electronWin.on("leave-full-screen", () => {
    electron.remote.getCurrentWindow().setSize(960, 540);
    window.syncWindowChrome();
});

electronWin.on("enter-full-screen", () => {
    window.syncWindowChrome();
});
