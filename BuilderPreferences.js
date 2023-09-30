class BuilderPreferences {
	static path = Electron_App.getPath("userData") + "/GMEdit/config/Builder-preferences.json";
	
	static current = {
		reuseTab: false,
		saveCompile: false,
		stopCompile: false,
		displayLine: true,
		forkArguments: "",
		forkInSideView: false,
		showRunAndFork: false,
		useVirtualDrives: false,
		cleanOnError: false,
		cleanAfterRun: false,
		runtimeSettings: {
			Stable: {
				location: process.env.ProgramData + "/GameMakerStudio2/Cache/runtimes/",
				runtimeList: [],
				selection: ""
			},
			Beta: {
				location: process.env.ProgramData + "/GameMakerStudio2-Beta/Cache/runtimes/",
				runtimeList: [],
				selection: ""
			}
		}
	};
	
	static save() {
		Electron_FS.writeFileSync(this.path, JSON.stringify(this.current, (k, v) => {
			return k == "runtimeList" ? undefined : v;
		}, "    "));
	}
	
	static load() {
		Object.assign(this.current, JSON.parse(Electron_FS.readFileSync(this.path)));
	}
	
	static init() {
		if (Electron_FS.existsSync(this.path)) {
			try {
				this.load();
				const pref = this.current;
				if (pref.runtimeLocation != null) {
					// migrate legacy settings
					this.Preferences.runtimeSettings.Stable.location = this.Preferences.runtimeLocation;
                    delete this.Preferences.runtimeLocation;
                    this.Preferences.runtimeSettings.Stable.selection = this.Preferences.runtimeSelection;
                    delete this.Preferences.runtimeSelection;
                    delete this.Preferences.runtimeList;
				}
			} catch (x) {
				console.error("[Builder] Failed to load preferences:", x);
			}
		} else this.save();
	}
	
	static element;
	
	static build() {
		const Preferences = $gmedit["ui.Preferences"];
		const root = document.createElement("div");
		this.element = root;
		const addSep = (out) => {
			const hr = document.createElement("hr");
			out.appendChild(hr);
		}
		
		for (const [key, set] of Object.entries(this.current.runtimeSettings)) {
			const runtimeGroup = Preferences.addGroup(root, `Runtime Settings (${key})`);
			let element, label;
			
			element = Preferences.addInput(runtimeGroup, "Runtime Location", set.location, (value) => {
				set.location = value;
				BuilderPreferences.save();
			});
			const runtimeLocationInput = element.querySelector("input");
			label = element.querySelector("label");
			label.appendChild(document.createTextNode(" ("));
			label.appendChild(Preferences.createFuncAnchor("Reset", function() {
				switch (key) {
					case "Stable": set.location = process.env.ProgramData + "/GameMakerStudio2/Cache/runtimes/"; break;
					case "Beta": set.location = process.env.ProgramData + "/GameMakerStudio2-Beta/Cache/runtimes/"; break;
					default: return;
				}
				runtimeLocationInput.value = set.location;
				BuilderPreferences.save();
			}));
			label.appendChild(document.createTextNode(")"));
			
			element = Preferences.addDropdown(runtimeGroup, "Current Runtime", set.selection, set.runtimeList, (value) => {
				set.selection = value;
				BuilderPreferences.save();
			});
			const runtimeListSelect = element.querySelector("select");
			label = element.querySelector("label");
			label.appendChild(document.createTextNode(" ("));
			label.appendChild(Preferences.createFuncAnchor("Rescan", function() {
				runtimeListSelect.innerHTML = "";
				for (const rt of Builder.GetRuntimes(set.location)) {
					const option = document.createElement("option");
					option.innerHTML = option.value = rt;
					runtimeListSelect.appendChild(option);
				}
				runtimeListSelect.value = set.selection;
				BuilderPreferences.save();
			}));
			label.appendChild(document.createTextNode(")"));
		}
		
		const settingsGroup = Preferences.addGroup(root, "Builder Settings");
		if (Builder.Platform === "win") {
			Preferences.addCheckbox(settingsGroup, 'Use virtual drives', this.current.useVirtualDrives, (value) => {
				this.current.useVirtualDrives = value;
				this.save();
			});
			Preferences.addButton(settingsGroup, "Clean virtual drives", () => {
				BuilderDrives.clean();
			});
			addSep(settingsGroup);
		}
		Preferences.addCheckbox(settingsGroup, 'Show "Run & Fork" in main menu', this.current.showRunAndFork, (value) => {
			this.current.showRunAndFork = value;
			Builder.MenuItems.runAndFork.visible = value;
			this.save();
		});
		Preferences.addInput(settingsGroup, "Fork Arguments", this.current.forkArguments, (value) => {
			this.current.forkArguments = value;
			this.save();
		});
		Preferences.addCheckbox(settingsGroup, 'Show "fork" log in a side view', this.current.forkInSideView, (value) => {
			this.current.forkInSideView = value;
			this.save();
		});
		addSep(settingsGroup);
		
		Preferences.addCheckbox(settingsGroup, "Reuse output tab", this.current.reuseTab, (value) => {
			this.current.reuseTab = value;
			this.save();
		});
		Preferences.addCheckbox(settingsGroup, "Save all tabs upon compile", this.current.saveCompile, (value) => {
			this.current.saveCompile = value;
			this.save();
		});
		Preferences.addCheckbox(settingsGroup, "Stop running instances upon compile", this.current.stopCompile, (value) => {
			this.current.stopCompile = value;
			this.save();
		});
		Preferences.addCheckbox(settingsGroup, "Open source file after fatal errors", this.current.displayLine, (value) => {
			this.current.displayLine = value;
			this.save();
		});
		Preferences.addCheckbox(settingsGroup, "Clean cache on compile error", this.current.cleanOnError, (value) => {
			this.current.cleanOnError = value;
			this.save();
		});
		Preferences.addCheckbox(settingsGroup, "Clean cache after run", this.current.cleanAfterRun, (value) => {
			this.current.cleanAfterRun = value;
			this.save();
		});
		Preferences.addText(root, `builder v${Builder.Version} by nommiin`);
	}
	
	static ready() {
		GMEdit.on("preferencesBuilt", (e) => {
			const out = e.target.querySelector('.plugin-settings[for="builder"]');
			if (this.element == null) this.build();
			out.appendChild(this.element);
		});
	}
}
