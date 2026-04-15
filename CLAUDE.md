# Kilowott — Figma Preflight Plugin
## Claude Code Master Briefing Document

Read this entire document before writing a single line of code.
This is the complete brief, architecture, rules, and execution plan.

---

## 1. What We Are Building and Why

Kilowott is a web agency using Claude Code as the primary agentic IDE for
design-to-code workflows. Designs come from Figma or Pencil and are passed
to Claude Code which reads the Figma JSON node tree to generate production
code.

The core problem: Claude Code's output quality depends entirely on how well
the Figma file is structured. Poorly structured files — groups instead of
frames, no Auto Layout, unnamed layers, raw hex fills — produce broken,
absolute-positioned, unmaintainable code output. Developers then spend hours
doing correction prompts and screenshot iterations to fix what should have
been right in the design file.

The solution: a Figma plugin that runs a preflight audit inside Figma itself,
before the file ever reaches a developer. It scans the node tree, surfaces
every structural violation with a direct jump-to-frame link, and only lets
the file be marked ready when it passes.

This is a designer-facing tool. It must be fast, clear, and require zero
technical knowledge to use.

---

## 2. Key Decisions Already Made

- **Plugin, not Claude Code MCP audit.** MCP is read-only and puts the burden
  on the developer. The plugin runs inside Figma with write access and puts
  the fix in the designer's hands immediately.

- **Vanilla JavaScript only.** No npm, no build step, no bundler. The plugin
  must run directly from source files. This keeps setup to zero and removes
  any dependency risk.

- **No third-party services.** No API keys, no external calls, no
  authentication. Entirely self-contained.

- **Distribution via manifest import** (desktop app, Plugins > Development >
  Import plugin from manifest). The plan is to eventually publish publicly to
  the Figma Community so browser-based Figma users can also access it. Build
  with that in mind — no desktop-only API features that would break in browser.

- **Figma free plan.** Do not assume any paid plan features. No private org
  plugin publishing. No Dev Mode APIs.

- **Target Figma plugin API** — not the REST API, not Code Connect, not Dev
  Mode. The plugin API only.

---

## 3. Project Folder Structure

Create this exact structure. Do not deviate.

```
kw-figma-preflight/
├── CLAUDE.md               ← this file
├── manifest.json           ← Figma plugin manifest
├── code.js                 ← Plugin sandbox (node tree logic, no DOM)
├── ui.html                 ← Plugin UI panel (HTML/CSS/JS, single file)
└── README.md               ← Setup instructions for the team
```

No subdirectories. No node_modules. No package.json. Four files plus this
briefing document.

---

## 4. manifest.json Specification

```json
{
  "name": "KW Preflight",
  "id": "kw-preflight-v1",
  "api": "1.0.0",
  "main": "code.js",
  "ui": "ui.html",
  "editorType": ["figma"],
  "networkAccess": {
    "allowedDomains": []
  }
}
```

- Name shown in Figma: "KW Preflight"
- No network access needed — leave allowedDomains empty
- editorType figma only — not figjam

---

## 5. Architecture — How The Two Contexts Work

The Figma plugin system runs in two isolated contexts that cannot share memory
and communicate only via postMessage. Understand this before writing any code.

**code.js — The Sandbox**
- Has access to the Figma node tree via the figma global object
- Can read and write nodes (rename, restructure, delete)
- Has NO DOM, NO fetch, NO window, NO localStorage
- Receives messages from ui.html via figma.ui.onmessage
- Sends messages to ui.html via figma.ui.postMessage

**ui.html — The UI iframe**
- Standard HTML/CSS/JS environment with full DOM
- Has NO access to figma object or node tree
- Receives messages from code.js via window.onmessage
- Sends messages to code.js via parent.postMessage

**Message flow:**
```
Designer clicks "Run Preflight" button in ui.html
  → parent.postMessage({ type: 'RUN_AUDIT' })
    → code.js receives via figma.ui.onmessage
      → traverses node tree, builds violations array
        → figma.ui.postMessage({ type: 'AUDIT_RESULTS', data: violations })
          → ui.html receives via window.onmessage
            → renders the report

Designer clicks "Jump To" button in ui.html
  → parent.postMessage({ type: 'FOCUS_NODE', nodeId: '123:456' })
    → code.js receives, calls figma.viewport.scrollAndZoomIntoView([node])
```

Every interaction follows this pattern. Never try to call figma from ui.html
or DOM methods from code.js.

---

## 6. The Audit Rules — Full Specification

These are the exact rules the plugin must check. Implement every one.

### RULE-01: Groups Must Not Exist
```
Check: node.type === 'GROUP'
Violation: Any group node anywhere on the current page
Message: "Group found — convert to Frame with Auto Layout"
Severity: ERROR
Auto-fixable: YES — can be converted programmatically
```

### RULE-02: Frames Must Use Auto Layout
```
Check: node.type === 'FRAME' && node.layoutMode === 'NONE'
Violation: Any frame that is not set to Auto Layout
Exceptions: Direct children of the page (top-level section wrappers are
  allowed to not have Auto Layout if they are just positional containers —
  check if ALL their children are frames, in which case pass)
  Actually, no exceptions — flag all. Let designer decide.
Message: "Frame has no Auto Layout — set to Horizontal or Vertical"
Severity: ERROR
Auto-fixable: NO — direction (H or V) requires designer judgment
```

### RULE-03: Default Layer Names
```
Check: node.name matches this regex: /^(Frame|Group|Rectangle|Ellipse|
  Vector|Line|Polygon|Star|Arrow|Component|Instance|Text)\s\d+$/i
Violation: Any layer with a machine-generated default name
Message: "Default layer name — rename to something semantic"
Severity: WARNING
Auto-fixable: NO — requires meaningful name from designer
```

### RULE-04: Text Nodes Without Text Styles
```
Check: node.type === 'TEXT' && node.textStyleId === ''
Violation: Any text node not using a saved Text Style
Message: "Text layer has no Text Style applied — use a defined style"
Severity: ERROR
Auto-fixable: NO
```

### RULE-05: Fills Without Color Styles
```
Check: node has fills array, any fill where fill.type === 'SOLID'
  and the node's fillStyleId === ''
Applies to: FRAME, RECTANGLE, ELLIPSE, POLYGON, STAR, VECTOR, TEXT,
  COMPONENT, INSTANCE
Violation: Any solid fill not referencing a saved Color Style
Exceptions: Fills with opacity 0 (invisible fills used for layout) — skip
Message: "Solid fill has no Color Style — apply a named color style"
Severity: ERROR
Auto-fixable: NO
```

### RULE-06: Images Without Export Settings
```
Check: node has fills array, any fill where fill.type === 'IMAGE'
  and node.exportSettings.length === 0
Violation: Any image fill with no export settings configured
Message: "Image has no export settings — set 2x PNG or SVG"
Severity: ERROR
Auto-fixable: YES — can add a default 2x PNG export setting
```

### RULE-07: Hidden Layers
```
Check: node.visible === false
Violation: Any hidden layer anywhere in the tree
Message: "Hidden layer — delete it or it will appear in the JSON output"
Severity: WARNING
Auto-fixable: YES — can delete the node (ask for confirmation first)
```

### RULE-08: Absolute Positioned Elements
```
Check: node has a parent, parent.type === 'FRAME',
  parent.layoutMode !== 'NONE', and node.layoutPositioning === 'ABSOLUTE'
Violation: Node is explicitly set to absolute within an Auto Layout frame
  (this is intentional override of Auto Layout — flag for review)
Message: "Element is absolutely positioned inside an Auto Layout frame —
  confirm this is intentional"
Severity: WARNING
Auto-fixable: NO — may be intentional (overlays etc), needs designer review
```

### RULE-09: Missing Annotations Layer
```
Check: Look for a frame or layer on the current page whose name contains
  'annotation' or 'note' or '📝' (case insensitive)
Violation: No annotations layer found anywhere on the page
Message: "No annotations layer found — add one for animations, interactions,
  and developer notes"
Severity: WARNING
Auto-fixable: NO
```

### RULE-10: Components Not Used For Repeating Elements
```
Check: Scan all direct children of section frames. If the same layer
  structure (same name pattern, same child count) appears 3 or more times
  as raw frames rather than component instances, flag it.
Check: node.type === 'FRAME' (not 'INSTANCE') appearing with siblings of
  identical name pattern
Message: "Repeated frame structure found — consider converting to a Component"
Severity: WARNING
Auto-fixable: NO
Note: This is a heuristic, not perfect. Flag it and let designer confirm.
```

---

## 7. Manual Sign-Off Checklist

These items cannot be automated. Display them as a checklist in the UI that
the designer must manually check before the report is considered complete.

```
□ Animation references attached as sticky notes (Figma stickies with 
  reference URLs — Awwwards, Dribbble, Lottie, or live site links — for 
  any section with motion or transitions)

□ Designer-to-developer comments added in Figma (Cmd/Ctrl+click comments 
  placed directly on frames for layout edge cases, copy changes, asset 
  substitutions, or post-freeze decisions)

□ Prototype links attached for interactive sections (tabs, accordions, 
  carousels, modals — a Figma prototype link in the annotations layer 
  showing which state is default and what triggers what)

□ Third-party integrations flagged (maps, video embeds, forms — annotated 
  with the specific service name: Google Maps, Vimeo, Gravity Forms etc.)

□ Approved frame clearly marked (section frames intended for development 
  have a clear naming convention distinguishing them from explorations — 
  e.g. ✅ prefix or _APPROVED suffix)

□ Real or representative copy used throughout (no Lorem Ipsum — all text 
  reflects actual content length and tone)

□ Responsive exceptions noted (any section that needs a designer-specified 
  mobile layout, not AI-handled stacking, is annotated with the exact 
  mobile treatment required)
```

---

## 8. Auto-Fix Capabilities

Only RULE-01, RULE-06, and RULE-07 support auto-fix.

**RULE-01 Auto-fix (Groups → Frames):**
For each group violation, add a "Convert to Frame" button next to the
Jump To button. When clicked:
- Get the group node
- Note its x, y, width, height, children, parent, and index
- Create a new FrameNode with same dimensions
- Set layoutMode to 'VERTICAL' as default
- Move all children into the new frame
- Insert the frame at the same index in the same parent
- Delete the original group
- Re-run the audit automatically after

**RULE-06 Auto-fix (Add Export Settings):**
Add a "Fix All" button for image export violations.
When clicked, for each affected node:
- Set node.exportSettings = [{ format: 'PNG', constraint: { type: 'SCALE', value: 2 } }]
Then re-run audit.

**RULE-07 Auto-fix (Delete Hidden Layers):**
Add a "Delete All Hidden" button.
Show a confirmation: "This will permanently delete X hidden layers. Continue?"
On confirm: remove each hidden node.
Then re-run audit.

---

## 9. UI Design Specification

Single HTML file. Inline all CSS and JS — no external files, no CDN links,
no imports. The plugin panel in Figma is typically 320px wide.

**Colour palette (match Kilowott branding from our documents):**
```
--kw-dark:    #0D1B3E   (backgrounds, headings)
--kw-blue:    #1B4FDC   (primary actions)
--kw-accent:  #4C6EF5   (highlights, active states)
--kw-light:   #EEF3FF   (section backgrounds)
--error-red:  #D32F2F   (ERROR violations)
--error-bg:   #FFEBEE   (ERROR row background)
--warn-amber: #F57C00   (WARNING violations)
--warn-bg:    #FFF8E1   (WARNING row background)
--pass-green: #2E7D32   (pass states)
--pass-bg:    #E8F5E9   (pass background)
--text-dark:  #1A1A2E
--text-mid:   #4A4A6A
--border:     #D0D7E8
```

**Layout — top to bottom:**

1. **Header bar** (dark background, KW_DARK)
   - Left: "KW Preflight" in white, bold, 13px
   - Right: small "v1.0" label in muted colour

2. **Scope selector** (light background)
   - Label: "Scan"
   - Two toggle buttons: "Current Page" (default) | "All Pages"

3. **Run Preflight button**
   - Full width, KW_BLUE background, white text, bold
   - Text: "Run Preflight"
   - Loading state: "Scanning..." with a simple CSS spinner
   - Disabled state during scan

4. **Results area** (shown after first run)

   **Summary bar:**
   - If all pass: green bar — "✅ All checks passed — X rules checked"
   - If violations: split counts — "X Errors  Y Warnings"

   **Violations list:**
   Each violation is a card showing:
   - Left colour bar (red for ERROR, amber for WARNING)
   - Rule badge (e.g. "RULE-01")
   - Violation message (bold, 12px)
   - Layer path below it (muted, 11px, e.g. "Hero Section > Card Grid > Frame 47")
   - Right side: "Jump To" button (small, outlined)
   - If auto-fixable: "Fix" button (small, filled, KW_BLUE)

   Group violations of the same rule under a collapsible header:
   "RULE-04 · Text Without Style (12 violations)" — click to expand/collapse

   **Auto-fix all buttons:**
   Below grouped violations that are all auto-fixable, show a
   "Fix All (X)" button to batch fix that rule.

5. **Manual Checklist** (shown after automated scan)
   - Header: "Manual Sign-Off"
   - Subtext: "Check these items yourself before marking ready"
   - Seven checkbox items from Section 7 above
   - Each checkbox is interactive — click to toggle

6. **Handoff Summary button**
   - Only shown when: zero ERROR violations + all manual checkboxes checked
   - Text: "Copy Handoff Summary"
   - Generates and copies to clipboard:
     ```
     ✅ KW Preflight — PASSED
     File: [filename]
     Page: [page name]
     Date: [date]
     Checked by: [Figma username if available]
     Rules passed: 10/10
     Manual sign-off: Complete
     Ready for development.
     ```

7. **Re-run button**
   - Shown after first run
   - Text: "Re-run Audit"
   - Smaller, outlined style below the results

---

## 10. code.js Structure

Write code.js in this order:

```javascript
// 1. Show the UI panel
figma.showUI(__html__, { width: 320, height: 580, title: 'KW Preflight' });

// 2. Rule functions
// Each rule is a function that takes the full nodes array and returns:
// { ruleId, severity, violations: [{ nodeId, nodeName, layerPath, message, autoFixable }] }

function ruleGroups(nodes) { ... }
function ruleAutoLayout(nodes) { ... }
function ruleDefaultNames(nodes) { ... }
function ruleTextStyles(nodes) { ... }
function ruleFillStyles(nodes) { ... }
function ruleExportSettings(nodes) { ... }
function ruleHiddenLayers(nodes) { ... }
function ruleAbsolutePositioning(nodes) { ... }
function ruleAnnotationsLayer(nodes) { ... }
function ruleRepeatingElements(nodes) { ... }

// 3. Helper: build layer path string for a node
function getLayerPath(node) { ... }
// Walks up node.parent chain, collects names, joins with ' > '
// Stop at the page level

// 4. Helper: get all nodes on scope (current page or all pages)
function getAllNodes(scope) { ... }
// scope: 'page' | 'all'
// Returns flat array of all descendant nodes

// 5. Main audit runner
function runAudit(scope) {
  const nodes = getAllNodes(scope);
  const rules = [
    ruleGroups, ruleAutoLayout, ruleDefaultNames, ruleTextStyles,
    ruleFillStyles, ruleExportSettings, ruleHiddenLayers,
    ruleAbsolutePositioning, ruleAnnotationsLayer, ruleRepeatingElements
  ];
  const results = rules.map(rule => rule(nodes));
  figma.ui.postMessage({ type: 'AUDIT_RESULTS', data: results });
}

// 6. Auto-fix handlers
function fixGroups(nodeIds) { ... }
function fixExportSettings(nodeIds) { ... }
function fixHiddenLayers(nodeIds) { ... }

// 7. Message handler
figma.ui.onmessage = (msg) => {
  switch(msg.type) {
    case 'RUN_AUDIT': runAudit(msg.scope); break;
    case 'FOCUS_NODE': focusNode(msg.nodeId); break;
    case 'FIX_GROUPS': fixGroups(msg.nodeIds); break;
    case 'FIX_EXPORT': fixExportSettings(msg.nodeIds); break;
    case 'FIX_HIDDEN': fixHiddenLayers(msg.nodeIds); break;
  }
};

// 8. Focus helper
function focusNode(nodeId) {
  const node = figma.getNodeById(nodeId);
  if (node) {
    figma.currentPage.selection = [node];
    figma.viewport.scrollAndZoomIntoView([node]);
  }
}
```

---

## 11. Performance Considerations

- Use `figma.currentPage.findAll()` for page scope — it is optimised
- For all pages: iterate `figma.root.children` (pages), call `page.findAll()`
  on each
- `findAll()` with a filter function is faster than finding all and filtering
  in JS — use it: `figma.currentPage.findAll(node => node.type === 'GROUP')`
- Run all rules against the same pre-fetched nodes array — do not traverse
  the tree once per rule
- After auto-fix operations, re-run the full audit automatically so the
  designer sees the updated state immediately

---

## 12. README.md Content

Write a README.md with these exact sections:

**Installation (3 steps)**
1. Download or clone this folder
2. Open Figma desktop app
3. Plugins > Development > Import plugin from manifest > select manifest.json

**How to use**
- Open any Figma file
- Run the plugin: Plugins > Development > KW Preflight
- Click Run Preflight
- Fix all errors, review warnings
- Complete manual sign-off checklist
- Copy handoff summary when button unlocks

**Rule reference table**
One row per rule: ID, name, severity, auto-fixable yes/no

**Publishing to Figma Community (future)**
Brief note that when ready for public distribution, use
Plugins > Publish to Community from the desktop app

---

## 13. Testing Checklist for Claude Code

After building all files, verify each of these before declaring done:

- [ ] manifest.json is valid JSON with no trailing commas
- [ ] code.js has no syntax errors (run: node --check code.js)
- [ ] All 10 rules are implemented as separate functions
- [ ] All 3 auto-fix handlers are implemented
- [ ] Jump To navigation works (focusNode called correctly)
- [ ] UI shows loading state during scan
- [ ] UI groups violations by rule with expand/collapse
- [ ] Manual checklist has all 7 items
- [ ] Handoff summary only unlocks when errors = 0 AND all checkboxes checked
- [ ] Copy to clipboard works in the UI
- [ ] No external dependencies anywhere
- [ ] No fetch or network calls anywhere
- [ ] README.md is complete

---

## 14. What To Build First — Execution Order

Follow this order exactly. Do not jump ahead.

1. Create the folder structure
2. Write manifest.json
3. Write code.js — start with the message handler scaffold and one rule
   (RULE-01 groups) end to end to prove the message flow works
4. Write ui.html — start with the button and the message listener, confirm
   it receives results from code.js
5. Add remaining 9 rules to code.js one by one
6. Add auto-fix handlers
7. Complete the full UI with all states and the manual checklist
8. Write README.md
9. Run the testing checklist in Section 13

---

## 15. Context: The Team

- Agency: Kilowott (KW)
- Primary agentic IDE: Claude Code
- Stack: WordPress, WooCommerce, Elementor, Gutenberg, React, PHP
- Design tools: Figma, Pencil
- This plugin is for the design team — non-technical users
- The output of this plugin feeds directly into Claude Code's design-to-code
  pipeline — a clean preflight means better first-pass code generation
- Team size: ~17 developers + designers
- Figma plan: Free
- Distribution: manifest import via shared folder or GitHub, with intent to
  publish publicly to Figma Community later

---

## 16. Anything That Would Block Progress

None. All prerequisites confirmed:
- No API keys needed
- No paid Figma plan needed
- No third-party services
- No build tools
- Figma desktop app available for development and testing

Start with Step 1 in Section 14.

---

## 17. V1.1 Updates — Apply These Now

These are additions to the existing working plugin. Do not rebuild from
scratch. Edit the existing code.js and ui.html files only. All existing
functionality must continue to work exactly as before.

Run `node --check code.js` after every edit to verify no syntax errors.

---

### 17.1  RULE-03 Auto-Fix — Prefix Rename + Bulk Rename Nudge

**What to add to code.js:**

Add a new auto-fix handler `fixDefaultNames(nodeIds)` that:
- Loops through each nodeId
- Gets the node via `figma.getNodeById(nodeId)`
- Renames it by prepending `⚠️ RENAME — ` to the existing name
  e.g. `Frame 47` becomes `⚠️ RENAME — Frame 47`
- This makes violations visually obvious in the Figma layers panel
  without moving or restructuring anything — zero visual risk
- After all renames complete, calls `runAudit('page')` to refresh

Add the new message type to the switch in `figma.ui.onmessage`:
```javascript
case 'FIX_DEFAULT_NAMES':
  fixDefaultNames(msg.nodeIds);
  break;
```

Update `ruleDefaultNames` so that nodes whose name already starts with
`⚠️ RENAME — ` are still flagged (they still need renaming) but their
`autoFixable` is set to `false` since they've already been prefixed.
This prevents the Fix button appearing on already-prefixed layers.

**What to add to ui.html:**

RULE-03 is the only rule where "Fix All" should show a two-part response:
1. Run the fix (prefix all names)
2. Show an inline nudge message below the RULE-03 group header after fixing:

```
💡 For bulk renaming, use the Rename Layers plugin in Figma Community.
   It lets you find/replace, add prefixes, and number layers in one step.
   Search "Rename Layers" in Figma > Plugins > Community.
```

Style this nudge as a light blue info box (background: #EEF3FF, border-left:
3px solid #4C6EF5, padding: 8px 10px, font-size: 10px, color: #4A4A6A).
Show it only after the Fix All for RULE-03 has been triggered, not before.
Hide it on re-run.

Also update RULE-03's `autoFixable` flag — since we now have a safe fix,
set `autoFixable: true` in the `ruleDefaultNames` return value for nodes
that have NOT yet been prefixed. Individual Fix buttons should appear per
violation, and the Fix All button should appear on the group header.

---

### 17.2  Plain Language Help Text — "What is this?" Expandable Panel

**The goal:** Every violation card should have a plain-language explanation
a non-technical designer can understand, plus a concrete instruction for
what to do in Figma. This is the single most important usability improvement.

**What to add to ui.html:**

For each violation card rendered in the violations list, add a help toggle
button after the layer path:

```
[violation message bold]
[layer path muted]
[What is this? ▼]  ← new toggle, shown collapsed by default
```

When expanded, show a help panel below with two parts:
- **Means:** one sentence plain-language explanation
- **Fix:** one concrete action in Figma

Style the expanded panel: background #F8F9FC, border-left 2px solid
#D0D7E8, padding 6px 10px, font-size 10px, color #4A4A6A, margin-top 4px.

The toggle text: collapsed = "What is this? ▾", expanded = "What is this? ▴"
Font-size 10px, color #4C6EF5, cursor pointer, no border, background none.
Clicking it toggles only that card's help panel — not all cards.

**Help text content — hardcode these exactly by ruleId:**

```javascript
var RULE_HELP = {
  'RULE-01': {
    means: 'You used Cmd+G to group layers. Groups have no layout ' +
           'intelligence — every element inside gets treated as floating ' +
           'at a fixed position when Claude Code reads this file.',
    fix: 'Select the group → right-click → Frame Selection → then press ' +
         'Shift+A to add Auto Layout. Or click Fix to convert automatically.'
  },
  'RULE-02': {
    means: 'This frame\'s children are manually positioned. Claude Code ' +
           'will output them as absolutely positioned elements that do not ' +
           'respond to screen size changes.',
    fix: 'Select the frame → press Shift+A to add Auto Layout → set ' +
         'direction (horizontal or vertical) and gap in the right panel.'
  },
  'RULE-03': {
    means: 'This layer still has Figma\'s auto-generated name. These names ' +
           'become CSS class names in generated code — meaningless names ' +
           'produce unmaintainable code.',
    fix: 'Double-click the layer name in the left panel and give it a ' +
         'meaningful name: Hero Section, Card Title, CTA Button. Use Fix ' +
         'All to mark all unnamed layers so they\'re easy to spot in the ' +
         'layers panel, then use Rename Layers plugin for bulk renaming.'
  },
  'RULE-04': {
    means: 'This text has font settings applied directly, not from your ' +
           'saved Text Styles. Claude Code hardcodes the values instead of ' +
           'using a design token — one font change won\'t update everywhere.',
    fix: 'Select the text → go to the Text panel on the right → click the ' +
         'Style picker (four-dots icon) → apply the correct style: ' +
         'Heading 1, Body, Caption etc.'
  },
  'RULE-05': {
    means: 'This element has a colour applied directly as a hex value, not ' +
           'from your saved Color Styles. Claude Code outputs it as a ' +
           'hardcoded hex instead of a CSS variable, breaking the token system.',
    fix: 'Select the element → go to Fill in the right panel → click the ' +
         'style picker (four-dots icon) → apply the correct color style.'
  },
  'RULE-06': {
    means: 'This image has no export settings configured. Claude Code will ' +
           'not know what format or resolution to use, producing broken ' +
           'image paths in the output.',
    fix: 'Click Fix to automatically set 2x PNG export. Or select the ' +
         'element → go to Export in the right panel → click + → set format.'
  },
  'RULE-07': {
    means: 'This layer is hidden in Figma but still exists in the file. ' +
           'It appears in the JSON that Claude Code reads, and can produce ' +
           'ghost elements or confuse the layout output.',
    fix: 'Click Fix to delete it permanently. Or select it in the layers ' +
         'panel and press Delete. Only delete if it is not needed — there ' +
         'is no undo after the plugin deletes it.'
  },
  'RULE-08': {
    means: 'This element has been manually set to ignore its parent\'s Auto ' +
           'Layout — it floats at a fixed position. Sometimes intentional ' +
           '(overlays, badges) but often a mistake.',
    fix: 'If intentional: ignore this warning. If not: select the element → ' +
         'in the right panel under constraints → switch from Absolute to Auto.'
  },
  'RULE-09': {
    means: 'There is no annotations layer in this file. Claude Code and the ' +
           'developer have no context for animations, hover states, ' +
           'interactions, or anything not visible in the static design.',
    fix: 'Create a new frame → name it "📝 Annotations" → place Figma ' +
         'sticky notes inside describing animations, hover states, ' +
         'third-party integrations, and any special developer instructions.'
  },
  'RULE-10': {
    means: 'You have the same layout copied multiple times as separate ' +
           'frames instead of as a Component. Claude Code generates each ' +
           'one as unique code instead of a reusable component.',
    fix: 'Select one of the repeated frames → right-click → Create ' +
         'Component (Opt+Cmd+K / Alt+Ctrl+K) → replace the other copies ' +
         'with instances of that component (hold Opt/Alt and drag).'
  }
};
```

Place this constant at the top of the `<script>` block alongside
`CHECKLIST_ITEMS`.

**How to render it:**

In the violation card building loop, after the layer path div, add:

```javascript
// Help toggle
var helpToggle = '<button class="help-toggle" ' +
  'data-rule="' + rule.ruleId + '">What is this? \u25BE</button>';

// Help panel (hidden by default)
var helpContent = RULE_HELP[rule.ruleId];
var helpPanel = '';
if (helpContent) {
  helpPanel = '<div class="help-panel" style="display:none">' +
    '<div class="help-means"><strong>Means:</strong> ' +
        escapeHtml(helpContent.means) + '</div>' +
    '<div class="help-fix"><strong>Fix:</strong> ' +
        escapeHtml(helpContent.fix) + '</div>' +
    '</div>';
}
```

Add to the CSS:
```css
.help-toggle {
  display: inline-block;
  margin-top: 4px;
  font-size: 10px;
  color: var(--kw-accent);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  font-family: inherit;
}
.help-toggle:hover { text-decoration: underline; }
.help-panel {
  margin-top: 6px;
  background: #F8F9FC;
  border-left: 2px solid var(--border);
  padding: 6px 10px;
  font-size: 10px;
  color: var(--text-mid);
  line-height: 1.5;
}
.help-means { margin-bottom: 4px; }
.help-fix { }
.help-panel strong { color: var(--text-dark); }
```

Add the toggle click handler inside the existing violations-list delegation
listener — add this alongside the btn-jump and btn-fix checks:
```javascript
if (target.classList.contains('help-toggle')) {
  var card = target.closest('.violation');
  var panel = card.querySelector('.help-panel');
  var isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'block';
  target.textContent = (isOpen ? 'What is this? \u25BE' : 'What is this? \u25B4');
}
```

---

### 17.3  Testing Checklist for V1.1

After making these changes, verify:

- [ ] `node --check code.js` passes with no errors
- [ ] RULE-03 violations show a Fix / Fix All button
- [ ] Clicking Fix All on RULE-03 prefixes layer names with ⚠️ RENAME —
- [ ] The blue nudge box appears after RULE-03 Fix All is triggered
- [ ] The nudge box disappears on re-run
- [ ] Every violation card has a "What is this? ▾" toggle
- [ ] Clicking the toggle expands the help panel for that card only
- [ ] Clicking again collapses it
- [ ] Help text is present for all 10 rule IDs
- [ ] All existing functionality still works (Jump To, Fix, Fix All,
      checklist, handoff summary)
- [ ] No external dependencies introduced
