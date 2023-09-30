class BuilderProjectProperties {
	static build(project, target) {
		const Preferences = $gmedit["ui.Preferences"];
		const group = Preferences.addGroup(target, "builder Settings");
		const defaultVersion = "<default>";
		
		//
		const ensureJSON = (isDefault) => {
			const properties = project.properties;
			let json = properties.builderSettings;
			if (isDefault && json == null) return null;
			if (json == null) json = properties.builderSettings = {};
			return json;
		};
		
		const json = project.properties.builderSettings;
		const ProjectProperties = $gmedit["ui.project.ProjectProperties"];
		
		//
		let versions = [defaultVersion];
		for (const [_, set] of Object.entries(BuilderPreferences.current.runtimeSettings)) {
			versions = versions.concat(set.runtimeList);
		}
		
		Preferences.addDropdown(group,
			"Version override",
			json?.runtimeVersion ?? defaultVersion,
			versions,
		(v) => {
			if (v === defaultVersion) v = null;
			const json = ensureJSON(v == null);
			if (json == null) return;
			json.runtimeVersion = v;
			ProjectProperties.save(project, project.properties);
		});
		
		//
		const extraArgsField = Preferences.addInput(group,
			"Additional runner arguments",
			json?.forkArguments ?? "",
		(v) => {
			if (v == "") v = null;
			const json = ensureJSON(v == null);
			if (json == null) return;
			json.extraArguments = v;
			ProjectProperties.save(project, project.properties);
		}).querySelector("input");
		
		//
		const forkArgsField = Preferences.addInput(group,
			"Fork arguments override",
			json?.forkArguments ?? "",
		(v) => {
			if (v === "") v = null;
			const json = ensureJSON(v == null);
			if (json == null) return;
			json.forkArguments = v;
			ProjectProperties.save(project, project.properties);
		}).querySelector("input");
		forkArgsField.placeholder = BuilderPreferences.current.forkArguments;
		
		//
		const steamAppIdEl = Preferences.addInput(group,
			"Steam App ID override",
			json?.steamAppID ?? "",
		(v) => {
			v = parseInt(v);
			if (isNaN(v)) v = null;
			const json = ensureJSON(v == null);
			if (json == null) return;
			json.steamAppID = v;
			ProjectProperties.save(project, project.properties);
		});
		steamAppIdEl.querySelector("input").placeholder = "0 to disable, blank to auto-detect";
	}
	
	static ready() {
		GMEdit.on("projectPropertiesBuilt", (e) => {
			this.build(e.project, e.target);
		});
	}
}
