# Chrome Web Store listing

Everything the developer dashboard asks for, ready to paste. Upload `dist/tracs-plus-<version>.zip` from `node dev/build.js`.

## Store listing

- **Category**: Tools (Workflow & planning)
- **Language**: English
- **Images**: icon `icons/icon128.png`; small promo tile `docs/store/promo-440x280.png`; screenshots `docs/store/table-1280x800.png`, `search-1280x800.png`, `guide-1280x800.png`
- **Homepage URL**: https://github.com/Fanisting/tracs-plus
- **Support URL**: https://github.com/Fanisting/tracs-plus/issues

**Summary** (from the manifest)

> Unofficial helper for UofT TRACS: adds course names, instructors and TA contacts to the job postings table.

**Description**

> TRACS+ makes the University of Toronto's TRACS hiring site easier to browse. It shows what each job posting is about right in the postings table, so you no longer have to open every posting.
>
> New columns
> • Course Name, with the course description on hover
> • Instructor, from the public UofT Timetable Builder for the posting's term
> • TA Support, the posting's contact email as a link
>
> A small bar above the table
> • Filter postings by job title, with counts, and optionally remember your choice
> • Show or hide each new column; hide columns that are empty
> • See how many postings are listed and how many courses have a known instructor
>
> Also
> • Every posting on one page, with the ones you already submitted at the top
> • One-click Rotman TA search
> • Short notes on two application form questions
> • A built-in guide: click the toolbar icon
>
> Everything TRACS+ adds is marked with a TRACS+ badge or a small + so you can tell it apart from TRACS itself.
>
> Privacy: TRACS+ only runs on tracs.utoronto.ca. It sends course codes, and nothing about you, to the public UofT Timetable Builder. No analytics, no servers of its own.
>
> TRACS+ is not affiliated with or endorsed by the University of Toronto.

## Privacy practices

**Single purpose**

> Adds course details (course name, instructor and contact email) to the job postings table on the University of Toronto's TRACS hiring site, with a filter for browsing the postings.

**Permission justifications**

- **storage**: Saves the user's display settings (which columns to show, the job title filter) and caches public timetable results for 24 hours.
- **declarativeNetRequestWithHostAccess**: The public UofT Timetable Builder API only answers requests whose Origin is its own site. One session rule sets the Origin and Referer headers on the extension's own requests to api.easi.utoronto.ca/ttb/ (requests from tabs are excluded), so no other traffic is changed.
- **Host permission https://tracs.utoronto.ca/\***: Adds the columns, the filter bar and the form notes to TRACS pages.
- **Host permission https://api.easi.utoronto.ca/\***: Looks up course instructors in the public UofT Timetable Builder API.

**Remote code**: No, I am not using remote code.

**Data usage**: collects none of the listed data types. Certify all three statements (no selling, no unrelated use, no creditworthiness use).

**Privacy policy URL**: https://github.com/Fanisting/tracs-plus/blob/main/PRIVACY.md

## Distribution

- **Visibility**: Public
- **Regions**: All regions
