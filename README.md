<div style="text-align: center;">

  # Ttsu2GSM
Browser Extension to Store and send text from ttsu reader to GSM
</div>
Ttsu2GSM is a chrome browser extension that automatically mark the lines you read in ttsu reader and store them and allows sending them directly to GSM. 

<div style="text-align: center;">

|settings|export|
|--------|------|
| ![settings](Assets/settings.png)| ![export](Assets/export.png)|

</div>

## installtion:
1- download and extract the repo.

2- enable developer mode in extensions page.

3- load the "extension" folder using Load unpacked.


## ttsu setup:
1- ttsu reader view mode have to be set to paginated (continuous not supported).

2- page columns set to 1 (multi columns not tested).

## Websocket:
1- install python.

2- install websockets library for python with `pip install websockets`.

3- add the websocket port 9012 to GSM settings.

![GSM settings](Assets/GSM%20settings.png)

4- open cmd in the repo folder and run Websocket Server using `python Websocket_Server.py` and activate websocket in the extension settings.


## import CSV file to GSM:
1- open the "Import CSV File" link in export option (while GSM is running).

2- in Import/Export section you can upload your file.

![Impor](Assets/import.png)

## Acknowledgements:
1- [GSM](https://github.com/bpwhelan/GameSentenceMiner) (GameSentenceMiner)

2- [ッツ Ebook Reader](https://github.com/ttu-ttu/ebook-reader)
