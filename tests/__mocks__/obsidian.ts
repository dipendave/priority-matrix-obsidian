// ==================== Obsidian DOM Helpers ====================
// Obsidian patches these onto HTMLElement/DocumentFragment prototypes at runtime.
// We replicate them here so view code works in jsdom tests.
// Guards ensure this only runs when DOM APIs are available (jsdom environment).

/* eslint-disable @typescript-eslint/no-explicit-any */

if (typeof HTMLElement !== "undefined") {
	function createChildElement(
		this: HTMLElement | DocumentFragment,
		tag: string,
		options?: { cls?: string; text?: string; attr?: Record<string, string> }
	): HTMLElement {
		const el = document.createElement(tag);
		if (options?.cls) {
			options.cls.split(" ").forEach((c) => { if (c) el.classList.add(c); });
		}
		if (options?.text) {
			el.textContent = options.text;
		}
		if (options?.attr) {
			for (const [key, value] of Object.entries(options.attr)) {
				el.setAttribute(key, String(value));
			}
		}
		this.appendChild(el);
		return el;
	}

	const HP = HTMLElement.prototype as any;
	if (!HP.createEl) {
		HP.createEl = function (tag: string, opts?: any) { return createChildElement.call(this, tag, opts); };
		HP.createDiv = function (opts?: any) { return createChildElement.call(this, "div", opts); };
		HP.createSpan = function (opts?: any) { return createChildElement.call(this, "span", opts); };
		HP.addClass = function (cls: string) { this.classList.add(cls); };
		HP.removeClass = function (cls: string) { this.classList.remove(cls); };
		HP.toggleClass = function (cls: string, force?: boolean) {
			if (force !== undefined) this.classList.toggle(cls, force);
			else this.classList.toggle(cls);
		};
		HP.hasClass = function (cls: string) { return this.classList.contains(cls); };
		HP.empty = function () { while (this.firstChild) this.removeChild(this.firstChild); };
		HP.setText = function (text: string) { this.textContent = text; };
		HP.setCssStyles = function (styles: Record<string, string>) { Object.assign(this.style, styles); };
	}

	// Obsidian exposes each node's own document and window as `doc` / `win`,
	// which differ from the globals when the node lives in a popout window.
	const NP = Node.prototype as any;
	if (!("doc" in NP)) {
		Object.defineProperty(NP, "doc", {
			configurable: true,
			get(this: Node) { return this.ownerDocument ?? (this as unknown as Document); },
		});
		Object.defineProperty(NP, "win", {
			configurable: true,
			get(this: Node) { return (this.ownerDocument ?? (this as unknown as Document)).defaultView; },
		});
	}

	// Global createFragment() helper
	const G = globalThis as any;
	if (!G.createFragment) {
		G.createFragment = function (callback?: (el: DocumentFragment) => void): DocumentFragment {
			const fragment = document.createDocumentFragment();
			if (callback) callback(fragment);
			return fragment;
		};
	}

	const FP = DocumentFragment.prototype as any;
	if (!FP.createEl) {
		FP.createEl = function (tag: string, opts?: any) { return createChildElement.call(this, tag, opts); };
		FP.appendText = function (text: string) { this.appendChild(document.createTextNode(text)); };
	}
}

/* eslint-enable @typescript-eslint/no-explicit-any */

// ==================== Obsidian Classes ====================

export class Plugin {
	app: any = { workspace: { getLeavesOfType: () => [], getLeaf: () => ({}) } };
	manifest: any = {};

	constructor(app: any, manifest: any) {
		this.app = app || this.app;
		this.manifest = manifest || this.manifest;
	}

	loadData(): Promise<any> {
		return Promise.resolve(null);
	}

	saveData(_data: any): Promise<void> {
		return Promise.resolve();
	}

	registerView() {}
	addRibbonIcon() {}
	addCommand() {}
}

export class ItemView {
	leaf: any;
	contentEl: any;

	constructor(leaf: any) {
		this.leaf = leaf;
		// Use a real DOM element in jsdom, plain object stub in Node
		if (typeof document !== "undefined") {
			this.contentEl = document.createElement("div");
		} else {
			this.contentEl = { empty: () => {}, addClass: () => {}, createDiv: () => ({}) };
		}
	}

	getViewType(): string {
		return "";
	}

	getDisplayText(): string {
		return "";
	}

	getIcon(): string {
		return "";
	}
}

export class WorkspaceLeaf {}

export class Notice {
	static instances: Notice[] = [];

	message: string | DocumentFragment;
	duration: number;

	constructor(message: string | DocumentFragment, duration?: number) {
		this.message = message;
		this.duration = duration ?? 5000;
		Notice.instances.push(this);
	}

	hide(): void {}

	static clear(): void {
		Notice.instances = [];
	}
}

export function setIcon(_el: HTMLElement, _iconId: string): void {}

export const Platform = { isMobile: false, isDesktop: true };
