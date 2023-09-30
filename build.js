Builder = Object.assign(Builder, {
    Extension: (Builder.Platform.includes("Windows") == true ? "win" : "ios"),
    Command: require("child_process"),
    Compiler: undefined,
    ErrorMet: false,
    Runner: [],
    Errors: [],
    Outpath: "",
    Runtime: "",
    Cache: "",
    Drive: "",
    Drives: [],
    Run: function(fork) {
        BuilderCompile.run(fork);
    },
    Stop: function() {
        // Make sure a GMS2 project is open!
        if (Builder.ProjectVersion($gmedit["gml.Project"].current) !== 2) return;

        // Display errors and kill processes!
        if (Builder.ErrorMet === true) Builder.Display();
        if (Builder.Compiler !== undefined) {
            Builder.Compiler.kill();
            Builder.Compiler = undefined;
        }
        if (Builder.Runner.length > 0) {
            Builder.Runner.forEach((e) => {
                e.kill();
            });
        }
    },
    Fork: function() {
        // Make sure a GMS2 project is open!
        if (Builder.ProjectVersion($gmedit["gml.Project"].current) !== 2) return;

        // Fork runner and add it to process list!
        Builder.Runner.push(Builder.Spawn(Builder.Runtime, Builder.Outpath, Builder.Name, true));
    },
    CleanRuntime: function() {
        // you can run the game again
        for (const item of Builder.MenuItems.list) {
            item.enabled = item.id.includes("-run") || item.id.includes("-clean");
        }
        BuilderDrives.removeCurrent();
        Builder.Runner = [];
    },
    CleanCache: function(_then) {
        const cacheDir = Builder.Cache;
        if (!cacheDir) return 1;
        if (!Electron_FS.existsSync(cacheDir)) return 2;
        Electron_FS.rmdir(cacheDir, { recursive: true }, (err) => {
            if (err) {
                console.error(`Couldn't clean cache directory ${cacheDir}: `, err);
            } else {
                console.log(`Cleaned up cache directory ${cacheDir}`);
            }
            if (_then) _then(err);
        });
        return 0;
    },
    CleanGUI: function() {
        console.log("clean?")
        const result = Builder.CleanCache((err) => {
            if (err) {
                Electron_Dialog.showErrorBox({
                    type: "error",
                title: "Builder",
                    message: "Couldn't clean cache in\n" + Builder.Cache + "\n" + err
                });
            } else {
                Electron_Dialog.showMessageBox({
                    type: "info",
                    title: "Builder",
                    message: "Successfully cleaned cache in\n" + Builder.Cache
                });
            }
        });
        switch (result) {
            case 1: Electron_Dialog.showMessageBox({
                type: "error",
                title: "Builder",
                message: "No idea where the cache is - run the game first"
            }); break;
            case 2: Electron_Dialog.showMessageBox({
                type: "info",
                title: "Builder",
                message: "Builder-specific cache directory doesn't exist - no action needed"
            }); break;
        }
    },
    Parse: function(string, type) {
        // Parse error output!
        const Contents = (string.toString()).split("\n");
        for(let i = 0; i < Contents.length; i++) {
            const Message = Contents[i];
            switch (type) {
                case 0: { // GMAssetCompiler.exe
                    if (Message.slice(0, 8) === "Error : ") {
                        Builder.Errors.push(Message.slice(8).trim());
                        Builder.ErrorMet = true;
                    } else if (Message.startsWith("Final Compile") === true && Builder.ErrorMet === true) {
                        return 1;
                    }
                    break;
                }

                case 1: { // Runner.exe
                    if (BuilderPreferences.current.displayLine == true && (Message.startsWith("ERROR!!! :: ") === true && Contents[i + 1].startsWith("FATAL ERROR") === true)) {
                        for(let j = i + 1; j < Contents.length; j++) {
                            if (Contents[j].startsWith("stack frame is") === true) {
                                const Stack = Builder.ParseDescriptor(Contents[++j]);
                                if ($gmedit["ui.OpenDeclaration"].openLocal(Stack.Asset, Stack.Line) === true) {
                                    setTimeout(() => {
                                        let Offset = 0;
                                        if (Stack.Type === "Object") {
                                            for(let Event = Builder.GetEvent(Stack.Event), k = 0; k < aceEditor.session.getLength(); k++) {
                                                if (aceEditor.session.getLine(k).startsWith("#event " + Event) === true) {
                                                    Offset = ++k;
                                                    break;
                                                }
                                            }
                                        }
                                        aceEditor.gotoLine(Stack.Line + Offset);
                                    }, 10);
                                }
                                break;
                            }
                        }
                    }
                    break;
                }
            }
        }
        return 0;
    },
    ParseDescriptor: function(string) {
        // Parse error descriptor and return object about it!
        const Descriptor = {};
        if (string.startsWith("gml_")) string = string.slice(4);
        Descriptor.Type = string.slice(0, string.indexOf("_"));
        string = string.slice(Descriptor.Type.length + 1);
        Descriptor.Line = parseInt(string.slice(string.lastIndexOf("(") + 1, string.lastIndexOf(")")).replace("line", ""));
        string = string.slice(0, string.lastIndexOf("(")).trim();
        if (Descriptor.Type === "Object") {
            Descriptor.Event = string.slice(string.lastIndexOf("_", string.lastIndexOf("_") - 1) + 1);
            string = string.slice(0, (Descriptor.Event.length * -1) - 1);
        }
        Descriptor.Asset = string;
        return Descriptor;
    },
    GetEvent: function(event) {
        // Turn descriptor event into GMEdit event name! 
        const SubEvent = event.slice(event.lastIndexOf("_") + 1), GmlEvent = $gmedit["parsers.GmlEvent"];
        event = event.slice(0, event.lastIndexOf("_"));
        for(let i = 0; i < GmlEvent.t2sc.length; i++) {
            if (GmlEvent.t2sc[i] === event) {
                return GmlEvent.i2s[i][SubEvent];
            }
        }
        return "";
    },
    Display: function() {
        // Display errors in new tab!
        const project = $gmedit["gml.Project"].current;
        const GmlFile = $gmedit["gml.file.GmlFile"];
        let output = new GmlFile(`Compilation Errors`, null, $gmedit["file.kind.gml.KGmlSearchResults"].inst, `// Compile failed with ${Builder.Errors.length} error${(Builder.Errors.length == 1 ? "" : "s")}\n\n`); 
        output.Write = (e) => {output.editor.session.setValue(output.editor.session.getValue() + "\n" + e); }
        for (const error of Builder.Errors) {
            const colonPos = error.indexOf(":");
            const descriptor = Builder.ParseDescriptor(error.slice(0, colonPos).trim());
            const errorText = error.slice(colonPos + 1).trim();
            let errorLine = "";
            grabErrorLine: {
                const resourceGUID = project.yyResourceGUIDs[descriptor.Asset];
                if (resourceGUID === null) break grabErrorLine;
                const resource = project.yyResources[resourceGUID];
                if (resource === null) break grabErrorLine;
                let resourcePath;
                if (resource.Value) {
                    resourcePath = resource.Value.resourcePath;
                } else if (resource.id) {
                    resourcePath = resource.id.path;
                } else break grabErrorLine;
                let path = resourcePath.slice(0, -(3 + descriptor.Asset.length));
                switch (descriptor.Type) {
                    case "Object": path += descriptor.Event; break;
                    default: path += descriptor.Asset; break;
                }
                try {
                    errorLine = project.readTextFileSync(path + ".gml").split("\n")[descriptor.Line].trim();
                } catch (_) {}
            };
            output.Write(`// Error in ${descriptor.Type[0].toLowerCase() + descriptor.Type.slice(1)} at @[${descriptor.Asset}${(descriptor.Type == "Object" ? `(${Builder.GetEvent(descriptor.Event)})` : "")}:${descriptor.Line + 1}]:\n// ${errorText}\n${errorLine}\n`)
        }
        GmlFile.openTab(output);
    },
    Spawn: function(runtime, outputPath, name, isFork, callback) {
        // Spawn an instance of the runner!
        let runnerPath = Builder.RunnerPath;
        runnerPath ??= (Builder.Platform === "win"
            ? `${runtime}/windows/Runner.exe`
            : `${runtime}/mac/YoYo Runner.app/Contents/MacOS/Mac_Runner`
        );
        const builderSettings = $gmedit["gml.Project"].current.properties.builderSettings;
        
        let args = [
            "-game", `${outputPath}/${name}.${Builder.Extension}`
        ];
        const parseArgs = (str) => {
            if (str == null) return [];
            str = str.trim();
            if (str === "") return [];
            if (str.startsWith("[")) try {
                return JSON.parse(str);
            } catch (e) {
                console.log('Error parsing', str, e);
                return [];
            }
            const result = [];
            let start = 0, acc = "";
            let pos = 0, len = str.length;
            let isInQuotes = false
            const flush = (till) => {
                if (!(till > start || acc !== "")) return;
                result.push(acc + str.substring(start, till));
                acc = "";
            };
            while (pos < len) {
                const c = str.charAt(pos++);
                if (c === " ") {
                    if (isInQuotes) {
                        //
                    } else {
                        flush(pos - 1);
                        start = pos;
                    }
                } else if (c === "\"") {
                    if (pos < len && str.charAt(pos) === "\"") {
                        acc += str.substring(start, pos);
                        start = ++pos;
                    } else {
                        flush(pos - 1);
                        start = pos;
                        isInQuotes = !isInQuotes;
                    }
                }
            }
            flush(pos);
            return result;
        };
        if (builderSettings?.steamAppID !== null) {
            if (builderSettings?.steamAppID !== 0) args.push("-debug_steamapi");
        } else if (Electron_FS.existsSync(`${outputPath}/steam_appid.txt`)) {
            args.push("-debug_steamapi");
        }
        {
            const extraArguments = builderSettings?.extraArguments;
            args = args.concat(parseArgs(extraArguments));
        }
        if (isFork) {
            const forkArguments = builderSettings?.forkArguments ?? BuilderPreferences.current.forkArguments;
            args = args.concat(parseArgs(forkArguments));
        }
        
        const output = BuilderOutput.open(isFork);
        output.write(`Running ${[runnerPath].concat(args).join(" ")}...\n`);
        const runner = Builder.Command.spawn(runnerPath, args, {
            cwd: outputPath
        });
        runner.stdout.on("data", (e) => {
            const text = e.toString();
            switch (Builder.Parse(text, 1)) {
                default: output.write(text, false);
            }
        });
        runner.addListener("close", function(code) {
            const runners = Builder.Runner;
            const i = runners.indexOf(this);
            if (i >= 0) runners.splice(i, 1);
            
            if (code !== 0 && code !== null) output.write(`Runner exited with non-zero status (0x${code.toString(16)} = ${code})`)
            if (callback) callback(code);
            Builder.CleanRuntime();
            if (runners.length === 0 && BuilderPreferences.current.cleanAfterRun) Builder.CleanCache();
        });
        return runner;
    },
    Sanitize: (value) => { return value.replace(/ /g, "_"); },
    Random: () => { return Math.round(Math.random() * 4294967295).toString(16).padStart(8, "0").toUpperCase(); },
    GetTime: (t) => {
        if (t == null) t = new Date();
        return `${t.getHours().toString().padStart(2, "0")}:${t.getMinutes().toString().padStart(2, "0")}:${t.getSeconds().toString().padStart(2, "0")}`
    },
    SessionsFile: new $gmedit["electron.ConfigFile"]("session", "builder-projects"),
});
