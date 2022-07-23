class SplitterExt {

    static target = null;
    static sizer = null;
    static sizeVar = null;
    static setVars = null
    static minSize = null
    static updateTabs = null
    static isMisc = null
    static parentEl = null
    static lsKey = null

    gmSplitter = null;

    constructor(gmEditSplitter, sizer) {

        this.gmSplitter = gmEditSplitter;

        gmEditSplitter.initConf();
        var q = this;
        var target = document.querySelector(sizer.getAttribute("splitter-element"));
        this.target = target;
        this.sizer = sizer;
        this.sizeVar = sizer.getAttribute("splitter-" + gmEditSplitter.orientiation + "-var");
        this.setVars = !!this.sizeVar;
        this.minSize = 0 | (sizer.getAttribute("splitter-min-" + gmEditSplitter.orientiation) || 50);
        this.updateTabs = sizer.getAttribute("splitter-update-tabs");
        this.isMisc = sizer.id != "splitter-td-ext";
        this.parentEl = target.parentElement;
        this.lsKey = sizer.getAttribute("splitter-lskey");
        target.style.setProperty("flex-grow", "inherit");

        var conf = gmEditSplitter.conf;

        var s = null;

        let newSize = Math.max(0 | (sizer.getAttribute("splitter-default-" + gmEditSplitter.orientiation)), this.minSize);

        this.setSize(newSize);

        var sp_mousemove, sp_mouseup, sp_x, sp_y;
        sp_mousemove = function (e) {
            var nx = e.pageX, dx = nx - sp_x; sp_x = nx;
            var ny = e.pageY, dy = ny - sp_y; sp_y = ny;
            var chosenDiff;
            if (q.gmSplitter.orientiation == GMEditSplitterDirection.Width) {
                chosenDiff = dx;
            }
            if (q.gmSplitter.orientiation == GMEditSplitterDirection.Height) {
                chosenDiff = dy;
            }
            var ns = parseFloat(q._findSize(q.target.style)) + chosenDiff * (q.target.parentElement.children[0] == q.target ? 1 : -1);
            if (ns < q.minSize) ns = q.minSize;
            q.setSize(ns);
            if (q.updateTabs && window.$gmedit) $gmedit["ui.ChromeTabs"].impl.layoutTabs()

            var e = new CustomEvent("resize");
            e.initEvent("resize");
            window.dispatchEvent(e);
        };

        sp_mouseup = function (e) {
            document.removeEventListener("mousemove", sp_mousemove);
            document.removeEventListener("mouseup", sp_mouseup);
            q.gmSplitter.mainEl.classList.remove("resizing");
            var s = q._findSize(q.target.style);

            // save
            gmEditSplitter.initConf();
            if (conf) {
                conf.sync();
                if (conf.data == null) conf.data = {};
                var sub = conf.data[q.lsKey];
                if (sub == null) sub = conf.data[q.lsKey] = {};
                if (q.gmSplitter.orientiation == GMEditSplitterDirection.Width) {
                    sub.width = s;
                }
                if (q.gmSplitter.orientiation == GMEditSplitterDirection.Height) {
                    sub.height = s
                }
                conf.flush();
            }
        };

        sizer.addEventListener("mousedown", function (e) {
            sp_x = e.pageX; sp_y = e.pageY;
            document.addEventListener("mousemove", sp_mousemove);
            document.addEventListener("mouseup", sp_mouseup);
            q.gmSplitter.mainEl.classList.add("resizing");
            e.preventDefault();
        });
    }

    getSize() {
        var targetSize = 0;
        var offset = 0;

        if (this.gmSplitter.orientiation == GMEditSplitterDirection.Width) {
            offset = this.sizer.offsetWidth;
            targetSize = this.target.offsetWidth;

        }
        if (this.gmSplitter.orientiation == GMEditSplitterDirection.Height) {
            offset = this.sizer.offsetHeight;
            targetSize = this.target.offsetHeight;
        }
        return (targetSize > 0 ? (parseFloat(_findSize(this.target.style)) || targetSize) : 0) + this.sizer.offsetWidth;
    }

    setSize(ns) {
        var offset = 0;

        if (this.gmSplitter.orientiation == GMEditSplitterDirection.Width) {
            offset = this.sizer.offsetWidth;
            this.target.style.width = ns + "px";

        }
        if (this.gmSplitter.orientiation == GMEditSplitterDirection.Height) {
            offset = this.sizer.offsetHeight;
            this.target.style.height = ns + "px";
        }

        this.target.style.flex = "0 0 " + ns + "px";
        if (this.setVars) {
            this.mainEl.style.setProperty(this.sizeVar, (ns + offset) + "px");
            syncMain(ns);
        }
    }

    setWidth(nw) {
        this.target.style.width = nw + "px";
        this.target.style.flex = "0 0 " + nw + "px";
        if (this.setVars) {
            this.mainEl.style.setProperty(this.sizeVar, (nw + this.sizer.offsetWidth) + "px");
            syncMain(nw);
        }
    }

    setHeight(nh) {
        this.target.style.height = nh + "px";
        this.target.style.flex = "0 0 " + nh + "px";
        if (this.setVars) {
            this.mainEl.style.setProperty(this.sizeVar, (nh + this.sizer.offsetHeight) + "px");
            syncMain(nh);
        }
    }

    _findSize(_obj) {
        if (this.gmSplitter.orientiation == GMEditSplitterDirection.Width) {
            return _obj.width;
        }
        if (this.gmSplitter.orientiation == GMEditSplitterDirection.Height) {
            return _obj.height;
        }
    }
}