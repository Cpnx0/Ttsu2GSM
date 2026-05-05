let settings = null;
let db;
let isChromiumBased;
let queue = [];
let isProcessing = false;
const batchWindowMS = 1;

if(typeof window !== 'undefined') {
  isChromiumBased = false;
} else {
  isChromiumBased = true;
}

chrome.storage.local.get("settings").then(result => {
  settings = result["settings"];
});

function openDB() {
  if(db) {
    return Promise.resolve(db);
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open("BooksDB", 1);

    request.onerror = (event) => {

      console.error(`Database error: ${event.target.error?.message}`);
      reject(event.target.error);
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      db.onerror = (event) => {

        console.error(`Database error: ${event.target.error?.message}`);
        reject(event.target.error);
      };
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      let DBtemp = event.target.result;

      if(!DBtemp.objectStoreNames.contains("Metadata")) {
        const MetaData = DBtemp.createObjectStore("Metadata", { keyPath: "id", autoIncrement: true });

        MetaData.createIndex("Title", "Title", { unique: true });

      }

      if(!DBtemp.objectStoreNames.contains("Content")) {
        const Content = DBtemp.createObjectStore("Content", { keyPath: "id", autoIncrement: true });

        Content.createIndex("Text", "Text", { unique: false });
        Content.createIndex("Bookid", "Bookid", { unique: false });
        Content.createIndex("Time", "Time", { unique: false });
      }
    }
  })
}

async function processQueue() {
  if(queue.length === 0) {
    isProcessing = false;
    return;
  }

  isProcessing = true;

  const batchEntryTime = queue[0].entryTime;
  const pageBatch = [];
  while(queue.length > 0 && queue[0].entryTime - batchEntryTime < batchWindowMS) {
    pageBatch.push(queue.shift());
  }

  try {
    const db = await openDB();
    const now = Math.floor(Date.now() / 1000);

    let totalChars = pageBatch.reduce((sum, item) => sum + item.Text.length, 0);

    let measured = now - batchEntryTime;
    let hardCap = 180;
    let charCap = Math.floor(totalChars / 0.5);
    let minPageTime = Math.max(2, Math.floor(totalChars / 7));
    let clampedPageTime = Math.max(minPageTime, Math.min(measured, hardCap, charCap));

    let accumulatedChars = 0;
    let transaction = db.transaction(["Content"], "readwrite");
    let content = transaction.objectStore("Content");
    for(const item of pageBatch) {
      accumulatedChars += item.Text.length;
      const ratio = accumulatedChars / totalChars;
      item.Time = batchEntryTime + Math.floor(clampedPageTime * ratio);
      delete item.entryTime;
      content.add(item);
    }

    transaction.oncomplete = () => processQueue();
    transaction.onerror = (e) => {
      console.error("Batch insert failed:", e.target.error);
      setTimeout(processQueue, 5000);
    };

  } catch(err) {
    console.error("Queue insertion failed:", err);
    // If it fails, wait 5 seconds and try again
    setTimeout(processQueue, 5000);
  }
}


if(!isChromiumBased) {
  chrome.webNavigation.onCompleted.addListener((details) => {
    if(details.frameId === 0) {
      console.log("Navigated to:", details.url);

      chrome.tabs.sendMessage(details.tabId, { action: "UrlChange" }, () => {
        if(chrome.runtime.lastError) return;
      });
    }
  }, {
    url: [{ urlMatches: 'http://localhost:4568/.*' }]
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  openDB().then((result) => {
    db = result;

    if(msg.action === "getOrCreateBook") {
      let transaction = db.transaction(["Metadata"], "readwrite");
      let Metadata = transaction.objectStore("Metadata")
      let request = Metadata.index("Title").get(msg.title);
      request.onsuccess = (event) => {
        let result = event.target.result;
        if(result) {
          sendResponse({ bookId: result.id });
        } else {
          let book = { Title: msg.title };
          let NewBookRequest = Metadata.add(book);
          NewBookRequest.onsuccess = (event) => {
            sendResponse({ bookId: event.target.result });
          }
        }
      };
      request.onerror = () => {
        sendResponse({ success: false });
      }
    } else if(msg.action === "insertContent") {
      let book = {
        Bookid: msg.bookId,
        Text: msg.text,
        entryTime: msg.entryTime,
        Time: null
      };

      queue.push(book);
      if(!isProcessing) processQueue();

      sendResponse({ success: true });
    } else {
      sendResponse({ success: false })
    }
  }).catch(err => {
    sendResponse({ error: err.message });
  });
  return true;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if(area !== "local" || !changes.settings) return;
  let newSettings = changes.settings.newValue;

  settings = newSettings;
});

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if(reason === 'install') {
    chrome.storage.local.set({
      settings: { Active: true, Hide: false, SelectedPosition: "default", Position: { default: "0%", top: "0% 0% -90% 0%", left: "0% -90% 0% 0%", bottom: "-90% 0% 0% 0%", right: "0% 0% 0% -90%", "center-horizontal": "-45% 0% -45% 0%", "center-vertical": "0% -45% 0% -45%", custom: "0%" } }
    });
  }
});

