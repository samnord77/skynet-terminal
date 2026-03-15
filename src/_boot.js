const signale = require("signale");
const {app, BrowserWindow, dialog, shell} = require("electron");

process.on("uncaughtException", e => {
    signale.fatal(e);
    dialog.showErrorBox("Skynet Terminal crashed", e.message || "Cannot retrieve error message.");
    if (tty) {
        tty.close();
    }
    if (extraTtys) {
        Object.keys(extraTtys).forEach(key => {
            if (extraTtys[key] !== null) {
                extraTtys[key].close();
            }
        });
    }
    process.exit(1);
});

signale.start(`Starting Skynet Terminal v${app.getVersion()}`);
signale.info(`With Node ${process.versions.node} and Electron ${process.versions.electron}`);
signale.info(`Renderer is Chrome ${process.versions.chrome}`);

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    signale.fatal("Error: Another instance of Skynet Terminal is already running. Cannot proceed.");
    app.exit(1);
}

signale.time("Startup");

const electron = require("electron");
require('@electron/remote/main').initialize()
const ipc = electron.ipcMain;
const path = require("path");
const url = require("url");
const fs = require("fs");
const net = require("net");
const which = require("which");
const Terminal = require("./classes/terminal.class.js").Terminal;

ipc.on("log", (e, type, content) => {
    signale[type](content);
});

var win, tty, extraTtys, geoWin;
const settingsFile = path.join(electron.app.getPath("userData"), "settings.json");
const shortcutsFile = path.join(electron.app.getPath("userData"), "shortcuts.json");
const lastWindowStateFile = path.join(electron.app.getPath("userData"), "lastWindowState.json");
const themesDir = path.join(electron.app.getPath("userData"), "themes");
const innerThemesDir = path.join(__dirname, "assets/themes");
const kblayoutsDir = path.join(electron.app.getPath("userData"), "keyboards");
const innerKblayoutsDir = path.join(__dirname, "assets/kb_layouts");
const fontsDir = path.join(electron.app.getPath("userData"), "fonts");
const innerFontsDir = path.join(__dirname, "assets/fonts");

// Unset proxy env variables to avoid connection problems on the internal websockets
// See #222
if (process.env.http_proxy) delete process.env.http_proxy;
if (process.env.https_proxy) delete process.env.https_proxy;

// Bypass GPU acceleration blocklist, trading a bit of stability for a great deal of performance, mostly on Linux
app.commandLine.appendSwitch("ignore-gpu-blocklist");
app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-video-decode");

// Fix userData folder not setup on Windows
try {
    fs.mkdirSync(electron.app.getPath("userData"));
    signale.info(`Created config dir at ${electron.app.getPath("userData")}`);
} catch(e) {
    signale.info(`Base config dir is ${electron.app.getPath("userData")}`);
}
// Create default settings file
if (!fs.existsSync(settingsFile)) {
    fs.writeFileSync(settingsFile, JSON.stringify({
        shell: (process.platform === "win32") ? "pwsh.exe" : "bash",
        shellArgs: (process.platform === "win32") ? "-NoLogo -NoProfile" : '',
        kaliDistro: "kali-linux",
        aiProvider: "lmstudio",
        lmStudioEndpoint: "http://127.0.0.1:1234/v1",
        lmStudioModel: "",
        openaiEndpoint: "https://api.openai.com/v1",
        openaiModel: "gpt-5.2-chat-latest",
        openaiApiKey: "",
        workspaceTypingDelay: 28,
        cwd: electron.app.getPath(process.platform === "win32" ? "home" : "userData"),
        keyboard: "en-US",
        theme: "tron",
        termFontSize: 15,
        audio: true,
        audioVolume: 1.0,
        disableFeedbackAudio: false,
        clockHours: 24,
        pingAddr: "1.1.1.1",
        port: 3000,
        nointro: false,
        nocursor: false,
        forceFullscreen: false,
        allowWindowed: true,
        excludeThreadsFromToplist: true,
        hideDotfiles: false,
        fsListView: false,
        experimentalGlobeFeatures: false,
        experimentalFeatures: false
    }, "", 4));
    signale.info(`Default settings written to ${settingsFile}`);
}
// Create default shortcuts file
if (!fs.existsSync(shortcutsFile)) {
    fs.writeFileSync(shortcutsFile, JSON.stringify([
        { type: "app", trigger: "Ctrl+Shift+C", action: "COPY", enabled: true },
        { type: "app", trigger: "Ctrl+Shift+V", action: "PASTE", enabled: true },
        { type: "app", trigger: "Ctrl+Tab", action: "NEXT_TAB", enabled: true },
        { type: "app", trigger: "Ctrl+Shift+Tab", action: "PREVIOUS_TAB", enabled: true },
        { type: "app", trigger: "Ctrl+X", action: "TAB_X", enabled: true },
        { type: "app", trigger: "Ctrl+Shift+S", action: "SETTINGS", enabled: true },
        { type: "app", trigger: "Ctrl+Shift+K", action: "SHORTCUTS", enabled: true },
        { type: "app", trigger: "Ctrl+Shift+O", action: "COMMAND_CENTER", enabled: true },
        { type: "app", trigger: "Ctrl+Shift+W", action: "KALI_WORKSPACE", enabled: true },
        { type: "app", trigger: "Ctrl+Shift+F", action: "FUZZY_SEARCH", enabled: true },
        { type: "app", trigger: "Ctrl+Shift+L", action: "FS_LIST_VIEW", enabled: true },
        { type: "app", trigger: "Ctrl+Shift+H", action: "FS_DOTFILES", enabled: true },
        { type: "app", trigger: "Ctrl+Shift+P", action: "KB_PASSMODE", enabled: true },
        { type: "app", trigger: "Ctrl+Shift+I", action: "DEV_DEBUG", enabled: false },
        { type: "app", trigger: "Ctrl+Shift+F5", action: "DEV_RELOAD", enabled: true },
        { type: "shell", trigger: "Ctrl+Shift+Alt+Space", action: "neofetch", linebreak: true, enabled: false }
    ], "", 4));
    signale.info(`Default keymap written to ${shortcutsFile}`);
}
//Create default window state file
if(!fs.existsSync(lastWindowStateFile)) {
    fs.writeFileSync(lastWindowStateFile, JSON.stringify({
        useFullscreen: true
    }, "", 4));
    signale.info(`Default last window state written to ${lastWindowStateFile}`);
}

// Copy default themes & keyboard layouts & fonts
signale.pending("Mirroring internal assets...");
try {
    fs.mkdirSync(themesDir);
} catch(e) {
    // Folder already exists
}
fs.readdirSync(innerThemesDir).forEach(e => {
    fs.writeFileSync(path.join(themesDir, e), fs.readFileSync(path.join(innerThemesDir, e), {encoding:"utf-8"}));
});
try {
    fs.mkdirSync(kblayoutsDir);
} catch(e) {
    // Folder already exists
}
fs.readdirSync(innerKblayoutsDir).forEach(e => {
    fs.writeFileSync(path.join(kblayoutsDir, e), fs.readFileSync(path.join(innerKblayoutsDir, e), {encoding:"utf-8"}));
});
try {
    fs.mkdirSync(fontsDir);
} catch(e) {
    // Folder already exists
}
fs.readdirSync(innerFontsDir).forEach(e => {
    fs.writeFileSync(path.join(fontsDir, e), fs.readFileSync(path.join(innerFontsDir, e)));
});

// Version history logging
const versionHistoryPath = path.join(electron.app.getPath("userData"), "versions_log.json");
var versionHistory = fs.existsSync(versionHistoryPath) ? require(versionHistoryPath) : {};
var version = app.getVersion();
if (typeof versionHistory[version] === "undefined") {
	versionHistory[version] = {
		firstSeen: Date.now(),
		lastSeen: Date.now()
	};
} else {
	versionHistory[version].lastSeen = Date.now();
}
fs.writeFileSync(versionHistoryPath, JSON.stringify(versionHistory, 0, 2), {encoding:"utf-8"});

function createWindow(settings) {
    signale.info("Creating window...");

    let display;
    if (!isNaN(settings.monitor)) {
        display = electron.screen.getAllDisplays()[settings.monitor] || electron.screen.getPrimaryDisplay();
    } else {
        display = electron.screen.getPrimaryDisplay();
    }
    let {x, y, width, height} = display.bounds;
    width++; height++;
    win = new BrowserWindow({
        title: "Skynet Terminal",
        x,
        y,
        width,
        height,
        show: false,
        resizable: true,
        movable: settings.allowWindowed || false,
        fullscreen: settings.forceFullscreen || false,
        autoHideMenuBar: true,
        frame: settings.allowWindowed || false,
        backgroundColor: '#000000',
        webPreferences: {
            devTools: true,
	    enableRemoteModule: true,
            contextIsolation: false,
            backgroundThrottling: false,
            webSecurity: true,
            nodeIntegration: true,
            nodeIntegrationInSubFrames: false,
            allowRunningInsecureContent: false,
            experimentalFeatures: settings.experimentalFeatures || false
        }
    });

    win.loadURL(url.format({
        pathname: path.join(__dirname, 'ui.html'),
        protocol: 'file:',
        slashes: true
    }));

    signale.complete("Frontend window created!");
    win.show();
    if (!settings.allowWindowed) {
        win.setResizable(false);
    } else if (!require(lastWindowStateFile)["useFullscreen"]) {
        win.setFullScreen(false);
    }

    signale.watch("Waiting for frontend connection...");
}

async function resolveShellPath(configuredShell) {
    const preferred = [];
    const normalizedConfiguredShell = String(configuredShell || "").toLowerCase();

    if (process.platform === "win32") {
        if (normalizedConfiguredShell.includes("powershell") || normalizedConfiguredShell.includes("pwsh")) {
            preferred.push("pwsh.exe");
        }
        if (configuredShell) {
            preferred.push(configuredShell);
        }
        preferred.push("powershell.exe", "cmd.exe");
    } else {
        if (configuredShell) {
            preferred.push(configuredShell);
        }
        preferred.push("bash");
    }

    for (const candidate of preferred) {
        try {
            return await which(candidate);
        } catch (error) {
            // Try next shell candidate
        }
    }

    throw new Error(`Unable to resolve a usable shell starting from "${configuredShell || "default"}".`);
}

function getDefaultShellArgs(shellPath, configuredArgs) {
    if (Array.isArray(configuredArgs)) {
        return configuredArgs;
    }

    const rawArgs = String(configuredArgs || "").trim();
    if (rawArgs.length > 0) {
        return rawArgs.match(/(?:[^\s"]+|"[^"]*")+/g).map(entry => entry.replace(/^"(.*)"$/, "$1"));
    }

    if (process.platform !== "win32") {
        return ["--login"];
    }

    const lowerShell = String(shellPath || "").toLowerCase();
    if (lowerShell.endsWith("pwsh.exe") || lowerShell.endsWith("powershell.exe")) {
        return ["-NoLogo", "-NoProfile"];
    }

    return [];
}

function checkPortAvailability(port) {
    return new Promise(resolve => {
        const server = net.createServer();

        server.once("error", () => {
            resolve(false);
        });

        server.once("listening", () => {
            server.close(() => resolve(true));
        });

        server.listen(port);
    });
}

async function resolveAvailablePort(preferredPort, excludedPorts = new Set()) {
    let port = Number(preferredPort) || 3000;

    while (excludedPorts.has(port) || !(await checkPortAvailability(port))) {
        port++;
    }

    return port;
}

async function resolveTerminalPorts(basePort) {
    const usedPorts = new Set();
    const mainPort = await resolveAvailablePort(basePort, usedPorts);
    usedPorts.add(mainPort);

    const extraPorts = [];
    let nextCandidate = mainPort + 2;
    for (let i = 0; i < 4; i++) {
        const port = await resolveAvailablePort(nextCandidate, usedPorts);
        usedPorts.add(port);
        extraPorts.push(port);
        nextCandidate = port + 1;
    }

    return {
        mainPort,
        extraPorts
    };
}

function createTerminalWithFallback(opts, label) {
    let port = Number(opts.port) || 3000;
    let attempts = 0;
    let lastError = null;

    while (attempts < 25) {
        try {
            return {
                term: new Terminal(Object.assign({}, opts, { port })),
                port
            };
        } catch (error) {
            lastError = error;
            if (error && error.code === "EADDRINUSE") {
                signale.warn(`${label} port ${port} is unavailable. Retrying on ${port + 1}.`);
                port++;
                attempts++;
                continue;
            }
            throw error;
        }
    }

    throw lastError || new Error(`Unable to create ${label} terminal.`);
}

function createGeoWindow(payload = {}) {
    if (!payload.ip || !Number.isFinite(Number(payload.latitude)) || !Number.isFinite(Number(payload.longitude))) {
        return false;
    }

    const query = new URLSearchParams({
        ip: payload.ip,
        lat: payload.latitude.toString(),
        lon: payload.longitude.toString(),
        city: payload.city || "",
        country: payload.country || "",
        region: payload.region || "",
        source: payload.source || "network"
    }).toString();

    const geoUrl = url.format({
        pathname: path.join(__dirname, "geo-map.html"),
        protocol: "file:",
        slashes: true
    }) + `?${query}`;

    if (geoWin && !geoWin.isDestroyed()) {
        geoWin.loadURL(geoUrl);
        geoWin.show();
        geoWin.focus();
        return true;
    }

    geoWin = new BrowserWindow({
        title: "Skynet Geo Map",
        width: 1040,
        height: 720,
        minWidth: 860,
        minHeight: 560,
        show: false,
        autoHideMenuBar: true,
        backgroundColor: "#05080d",
        parent: win || null,
        webPreferences: {
            devTools: true,
            contextIsolation: false,
            backgroundThrottling: false,
            webSecurity: true,
            nodeIntegration: true,
            nodeIntegrationInSubFrames: false,
            allowRunningInsecureContent: false
        }
    });

    geoWin.on("closed", () => {
        geoWin = null;
    });

    geoWin.loadURL(geoUrl);
    geoWin.once("ready-to-show", () => {
        if (geoWin) geoWin.show();
    });

    return true;
}

app.on('ready', async () => {
    signale.pending(`Loading settings file...`);
    let settings = require(settingsFile);
    let settingsChanged = false;

    if (process.platform === "win32") {
        if (settings.allowWindowed !== true) {
            settings.allowWindowed = true;
            settingsChanged = true;
        }
        if (settings.forceFullscreen !== false) {
            settings.forceFullscreen = false;
            settingsChanged = true;
        }
        if (!settings.cwd || settings.cwd === electron.app.getPath("userData")) {
            settings.cwd = electron.app.getPath("home");
            settingsChanged = true;
        }
    }

    signale.pending(`Resolving shell path...`);
    settings.shell = await resolveShellPath(settings.shell).catch(e => { throw(e) });
    const shellArgs = getDefaultShellArgs(settings.shell, settings.shellArgs);
    if (Array.isArray(shellArgs) && shellArgs.join(" ") !== String(settings.shellArgs || "").trim()) {
        settings.shellArgs = shellArgs.join(" ");
        settingsChanged = true;
    }
    signale.info(`Shell found at ${settings.shell}`);
    signale.success(`Settings loaded!`);

    if (!require("fs").existsSync(settings.cwd)) {
        settings.cwd = electron.app.getPath("home");
        settingsChanged = true;
    }
    if (!require("fs").existsSync(settings.cwd)) throw new Error("Configured cwd path does not exist.");

    if (settingsChanged) {
        fs.writeFileSync(settingsFile, JSON.stringify(settings, "", 4));
    }

    let cleanEnv;
    if (process.platform === "win32") {
        cleanEnv = Object.assign({}, process.env);
    } else {
        // See #366
        cleanEnv = await require("shell-env")(settings.shell).catch(e => { throw e; });
    }

    Object.assign(cleanEnv, {
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
        TERM_PROGRAM: "Skynet Terminal",
        TERM_PROGRAM_VERSION: app.getVersion()
    }, settings.env);

    const configuredPort = Number(settings.port) || 3000;
    const { mainPort, extraPorts } = await resolveTerminalPorts(configuredPort);
    if (mainPort !== configuredPort) {
        signale.warn(`Configured port ${configuredPort} is unavailable. Using ${mainPort} instead.`);
        settings.port = mainPort;
        fs.writeFileSync(settingsFile, JSON.stringify(settings, "", 4));
    }

    signale.pending(`Creating new terminal process on port ${mainPort}`);
    const mainTerminal = createTerminalWithFallback({
        role: "server",
        shell: settings.shell,
        params: shellArgs,
        cwd: settings.cwd,
        env: cleanEnv,
        port: mainPort
    }, "main");
    tty = mainTerminal.term;
    if (mainTerminal.port !== settings.port) {
        settings.port = mainTerminal.port;
        fs.writeFileSync(settingsFile, JSON.stringify(settings, "", 4));
    }
    signale.success(`Terminal back-end initialized!`);
    tty.onclosed = (code, signal) => {
        tty.ondisconnected = () => {};
        signale.complete("Terminal exited", code, signal);
        app.quit();
    };
    tty.onopened = () => {
        signale.success("Connected to frontend!");
        signale.timeEnd("Startup");
    };
    tty.onresized = (cols, rows) => {
        signale.info("Resized TTY to ", cols, rows);
    };
    tty.ondisconnected = () => {
        signale.error("Lost connection to frontend");
        signale.watch("Waiting for frontend connection...");
    };

    // Support for multithreaded systeminformation calls
    signale.pending("Starting multithreaded calls controller...");
    require("./_multithread.js");

    createWindow(settings);

    // Support for more terminals, used for creating tabs (currently limited to 4 extra terms)
    extraTtys = {};
    extraPorts.forEach(port => {
        extraTtys[port] = null;
    });

    ipc.on("ttyspawn", (e, arg) => {
        let port = null;
        let reservedKey = null;
        Object.keys(extraTtys).forEach(key => {
            if (extraTtys[key] === null && port === null) {
                extraTtys[key] = {};
                port = key;
                reservedKey = key;
            }
        });

        if (port === null) {
            signale.error("TTY spawn denied (Reason: exceeded max TTYs number)");
            e.sender.send("ttyspawn-reply", "ERROR: max number of ttys reached");
        } else {
            signale.pending(`Creating new TTY process on port ${port}`);
            const spawnedTerminal = createTerminalWithFallback({
                role: "server",
                shell: settings.shell,
                params: shellArgs,
                cwd: tty.tty._cwd || settings.cwd,
                env: cleanEnv,
                port: port
            }, `tty ${port}`);
            let term = spawnedTerminal.term;
            port = spawnedTerminal.port;
            if (reservedKey !== null && String(reservedKey) !== String(port)) {
                extraTtys[reservedKey] = null;
            }
            if (typeof extraTtys[port] === "undefined") {
                extraTtys[port] = null;
            }
            signale.success(`New terminal back-end initialized at ${port}`);
            term.onclosed = (code, signal) => {
                term.ondisconnected = () => {};
                term.wss.close();
                signale.complete(`TTY exited at ${port}`, code, signal);
                extraTtys[term.port] = null;
                term = null;
            };
            term.onopened = pid => {
                signale.success(`TTY ${port} connected to frontend (process PID ${pid})`);
            };
            term.onresized = () => {};
            term.ondisconnected = () => {
                term.onclosed = () => {};
                term.close();
                term.wss.close();
                extraTtys[term.port] = null;
                term = null;
            };

            extraTtys[port] = term;
            e.sender.send("ttyspawn-reply", "SUCCESS: "+port);
        }
    });

    // Backend support for theme and keyboard hotswitch
    let themeOverride = null;
    let kbOverride = null;
    ipc.on("getThemeOverride", (e, arg) => {
        e.sender.send("getThemeOverride", themeOverride);
    });
    ipc.on("getKbOverride", (e, arg) => {
        e.sender.send("getKbOverride", kbOverride);
    });
    ipc.on("setThemeOverride", (e, arg) => {
        themeOverride = arg;
    });
    ipc.on("setKbOverride", (e, arg) => {
        kbOverride = arg;
    });
    ipc.on("openGeoWindow", (e, payload) => {
        createGeoWindow(payload || {});
    });
});

app.on('web-contents-created', (e, contents) => {
    // Prevent creating more than one window
    contents.on('new-window', (e, url) => {
        e.preventDefault();
        shell.openExternal(url);
    });

    // Prevent loading something else than the UI
    contents.on('will-navigate', (e, url) => {
        if (url !== contents.getURL()) e.preventDefault();
    });
});

app.on('window-all-closed', () => {
    signale.info("All windows closed");
    app.quit();
});

app.on('before-quit', () => {
    if (tty) {
        tty.close();
    }
    if (extraTtys) {
        Object.keys(extraTtys).forEach(key => {
            if (extraTtys[key] !== null) {
                extraTtys[key].close();
            }
        });
    }
    if (geoWin && !geoWin.isDestroyed()) {
        geoWin.close();
    }
    signale.complete("Shutting down...");
});
