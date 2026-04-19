let settings = null;
let db;
let isChromiumBased;

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



if(!isChromiumBased) {
  browser.webNavigation.onCompleted.addListener((details) => {
    if(details.frameId === 0) {
      console.log("Navigated to:", details.url);

      browser.tabs.sendMessage(details.tabId, { action: "UrlChange" })
        .then(response => console.log("Message sent successfully"))
        .catch(error => console.warn("Content script not ready yet or not injected."));
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
      return true;
    } else if(msg.action === "insertContent") {
      let transaction = db.transaction(["Content"], "readwrite");
      let content = transaction.objectStore("Content");
      let book = {
        Bookid: msg.bookId,
        Text: msg.text,
        Time: msg.time
      };
      let request = content.add(book);
      request.onsuccess = () => sendResponse({ success: true });
      return true;
    }
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
      settings: { Active: true, Hide: false, Clipboard: false }
    });
  }
});

