let bookTitle;
let chapterId;
let paragraphs = [];
let checkbox_array;
let bookContentEl = null;
let bookData = {};
let storage_loaded = false;
let db;
const request = indexedDB.open("BooksDB",1);
let Bookid = null;
let intilize = false;
let settings;

chrome.storage.local.get("settings").then(result =>{
    settings = result["settings"];
});

function websockectConnection(){

}


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

async function loadBook(bookTitle) {

    await chrome.storage.local.get(bookTitle).then(result =>{
        bookData= result[bookTitle]||{};
    });
}

async function inti() {
    await loadBook(bookTitle).then(result =>{
        let transaction = db.transaction(["Metadata"],"readwrite");
        let Metadata = transaction.objectStore("Metadata")
        let request =Metadata.index("Title").get(bookTitle);
        request.onsuccess = (event) => {
            let result = event.target.result;
            if(result){
                Bookid= result.id;
                console.log(`Bookid is ${Bookid}`);
            } else{
                let book ={Title:bookTitle};
                let NewBookRequest = Metadata.add(book);
                NewBookRequest.onsuccess = (event) =>{
                    Bookid = event.target.result;
                    console.log(`Bookid is ${Bookid}`);
                }
            }
        };
        transaction.oncomplete= () =>{
            console.log("book was loaded");
            storage_loaded = true;
        }

        
    });
} 
let previous_paragraphs = [];
let ISObserver;
async function addCheckboxes() {
    paragraphs = document.querySelectorAll(".p-text p");
    let container = document.querySelector(".book-content");
    ISObserver = new IntersectionObserver(entries => {
        if (previous_paragraphs.length != 0){
            previous_paragraphs.forEach(p =>{
            checkbox = p.firstElementChild;
            if (checkbox){
                try {
                let chapter = checkbox.getAttribute("data-chapter");
                let index =parseInt(checkbox.getAttribute('data-index'));
                realCheckbox = document.querySelector('[data-index="'+index+'"]');
            
                if (checkbox.checked ===false && realCheckbox.checked ===false){
                    send_text(checkbox,index,chapter);
                    if (realCheckbox){
                        realCheckbox.checked = true;
                        realCheckbox.disabled = true;
                    }
                }
            } catch (error) {
                console.error(error);
            }
            }
            
        });
        previous_paragraphs = [];
      }
      
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      previous_paragraphs.push(entry.target.cloneNode(true));
    }
  });
}, {
  root: container,
  threshold: 1
});


paragraphs.forEach(p => ISObserver.observe(p));


    if (paragraphs.length===0)return;
    if(!bookData[chapterId]){
        checkbox_array = new Array(paragraphs.length).fill(false);
        console.log("new chapter was added, ",bookData);
        bookData[chapterId] = checkbox_array;
        await chrome.storage.local.set({[bookTitle]:bookData});
    }
    


    paragraphs.forEach((p,index) => {
        if (!p.dataset.checkboxAdded && p.textContent !="") {
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.style.margin = "4px";
            checkbox.dataset.index = index;
            checkbox.dataset.chapter = chapterId;
            checkbox.checked = bookData[chapterId][index];
            checkbox.hidden = settings["Hide"];
            console.log(bookData[chapterId][index]);
            if(checkbox.checked === true){
                checkbox.disabled = true;
            }

            p.prepend(checkbox);
            p.dataset.checkboxAdded = "true";
            checkbox.addEventListener("change",function() {
                send_text(this,index,chapterId);
        });
        }
    });
}

function remove_furigana(element){
    let p_element = element.cloneNode(true);
    let furigana = p_element.querySelectorAll("ruby");
            furigana.forEach(furi =>{
                furi.firstElementChild.remove();
            });
    return p_element.textContent;
}

async function send_text(element,index,chapter){
    let text = remove_furigana(element.parentElement);
    bookData[chapter][index]= true;
    await chrome.storage.local.set({[bookTitle]:bookData}).then(result=>{
    let transaction = db.transaction(["Content"],"readwrite");
    let content = transaction.objectStore("Content");
    let time = Math.floor(Date.now() / 1000);
    let book = {
        Bookid: Bookid,
        Text:text,
        Time:time
    };
    let request = content.add(book);
    request.onsuccess= (event) =>{
        element.disabled = true;
        console.log(book);
    }
    });
    
}

async function processChapter(){
    console.log("working");
    
    let bookTitletemp = document.querySelector("head title");
    let chapter = document.querySelector(".book-content-container");
    if(!chapter || !bookTitletemp) return;

    bookTitletemp=bookTitletemp.textContent.split("|");
    let newTitle = bookTitletemp[0].trim();

    if (newTitle !== bookTitle) {
        bookTitle = newTitle;
        storage_loaded = false;
    }
    if(chapterId == chapter.id || chapter.id =="" || chapter.id == "ttu-p-cover")return;
    chapterId = chapter.id;
    console.log("chapter id was obtained: ",chapterId);

    if(!storage_loaded && !intilize){
        intilize = true;
        console.log("test");
        
        await inti();
        intilize = false;
    }
    console.log("add checkboxes triggered");
    await addCheckboxes();
}
const observer = new MutationObserver(processChapter);

const bodyObserver = new MutationObserver(async () =>{
    bookContentEl = document.querySelector(".book-content");
    if (bookContentEl){
        console.log("Book Content ready!");
        bodyObserver.disconnect();
        observer.observe(bookContentEl, {
            childList: true,
            subtree: true
        });
        
    }
});

chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
  if (msg.action === "activateExtension" && settings["Active"] ===true) {
    bodyObserver.observe(document.body,{
        childList: true,
        subtree: true
    });
  } 
});

chrome.storage.onChanged.addListener(async (changes, area)=>{
    if (area !== "local") return;

    if (!changes.settings) return;

    let newSettings = changes.settings.newValue;

    if(newSettings["Active"] != settings["Active"]){
            if(newSettings["Active"] == true){
                bookContentEl = document.querySelector(".book-content");
                if (bookContentEl){
                    observer.observe(bookContentEl, {
                        childList: true,
                        subtree: true
                    });
                    await processChapter();
                } else{
                    bodyObserver.observe(document.body,{
                        childList: true,
                        subtree: true
                    })
                }
            } else{
                    observer.disconnect();
                    if (ISObserver) ISObserver.disconnect();
                    paragraphs.forEach(p =>{
                        let checkbox = p.querySelector('input[type="checkbox"]');
                        if (checkbox){
                            checkbox.remove();
                        }
                        p.removeAttribute("data-checkbox-added");
                    });
                    paragraphs =[];
                    previous_paragraphs =[];
                    bookTitle = "";
                    chapterId = "";
                    storage_loaded = false;
                    Bookid = null;
                }
    }

    if (paragraphs.length > 0){        
        if (newSettings["Hide"] != settings["Hide"]){
            console.log("paragraps length: ", paragraphs.length);
            console.log("Hide changed:", newSettings.Hide);
            
            paragraphs.forEach(p=>{
            p.firstElementChild.hidden = newSettings["Hide"];
            });
        }
    }
    
    settings = newSettings;
    
})



