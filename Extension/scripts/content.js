let bookTitle;
let chapters = [];
let paragraphs = [];
let checkbox_array;
let bookContentEl = null;
let bookData = {};
let storage_loaded = false;
let Bookid = null;
let intilize = false;
let settings;
let clipboardQueue = [];
let isProcessingClipboard = false;
let WSQueue = [];
let isProcessingWS = false;
let observerRunning = false;

chrome.storage.local.get("settings").then((result) => {
  settings = result["settings"];
  checkUrl();
});

function inti() {
  console.log(bookTitle);

  chrome.storage.local.get(bookTitle).then((result) => {
    bookData = result[bookTitle] || {};
    chrome.runtime.sendMessage(
      { action: "getOrCreateBook", title: bookTitle },
      (response) => {
        Bookid = response.bookId;
        storage_loaded = true;
        intilize = false;
        addCheckboxes();
      },
    );
  });
}
let previous_paragraphs = [];
let ISObserver;
async function addCheckboxes() {
  let container = document.querySelector(".book-content");
  if(!ISObserver) {
    ISObserver = new IntersectionObserver(
      (entries) => {
        if(previous_paragraphs.length != 0) {
          previous_paragraphs.forEach((p) => {
            checkbox = p.firstElementChild;
            if(checkbox) {
              try {
                let chapter = checkbox.getAttribute("data-chapter");
                let index = parseInt(checkbox.getAttribute("data-index"));
                realCheckbox = document.querySelector(
                  '[data-index="' + index + '"]',
                );

                if(
                  checkbox.checked === false &&
                  realCheckbox.checked === false
                ) {
                  send_text(checkbox, index, chapter);
                  if(realCheckbox) {
                    realCheckbox.checked = true;
                    realCheckbox.disabled = true;
                  }
                }
                previous_paragraphs = [];
              } catch(error) { }
            }
          });
        }

        entries.forEach((entry) => {
          if(entry.isIntersecting) {
            previous_paragraphs.push(entry.target.cloneNode(true));
          }
        });
      },
      {
        root: container,
        threshold: 0,
      },
    );
  }


  let htmlWrapperEl = document.querySelectorAll(".ttu-book-html-wrapper");
  htmlWrapperEl.forEach((element) => {

    let chapterId = element.parentElement.id;
    paragraphs = element.querySelectorAll(".p-text p");
    if(paragraphs.length > 0 && !paragraphs[1]?.hasAttribute("data-checkbox-added")) {
      if(!bookData[chapterId]) {
        checkbox_array = new Array(paragraphs.length).fill(false);
        console.log("new chapter was added, ", bookData);
        bookData[chapterId] = checkbox_array;
        chrome.storage.local.set({ [bookTitle]: bookData });
      }

      paragraphs.forEach((p, index) => {
        if(!p.dataset.checkboxAdded && p.textContent != "") {
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.style.margin = "4px";
          checkbox.dataset.index = index;
          checkbox.dataset.chapter = chapterId;
          checkbox.checked = bookData[chapterId][index];
          checkbox.hidden = settings["Hide"];
          console.log(bookData[chapterId][index]);
          if(checkbox.checked === true) {
            checkbox.disabled = true;
          }

          p.prepend(checkbox);
          p.dataset.checkboxAdded = "true";
          checkbox.addEventListener("change", function () {
            send_text(this, index, chapterId);
          });
        }
      });
      paragraphs.forEach((p) => ISObserver.observe(p));
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
        bookId: Bookid,
        text: text,
        time: Math.floor(Date.now() / 1000),
      },
      () => {
        element.disabled = true;
        if(settings?.WS && !settings?.Clipboard) {
          WSQueue.push(text);
          processWSQueue();
        }
      },
    );
  });
}

async function processChapter() {
  let bookTitletemp = document.querySelector("head title");
  console.log("booktitle");

  if(!bookTitletemp) return;
  //if(!chapter || !bookTitletemp) return;
  //if(chapter.id ==="" || chapter.id == "ttu-p-cover")return;

  bookTitletemp = bookTitletemp.textContent.split("|");
  let newTitle = bookTitletemp[0].trim();

  if(newTitle !== bookTitle) {
    bookTitle = newTitle;
    storage_loaded = false;
  }

  if(!storage_loaded && !intilize) {
    console.log("inti");

    intilize = true;
    inti();
  }
  if(storage_loaded) {
    await addCheckboxes();
  }
}
const observer = new MutationObserver(processChapter);

const bodyObserver = new MutationObserver(async () => {
  bookContentEl = document.querySelector(".book-content");
  if(bookContentEl) {
    console.log("Book Content ready!");
    bodyObserver.disconnect();
    observerRunning = true;
    observer.observe(bookContentEl, {
      childList: true,
      subtree: true,
    });
    processChapter();
  }
});

function checkUrl() {
  const url = new URL(location.href);
  if(
    (url.pathname === "/b" || url.pathname === "/ebook-reader/b") &&
    url.searchParams.has("id") &&
    settings["Active"] === true
  ) {
    bodyObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  } else if(observerRunning) {
    observer.disconnect();
    observerRunning = false;
  }
}

navigation.addEventListener("navigate", (navigateEvent) => {
  checkUrl();
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if(area !== "local") return;

  if(!changes.settings) return;

  let newSettings = changes.settings.newValue;

  if(newSettings["Active"] != settings["Active"]) {
    if(newSettings["Active"] == true) {
      bookContentEl = document.querySelector(".book-content");
      if(bookContentEl) {
        observer.observe(bookContentEl, {
          childList: true,
          subtree: true,
        });
        await processChapter();
      } else {
        bodyObserver.observe(document.body, {
          childList: true,
          subtree: true,
        });
      }
    } else {
      observer.disconnect();
      if(ISObserver) ISObserver.disconnect();
      paragraphs.forEach((p) => {
        let checkbox = p.querySelector('input[type="checkbox"]');
        if(checkbox) {
          checkbox.remove();
        }
        p.removeAttribute("data-checkbox-added");
      });
      paragraphs = [];
      previous_paragraphs = [];
      bookTitle = "";
      chapterId = "";
      storage_loaded = false;
      Bookid = null;
    }
  }

  if(paragraphs.length > 0) {
    if(newSettings["Hide"] != settings["Hide"]) {
      console.log("paragraps length: ", paragraphs.length);
      console.log("Hide changed:", newSettings.Hide);

      paragraphs.forEach((p) => {
        p.firstElementChild.hidden = newSettings["Hide"];
      });
    }
  }

  settings = newSettings;
});
