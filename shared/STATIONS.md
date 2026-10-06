# Station directory

`stations.json` is an offline picker catalogue, shared by the public form and the backend. The backend resolves codes using its own catalogue and ignores customer-supplied station labels. Searching offers suggestions; it never silently chooses or corrects a station.

## Sources and limits

The 8,625-entry catalogue was extracted from the [Indian Railways passenger-station directory](https://indianrailways.gov.in/Railway_station_zone-category_wise_list.pdf), dated 1 December 2022, supplemented by the [Southern Railway directory](https://sr.indianrailways.gov.in/cris/uploads/files/1659695525713-SR.pdf), dated 1 April 2022. The national document omits Salem division, so the Southern document supplies Coimbatore, Salem, Erode, Tiruppur and other missing codes. Geography is blank where that supplement does not supply it. The `city` field generally contains the source's district; selected entries use a familiar city name for search.

These are dated reference directories. They do not verify current train routes, station renamings, availability or fares. Staff must confirm the exact boarding station and date before buying a ticket. Missing stations need operator assistance rather than a free-text code guess.

`station-overrides.json` contains reviewed aliases and presentation adjustments, including Chennai/Madras, Bengaluru/Bangalore and Tamil aliases for frequently used stations. These aliases are search hints, never passenger name corrections. CBE's full supplemental entry is verified in the Southern directory. CSMT's expanded name is supported by [IRCTC's 2025 itinerary](https://www.irctctourism.com/pressRoomImage/pdf/IRCTC_Chhatrapati_Shivaji_Maharaj_Circuit_Train_Ex_Mumbai_28-05-2025.pdf); its older names/codes and Allahabad/Bombay are search aliases only. Thirteen conflicting code rows in the national source were removed rather than resolved by guessing; an unambiguous Southern entry may then supply a missing code.

## Rebuilding

Download the official PDFs deliberately, inspect their publication dates and install `pdfplumber` in a local Python environment. From the repository root:

```powershell
New-Item -ItemType Directory -Force .tmp
python scripts/import-stations.py PATH_TO_NATIONAL_PDF PATH_TO_SOUTHERN_PDF
```

The importer caches national extraction by source SHA-256 under ignored `.tmp/`, rejects suspiciously small extracts, reports skipped annotations and writes conflicting rows to `.tmp/station-conflicts.json`. Review those reports and catalogue changes before committing. Verify common routes and renamed stations using current official railway sources; record any added override's source here. Build and publish both the customer site and Functions together when changing the catalogue.
