# Marathi Hospital Duty Roster v5

## Included

- सोम, मंगळ, बुध, गुरु, शुक्र, शनि, रवि columns.
- No `एकूण` column after रवि.
- Summary has the same seven day columns and an `एकूण` final row only.
- Default duties:
  - M = सकाळ
  - E = दुपार
  - N = रापा
  - NO = रासू
  - L = रजा
- Custom duty names, abbreviations, descriptions, login and logout times.
- English -> Marathi automatic transliteration.
- Removes unwanted trailing Marathi halant `्`.
- Marathi name Bold and font size controls.
- Add staff before or after any existing staff row.
- Ward-specific staff templates.
- Next Week button clears dates and assignments while retaining staff.
- Save, Print, A4 PDF, JSON Backup/Restore.
- Per-day note field.

## Install

Open Command Prompt in this folder:

npm install
npm run dev

Then open the localhost URL shown by Vite.


## v6 alignment fix
The A4 main duty table and summary now share the exact same `<colgroup>`:
- 40px serial
- 58px roll number
- 165px name
- 7 equal day columns

The summary's `ड्युटी` cell spans the same first three columns. Therefore सोम through रवि are vertically aligned with the exact same day columns.

The printable main table has no columns after रवि.
The summary has no `एकूण` column; `एकूण` is only the final summary row.


## v7
- Next Week automatically advances the From/To dates by 7 days when a current From Date exists.
- Ward Templates now lists saved wards and supports Load, Rename and Delete.
- Save Week History stores completed weekly rosters in browser storage.
- Weekly History supports reopening and deleting previous weekly rosters.
- Up to 100 weekly history entries are kept.


## v8 - Posts / पदे
Default posts:
- परिसेवक
- अधिपरिचारिका
- कक्षसेवक
- सफाईगार

You can add any custom post, rename posts, and delete posts. Employee group/post selection uses the saved post list, and printed A4 output groups employees under their selected post.
Ward templates also save and restore the post list.


## v9 - Staff management
- Search/filter employees by English name, Marathi name, roll number, or post.
- Move any employee up or down without changing their assigned duties.
- Before/After insertion works with the employee's original position even while searching.
- Clear search control.


## v10
- Removed the duty-code legend from the bottom/end of the printed A4 duty list.
- The A4 sheet no longer prints `M = सकाळ`, `E = दुपार`, `N = रापा`, `NO = रासू`, `L = रजा` at the bottom.
- The duty codes remain available in the editor and are used for the duty cells and summary calculations.


## Final v11
- From Date automatically fills To Date as a 7-day Monday-to-Sunday roster window.
- The user can still manually change To Date when required.
- Final A4 output keeps the approved सोम-to-रवि alignment.
- No `एकूण` column after रवि.
- No duty-code legend at the bottom of the A4 sheet.


## v12 - Marathi Font
- Mukta is the primary Marathi/Devanagari font.
- Applied to editor, duty table, summary and A4 print output.
- Marathi names use stronger weight for readability.
- A4 headers and summary labels use Mukta Bold.
- Existing layout and functionality remain unchanged.


## v13 - Font selector + 5-user login
- Visible Marathi Font Settings: Mukta, Noto Sans Devanagari, Tiro Devanagari Marathi.
- Selected font applies to the editor and A4 output.
- Summary `ड्युटी` heading and all duty labels are centered.
- Vercel-compatible login/logout for 5 users using server-only environment variables.
- Configure `DUTY_AUTH_SECRET` and `USER1_*` through `USER5_*` in Vercel.
- Roster data remains browser-local until an online database is connected.
