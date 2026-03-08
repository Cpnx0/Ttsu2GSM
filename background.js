chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    chrome.storage.local.set({
      settings: {Active: true, Hide:false, Clipboard:false, WSPort:"9012"}
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