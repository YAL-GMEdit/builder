class BuilderCompile {
    static run(autoRunFork) {
        let project = $gmedit["gml.Project"].current;
        if (Builder.ProjectVersion(project) != 2) return false;
        BuilderCompile.runAsync(autoRunFork, project);
        return true;
    }
    static async runAsync(autoRunFork, project) {
        project ??= $gmedit["gml.Project"].current;
        
        const path = require("path")
        const isWindows = (Builder.Platform == "win");

        // Clear any past errors!
        Builder.Errors = [];
        Builder.ErrorMet = false;
        
        // Create or reuse output tab!
        let output = BuilderOutput.open(false);
        let abort = (text) => {
            output.write(text);
            return false;
        }
        output.clear(`Compile Started: ${Builder.GetTime()}`);

        // Save all edits if enabled!
        if (BuilderPreferences.current.saveCompile == true) {
            for (let tab of document.querySelectorAll(".chrome-tab-changed")) {
                let file = tab.gmlFile;
                if (file && file.__changed && file.path != null) file.save();
            }
        }

        // Close any runners if open
        if (BuilderPreferences.current.stopCompile == true) {
            if (Builder.Runner.length > 0) {
                Builder.Runner.forEach((e) => {
                    e.kill();
                });
            }
            Builder.Runner = [];
        }

        // Find the temporary directory!
        output.write(`IDE: ${project.builderIDEVersion}`);
        let builderSettings = project.properties.builderSettings;
        let runtimeSelection;
        function removeRuntimePrefix(version) {
            const prefixRegex = /^runtime-(.+)/;
            const mt = prefixRegex.exec(version);
            return mt ? mt[1] : version;
        }
        function findExactRuntime(desiredVersion) {
            desiredVersion = removeRuntimePrefix(desiredVersion);
            for (let set of Object.values(BuilderPreferences.current.runtimeSettings)) {
                for (let runtimeVersion of set.runtimeList) {
                    let runtimeVersionNP = removeRuntimePrefix(runtimeVersion);
                    if (runtimeVersionNP != desiredVersion) continue;
                    return set.location + runtimeVersion;
                }
            }
            return null;
        }
        if (builderSettings?.runtimeVersion) {
            runtimeSelection = builderSettings.runtimeVersion;
            let rtPath = findExactRuntime(runtimeSelection);
            if (rtPath == null) return abort(`Couldn't find runtime ${runtimeSelection} that is set in project properties!`);
            Builder.Runtime = rtPath;
        } else {
            function getRuntimeNumbers(version) {
                let parts = version.split(".");
                parts = parts.map(part => {
                    let n = parseInt(part);
                    return isNaN(n) ? 0 : n;
                });
                return parts;
            }
            function findClosestRuntime(prefix, oldest = false) {
                for (const set of Object.values(BuilderPreferences.current.runtimeSettings)) {
                    let rtl = set.runtimeList;
                    rtl = rtl.map(v => {
                        const vnp = removeRuntimePrefix(v);
                        return { version: v, noPrefix: vnp, numbers: getRuntimeNumbers(vnp) };
                    });
                    rtl = rtl.filter(v => v.noPrefix.startsWith(prefix));
                    if (rtl.length == 0) continue;
                    rtl.sort((a, b) => {
                        const an = a.numbers;
                        const bn = b.numbers;
                        const n = Math.max(an.length, bn.length);
                        for (let i = 0; i < n; i++) {
                            const av = an[i] ?? 0;
                            const bv = bn[i] ?? 0;
                            let d = bv - av;
                            if (oldest) d = -d;
                            if (d != 0) return d;
                        }
                        return 0;
                    });
                    const rt = rtl[0];
                    rt.path = set.location + rt.version;
                    return rt;
                }
                return null;
            }
            //
            runtimeSelection = null;
            let ideVersion = project.builderIDEVersion;
            const isLTS = /^20\d\d\.0\./.test(ideVersion);
            let rtPath = findExactRuntime(ideVersion);
            if (rtPath) {
                runtimeSelection = ideVersion;
                Builder.Runtime = rtPath;
            } else {
                function setRuntime(rt) {
                    runtimeSelection = rt.version;
                    Builder.Runtime = rt.path;
                }
                let versionParts = ideVersion.split(".");
                for (let vn = versionParts.length; --vn >= 2;) {
                    let versionPrefix = versionParts.slice(0, vn).join(".") + ".";
                    let rt = findClosestRuntime(versionPrefix);
                    if (rt) {
                        setRuntime(rt);
                        break;
                    }
                }
                if (runtimeSelection) {
                    // OK!
                } else if (/^2022\./.test(ideVersion) && !isLTS) {
                    // if it's 2022.x, try 2023.x?
                    let rt = findClosestRuntime("2023.", true);
                    if (rt) setRuntime(rt);
                } else if (/^2\.3\./.test(ideVersion)) {
                    // if it's 2.3.x, try LTS?
                    let rt = findClosestRuntime("2022.0.");
                    if (rt) setRuntime(rt);
                }
            }
            if (runtimeSelection == null) {
                return abort(`Could not find a good runtime match! Try picking one manually.`);
            } else {
                output.write(`Best-matching runtime is ${runtimeSelection}`);
            }
        }
        //
        let appName = (() => {
            let rt = Builder.Runtime;
            let at = rt.lastIndexOf("/Cache");
            if (at < 0) return "GameMakerStudio2";
            rt = rt.substring(0, at);
            at = rt.lastIndexOf("/");
            if (at < 0) return "GameMakerStudio2";
            return rt.substring(at + 1);
        })();
        output.write(`Program: ${appName}`);
        output.write(`Runtime: ${Builder.Runtime}`)
        let steamworksPath = null;
        let Userpath, Temporary, GMS2CacheDir; {
            let appBase = (isWindows ? Electron_App.getPath("appData") : `/Users/${process.env.LOGNAME}/.config`);
            let appDir = `${appBase}/${appName}`;
            if (!Electron_FS.existsSync(appDir)) Electron_FS.mkdirSync(appDir);
            //
            try {
                let userData = JSON.parse(Electron_FS.readFileSync(`${appDir}/um.json`));
                let username = userData.login || userData.username;
                // "you@domain.com" -> "you":
                let usernameAtSign = username.indexOf("@");
                if (usernameAtSign >= 0) username = username.slice(0, usernameAtSign);
                //
                Userpath = `${appDir}/${username}_${userData.userID}`;
                GMS2CacheDir = `${appDir}/Cache/GMS2CACHE`;
            } catch (x) {
                return abort([
                    "Failed to figure out your user path!",
                    "Make sure you're logged in.",
                    "Error: " + x
                ].join("\n"));
            }
            //
            try {
                let userSettings = JSON.parse(Electron_FS.readFileSync(`${Userpath}/local_settings.json`));
                let dir;
                Temporary = userSettings["machine.General Settings.Paths.IDE.TempFolder"];
                dir = userSettings["machine.General Settings.Paths.IDE.AssetCacheFolder"];
                if (dir) GMS2CacheDir = dir + "\\GMS2CACHE";
                steamworksPath = userSettings["machine.Platform Settings.Steam.steamsdk_path"];
            } catch (x) {
                console.error("Failed to read temporary folder path, assuming default.", x);
                Temporary = null;
            }
            if (!Temporary) { // figure out default location
                if (isWindows) {
                    Temporary = `${process.env.LOCALAPPDATA}/${appName}`;
                } else {
                    Temporary = require("os").tmpdir();
                    if (Temporary.endsWith("/T")) Temporary = Temporary.slice(0, -2); // ?
                }
            }
            // for an off-chance that your %LOCALAPPDATA%/GameMakerStudio2 directory doesn't exist
            if (!Electron_FS.existsSync(Temporary)) Electron_FS.mkdirSync(Temporary);
            if (!isWindows) {
                Temporary += "/GameMakerStudio2";
                if (!Electron_FS.existsSync(Temporary)) Electron_FS.mkdirSync(Temporary);
            }
            Temporary += "/GMS2TEMP";
            if (!Electron_FS.existsSync(Temporary)) Electron_FS.mkdirSync(Temporary);
            if (!Electron_FS.existsSync(Temporary)) Electron_FS.mkdirSync(Temporary);
        }
        output.write("Temp directory: " + Temporary);

        let Name = project.name.slice(0, project.name.lastIndexOf("."));
        Builder.Name = Builder.Sanitize(Name);
        Builder.Cache = `${GMS2CacheDir}/${Name}`;

        // Check for GMAssetCompiler and Runner files!
        let GMAssetCompilerDirOrig = Builder.Runtime + "/bin";
        let GMAssetCompilerPathOrig = GMAssetCompilerDirOrig + "/GMAssetCompiler.exe";
        const GMAssetCompilerDir2022Container = `${Builder.Runtime}/bin/assetcompiler/${isWindows ? "windows" : "osx"}`;
        const isArm = Electron_FS.existsSync(`${GMAssetCompilerDir2022Container}/arm64`);
        let GMAssetCompilerDir2022 = `${Builder.Runtime}/bin/assetcompiler/${isWindows ? "windows" : "osx"}/${isArm ? 'arm64' : 'x64'}`;
        let GMAssetCompilerPath2022 = `${GMAssetCompilerDir2022}/GMAssetCompiler${isWindows ? ".exe" : ""}`;
        let GMAssetCompilerDir = GMAssetCompilerDirOrig;
        let GMAssetCompilerPath = GMAssetCompilerPathOrig;
        let DotNET6Flag = false;

        if (!Electron_FS.existsSync(GMAssetCompilerPath)) {
            if (Electron_FS.existsSync(GMAssetCompilerPath2022)) {
                GMAssetCompilerDir = GMAssetCompilerDir2022;
                GMAssetCompilerPath = GMAssetCompilerPath2022;
                DotNET6Flag = true;
            } else {
                output.write(`!!! Could not find "GMAssetCompiler${isWindows ? ".exe" : ""}" in ${GMAssetCompilerPath}`);
                Builder.Stop();
                return;
            }
        }
        let runnerPath = null;
        let x64flag = null; // determines value of /64bitgame= (null to not pass)
        let optPlat = null; // platform options YY (to avoid loading them twice)
        if (isWindows) {
            if (Electron_FS.existsSync(runnerPath = `${Builder.Runtime}/windows/Runner.exe`)) {
                try {
                    optPlat = project.readYyFileSync(`options/windows/options_windows.yy`);
                    x64flag = optPlat["option_windows_use_x64"];
                } catch (e) {
                    console.log("Error checking x64 flag:", e);
                }
            } else if (Electron_FS.existsSync(runnerPath = `${Builder.Runtime}/windows/x64/Runner.exe`)) {
                // no x86 runtime so this surely is x64
                x64flag = true;
            } else runnerPath = null;
        } else {
            if (Electron_FS.existsSync(runnerPath = `${Builder.Runtime}/mac/YoYo Runner.app/Contents/MacOS/Mac_Runner`)) {
                // OK!
            } else runnerPath = null;
        }
        if (runnerPath == null) {
            output.write(`!!! Could not find runner executable in "${Builder.Runtime}"`);
            Builder.Stop();
            return;
        }
        Builder.RunnerPath = runnerPath;
        Builder.MenuItems.stop.enabled = true;

        // Create substitute drive on Windows!
        const TemporaryUnmapped = Temporary;
        if (isWindows && BuilderPreferences.current.useVirtualDrives) {
            let drive = BuilderDrives.add(Temporary);
            if (drive == null) {
                output.write(`!!! Could not find a free drive letter to use`)
                return;
            }
            Builder.Drive = drive;
            Builder.Drives.push(drive);
            Temporary = drive + ":/";
        } else if (!Temporary.endsWith("/") && !Temporary.endsWith("\\")) {
            Temporary += "/";
        }
        Builder.Outpath = Temporary + Name + "_" + Builder.Random();
        output.write("Using output path: " + Builder.Outpath);
        output.write(""); // GMAC doesn't line-break at the start
        
        /*
        Target bit flags:
        Windows: 1 << 6
        Mac: 1 << 1
        IOS: 1 << 2
        Android: 1 << 3
        HTML5: 1 << 5
        Linux: 1 << 7
        WASM: 1 << 63
        OperaGX: 1 << 34
        */
        const targetMask = isWindows ? 64 : 2;
        const targetMachine = isWindows ? "windows" : "mac";
        const targetMachineFriendly = isWindows ? "Windows" : "macOS";
        
        // I don't know where I'm supposed to get feature flag list from
        let ffe = (function() {
            let plain = "operagx-yyc,intellisense,nullish,login_sso,test";
            let shifted = "";
            for (let i = 0; i < plain.length; i++) {
                shifted += String.fromCharCode(plain.charCodeAt(i) + 10);
            }
            return btoa(shifted);
        })();
        
        // Apparently using forward slashes in paths breaks caching now, go figure
        const fixSlashes = (path) => {
            return isWindows ? path.split("/").join("\\") : path;
        }
        
        let outputPath = `${Builder.Outpath}/${Builder.Name}.${Builder.Extension}`;
        let optionsIniPath = fixSlashes(Builder.Outpath + "/options.ini");
        
        const compilerArgs = [
            `/compile`,
            `/majorv=1`, // /mv
            `/minorv=0`, // /iv
            `/releasev=0`, // /rv
            `/buildv=0`, // /bv
            `/zpex`, // GMS2 mode
            `/NumProcessors=8`, // /j
            `/gamename=${Name}`, // /gn spaces/etc. will be replaced automatically
            `/TempDir=${fixSlashes(Temporary)}`, // /td
            `/CacheDir=${fixSlashes(Builder.Cache)}`, // /cd
            `/runtimePath=${fixSlashes(Builder.Runtime)}`, // /rtp
            `/zpuf=${fixSlashes(Userpath)}`, // GMS2 user folder
            `/machine=${targetMachine}`, // /m
            `/target=${targetMask}`, // /tgt
            `/llvmSource=${fixSlashes(Builder.Runtime + "/interpreted/")}`,
            `/nodnd`,
            `/config=${project.config}`,
            `/outputDir=${fixSlashes(Builder.Outpath)}`,
            `/ShortCircuit=True`,
            `/optionsini=${optionsIniPath}`,
            `/CompileToVM`,
            `/baseproject=${fixSlashes(Builder.Runtime + "/BaseProject/BaseProject.yyp")}`,
            `/verbose`,
            `/bt=run`, // build type
            `/runtime=vm`, // "vm" or "yyc"
        ];
        if (!/^runtime-[27]\./.test(runtimeSelection)) {
            // not 2.x/7.x - in other words, 2022+
            compilerArgs.push(`/debug`);
            compilerArgs.push(`/ffe=${ffe}`);
        }
        if (x64flag != null) compilerArgs.push("/64bitgame=" + x64flag);
        compilerArgs.push(project.path);
        //for (let arg of compilerArgs) output.write(arg);
        //
        let extensionNames = []; // only for 2.3+!
        try {
            if (project.isGMS23) for (let resName in project.yyResources) {
                let res = project.yyResources[resName];
                if (res == null) continue;
                let id = res.id;
                if (id == null) continue;
                let extName = id.name;
                if (extName == null) continue;
                let extRel = id.path;
                if (extRel == null || !extRel.startsWith("extensions/")) continue;
                extensionNames.push(resName);
            }
        } catch (e) {
            console.error("Failed to enumerate extensions:", e);
        }
        
        //
        let runUserCommandStep_env = null;
        const runUserCommandStep_init_env = () => {
            let env = {};
            let iniSections = [];
            let iniAdd = (sectionName, key, value) => {
                let section = iniSections.filter(q => q.name == sectionName)[0];
                if (section == null) iniSections.push(section = { name: sectionName, pairs: []});
                let pairs = section.pairs;
                let pair = pairs.filter(q => q.key == key)[0];
                if (pair == null) {
                    pairs.push({key, value});
                } else pair.value = value;
            }
            if (isWindows && x64flag != null) iniAdd("Windows", "Usex64", x64flag ? "True" : "False");
            // baseline:
            env["YYPLATFORM_name"] = targetMachineFriendly;
            try {
                let platName = targetMachine;
                optPlat ??= project.readYyFileSync(`options/${platName}/options_${platName}.yy`);
                for (let key in optPlat) {
                    //if (!key.startsWith("option_")) continue;
                    let val = optPlat[key];
                    if (typeof(val) == "boolean") val = val ? "True" : "False";
                    env["YYPLATFORM_" + key] = val;
                }
            } catch (e) {
                console.error("Error while getting platform options:", e);
            }
            // 
            if (x64flag && env["YYPLATFORM_option_windows_use_x64"] == "False") {
                env["YYPLATFORM_option_windows_use_x64"] = "True";
            }
            // I can't figure out why isRunningFromIDE returns false for builder-launched games
            let appid = env["YYEXTOPT_Steamworks_AppID"];
            if (appid != null) {
                if (!Electron_FS.existsSync(Builder.Outpath)) Electron_FS.mkdirSync(Builder.Outpath);
                Electron_FS.writeFileSync(Builder.Outpath + "/steam_appid.txt", "" + appid);
            }
            //
            env["YYTARGET_runtime"] = "VM";
            env["YYtargetMask"] = targetMask;
            env["YYoutputFolder"] = Builder.Outpath;
            env["YYassetCompiler"] = " " + compilerArgs.join(" ");
            env["YYcompile_output_file_name"] = outputPath;
            env["YYconfig"] = project.config;
            env["YYconfigParents"] = ""; // TODO
            env["YYdebug"] = "False";
            env["YYprojectName"] = Name;
            env["YYprojectPath"] = project.path;
            env["YYprojectDir"] = project.dir;
            env["YYruntimeLocation"] = Builder.Runtime;
            let runtimeVersion = runtimeSelection;
            if (runtimeVersion.startsWith("runtime-")) runtimeVersion = runtimeVersion.substring("runtime-".length);
            env["YYruntimeVersion"] = runtimeVersion;
            env["YYuserDir"] = Userpath;
            env["YYtempFolder"] = TemporaryUnmapped;
            env["YYtempFolderUnmapped"] = TemporaryUnmapped;
            env["YYverbose"] = "True";
            //
            //console.log(env);
            Object.assign(env, process.env);
            // collecting extension options is a little messy but what can you do
            for (let resName of extensionNames) {
                let res = project.yyResources[resName];
                let id = res.id;
                let extName = id.name;
                let extRel = id.path;
                if (extRel == null || !extRel.startsWith("extensions/")) continue;
                let optRel = "options/extensions/" + id.name + ".json";
                if (!project.existsSync(optRel)) continue;
                try {
                    let ext = project.readYyFileSync(extRel);
                    let optRoot = project.readYyFileSync(optRel);
                    let configurables = optRoot.configurables;
                    // collect files with PreGraphicsInitialisation...
                    for (let file of ext.files) {
                        let func = file.functions.filter(q => q.name == "PreGraphicsInitialisation")[0];
                        if (func == null) continue;
                        let aliases = [file.filename];
                        for (let proxy of file.ProxyFiles) aliases.push(proxy.name);
                        let PathTools = $gmedit["haxe.io.Path"];
                        if (isWindows) {
                            aliases = aliases.filter(name => {
                                return PathTools.extension(name).toLowerCase() == "dll";
                            });
                        } else {
                            aliases = aliases.filter(name => {
                                return PathTools.extension(name).toLowerCase() != "dll";
                            });
                        }
                        if (aliases.length > 0) iniAdd(extName, "PreGraphicsInitFile", aliases.join("|"));
                    }
                    for (let optDef of ext.options) {
                        if (optDef.optType == 5) continue; // label!
                        
                        let optGUID = optDef.guid;
                        let optVal = configurables[optGUID];
                        if (optVal != null
                            && typeof(optVal) == "object"
                            && optVal.Default != null
                        ) optVal = optVal.Default.value;
                        optVal ??= optDef.defaultValue;
                        if (optVal == null) continue;
                        // variables:
                        optVal = optVal.replace(/%(\w+)%/g, (mt, name) => {
                            return env[name] ?? mt;
                        });
                        
                        if (optDef.optType == 4) { // path!
                            if (!path.isAbsolute(optVal)) {
                                optVal = path.normalize(path.join(project.dir, optVal));
                            }
                        }
                        
                        env[`YYEXTOPT_${extName}_${optDef.name}`] = optVal;
                        if (optDef.exportToINI) iniAdd(extName, optDef.name, optVal);
                    }
                } catch (e) {
                    console.error(`Error while getting options for ${id.name}:`, e);
                }
            }
            //
            try {
                let optMain = project.readYyFileSync("options/main/options_main.yy");
                for (let key in optMain) {
                    //if (!key.startsWith("option_")) continue;
                    env["YYMAIN_" + key] = optMain[key];
                }
            } catch (e) {
                console.error("Error while getting main options:", e);
            }
            // write the ini file:
            if (iniSections.length > 0) {
                let iniLines = [];
                for (let section of iniSections) {
                    iniLines.push("[" + section.name + "]");
                    if (section.name == "Steamworks") {
                        let sdkPair = section.pairs.filter((p) => p.key == "SteamSDK")[0];
                        if (sdkPair) sdkPair.value = sdkPair.value.split("\\\\").join("\\");
                    }
                    for (let pair of section.pairs) {
                        iniLines.push(pair.key + "=" + pair.value);
                    }
                }
                iniLines.push("");
                if (!Electron_FS.existsSync(Builder.Outpath)) Electron_FS.mkdirSync(Builder.Outpath);
                Electron_FS.writeFileSync(optionsIniPath, iniLines.join("\r\n"));
            }
            //
            runUserCommandStep_env = env;
        }
        /** @returns {bool} trouble */
        const runUserCommandStep_1 = async (path) => {
            if (!project.isGMS23) return false;
            if (runUserCommandStep_env == null) runUserCommandStep_init_env();
            path = project.fullPath(path);
            //console.log(path, Electron_FS.existsSync(path));
            if (!Electron_FS.existsSync(path)) return false;
            // Well? I don't want to print streams when we're done, I want it as it happens
            let proc;
            try {
                output.write(`Running "${path}"`);
                output.write("");
                proc = Builder.Command.spawn(path, {
                    env: runUserCommandStep_env,
                    shell: true,
                });
            } catch (e) {
                output.write(`Failed to run "${path}": ` + e);
                console.error(`Failed to run "${path}":`, e);
                return true;
            }
            let exitCode = null;
            proc.stdout.on("data", (e) => {
               output.write(e.toString(), false);
            });
            proc.stderr.on("data", (e) => {
                output.write(e.toString(), false);
            });
            proc.on("close", (_exitCode) => {
                exitCode = _exitCode;
                output.write(`Finished "${path}", exitCode=${_exitCode} (0x${_exitCode.toString(16)})`);
            });
            Builder.Compiler = proc;
            const asyncSleep = (delay) => {
                return new Promise((resolve, reject) => {
                    setTimeout(() => resolve(null), delay);
                });
            }
            let waitCount = 0;
            while (exitCode == null) {
                waitCount += 1;
                let waitAmt = waitCount < 10 ? 10 : waitCount < 50 ? 25 : 50;
                await asyncSleep(waitAmt);
            }
            Builder.Compiler = null;
            return exitCode != 0;
        }
        const runUserCommandStep = async (name) => {
            let scriptRel = name + (isWindows?".bat":".sh");
            if (await runUserCommandStep_1(scriptRel)) return true;
            for (let resName of extensionNames) {
                let res = project.yyResources[resName];
                let esPath = $gmedit["haxe.io.Path"].directory(res.id.path) + "/" + scriptRel;
                if (await runUserCommandStep_1(esPath)) return true;
            }
            return false;
        }

        // Run the compiler!
        let compileStartTime = Date.now();
        if (await runUserCommandStep("pre_build_step")) return;
        if (isWindows) {
            Builder.Compiler = Builder.Command.spawn(GMAssetCompilerPath, compilerArgs, {
                cwd: Builder.Runtime,
            });
        } else if (DotNET6Flag) {
            Builder.Compiler = Builder.Command.spawn(GMAssetCompilerPath, compilerArgs);
        } else {
            Builder.Compiler = Builder.Command.spawn(
                "/Library/Frameworks/Mono.framework/Versions/Current/Commands/mono",
                [GMAssetCompilerPath].concat(compilerArgs)
            );
        }
        
        // Capture compiler output!
        output.write(""); // (because stdout is appended raw)
        Builder.Compiler.stdout.on("data", (e) => {
            let text = e.toString();
            switch (Builder.Parse(text, 0)) {
                case 1: Builder.Stop();
                default: output.write(text, false);
            }
        });
        Builder.Compiler.stderr.on("data", (e) => {
            let text = e.toString();
            switch (Builder.Parse(text, 0)) {
                case 1: Builder.Stop();
                default: output.write(text, false);
            }
        });

        Builder.Compiler.on("close", async (exitCode) => {
            if (exitCode != 0 || Builder.Compiler == undefined || Builder.ErrorMet) {
                BuilderOutput.main.write(`Compile Ended: ${Builder.GetTime()} (${(Date.now() - compileStartTime)/1000}s)`);
                Builder.CleanRuntime();
                if (BuilderPreferences.current.cleanOnError) Builder.CleanCache();
                return;
            }
            BuilderOutput.main.write(`Compile Finished: ${Builder.GetTime()} (${(Date.now() - compileStartTime)/1000}s)`);

            // Rename output file!
            if (Name != Builder.Name || !isWindows) {
                let executableName = isWindows ? Name : "game";
                Electron_FS.renameSync(`${Builder.Outpath}/${executableName}.${Builder.Extension}`, `${Builder.Outpath}/${Builder.Name}.${Builder.Extension}`);
                Electron_FS.renameSync(`${Builder.Outpath}/${executableName}.yydebug`, `${Builder.Outpath}/${Builder.Name}.yydebug`);
            }

            // Copy Steam API binary if needed:
            if (Electron_FS.existsSync(`${Builder.Outpath}/steam_appid.txt`) && steamworksPath) try {
                if (isWindows) {
                    Electron_FS.copyFileSync(`${steamworksPath}/redistributable_bin/steam_api.dll`, `${Builder.Outpath}/steam_api.dll`);
                } else {
                    // note: not tested at all
                    Electron_FS.copyFileSync(`${steamworksPath}/redistributable_bin/osx32/libsteam_api.dylib`, `${Builder.Outpath}/libsteam_api.dylib`);
                }
            } catch (x) {
                console.error("Failed to copy steam_api:", x);
            }
            Builder.Compiler = undefined;
            
            if (await runUserCommandStep("post_build_step")) return;

            if (await runUserCommandStep("pre_run_step")) return;
            BuilderOutputAside.clearOnNextOpen = true;
            Builder.Runner.push(Builder.Spawn(Builder.Runtime, Builder.Outpath, Builder.Name, false, (_code) => {
                runUserCommandStep("post_run_step");
            }));
            Builder.MenuItems.fork.enabled = true;
            if (autoRunFork) Builder.Fork();
        });
    }
}
