let settings;
let ActiveCheckbox = document.querySelector("#activeCheckbox");
let HideCheckbox = document.querySelector("#hideCheckbox");
let ClipboardCheckbox = document.querySelector("#clipboardCheckbox");
let WebsocketCheckbox = document.querySelector("#websocketCheckbox")
let WSPort = document.querySelector("#websocket");

async function getSettings(){
await chrome.storage.local.get("settings").then(result=>{
    settings = result["settings"]||{Active:false,Hide:false,Clipboard:false,WS:false,WSPort:"ws://localhost:9012"};

    ActiveCheckbox.checked = settings["Active"];
    HideCheckbox.checked = settings["Hide"];
    ClipboardCheckbox.checked = settings["Clipboard"];
    WebsocketCheckbox.checked = settings["WS"];
    WSPort.value = settings["WSPort"];
});
}

document.addEventListener("DOMContentLoaded",()=>{
    getSettings();

    ActiveCheckbox.addEventListener("change", async (event)=>{
    settings["Active"] = event.target.checked;
    await chrome.storage.local.set({settings:settings});
    });

    HideCheckbox.addEventListener("change", async (event)=>{
        settings["Hide"] = event.target.checked;
        await chrome.storage.local.set({settings:settings});
    });

    ClipboardCheckbox.addEventListener("change", async (event)=>{
        settings["Clipboard"] = event.target.checked;
        await chrome.storage.local.set({settings:settings});
    });

    WebsocketCheckbox.addEventListener("change", async (event)=>{
        settings["WS"] = event.target.checked;
        await chrome.storage.local.set({settings:settings});
    });

    WSPort.addEventListener("change", async (event)=>{
        settings["WSPort"] = event.target.value;
        await chrome.storage.local.set({settings:settings});
    });
});

