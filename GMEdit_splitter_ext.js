/**
 * Modified version of base GMEdit's splitter. Allows both vertical and horizontal splits.
 */
class GMEdit_Splitter_ext {

    electron = null;
    fs = null;
    configPath = null;
    orientiation = null;
    conf = null;

    mainEl = document.getElementById("main");
    splitters = [];

    constructor(sizer, _orientiation) {

        if (sizer === null || sizer === undefined) {
            console.error("Sizer is required for initialize GMEdit_Splitter_ext");
            return;
        }

        this.orientiation = _orientiation;

        if (window.require) {
            this.electron = require("electron");
            this.fs = require("fs");
            var remote = this.electron.remote;
            if (remote == null) remote = require("@electron/remote");
            this.configPath = remote.app.getPath("userData") + "/GMEdit/session/splitterExt.json";
        }

        SplitterExt.syncMain = this.syncMain;
        SplitterExt.splitters = this.splitters;

        window.GMEdit_Splitter_Etx = SplitterExt;
        var splitterEls = document.querySelectorAll(".splitter-td-ext");
        for (var i = 0; i < splitterEls.length; i++) {
            var sp = new SplitterExt(this, splitterEls[i])
            if (sp.setVars) this.splitters.push(sp);
        }

        var q = this;
        window.addEventListener("resize", function (e) {
            q.syncMain();
        });

        this.syncMain();
    }

    initConf() {
        if (this.conf == null && window["$gmedit"]) {
            this.conf = new $gmedit["electron.ConfigFile"]("session", "splitter");
        }
    }

    syncMain() {
        var mainSize;
        if (this.orientiation == GMEditSplitterDirection.Width) {
            mainSize = window.innerWidth;
        }

        if (this.orientiation == GMEditSplitterDirection.Height) {
            mainSize = window.innerHeight;
        }

        // Could not find a valid orientation. Exit with error.
        if (!this.orientiation == GMEditSplitterDirection.Width && !this.orientiation == GMEditSplitterDirection.Height) {
            console.error("Orientation not reconized: " + this.orientiation);
            return;
        }

        for (var i = 0; i < this.splitters.length; i++) {
            var sp = this.splitters[i];
            if (sp.sizer.style.display == "none") continue;
            if (!document.body.contains(sp.sizer)) continue;
            var offset;

            offset = sp.getSize();
            mainSize -= offset;
        }

        this.mainEl.style.setProperty("--main-" + this.orientiation, mainSize + "px");
    }
}