# KW Preflight — Figma Plugin

A preflight audit plugin for Figma that checks design file structure before handoff to development. Built for the Kilowott design-to-code pipeline.

## Installation

1. Download or clone this folder
2. Open Figma desktop app
3. Go to **Plugins > Development > Import plugin from manifest** and select `manifest.json`

## How to Use

1. Open any Figma file
2. Run the plugin: **Plugins > Development > KW Preflight**
3. Click **Run Preflight**
4. Fix all errors, review warnings
5. Complete the manual sign-off checklist
6. Click **Copy Handoff Summary** when the button unlocks (zero errors + all checkboxes checked)

## Rule Reference

| ID | Rule | Severity | Auto-fixable |
|----|------|----------|-------------|
| RULE-01 | Groups Must Not Exist | ERROR | Yes |
| RULE-02 | Frames Must Use Auto Layout | ERROR | No |
| RULE-03 | Default Layer Names | WARNING | No |
| RULE-04 | Text Without Text Style | ERROR | No |
| RULE-05 | Fills Without Color Style | ERROR | No |
| RULE-06 | Images Without Export Settings | ERROR | Yes |
| RULE-07 | Hidden Layers | WARNING | Yes |
| RULE-08 | Absolute Positioned Elements | WARNING | No |
| RULE-09 | Missing Annotations Layer | WARNING | No |
| RULE-10 | Repeating Elements Not Components | WARNING | No |

## Publishing to Figma Community (Future)

When ready for public distribution, use **Plugins > Publish to Community** from the Figma desktop app. The plugin uses no desktop-only APIs and is compatible with browser-based Figma.
