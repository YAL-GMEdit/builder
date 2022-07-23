class BuilderOutputTerminal {

	/** @type {AceEditor} */
	static aceEditor = null;

	static aceSession = null;

	/** @type {HTMLDivElement} */
	static sizer = null;

	/** @type {GMEdit_Splitter_ext} */
	static splitter = null;

	/** @type {HTMLDivElement} */
	static container = null;

	/** @type {HTMLDivElement} */
	static parent = null;

	/** @type {BuilderOutput} */
	static output = null;

	static editorID = "builder_terminal";

	static clearOnNextOpen = false;

	static prepare() {
		this.container = document.createElement("div");
		this.container.classList.add("ace_container");

		this.sizer = document.createElement("div");
		this.sizer.setAttribute("splitter-element", "#" + this.editorID);
		this.sizer.setAttribute("splitter-lskey", "aside_height");
		this.sizer.setAttribute("splitter-default-height", "" + (aceEditor.container.clientHeight >> 1));
		this.sizer.classList.add("splitter-td-ext");

		let nextCont = document.createElement("div");
		nextCont.classList.add("ace_container");

		let mainCont = aceEditor.container.parentElement;
		var mainChildren = [];
		for (let el of mainCont.children) mainChildren.push(el);
		for (let ch of mainChildren) {
			mainCont.removeChild(ch);
			nextCont.append(ch);
		}
		mainCont.style.setProperty("flex-direction", "column");
		mainCont.append(nextCont);
		mainCont.append(this.sizer);
		mainCont.append(this.container);
		this.parent = mainCont;

		var textarea = document.createElement("textarea");
		this.container.append(textarea);
		this.aceEditor = GMEdit.aceTools.createEditor(textarea);

		this.container.id = this.editorID;
		this.splitter = new GMEdit_Splitter_ext(this.sizer, GMEditSplitterDirection.Height);
	}

	static emitResize() {
		var e = new CustomEvent("resize");
		e.initEvent("resize");
		window.dispatchEvent(e);
	}

	static onFileClose(e) {
		if (e.file == BuilderOutputTerminal.output?.gmlFile) {
			BuilderOutputTerminal.hide();
		}
	}

	static toggleTerminal() {
		var parent = document.querySelector("#builder_terminal");
		var sizer = document.querySelector(".splitter-td-ext");
		if (parent) {
			if (parent.style.display == "none") {
				parent.style.display = "";
				sizer.style.display = "";
			} else {
				parent.style.display = "none";
				sizer.style.display = "none";
			}
			var e = new CustomEvent("resize");
			e.initEvent("resize");
			window.dispatchEvent(e);
		} else {
			console.error("Could not find terminal resource");
		}
	}

	/** @param {BuilderOutput} output */
	static show(output) {
		if (this.output == null) {
			GMEdit.on("fileClose", this.onFileClose);
			if (this.aceEditor != null) {
				this.parent.append(this.sizer);
				this.parent.append(this.container);
			} else this.prepare();
			this.emitResize();
		} else {
			if (this.clearOnNextOpen) {
				this.clearOnNextOpen = false;
				this.output.clear();
			}
		}
		this.output = output;
		this.aceSession = GMEdit.aceTools.cloneSession(output.aceSession);
		this.aceEditor.setSession(this.aceSession);
		output.aceEditors.push(this.aceEditor);
	}

	static hide() {
		if (this.output == null) return;
		GMEdit.off("fileClose", this.onFileClose);
		this.parent.removeChild(this.sizer);
		this.parent.removeChild(this.container);
		this.output = null;
		this.aceSession = null;
		this.emitResize();
		setTimeout(() => window.aceEditor.focus());
	}
}