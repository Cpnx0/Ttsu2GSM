let WS = null;
let settings = null;

chrome.storage.local.get("settings").then(result => {
    settings = result["settings"];
    if (settings?.WS === true) {
        connectWebSocket();
    }
});



function connectWebSocket() {
    let WSUrl = settings?.WSPort;
    if (!WSUrl) return;

    WS = new WebSocket(WSUrl);

    WS.addEventListener("open", () => {
        console.log("WS connected");
        keepAlive();
    });

    WS.addEventListener("error", (e) => {
        console.log("WS error", e);
    });

    WS.addEventListener("close", () => {
        if (settings?.WS) {
            setTimeout(connectWebSocket, 1000);
        }
    });
}

function keepAlive() {
  const keepAliveIntervalId = setInterval(
    () => {
      if (WS) {
        WS.send('ping');
      } else {
        clearInterval(keepAliveIntervalId);
      }
    },
    // Set the interval to 20 seconds to prevent the service worker from becoming inactive.
    20 * 1000 
  );
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "sendText" && WS?.readyState === WebSocket.OPEN) {
        WS.send(msg.text);
    }
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.settings) return;
    let newSettings = changes.settings.newValue;

    if (newSettings.WS !== settings?.WS) {
        if (newSettings.WS === true) {
            settings = newSettings;
            connectWebSocket();
        } else {
            WS?.close();
        }
    } else if (newSettings.WSPort !== settings?.WSPort) {
        WS?.close();
        settings = newSettings;
        if (newSettings.WS) connectWebSocket();
    }

    settings = newSettings;
});

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    chrome.storage.local.set({
      settings: {Active: true, Hide:false, Clipboard:false, WS:true, WSPort:"ws://localhost:9012"}
    });
  }
});


chrome.webNavigation.onHistoryStateUpdated.addListener((details)=>{
    const url = new URL(details.url);
    if (url.pathname === "/b" && url.searchParams.has("id")) {
    console.log("working");
    
    chrome.tabs.sendMessage(details.tabId, { action: "activateExtension" });
  }
},
{
    url: [{ hostEquals: "reader.ttsu.app" }]
  });

chrome.webNavigation.onCompleted.addListener((details) => {
  const url = new URL(details.url);
  if (url.pathname === "/b" && url.searchParams.has("id")) {
    chrome.tabs.sendMessage(details.tabId, { action: "activateExtension" });
  }
}, { url: [{ hostEquals: "reader.ttsu.app" }] });