let settings;
let ActiveCheckbox = document.querySelector("#activeCheckbox");
let HideCheckbox = document.querySelector("#hideCheckbox");
let ClipboardCheckbox = document.querySelector("#clipboardCheckbox");
let WebsocketCheckbox = document.querySelector("#websocketCheckbox")
let WSPort = document.querySelector("#websocket");
let ExportBtn = document.querySelector("#export");
let ExportStartEl = document.querySelector("#exportStart");
let ExportEndEl = document.querySelector("#exportEnd");

async function getSettings() {
    await chrome.storage.local.get("settings").then(result => {
        settings = result["settings"] || { Active: false, Hide: false, Clipboard: false, WS: false, WSPort: "ws://localhost:9012" };

        ActiveCheckbox.checked = settings["Active"];
        HideCheckbox.checked = settings["Hide"];
        ClipboardCheckbox.checked = settings["Clipboard"];
        WebsocketCheckbox.checked = settings["WS"];
        WSPort.value = settings["WSPort"];
    });
}

document.addEventListener("DOMContentLoaded", () => {
    getSettings();

    const accordionCollapseElementList = document.querySelectorAll('#myAccordion .collapse');
    const accordionCollapseList = [...accordionCollapseElementList].map(accordionCollapseEl => new bootstrap.Collapse(accordionCollapseEl));
    flatpickr(ExportStartEl, {
        enableTime: true,
        dateFormat: "Y-m-d H:i",
        defaultHour: 0
    });
    flatpickr(ExportEndEl, {
        enableTime: true,
        enableSeconds: true,
        dateFormat: "Y-m-d H:i:s",
        defaultHour: 23,
        defaultMinute: 59,
        defaultSeconds: 59
    });

    ActiveCheckbox.addEventListener("change", async (event) => {
        settings["Active"] = event.target.checked;
        await chrome.storage.local.set({ settings: settings });
    });

    HideCheckbox.addEventListener("change", async (event) => {
        settings["Hide"] = event.target.checked;
        await chrome.storage.local.set({ settings: settings });
    });

    ClipboardCheckbox.addEventListener("change", async (event) => {
        settings["Clipboard"] = event.target.checked;
        await chrome.storage.local.set({ settings: settings });
    });

    WebsocketCheckbox.addEventListener("change", async (event) => {
        settings["WS"] = event.target.checked;
        await chrome.storage.local.set({ settings: settings });
    });

    WSPort.addEventListener("change", async (event) => {
        settings["WSPort"] = event.target.value;
        await chrome.storage.local.set({ settings: settings });
    });

    ExportBtn.addEventListener("click", (event) => {
        let StartDate = ExportStartEl.value;
        let EndDate = ExportEndEl.value;
        console.log(StartDate, EndDate);


        let importCheckbox = document.querySelector("#importCheckbox").checked;
        let spinner = document.querySelector("#spinner");
        spinner.removeAttribute("hidden");
        chrome.runtime.sendMessage({ action: "exportCSV", StartDate: StartDate, EndDate: EndDate, Import: importCheckbox });
    })

    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if(msg.action == "exportResult") {
            let spinner = document.querySelector("#spinner");
            let success = document.querySelector("#exportSuccess");
            let failed = document.querySelector("#exportFailed");
            if(!spinner.hasAttribute("hidden")) {
                spinner.hidden = true;
            }
            if(msg.success === true) {
                success.removeAttribute("hidden");
            } else {
                failed.removeAttribute("hidden");
            }
        }
    })
});

