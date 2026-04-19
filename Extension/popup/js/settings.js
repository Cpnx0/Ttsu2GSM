let settings;
let ActiveCheckbox = document.querySelector("#activeCheckbox");
let HideCheckbox = document.querySelector("#hideCheckbox");
let ClipboardCheckbox = document.querySelector("#clipboardCheckbox");
let ExportBtn = document.querySelector("#export");
let ExportStartEl = document.querySelector("#exportStart");
let ExportEndEl = document.querySelector("#exportEnd");

async function getSettings() {
    await chrome.storage.local.get("settings").then(result => {
        settings = result["settings"] || { Active: false, Hide: false, Clipboard: false };

        ActiveCheckbox.checked = settings["Active"];
        HideCheckbox.checked = settings["Hide"];
        ClipboardCheckbox.checked = settings["Clipboard"];
    });
}

document.addEventListener("DOMContentLoaded", () => {
    getSettings();

    const accordionCollapseElementList = document.querySelectorAll('#myAccordion .collapse');
    const accordionCollapseList = [...accordionCollapseElementList].map(accordionCollapseEl => new bootstrap.Collapse(accordionCollapseEl));
    flatpickr(ExportStartEl, {
        enableTime: true,
        dateFormat: "Y-m-d H:i",
        defaultHour: 0
    });
    flatpickr(ExportEndEl, {
        enableTime: true,
        enableSeconds: true,
        dateFormat: "Y-m-d H:i:s",
        defaultHour: 23,
        defaultMinute: 59,
        defaultSeconds: 59
    });

    ActiveCheckbox.addEventListener("change", async (event) => {
        settings["Active"] = event.target.checked;
        await chrome.storage.local.set({ settings: settings });
    });

    HideCheckbox.addEventListener("change", async (event) => {
        settings["Hide"] = event.target.checked;
        await chrome.storage.local.set({ settings: settings });
    });

    ClipboardCheckbox.addEventListener("change", async (event) => {
        settings["Clipboard"] = event.target.checked;
        await chrome.storage.local.set({ settings: settings });
    });

    ExportBtn.addEventListener("click", (event) => {
        let StartDate = ExportStartEl.value;
        let EndDate = ExportEndEl.value;
        let importCheckbox = document.querySelector("#importCheckbox").checked;
        let spinner = document.querySelector("#spinner");
        spinner.removeAttribute("hidden");
        exportCSV(StartDate, EndDate, importCheckbox);
    })

});

function exportCSV(StartDate, EndDate, Import) {
    let spinner = document.querySelector("#spinner");
    let success = document.querySelector("#exportSuccess");
    let failed = document.querySelector("#exportFailed");
    if(!spinner.hasAttribute("hidden")) {
        spinner.hidden = true;
    }
    const request = indexedDB.open("BooksDB", 1);
    request.onsuccess = (event) => {
        let db = event.target.result;
        let transaction = db.transaction(["Content", "Metadata"], "readonly");
        let ContentTable = transaction.objectStore("Content");
        let MetadataTable = transaction.objectStore("Metadata");
        let TimeIndex = ContentTable.index("Time");

        let TimeRange = null;
        let filename = null;
        let csv = null;
        let now = new Date(Date.now());

        now = now.toLocaleString().replace(/[\/:, ]/g, "-");

        if(StartDate != "" && EndDate != "") {
            StartDate = new Date(StartDate);
            EndDate = new Date(EndDate);
            const startUnix = Math.floor(StartDate.getTime() / 1000);
            const endUnix = Math.floor(EndDate.getTime() / 1000);
            TimeRange = IDBKeyRange.bound(startUnix, endUnix);
            filename = `Ttsu2GSM Export ${StartDate.toLocaleString().replace(/[\/:, ]/g, "-")} - ${EndDate.toLocaleString().replace(/[\/:, ]/g, "-")}`
        } else if(StartDate != "") {
            StartDate = new Date(StartDate);
            const startUnix = Math.floor(StartDate.getTime() / 1000);
            TimeRange = IDBKeyRange.lowerBound(startUnix);
            filename = `Ttsu2GSM Export ${StartDate.toLocaleString().replace(/[\/:, ]/g, "-")} - ${now}`
        } else if(EndDate != "") {
            EndDate = new Date(EndDate);
            const endUnix = Math.floor(EndDate.getTime() / 1000);
            TimeRange = IDBKeyRange.upperBound(endUnix);
            filename = `Ttsu2GSM Export ${EndDate.toLocaleString().replace(/[\/:, ]/g, "-")}`
        } else {
            filename = `Ttsu2GSM Export ${now}`;
        }

        TimeIndex.getAll(TimeRange).onsuccess = (event) => {
            let allContent = event.target.result;

            MetadataTable.getAll().onsuccess = (event) => {
                let allMetadata = event.target.result;

                let bookMap = {};
                allMetadata.forEach(book => {
                    bookMap[book.id] = book.Title;
                });

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

                csv = rows.map(r => r.join(",")).join("\n");
                chrome.runtime.sendMessage({ action: "exportResult", success: true, csv: csv, filename: filename });

                if(Import === true) {
                    let file = new File([csv], `${filename}.csv`, { type: "text/csv" });

                    let formData = new FormData();
                    formData.append("file", file);
                    try {
                        fetch("http://localhost:7275/api/import-exstatic", {
                            method: "POST",
                            body: formData
                        }).then(result => {

                            if(result.ok) {
                                spinner.hidden = true;
                                success.removeAttribute("hidden")
                            } else {
                                spinner.hidden = true;
                                failed.removeAttribute("hidden");
                            }
                        })
                    } catch(error) {
                        console.log(error);

                        spinner.hidden = true;
                        failed.removeAttribute("hidden");
                    }
                } else {


                    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });

                    const url = window.URL.createObjectURL(blob);

                    const link = document.createElement('a');

                    link.style.display = 'none';

                    link.href = url;

                    link.setAttribute('download', filename + ".csv");


                    document.body.appendChild(link);

                    link.click();

                    setTimeout(() => {

                        document.body.removeChild(link);

                        window.URL.revokeObjectURL(url);
                        console.log("finished");

                        spinner.hidden = true;
                        success.removeAttribute("hidden")

                    }, 100);
                }


            }

        }
    }

    request.onerror = (event) => {
        spinner.hidden = true;
        failed.removeAttribute("hidden");
    }
}


