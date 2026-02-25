import { app } from "../../scripts/app.js";

const N_IN = 9;
const N_MID = 3;
const N_OUT = 9;
const N = N_IN + N_MID + N_OUT; // 21

const LABELS = [
    ...Array.from({ length: N_IN }, (_, i) => `IN${i}`),
    ...Array.from({ length: N_MID }, (_, i) => `MID${i}`),
    ...Array.from({ length: N_OUT }, (_, i) => `OUT${i}`),
];

const COLORS = {
    curveIn: "#2e86ff",
    curveMid: "#f39c12",
    curveOut: "#27ae60",
    spanIn: "rgba(46,134,255,0.25)",
    spanMid: "rgba(243,156,18,0.25)",
    spanOut: "rgba(39,174,96,0.25)",
    active: "#ff8f4c",
    grid: "rgba(255,255,255,0.12)",
    axis: "rgba(255,255,255,0.4)",
    muted: "rgba(255,255,255,0.6)",
    panel: "#1a1a2e",
    text: "#ffffff",
};

const CURVE_HEIGHT = 200;
const PAD = { l: 45, r: 10, t: 8, b: 50 };
const WRAPPER_PAD = { l: 15, r: 15, t: 10, b: 15 }; // Padding around the graph within the node
const MIN_NODE_HEIGHT = 400; // Minimum height to contain widgets + graph

function clamp(x, lo, hi) {
    return Math.max(lo, Math.min(hi, x));
}

function sectionForIndex(i) {
    if (i < N_IN) return "In";
    if (i < N_IN + N_MID) return "Mid";
    return "Out";
}

app.registerExtension({
    name: "VisualModelMergeSDXL",

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "VisualModelMergeSDXL") {
            return;
        }

        // Store original methods
        const onNodeCreated = nodeType.prototype.onNodeCreated;
        const onDrawForeground = nodeType.prototype.onDrawForeground;
        const onMouseDown = nodeType.prototype.onMouseDown;
        const onMouseMove = nodeType.prototype.onMouseMove;
        const onMouseUp = nodeType.prototype.onMouseUp;

        nodeType.prototype.onNodeCreated = function () {
            const r = onNodeCreated?.apply(this, arguments);

            // Initialize curve state
            this.curveValues = new Array(N).fill(100);
            this.curveRadius = 3;
            this.curveActiveIdx = -1;
            this.curveDragging = false;

            // Find and configure widgets
            const jsonWidget = this.widgets?.find((w) => w.name === "weights_json");
            if (jsonWidget) {
                // Load initial values
                try {
                    const parsed = JSON.parse(jsonWidget.value);
                    if (Array.isArray(parsed) && parsed.length === N) {
                        this.curveValues = parsed.map((x) => clamp(Math.round(x), 0, 100));
                    }
                } catch (e) {}

                // Hide the JSON widget
                jsonWidget.type = "hidden";
                jsonWidget.computeSize = () => [0, -4];
            }

            // Add radius slider
            this.addWidget("slider", "Smoothing Radius", 3, (v) => {
                this.curveRadius = v;
            }, { min: 1, max: 8, step: 1, precision: 0, serialize: false });

            // Add reset button
            this.addWidget("button", "Reset Weights", null, () => {
                this.curveValues = new Array(N).fill(100);
                this.syncCurveToBackend();
                app.canvas.setDirty(true, true);
            }, { serialize: false });

            // Set node size with minimum dimensions to contain widgets and graph
            this.size[0] = Math.max(this.size[0], 420);
            const requiredHeight = this.computeSize()[1] + WRAPPER_PAD.t + CURVE_HEIGHT + WRAPPER_PAD.b;
            this.size[1] = Math.max(requiredHeight, MIN_NODE_HEIGHT);

            return r;
        };

        nodeType.prototype.syncCurveToBackend = function () {
            const jsonWidget = this.widgets?.find((w) => w.name === "weights_json");
            if (jsonWidget) {
                jsonWidget.value = JSON.stringify(this.curveValues.map((v) => Math.round(v)));
            }
        };

        nodeType.prototype.getCurveArea = function () {
            // Curve area is at the bottom of the node, after all widgets, with wrapper padding
            const widgetsHeight = this.computeSize()[1];
            return {
                x: WRAPPER_PAD.l,
                y: widgetsHeight + WRAPPER_PAD.t,
                w: this.size[0] - WRAPPER_PAD.l - WRAPPER_PAD.r,
                h: CURVE_HEIGHT,
            };
        };

        nodeType.prototype.xForIndex = function (i, area) {
            const plotW = area.w - PAD.l - PAD.r;
            const t = N === 1 ? 0.5 : i / (N - 1);
            return area.x + PAD.l + t * plotW;
        };

        nodeType.prototype.yForValue = function (v, area) {
            const plotH = area.h - PAD.t - PAD.b;
            const t = clamp(v / 100, 0, 1);
            return area.y + PAD.t + (1 - t) * plotH;
        };

        nodeType.prototype.valueForY = function (y, area) {
            const plotH = area.h - PAD.t - PAD.b;
            const t = (y - area.y - PAD.t) / plotH;
            return clamp((1 - t) * 100, 0, 100);
        };

        nodeType.prototype.nearestIndexFromX = function (x, area) {
            const plotW = area.w - PAD.l - PAD.r;
            const t = clamp((x - area.x - PAD.l) / plotW, 0, 1);
            return clamp(Math.round(t * (N - 1)), 0, N - 1);
        };

        nodeType.prototype.applyLocalDelta = function (centerIdx, delta, radius) {
            const sigma = Math.max(0.6, radius / 1.8);
            const denom = 2 * sigma * sigma;

            for (let i = 0; i < N; i++) {
                const d = i - centerIdx;
                const w = Math.exp(-(d * d) / denom);
                this.curveValues[i] = clamp(this.curveValues[i] + delta * w, 0, 100);
            }
        };

        nodeType.prototype.onDrawForeground = function (ctx) {
            onDrawForeground?.apply(this, arguments);

            if (!this.curveValues) return;

            const area = this.getCurveArea();
            const plotW = area.w - PAD.l - PAD.r;
            const plotH = area.h - PAD.t - PAD.b;

            ctx.save();

            // Background
            ctx.fillStyle = COLORS.panel;
            ctx.fillRect(area.x, area.y, area.w, area.h);

            // Section backgrounds
            const yTop = area.y + PAD.t;
            const yBot = area.y + area.h - PAD.b;

            const xInStart = this.xForIndex(0, area);
            const xMidStart = this.xForIndex(N_IN, area);
            const xOutStart = this.xForIndex(N_IN + N_MID, area);
            const xEnd = area.x + area.w - PAD.r;

            ctx.fillStyle = COLORS.spanIn;
            ctx.fillRect(xInStart, yTop, xMidStart - xInStart, yBot - yTop);

            ctx.fillStyle = COLORS.spanMid;
            ctx.fillRect(xMidStart, yTop, xOutStart - xMidStart, yBot - yTop);

            ctx.fillStyle = COLORS.spanOut;
            ctx.fillRect(xOutStart, yTop, xEnd - xOutStart, yBot - yTop);

            // Horizontal grid lines
            ctx.strokeStyle = COLORS.grid;
            ctx.lineWidth = 1;
            for (const v of [0, 25, 50, 75, 100]) {
                const yy = this.yForValue(v, area);
                ctx.beginPath();
                ctx.moveTo(area.x + PAD.l, yy);
                ctx.lineTo(area.x + area.w - PAD.r, yy);
                ctx.stroke();
            }

            // Axes
            ctx.strokeStyle = COLORS.axis;
            ctx.beginPath();
            ctx.moveTo(area.x + PAD.l, yTop);
            ctx.lineTo(area.x + PAD.l, yBot);
            ctx.moveTo(area.x + PAD.l, yBot);
            ctx.lineTo(area.x + area.w - PAD.r, yBot);
            ctx.stroke();

            // Y labels
            ctx.fillStyle = COLORS.muted;
            ctx.font = "10px sans-serif";
            ctx.textAlign = "right";
            ctx.textBaseline = "middle";
            for (const v of [0, 50, 100]) {
                ctx.fillText(String(v), area.x + PAD.l - 4, this.yForValue(v, area));
            }

            // X labels (rotated)
            ctx.font = "9px sans-serif";
            ctx.textAlign = "right";
            ctx.textBaseline = "middle";
            for (let i = 0; i < N; i++) {
                const xx = this.xForIndex(i, area);
                const isSectionStart = i === 0 || i === N_IN || i === N_IN + N_MID;

                ctx.save();
                ctx.translate(xx, yBot + 30);
                ctx.rotate(-Math.PI / 4);
                ctx.fillStyle = isSectionStart ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.5)";
                ctx.fillText(LABELS[i], 0, 0);
                ctx.restore();
            }

            // Draw curve segments
            ctx.lineWidth = 2;
            ctx.lineJoin = "round";
            ctx.lineCap = "round";

            for (let i = 0; i < N - 1; i++) {
                const sec = sectionForIndex(i);
                ctx.strokeStyle = COLORS[`curve${sec}`];

                ctx.beginPath();
                ctx.moveTo(this.xForIndex(i, area), this.yForValue(this.curveValues[i], area));
                ctx.lineTo(this.xForIndex(i + 1, area), this.yForValue(this.curveValues[i + 1], area));
                ctx.stroke();
            }

            // Draw points
            for (let i = 0; i < N; i++) {
                const sec = sectionForIndex(i);
                const isActive = i === this.curveActiveIdx;

                ctx.beginPath();
                ctx.fillStyle = isActive ? COLORS.active : COLORS[`curve${sec}`];
                ctx.arc(
                    this.xForIndex(i, area),
                    this.yForValue(this.curveValues[i], area),
                    isActive ? 5 : 3,
                    0,
                    Math.PI * 2
                );
                ctx.fill();
            }

            // Active block info
            if (this.curveActiveIdx >= 0 && this.curveActiveIdx < N) {
                ctx.fillStyle = COLORS.text;
                ctx.font = "11px sans-serif";
                ctx.textAlign = "left";
                ctx.textBaseline = "top";
                const infoText = `${LABELS[this.curveActiveIdx]}: ${Math.round(this.curveValues[this.curveActiveIdx])}`;
                ctx.fillText(infoText, area.x + PAD.l + 4, area.y + PAD.t + 2);
            }

            ctx.restore();
        };

        nodeType.prototype.onMouseDown = function (e, localPos, graphCanvas) {
            const area = this.getCurveArea();

            // Check if click is in curve area
            if (localPos[1] >= area.y && localPos[1] <= area.y + area.h &&
                localPos[0] >= area.x && localPos[0] <= area.x + area.w) {

                this.curveDragging = true;
                this.curveActiveIdx = this.nearestIndexFromX(localPos[0], area);

                const newVal = this.valueForY(localPos[1], area);

                if (e.shiftKey) {
                    this.curveValues[this.curveActiveIdx] = clamp(Math.round(newVal), 0, 100);
                } else {
                    const delta = newVal - this.curveValues[this.curveActiveIdx];
                    this.applyLocalDelta(this.curveActiveIdx, delta, this.curveRadius);
                }

                this.syncCurveToBackend();
                app.canvas.setDirty(true, true);
                return true;
            }

            return onMouseDown?.apply(this, arguments);
        };

        nodeType.prototype.onMouseMove = function (e, localPos, graphCanvas) {
            const area = this.getCurveArea();

            // Check if in curve area
            if (localPos[1] >= area.y && localPos[1] <= area.y + area.h &&
                localPos[0] >= area.x && localPos[0] <= area.x + area.w) {

                if (this.curveDragging) {
                    const newVal = this.valueForY(localPos[1], area);

                    if (e.shiftKey) {
                        this.curveValues[this.curveActiveIdx] = clamp(Math.round(newVal), 0, 100);
                    } else {
                        const delta = newVal - this.curveValues[this.curveActiveIdx];
                        this.applyLocalDelta(this.curveActiveIdx, delta, this.curveRadius);
                    }

                    this.syncCurveToBackend();
                    app.canvas.setDirty(true, true);
                    return true;
                } else {
                    // Update hover
                    const newIdx = this.nearestIndexFromX(localPos[0], area);
                    if (newIdx !== this.curveActiveIdx) {
                        this.curveActiveIdx = newIdx;
                        app.canvas.setDirty(true, true);
                    }
                }
            } else if (!this.curveDragging) {
                // Clear hover when outside curve area
                if (this.curveActiveIdx !== -1) {
                    this.curveActiveIdx = -1;
                    app.canvas.setDirty(true, true);
                }
            }

            return onMouseMove?.apply(this, arguments);
        };

        nodeType.prototype.onMouseUp = function (e, localPos, graphCanvas) {
            if (this.curveDragging) {
                this.curveDragging = false;
                // Snap to integers
                this.curveValues = this.curveValues.map((v) => clamp(Math.round(v), 0, 100));
                this.syncCurveToBackend();
                app.canvas.setDirty(true, true);
                return true;
            }

            return onMouseUp?.apply(this, arguments);
        };

        // Handle resize to enforce minimum dimensions
        const onResize = nodeType.prototype.onResize;
        nodeType.prototype.onResize = function (size) {
            const minWidth = 420;
            const requiredHeight = this.computeSize()[1] + WRAPPER_PAD.t + CURVE_HEIGHT + WRAPPER_PAD.b;
            const minHeight = Math.max(requiredHeight, MIN_NODE_HEIGHT);

            size[0] = Math.max(size[0], minWidth);
            size[1] = Math.max(size[1], minHeight);

            return onResize?.apply(this, arguments);
        };

        // Handle loading saved workflows
        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function (info) {
            const r = onConfigure?.apply(this, arguments);

            const jsonWidget = this.widgets?.find((w) => w.name === "weights_json");
            if (jsonWidget && jsonWidget.value) {
                try {
                    const parsed = JSON.parse(jsonWidget.value);
                    if (Array.isArray(parsed) && parsed.length === N) {
                        this.curveValues = parsed.map((x) => clamp(Math.round(x), 0, 100));
                    }
                } catch (e) {}
            }

            // Ensure proper size with minimum height
            const requiredHeight = this.computeSize()[1] + WRAPPER_PAD.t + CURVE_HEIGHT + WRAPPER_PAD.b;
            this.size[1] = Math.max(requiredHeight, MIN_NODE_HEIGHT);

            return r;
        };
    },
});
