const USER_ID = "demo-user";
const FUNCTION_APP = "https://reciept-tracker456-adc9dtccdxhgdefj.westcentralus-01.azurewebsites.net";
const API_BASE = location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? ""
    : FUNCTION_APP;
const SUPPORTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const state = {
    receipts: [],
    selectedFile: null,
};

const $ = (id) => document.getElementById(id);

const els = {
    form: $("uploadForm"),
    fileInput: $("fileInput"),
    dropZone: $("dropZone"),
    fileName: $("fileName"),
    fileMeta: $("fileMeta"),
    uploadBtn: $("uploadBtn"),
    clearBtn: $("clearBtn"),
    refreshBtn: $("refreshBtn"),
    status: $("status"),
    statusWrap: $("statusWrap"),
    totals: $("totals"),
    rows: $("rows"),
    currentMonthTotal: $("currentMonthTotal"),
    currentMonthLabel: $("currentMonthLabel"),
    receiptCount: $("receiptCount"),
    latestScan: $("latestScan"),
};

function setStatus(message, mode = "idle") {
    els.status.textContent = message;
    els.statusWrap.dataset.state = mode;
}

function formatBytes(bytes) {
    if (!bytes) return "0 KB";
    const units = ["B", "KB", "MB"];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }
    return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function money(amount, currency) {
    if (typeof amount !== "number") return "--";
    return `${currency ? `${currency} ` : ""}${amount.toFixed(2)}`;
}

function monthLabel(value) {
    if (!value) return "No monthly data";
    const [year, month] = value.split("-");
    const date = new Date(Number(year), Number(month) - 1, 1);
    return date.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

function updateSelectedFile(file) {
    if (file && !SUPPORTED_TYPES.has(file.type)) {
        state.selectedFile = null;
        els.fileInput.value = "";
        els.dropZone.classList.remove("is-ready");
        els.fileName.textContent = "Unsupported file type";
        els.fileMeta.textContent = "Use JPEG, PNG, or WebP";
        setStatus("Only JPEG, PNG, and WebP receipts are supported.", "error");
        return;
    }

    state.selectedFile = file || null;
    els.dropZone.classList.toggle("is-ready", Boolean(file));

    if (!file) {
        els.fileName.textContent = "Select receipt image";
        els.fileMeta.textContent = "JPEG, PNG, or WebP";
        els.fileInput.value = "";
        return;
    }

    els.fileName.textContent = file.name;
    els.fileMeta.textContent = `${file.type || "image"} - ${formatBytes(file.size)}`;
}

function setUploading(isUploading) {
    els.uploadBtn.disabled = isUploading;
    els.refreshBtn.disabled = isUploading;
    els.clearBtn.disabled = isUploading;
}

function clearChildren(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
}

function emptyState(message) {
    const div = document.createElement("div");
    div.className = "empty-state";
    div.textContent = message;
    return div;
}

function renderMetrics(data) {
    const totals = data.monthlyTotals || {};
    const months = Object.keys(totals).sort().reverse();
    const latestMonth = months[0];
    const receipts = data.receipts || [];
    const latestReceipt = receipts.find((receipt) => receipt.date);

    els.currentMonthTotal.textContent = latestMonth ? Number(totals[latestMonth]).toFixed(2) : "0.00";
    els.currentMonthLabel.textContent = monthLabel(latestMonth);
    els.receiptCount.textContent = String(data.count || receipts.length || 0);
    els.latestScan.textContent = latestReceipt?.date || "--";
}

function renderTotals(totals) {
    clearChildren(els.totals);
    const entries = Object.entries(totals || {}).sort((a, b) => b[0].localeCompare(a[0]));

    if (!entries.length) {
        els.totals.appendChild(emptyState("No totals yet. Upload a receipt to start the ledger."));
        return;
    }

    for (const [month, amount] of entries) {
        const row = document.createElement("div");
        row.className = "total-row";

        const label = document.createElement("span");
        label.className = "total-month";
        label.textContent = monthLabel(month);

        const value = document.createElement("span");
        value.className = "total-amount";
        value.textContent = Number(amount).toFixed(2);

        row.append(label, value);
        els.totals.appendChild(row);
    }
}

function renderRows(receipts) {
    clearChildren(els.rows);

    if (!receipts.length) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 4;
        cell.appendChild(emptyState("No receipts yet. Upload one above and refresh after processing."));
        row.appendChild(cell);
        els.rows.appendChild(row);
        return;
    }

    for (const receipt of receipts) {
        const row = document.createElement("tr");
        const vendor = document.createElement("td");
        const date = document.createElement("td");
        const category = document.createElement("td");
        const total = document.createElement("td");
        const badge = document.createElement("span");

        vendor.className = "vendor";
        vendor.textContent = receipt.vendor || "--";
        date.textContent = receipt.date || "--";
        badge.className = "badge";
        badge.textContent = receipt.category || "--";
        total.className = "amount";
        total.textContent = money(receipt.total, receipt.currency);

        category.appendChild(badge);
        row.append(vendor, date, category, total);
        els.rows.appendChild(row);
    }
}

async function loadReceipts() {
    setStatus("Loading receipts...", "loading");

    try {
        const res = await fetch(`${API_BASE}/api/receipts?userId=${encodeURIComponent(USER_ID)}`);
        if (!res.ok) throw new Error(`Load failed (${res.status})`);

        const data = await res.json();
        state.receipts = data.receipts || [];
        renderMetrics(data);
        renderTotals(data.monthlyTotals || {});
        renderRows(state.receipts);
        setStatus(`${data.count || 0} receipt record(s) loaded.`, "idle");
    } catch (error) {
        renderMetrics({ receipts: state.receipts, count: state.receipts.length, monthlyTotals: {} });
        setStatus(`Error: ${error.message}`, "error");
    }
}

async function uploadReceipt(event) {
    event.preventDefault();
    const file = state.selectedFile || els.fileInput.files[0];

    if (!file) {
        setStatus("Choose a receipt image before uploading.", "error");
        return;
    }

    setUploading(true);
    setStatus(`Uploading ${file.name}...`, "loading");

    try {
        const res = await fetch(`${API_BASE}/api/UploadReceipt`, {
            method: "POST",
            headers: { "Content-Type": file.type },
            body: file,
        });

        if (!res.ok) throw new Error(`Upload failed (${res.status})`);

        updateSelectedFile(null);
        setStatus("Uploaded. OCR processing is running; refreshing shortly.", "processing");
        window.setTimeout(loadReceipts, 6000);
    } catch (error) {
        setStatus(`Error: ${error.message}`, "error");
    } finally {
        setUploading(false);
    }
}

els.fileInput.addEventListener("change", () => updateSelectedFile(els.fileInput.files[0]));
els.form.addEventListener("submit", uploadReceipt);
els.refreshBtn.addEventListener("click", loadReceipts);
els.clearBtn.addEventListener("click", () => {
    updateSelectedFile(null);
    setStatus("Ready for upload.", "idle");
});

["dragenter", "dragover"].forEach((eventName) => {
    els.dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        els.dropZone.classList.add("is-dragging");
    });
});

["dragleave", "drop"].forEach((eventName) => {
    els.dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        els.dropZone.classList.remove("is-dragging");
    });
});

els.dropZone.addEventListener("drop", (event) => {
    const file = event.dataTransfer.files[0];
    if (file) updateSelectedFile(file);
});

loadReceipts();
