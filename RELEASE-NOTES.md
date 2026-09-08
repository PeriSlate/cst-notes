# CST Notes 0.1.8

### Navigation
- Made Home full-width and matched it to your Obsidian accent color.
- Added Home buttons to live case headers, Admin, and Admin subpages.
- Replaced Quick Case in the navigation area with Templates.

### Onboarding
- Show the checklist only when the example case is present.
- New-user initialization includes a sanitized example case. Updates do not add it to existing libraries.
- Added Admin → Onboarding with Add example case and Show onboarding checklist.
- Simplified checklist tasks and improved automatic progress updates.
- Hide completed checklists automatically. Hiding manually now asks for confirmation and explains how to show the checklist again.
- Updated getting-started and template-review instructions.

### Case archiving and recovery
- Added a red, two-step Delete → Are you sure? button to live case headers.
- Added Restore to archived case headers, preserving case content and identity and returning cases to their original location.
- Restore checks for conflicting notes and surgeon identities instead of overwriting them.
- Existing live headers receive the new controls; missing or legacy headers are repaired with a backup when needed.
