let bookTitle = null;
let paragraphs = [];
let bookContentEl = null;
let bookData = {};
let storageLoaded = false;
let bookId = null;
let intilize = false;
let settings;
let observerRunning = false;
let mode = null;
let pendingParagraphs = new Set();
let ISObserver = null;
let container;
let rootMargin;
let contentWrapper;
let parahraphSelector = null;
let continuousMode;
let reactivate = false;
const isChromiumBased = !!window.chrome;

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

function shutdownExtension() {
  console.log("shutting down");
  let currentParagraphs = document.querySelectorAll(parahraphSelector);
  if(observer)
    observer.disconnect();

  if(bodyObserver)
    bodyObserver.disconnect();

  if(ISObserver)
    ISObserver.disconnect();

  if(currentParagraphs) {
    currentParagraphs.forEach((p) => {
      let checkbox = p.querySelector('input[type="checkbox"]');
      if(checkbox) {
        checkbox.remove();
      }
      p.removeAttribute("data-checkbox-added");
    });
  }

  paragraphs = [];
  pendingParagraphs = new Set();
  bookTitle = null;
  storageLoaded = false;
  intilize = false;
  bookId = null;
  mode = null;
  ISObserver = null;
  observerRunning = false;
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
        rootMargin = settings["Position"][settings["SelectedPosition"]];
        contentWrapper = document.querySelectorAll(".scrollbar-hide .overflow-hidden");

      } else {
        container = document.querySelector("#manga-panel");
        rootMargin = settings["Position"]["default"];
        contentWrapper = document.querySelectorAll("#manga-panel > div > div");
        contentWrapper = [...contentWrapper].reverse();
      }
      parahraphSelector = ".textBox p";
      break;
    case "manatan":
      container = null;
      rootMargin = settings["Position"][settings["SelectedPosition"]];
      contentWrapper = document.querySelectorAll(".ocr-overlay-wrapper");
      parahraphSelector = ".gemini-ocr-text-box";
      break;
    case "ttsu":
      if(document.body.classList.contains("overflow-hidden")) {
        container = document.querySelector(".book-content");
        rootMargin = settings["Position"]["default"];
      } else {
        container = null;
        rootMargin = settings["Position"][settings["SelectedPosition"]];
      }
      contentWrapper = document.querySelectorAll(".ttu-book-html-wrapper");
      parahraphSelector = "p";
      break;
  }

  if(ISObserver) {
    if(ISObserver.root !== container) {
      ISObserver.disconnect();
      ISObserver = null;
    }
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
                let time = parseInt(checkbox.dataset.entryTime);

                if(!bookData[chapter][index]) {


                  send_text(checkbox, index, chapter, time);
                  if(checkbox) {
                    checkbox.disabled = true;
                    checkbox.checked = true;
                  }
                  pendingParagraphs.delete(textContainerEl);
                  ISObserver.unobserve(textContainerEl)
                  console.log("sent", chapter, bookData[chapter][index]);
                }

              } catch(error) {
                console.log(error);
              }
            }
          });
        }

        toBeAdded.forEach((entry) => {
          let checkbox = entry.target.firstElementChild;
          let chapter = checkbox.getAttribute("data-chapter");
          let index = parseInt(checkbox.getAttribute("data-index"));
          checkbox.dataset.entryTime = Math.floor(Date.now() / 1000);
          if(!bookData[chapter][index]) {
            pendingParagraphs.add(entry.target);
            console.log("observing", chapter, bookData[chapter][index]);
          }
        });
      },
      {
        root: container,
        threshold: 0,
        rootMargin: rootMargin
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
        let checkboxArray = new Array(paragraphs.length).fill(false);
        bookData[chapterId] = checkboxArray;
        chrome.storage.local.set({ [bookTitle]: bookData });
      }


      paragraphs.forEach((p, index) => {
        if(!p.dataset.checkboxAdded && (p.textContent.trim() != "" && p.textContent.trim() != "ネタバレ") && !(p.classList.contains("ttu-img-container") || p.classList.contains("ttu-illustration-container"))) {

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
            send_text(this, index, chapterId, Math.floor(Date.now() / 1000));
          });
          ISObserver.observe(p)
        }
      });
    };
  });

}


function remove_furigana(element) {
  let p_element = element.cloneNode(true);
  let furigana = p_element.querySelectorAll("ruby rt");
  furigana.forEach((furi) => {
    furi.remove();
  });
  return p_element.textContent;
}

async function send_text(element, index, chapter, entryTime) {
  let text = remove_furigana(element.parentElement);
  text = text.replace(/\n/g, " ");
  bookData[chapter][index] = true;

  await chrome.storage.local.set({ [bookTitle]: bookData }).then((result) => {
    chrome.runtime.sendMessage(
      {
        action: "insertContent",
        bookId: bookId,
        text: text,
        entryTime: entryTime
      });
    element.disabled = true;
    console.log(text);
  });
}

async function processChapter() {
  let bookTitletemp = document.querySelector("head title");

  if(!bookTitletemp || document.readyState !== "complete") return;

  bookTitletemp = bookTitletemp.textContent.split("|");
  let newTitle = bookTitletemp[0].trim();

  if(newTitle != bookTitle) {
    bookTitle = newTitle;
    bookId = null;
    storageLoaded = false;
  }

  if(!storageLoaded && !intilize && bookId === null) {
    console.log("inti");

    intilize = true;
    inti();
  }
  if(storageLoaded) {
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
      let tempEl = document.querySelector(".reader-scroll-container");
      if(tempEl) {
        bookContentEl = tempEl;
      } else {
        bookContentEl = document.querySelector("#ocr-overlay-layer");
      }
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
    if(reactivate) {
      reactivate = false;
      processChapter();
    } else {
      window.requestIdleCallback(() => {
        processChapter();

      }, { timeout: 2000 });
    }

    return true;
  }
  return false;
}

const bodyObserver = new MutationObserver(findAndStartObserver);

function checkUrl() {
  let found;
  const url = new URL(location.href);
  const namepath = url.pathname.split("/");

  if((url.pathname === "/b" || url.pathname === "/ebook-reader/b") && url.searchParams.has("id") && settings["Active"] === true) {
    mode = "ttsu";
    found = findAndStartObserver();
    if(!found) {
      bodyObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }
  } else if(url.port === "5173" && url.hash.startsWith("#/reader/") && settings["Active"] === true) {
    mode = "mokuro";
    found = findAndStartObserver();
    if(!found) {
      bodyObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }
  } else if(url.port == "4567" && namepath[1] == "manga" && namepath[3] == "chapter" && settings["Active"] === true) {
    mode = "manatan";
    found = findAndStartObserver();
    if(!found) {
      bodyObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }
  } else if(observerRunning) {
    shutdownExtension();
  }
}



navigation.addEventListener("navigate", (navigateEvent) => {
  pendingParagraphs.clear();
  if(observerRunning) {
    shutdownExtension();
  }

  requestAnimationFrame(() => {
    checkUrl();
  });
});

if(!isChromiumBased) {
  browser.runtime.onMessage.addListener((msg, sender) => {
    if(msg.action === "UrlChange") {
      console.log("Message received: UrlChange");
      pendingParagraphs.clear();

      checkUrl();

      return Promise.resolve({ status: "ok" });
    }
  });
}


chrome.storage.onChanged.addListener(async (changes, area) => {
  if(area !== "local") return;

  if(!changes.settings) return;

  let newSettings = changes.settings.newValue;
  let currentParagraphs = document.querySelectorAll(parahraphSelector);
  if(newSettings["Active"] != settings["Active"]) {
    if(newSettings["Active"] == true) {
      settings["Active"] = newSettings["Active"];
      reactivate = true;
      checkUrl();
    } else {
      shutdownExtension();
    }
  }

  if(currentParagraphs.length > 0) {
    if(newSettings["Hide"] != settings["Hide"]) {
      console.log("Hide changed:", newSettings.Hide);
      if(newSettings["Active"]) {
        currentParagraphs.forEach((p) => {
          let checkbox = p.querySelector('input[type="checkbox"]');
          if(checkbox) {
            checkbox.hidden = newSettings["Hide"];
          }
        });
      }
    } else if(container === null && newSettings["SelectedPosition"] != settings["SelectedPosition"]) {
      settings = newSettings;
      shutdownExtension();
      checkUrl();
    }
  }

  settings = newSettings;
});