let bookTitle;
let chapters = [];
let paragraphs = [];
let checkbox_array;
let bookContentEl = null;
let bookData = {};
let storageLoaded = false;
let bookId = null;
let intilize = false;
let settings;
let clipboardQueue = [];
let isProcessingClipboard = false;
let WSQueue = [];
let isProcessingWS = false;
let observerRunning = false;
let mode = null;
let pendingParagraphs = new Set();
let ISObserver;
let container;
let contentWrapper;
let parahraphSelector;
let continuousMode;

chrome.storage.local.get("settings").then((result) => {
  settings = result["settings"];
  checkUrl();
});

function inti() {
  chrome.storage.local.get(bookTitle).then((result) => {
    bookData = result[bookTitle] || {};
    chrome.runtime.sendMessage(
      { action: "getOrCreateBook", title: bookTitle },
      (response) => {
        bookId = response.bookId;
        storageLoaded = true;
        intilize = false;
        addCheckboxes();
      },
    );
  });
}



function getChapter(element) {
  switch(mode) {
    case "mokuro":
      return chapterId = element.getAttribute("data-page-index");
    case "manatan":
      let pathname = new URL(element.getAttribute("data-full-img-src")).pathname.split("/");
      return chapterId = pathname[5] + "-" + pathname[6] + "-" + pathname[7] + "-" + pathname[8];
    case "ttsu":
      return chapterId = element.parentElement.id;
  }
}

async function addCheckboxes() {
  switch(mode) {
    case "mokuro":
      if(continuousMode) {
        container = null;
        contentWrapper = document.querySelectorAll(".scrollbar-hide .overflow-hidden");
        console.log("mokuro");

      } else {
        container = document.querySelector("#manga-panel");
        contentWrapper = document.querySelectorAll("#manga-panel > div > div");
        contentWrapper = [...contentWrapper].reverse();
      }
      parahraphSelector = ".textBox p";
      break;
    case "manatan":
      container = null;
      contentWrapper = document.querySelectorAll(".ocr-overlay-wrapper");
      parahraphSelector = ".gemini-ocr-text-box";
      break;
    case "ttsu":
      if(document.body.classList.contains("overflow-hidden")) {
        container = document.querySelector(".book-content");
      } else {
        container = null;
      }
      contentWrapper = document.querySelectorAll(".ttu-book-html-wrapper");
      parahraphSelector = "p";
      break;
  }
  if(!ISObserver) {
    ISObserver = new IntersectionObserver(
      (entries) => {
        let toBeSent = entries.filter((el) => !el.isIntersecting && pendingParagraphs.has(el.target));
        let toBeAdded = entries.filter((el) => el.isIntersecting && !pendingParagraphs.has(el.target));
        if(pendingParagraphs.size != 0) {
          toBeSent.forEach((entry) => {
            let textContainerEl = entry.target;
            let checkbox = textContainerEl.firstElementChild;
            if(checkbox) {
              try {
                let chapter = checkbox.getAttribute("data-chapter");
                let index = parseInt(checkbox.getAttribute("data-index"));

                if(!bookData[chapter][index]) {


                  send_text(checkbox, index, chapter);
                  if(checkbox) {
                    checkbox.disabled = true;
                    checkbox.checked = true;
                  }
                  pendingParagraphs.delete(textContainerEl);
                  ISObserver.unobserve(textContainerEl)
                  console.log("sent", chapter, bookData[chapter][index]);
                }

              } catch(error) { }
            }
          });
        }

        toBeAdded.forEach((entry) => {
          let checkbox = entry.target.firstElementChild;
          let chapter = checkbox.getAttribute("data-chapter");
          let index = parseInt(checkbox.getAttribute("data-index"));
          if(!bookData[chapter][index]) {
            pendingParagraphs.add(entry.target);
            console.log("observing", chapter, bookData[chapter][index]);
          }
        });
      },
      {
        root: container,
        threshold: 0,
        rootMargin: "0px"
      },
    );
  }



  contentWrapper.forEach((element) => {

    if(mode == "mokuro" && continuousMode) {
      element = element.querySelector("div[draggable=false]");
    }
    let chapterId = getChapter(element);
    paragraphs = element.querySelectorAll(parahraphSelector);

    if(paragraphs.length > 0 && !paragraphs[1]?.hasAttribute("data-checkbox-added")) {
      if(!bookData[chapterId]) {
        checkbox_array = new Array(paragraphs.length).fill(false);
        //console.log("new chapter was added, ", bookData);
        bookData[chapterId] = checkbox_array;
        chrome.storage.local.set({ [bookTitle]: bookData });
      }


      paragraphs.forEach((p, index) => {
        if(!p.dataset.checkboxAdded && p.textContent != "" && !(p.classList.contains("ttu-img-container") || p.classList.contains("ttu-illustration-container"))) {

          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.dataset.index = index;
          checkbox.dataset.chapter = chapterId;
          checkbox.checked = bookData[chapterId][index];
          checkbox.hidden = settings["Hide"];
          if(checkbox.checked === true) {
            checkbox.disabled = true;
          }

          p.prepend(checkbox);
          p.dataset.checkboxAdded = "true";
          checkbox.addEventListener("change", function () {
            send_text(this, index, chapterId);
          });
          ISObserver.observe(p)
        }
      });
    };
  });

}


function remove_furigana(element) {
  let p_element = element.cloneNode(true);
  let furigana = p_element.querySelectorAll("ruby");
  furigana.forEach((furi) => {
    furi.firstElementChild.remove();
  });
  return p_element.textContent;
}

function processClipboardQueue() {
  if(isProcessingClipboard || clipboardQueue.length === 0) return;

  isProcessingClipboard = true;
  let text = clipboardQueue.shift();

  navigator.clipboard
    .writeText(text)
    .then(() => {
      setTimeout(() => {
        isProcessingClipboard = false;
        processClipboardQueue();
      }, 300);
    })
    .catch((err) => {
      console.error("Clipboard error:", err);
      isProcessingClipboard = false;
      processClipboardQueue();
    });
}

function processWSQueue() {
  if(isProcessingWS || WSQueue.length === 0) return;

  isProcessingWS = true;
  let text = WSQueue.shift();

  chrome.runtime.sendMessage({ action: "sendText", text: text }, () => {
    setTimeout(() => {
      isProcessingWS = false;
      processWSQueue();
    }, 200);
  });
}

async function send_text(element, index, chapter) {
  let text = remove_furigana(element.parentElement);
  bookData[chapter][index] = true;
  if(settings?.Clipboard) {
    clipboardQueue.push(text);
    processClipboardQueue();
  }
  await chrome.storage.local.set({ [bookTitle]: bookData }).then((result) => {
    chrome.runtime.sendMessage(
      {
        action: "insertContent",
        bookId: bookId,
        text: text,
        time: Math.floor(Date.now() / 1000),
      },
      () => {
        element.disabled = true;
        if(settings?.WS && !settings?.Clipboard) {
          WSQueue.push(text);
          processWSQueue();
        }
        console.log(text);

      },
    );
  });
}

async function processChapter() {
  let bookTitletemp = document.querySelector("head title");
  console.log("booktitle");

  if(!bookTitletemp) return;

  bookTitletemp = bookTitletemp.textContent.split("|");
  let newTitle = bookTitletemp[0].trim();

  if(newTitle != bookTitle) {
    bookTitle = newTitle;
    storageLoaded = false;
  }

  if(!storageLoaded && !intilize) {
    console.log("inti");

    intilize = true;
    inti();
  }
  if(storageLoaded) {
    console.log("storage passed");
    addCheckboxes();
  }
}
const observer = new MutationObserver(processChapter);

function findAndStartObserver() {
  switch(mode) {
    case "mokuro":
      continuousMode = document.querySelector(".scrollbar-hide");
      if(continuousMode) {
        bookContentEl = continuousMode;
      } else {
        bookContentEl = document.querySelector("#manga-panel");
      }
      break;
    case "manatan":
      bookContentEl = document.querySelector("#ocr-overlay-layer");
      break;
    case "ttsu":
      bookContentEl = document.querySelector(".book-content");
      break;
  }

  if(bookContentEl) {
    console.log("Book Content ready!");
    bodyObserver.disconnect();
    observerRunning = true;
    observer.observe(bookContentEl, {
      childList: true,
      subtree: true,
    });
    processChapter();
    return true;
  }
  return false;
}

const bodyObserver = new MutationObserver(findAndStartObserver);

function checkUrl() {
  let found;
  const url = new URL(location.href);
  const namepath = url.pathname.split("/");

  console.log((url.pathname === "/b" || url.pathname === "/ebook-reader/b") && url.searchParams.has("id") && settings["Active"] === true, url);
  if((url.pathname === "/b" || url.pathname === "/ebook-reader/b") && url.searchParams.has("id") && settings["Active"] === true) {
    mode = "ttsu";
    found = findAndStartObserver();
    if(!found) {
      bodyObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }
  } else if(url.host === "localhost:5173" && url.hash.startsWith("#/reader/")) {
    mode = "mokuro";
    found = findAndStartObserver();
    if(!found) {
      bodyObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }
  } else if(url.host == "localhost:4568" && namepath[1] == "manga" && namepath[3] == "chapter") {
    mode = "manatan";
    found = findAndStartObserver();
    if(!found) {
      bodyObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }
  } else if(observerRunning) {
    mode = null;
    observer.disconnect();
    bodyObserver.disconnect();
    observerRunning = false;
  }
}

navigation.addEventListener("navigate", (navigateEvent) => {
  requestAnimationFrame(() => {
    checkUrl();
  });
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if(area !== "local") return;

  if(!changes.settings) return;

  let newSettings = changes.settings.newValue;
  let currentParagraphs = document.querySelectorAll("p");
  if(newSettings["Active"] != settings["Active"]) {
    if(newSettings["Active"] == true) {
      settings["Active"] = newSettings["Active"];
      checkUrl();
    } else {
      if(observer)
        observer.disconnect();
      if(ISObserver)
        ISObserver.disconnect();
      currentParagraphs.forEach((p) => {
        let checkbox = p.querySelector('input[type="checkbox"]');
        if(checkbox) {
          checkbox.remove();
        }
        p.removeAttribute("data-checkbox-added");
      });
      paragraphs = [];
      pendingParagraphs = new Set();
      bookTitle = null;
      storageLoaded = false;
      intilize = false;
      bookId = null;
      mode = null;
    }
  }

  if(currentParagraphs.length > 0) {
    if(newSettings["Hide"] != settings["Hide"]) {
      console.log("paragraps length: ", currentParagraphs.length);
      console.log("Hide changed:", newSettings.Hide);
      if(newSettings["Active"]) {
        currentParagraphs.forEach((p) => {
          let checkbox = p.querySelector('input[type="checkbox"]');
          if(checkbox) {
            checkbox.hidden = newSettings["Hide"];
          }
        });
      }
    }
  }

  settings = newSettings;
});