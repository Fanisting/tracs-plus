# TRACS+ Course Info: Privacy Policy

Last updated: October 17, 2026

TRACS+ Course Info ("TRACS+") is a Chrome extension that adds course information to the job postings table on https://tracs.utoronto.ca/.

## What TRACS+ collects

Nothing. TRACS+ does not collect, store or send any personal information, browsing history, login details or application answers. It has no analytics and no servers of its own.

## What TRACS+ sends, and where

To find instructors, TRACS+ sends the **course code and academic year** of each listed posting (for example `RSM270H1`, 2027) to the public University of Toronto Timetable Builder API at `api.easi.utoronto.ca`. These requests contain nothing about you.

## What TRACS+ stores on your computer

- **Settings** (which columns to show, the job title filter and whether to remember it) are saved with `chrome.storage.sync`, so Chrome can sync them across your own signed-in browsers.
- **Timetable results** are cached with `chrome.storage.local` for up to 24 hours, so pages load faster.

Removing the extension deletes both.

## Permissions

- `https://tracs.utoronto.ca/*`: to add the columns, the bar and the form notes to TRACS pages.
- `https://api.easi.utoronto.ca/*`: to look up instructors in the public timetable.
- `storage`: to keep your settings and the timetable cache.
- `declarativeNetRequestWithHostAccess`: the timetable API only answers requests that come from the Timetable Builder site, so TRACS+ sets the `Origin` and `Referer` headers on its own requests to that API. No other requests are changed.

## Contact

Questions or concerns: open an issue at https://github.com/Fanisting/tracs-plus/issues.
