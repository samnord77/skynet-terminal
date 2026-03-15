const { EventEmitter } = require("events");

class TerminalService {
    constructor(opts = {}) {
        this.getTerminal = opts.getTerminal || (() => null);
        this.getKeyboard = opts.getKeyboard || (() => null);
        this.getCurrentTermIndex = opts.getCurrentTermIndex || (() => 0);
        this.getSettings = opts.getSettings || (() => ({}));
        this.delay = opts.delay || (ms => new Promise(resolve => setTimeout(resolve, ms)));

        this._events = new EventEmitter();
        this._boundTerminal = null;
        this._boundSocket = null;
        this._boundSocketListener = null;
    }

    getActiveTerminal() {
        return this.getTerminal();
    }

    getCurrentCwd() {
        const terminal = this.getActiveTerminal();
        return terminal && terminal.cwd ? terminal.cwd : "";
    }

    focus() {
        const terminal = this.getActiveTerminal();
        if (terminal && terminal.term && typeof terminal.term.focus === "function") {
            terminal.term.focus();
        }
    }

    onOutput(listener) {
        this._ensureOutputBinding();
        this._events.on("output", listener);

        return () => {
            this._events.off("output", listener);
        };
    }

    onCommand(listener) {
        this._events.on("command", listener);

        return () => {
            this._events.off("command", listener);
        };
    }

    async typeText(text, options = {}) {
        const terminal = this._ensureOutputBinding();
        if (!terminal) {
            throw new Error("No active terminal available.");
        }

        const keyboard = this.getKeyboard();
        const typingDelay = this._getTypingDelay(options);

        for (const chunk of Array.from(String(text || ""))) {
            if (keyboard && typeof keyboard.animateInput === "function") {
                await keyboard.animateInput(this._toVisualInput(chunk), {
                    holdMs: Math.max(typingDelay - 8, 16)
                });
            }

            terminal.write(chunk);
            await this.delay(typingDelay);
        }

        this.focus();
        return {
            typed: String(text || ""),
            termId: this.getCurrentTermIndex()
        };
    }

    async pressEnter(options = {}) {
        const terminal = this._ensureOutputBinding();
        if (!terminal) {
            throw new Error("No active terminal available.");
        }

        const keyboard = this.getKeyboard();
        const typingDelay = this._getTypingDelay(options);

        if (keyboard && typeof keyboard.animateInput === "function") {
            await keyboard.animateInput("Enter", {
                holdMs: Math.max(typingDelay - 8, 16)
            });
        }

        terminal.write("\r");
        await this.delay(Math.max(typingDelay, 16));
        this.focus();
    }

    async sendLine(command) {
        const terminal = this._ensureOutputBinding();
        if (!terminal) {
            throw new Error("No active terminal available.");
        }

        const printable = String(command || "");
        terminal.writelr(printable);
        this._events.emit("command", {
            command: printable,
            termId: this.getCurrentTermIndex(),
            mode: "line"
        });
        this.focus();

        return {
            command: printable,
            termId: this.getCurrentTermIndex(),
            executed: true
        };
    }

    async runVisualCommand(command, options = {}) {
        const printable = String(command || "");

        if (!printable.trim()) {
            throw new Error("Cannot run an empty command.");
        }

        await this.typeText(printable, options);

        if (options.execute === false) {
            this._events.emit("command", {
                command: printable,
                termId: this.getCurrentTermIndex(),
                mode: "visual-preview"
            });
            return {
                command: printable,
                termId: this.getCurrentTermIndex(),
                executed: false
            };
        }

        await this.pressEnter(options);
        this._events.emit("command", {
            command: printable,
            termId: this.getCurrentTermIndex(),
            mode: "visual-run"
        });

        return {
            command: printable,
            termId: this.getCurrentTermIndex(),
            executed: true
        };
    }

    async openShell(command, options = {}) {
        return this.runVisualCommand(command, options);
    }

    refreshOutputBinding() {
        return this._ensureOutputBinding();
    }

    destroy() {
        if (this._boundSocket && this._boundSocketListener) {
            this._boundSocket.removeEventListener("message", this._boundSocketListener);
        }
        this._boundTerminal = null;
        this._boundSocket = null;
        this._boundSocketListener = null;
        this._events.removeAllListeners();
    }

    _getTypingDelay(options = {}) {
        const settings = this.getSettings();
        if (typeof options.typingDelay === "number") {
            return options.typingDelay;
        }
        if (typeof settings.workspaceTypingDelay === "number") {
            return settings.workspaceTypingDelay;
        }
        return 28;
    }

    _toVisualInput(chunk) {
        if (chunk === "\r" || chunk === "\n") {
            return "Enter";
        }
        if (chunk === "\t") {
            return "Tab";
        }
        return chunk;
    }

    _ensureOutputBinding() {
        const terminal = this.getActiveTerminal();
        if (!terminal || !terminal.socket) {
            return terminal;
        }

        if (terminal === this._boundTerminal && this._boundSocket === terminal.socket) {
            return terminal;
        }

        if (this._boundSocket && this._boundSocketListener) {
            this._boundSocket.removeEventListener("message", this._boundSocketListener);
        }

        this._boundTerminal = terminal;
        this._boundSocket = terminal.socket;
        this._boundSocketListener = event => {
            this._events.emit("output", {
                data: event.data,
                termId: this.getCurrentTermIndex(),
                cwd: this.getCurrentCwd()
            });
        };

        terminal.socket.addEventListener("message", this._boundSocketListener);
        return terminal;
    }
}

module.exports = {
    TerminalService
};
