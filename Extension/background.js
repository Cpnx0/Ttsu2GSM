let WS = null;
let settings = null;
let db;
const request = indexedDB.open("BooksDB",1);

chrome.storage.local.get("settings").then(result => {
    settings = result["settings"];
    if (settings?.WS === true) {
        connectWebSocket();
    }
});

request.onsuccess = (event) => {
  db = event.target.result;
  db.onerror = (event) => {

  console.error(`Database error: ${event.target.error?.message}`);
};
};

request.onupgradeneeded = (event) =>{
    db = event.target.result;

    const MetaData = db.createObjectStore("Metadata", { keyPath: "id",autoIncrement: true });

    MetaData.createIndex("Title","Title", {unique:true});
    
    const Content = db.createObjectStore("Content", {keyPath:"id", autoIncrement:true});

    Content.createIndex("Text","Text", {unique:false});
    Content.createIndex("Bookid","Bookid",{unique:false});
    Content.createIndex("Time","Time",{unique:false});
}

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
    if (msg.action === "sendText") {
        if (WS?.readyState === WebSocket.OPEN) WS.send(msg.text);
    }else if (msg.action === "getOrCreateBook") {
        let transaction = db.transaction(["Metadata"],"readwrite");
        let Metadata = transaction.objectStore("Metadata")
        let request =Metadata.index("Title").get(msg.title);
        request.onsuccess = (event) => {
            let result = event.target.result;
            if(result){
                sendResponse({ bookId: result.id });
            } else{
                let book ={Title:msg.title};
                let NewBookRequest = Metadata.add(book);
                NewBookRequest.onsuccess = (event) =>{
                    sendResponse({ bookId: event.target.result });
                }
            }
        };
        return true;
    } else if (msg.action === "insertContent") {
      let transaction = db.transaction(["Content"],"readwrite");
      let content = transaction.objectStore("Content");
      let book = {
        Bookid: msg.bookId,
        Text:msg.text,
        Time:msg.time
      };
      let request = content.add(book);
      request.onsuccess = () => sendResponse({ success: true });
      return true;
      } else if (msg.action === "exportCSV") {
        exportCSV(msg.StartDate,msg.EndDate);
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

function exportCSV(StartDate,EndDate){
  let transaction = db.transaction(["Content", "Metadata"], "readonly");
  let ContentTable = transaction.objectStore("Content");
  let MetadataTable = transaction.objectStore("Metadata");
  let TimeIndex = ContentTable.index("Time");

  let TimeRange = null;
  let filename = null;
  let now =new Date(Date.now());
    now = now.toLocaleString().replace(/[\/:, ]/g, "-");

  if(StartDate != "" && EndDate != ""){
    StartDate = new Date(StartDate+"T00:00:00");
    EndDate = new Date(EndDate+"T23:59:59");
    const startUnix = Math.floor(StartDate.getTime() / 1000);
    const endUnix = Math.floor(EndDate.getTime() / 1000);
    TimeRange = IDBKeyRange.bound(startUnix, endUnix);
    filename = `Ttsu2GSM Export ${StartDate.toLocaleString().replace(/[\/:, ]/g, "-")} - ${EndDate.toLocaleString().replace(/[\/:, ]/g, "-")}`
  } else if(StartDate != ""){
    StartDate = new Date(StartDate+"T00:00:00");
    const startUnix = Math.floor(StartDate.getTime() / 1000);
    TimeRange = IDBKeyRange.lowerBound(startUnix);
    filename = `Ttsu2GSM Export ${StartDate.toLocaleString().replace(/[\/:, ]/g, "-")} - ${now}`
  } else if(EndDate != ""){
    EndDate = new Date(EndDate+"T23:59:59");
    const endUnix = Math.floor(EndDate.getTime() / 1000);
    TimeRange = IDBKeyRange.upperBound(endUnix);
    filename = `Ttsu2GSM Export ${EndDate.toLocaleString().replace(/[\/:, ]/g, "-")}`
  } else {
    filename = `Ttsu2GSM Export ${now}`;
  }

  TimeIndex.getAll(TimeRange).onsuccess = (event) =>{
    let allContent = event.target.result;

    MetadataTable.getAll().onsuccess = (event) =>{
      let allMetadata = event.target.result;

      let bookMap = {};
      allMetadata.forEach(book => {
        bookMap[book.id] = book.Title;});
      
      let rows = [["uuid", "given_identifier", "name", "line", "time"]];
      allContent.forEach(row => {
        let uuid = crypto.randomUUID();
          rows.push([
          uuid,
          row.id,
          bookMap[row.Bookid] || "Unknown",
          JSON.stringify(row.Text),
          row.Time
         ]);
      });
      
      let csv = rows.map(r => r.join(",")).join("\n");
      let url = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);

      chrome.downloads.download({
        url: url,
        filename: `${filename}.csv`,
        saveAs: true
      });
    }
  }

}