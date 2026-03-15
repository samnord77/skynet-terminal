const { spawn } = require("child_process");

class KaliIntegration {
    constructor(opts = {}) {
        this.getSettings = opts.getSettings || (() => ({}));
        this.terminalService = opts.terminalService || null;
        this.binary = opts.binary || (process.platform === "win32" ? "wsl.exe" : "wsl");
    }

    getDistroName() {
        const settings = this.getSettings();
        return settings.kaliDistro || "kali-linux";
    }

    getBinary() {
        return this.binary;
    }

    buildOpenShellCommand() {
        return `${this.getBinary()} -d ${this.getDistroName()}`;
    }

    buildInteractiveCommand(command) {
        const quoted = this._escapePowerShellSingleQuoted(command);
        return `${this.getBinary()} -d ${this.getDistroName()} -- bash -lc '${quoted}'`;
    }

    dryRun(command) {
        return {
            distro: this.getDistroName(),
            binary: this.getBinary(),
            command,
            args: ["-d", this.getDistroName(), "--", "bash", "-lc", command],
            printable: this.buildInteractiveCommand(command)
        };
    }

    async openInteractiveShell(options = {}) {
        if (!this.terminalService) {
            throw new Error("Terminal service is not connected.");
        }

        return this.terminalService.openShell(this.buildOpenShellCommand(), options);
    }

    async checkEnvironment() {
        const result = await this._spawnAndCollect(["-l", "-q"], {
            timeoutMs: 8000
        }).catch(error => ({
            ok: false,
            stdout: "",
            stderr: error.message,
            exitCode: null,
            error
        }));

        const distros = result.stdout
            .split(/\r?\n/)
            .map(line => line.replace(/\u0000/g, "").trim())
            .filter(Boolean);

        return {
            available: result.ok,
            binary: this.getBinary(),
            distro: this.getDistroName(),
            distros,
            distroInstalled: distros.includes(this.getDistroName()),
            error: result.ok ? null : result.stderr || (result.error ? result.error.message : "WSL unavailable")
        };
    }

    async run(command, options = {}) {
        const handle = this.stream(command, options);
        return handle.promise;
    }

    stream(command, options = {}) {
        const args = ["-d", this.getDistroName(), "--", "bash", "-lc", command];
        const child = spawn(this.getBinary(), args, {
            windowsHide: true,
            stdio: ["ignore", "pipe", "pipe"]
        });

        let stdout = "";
        let stderr = "";
        let settled = false;
        let timeout = null;

        const stdoutListeners = new Set();
        const stderrListeners = new Set();
        const exitListeners = new Set();

        const notify = (listeners, payload) => {
            listeners.forEach(listener => {
                try {
                    listener(payload);
                } catch (error) {
                    // keep stream consumers isolated
                }
            });
        };

        if (child.stdout) {
            child.stdout.on("data", chunk => {
                const value = chunk.toString();
                stdout += value;
                notify(stdoutListeners, value);
            });
        }

        if (child.stderr) {
            child.stderr.on("data", chunk => {
                const value = chunk.toString();
                stderr += value;
                notify(stderrListeners, value);
            });
        }

        const promise = new Promise((resolve, reject) => {
            child.once("error", error => {
                settled = true;
                if (timeout) clearTimeout(timeout);
                reject(error);
            });

            child.once("close", (exitCode, signal) => {
                settled = true;
                if (timeout) clearTimeout(timeout);

                const result = {
                    ok: exitCode === 0,
                    distro: this.getDistroName(),
                    command,
                    args,
                    stdout,
                    stderr,
                    exitCode,
                    signal
                };

                notify(exitListeners, result);
                resolve(result);
            });
        });

        if (typeof options.timeoutMs === "number" && options.timeoutMs > 0) {
            timeout = setTimeout(() => {
                if (!settled) {
                    child.kill();
                }
            }, options.timeoutMs);
        }

        return {
            child,
            promise,
            cancel: () => {
                if (!settled) {
                    child.kill();
                }
            },
            onStdout: listener => {
                stdoutListeners.add(listener);
                return () => stdoutListeners.delete(listener);
            },
            onStderr: listener => {
                stderrListeners.add(listener);
                return () => stderrListeners.delete(listener);
            },
            onExit: listener => {
                exitListeners.add(listener);
                return () => exitListeners.delete(listener);
            }
        };
    }

    async _spawnAndCollect(args, options = {}) {
        const handle = this.streamRaw(args, options);
        return handle.promise;
    }

    streamRaw(args, options = {}) {
        const child = spawn(this.getBinary(), args, {
            windowsHide: true,
            stdio: ["ignore", "pipe", "pipe"]
        });

        let stdout = "";
        let stderr = "";
        let settled = false;
        let timeout = null;

        if (child.stdout) {
            child.stdout.on("data", chunk => {
                stdout += chunk.toString();
            });
        }

        if (child.stderr) {
            child.stderr.on("data", chunk => {
                stderr += chunk.toString();
            });
        }

        const promise = new Promise((resolve, reject) => {
            child.once("error", error => {
                settled = true;
                if (timeout) clearTimeout(timeout);
                reject(error);
            });

            child.once("close", (exitCode, signal) => {
                settled = true;
                if (timeout) clearTimeout(timeout);
                resolve({
                    ok: exitCode === 0,
                    stdout,
                    stderr,
                    exitCode,
                    signal
                });
            });
        });

        if (typeof options.timeoutMs === "number" && options.timeoutMs > 0) {
            timeout = setTimeout(() => {
                if (!settled) {
                    child.kill();
                }
            }, options.timeoutMs);
        }

        return {
            child,
            promise,
            cancel: () => {
                if (!settled) {
                    child.kill();
                }
            }
        };
    }

    _escapePowerShellSingleQuoted(command) {
        return String(command || "").replace(/'/g, "''");
    }
}

module.exports = {
    KaliIntegration
};
