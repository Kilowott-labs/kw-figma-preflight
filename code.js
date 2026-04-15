// KW Preflight — Figma Plugin Sandbox (code.js)
// No DOM access. Communicates with ui.html via postMessage only.

figma.showUI(__html__, { width: 320, height: 580, title: 'KW Preflight' });

// ─── Helpers ────────────────────────────────────────────────

function getLayerPath(node) {
  var parts = [];
  var current = node;
  while (current && current.type !== 'PAGE' && current.type !== 'DOCUMENT') {
    parts.unshift(current.name);
    current = current.parent;
  }
  return parts.join(' > ');
}

function getAllNodes(scope) {
  var nodes = [];
  if (scope === 'selection') {
    var selection = figma.currentPage.selection;
    if (selection.length === 0) {
      figma.ui.postMessage({ type: 'EMPTY_SELECTION' });
      return null;
    }
    for (var i = 0; i < selection.length; i++) {
      var sel = selection[i];
      nodes.push(sel);
      if ('findAll' in sel) {
        nodes = nodes.concat(sel.findAll(function() { return true; }));
      }
    }
  } else if (scope === 'all') {
    for (var i = 0; i < figma.root.children.length; i++) {
      var page = figma.root.children[i];
      nodes = nodes.concat(page.findAll(function() { return true; }));
    }
  } else {
    nodes = figma.currentPage.findAll(function() { return true; });
  }
  return nodes;
}

// ─── Rule Functions ─────────────────────────────────────────
// Each returns: { ruleId, ruleName, severity, violations: [{ nodeId, nodeName, layerPath, message, autoFixable }] }

function ruleGroups(nodes) {
  var violations = [];
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    if (n.type === 'GROUP') {
      violations.push({
        nodeId: n.id,
        nodeName: n.name,
        layerPath: getLayerPath(n),
        message: 'Group found \u2014 convert to Frame with Auto Layout',
        autoFixable: true
      });
    }
  }
  return { ruleId: 'RULE-01', ruleName: 'Groups Must Not Exist', severity: 'ERROR', violations: violations };
}

function ruleAutoLayout(nodes) {
  var violations = [];
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    if (n.type === 'FRAME' && n.layoutMode === 'NONE' && (!n.parent || (n.parent.type !== 'COMPONENT' && n.parent.type !== 'INSTANCE'))) {
      violations.push({
        nodeId: n.id,
        nodeName: n.name,
        layerPath: getLayerPath(n),
        message: 'Frame has no Auto Layout \u2014 set to Horizontal or Vertical',
        autoFixable: false
      });
    }
  }
  return { ruleId: 'RULE-02', ruleName: 'Frames Must Use Auto Layout', severity: 'ERROR', violations: violations };
}

function ruleDefaultNames(nodes) {
  var pattern = /^(Frame|Group|Rectangle|Ellipse|Vector|Line|Polygon|Star|Arrow|Component|Instance|Text)\s\d+$/i;
  var prefixPattern = /^\u26a0\ufe0f RENAME \u2014 /;
  var violations = [];
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    var alreadyPrefixed = prefixPattern.test(n.name);
    if (pattern.test(n.name) || alreadyPrefixed) {
      violations.push({
        nodeId: n.id,
        nodeName: n.name,
        layerPath: getLayerPath(n),
        message: 'Default layer name \u2014 rename to something semantic',
        autoFixable: !alreadyPrefixed
      });
    }
  }
  return { ruleId: 'RULE-03', ruleName: 'Default Layer Names', severity: 'WARNING', violations: violations };
}

function ruleTextStyles(nodes) {
  var violations = [];
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    if (n.type === 'TEXT' && n.textStyleId === '') {
      violations.push({
        nodeId: n.id,
        nodeName: n.name,
        layerPath: getLayerPath(n),
        message: 'Text layer has no Text Style applied \u2014 use a defined style',
        autoFixable: false
      });
    }
  }
  return { ruleId: 'RULE-04', ruleName: 'Text Without Style', severity: 'ERROR', violations: violations };
}

function ruleFillStyles(nodes) {
  var validTypes = { FRAME: 1, RECTANGLE: 1, ELLIPSE: 1, POLYGON: 1, STAR: 1, VECTOR: 1, TEXT: 1, COMPONENT: 1, INSTANCE: 1 };
  var violations = [];
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    if (!validTypes[n.type]) continue;
    if (!n.fills || !Array.isArray(n.fills)) continue;
    var hasSolidFill = false;
    for (var j = 0; j < n.fills.length; j++) {
      var fill = n.fills[j];
      if (fill.type === 'SOLID' && fill.opacity !== 0 && fill.visible !== false) {
        hasSolidFill = true;
        break;
      }
    }
    if (hasSolidFill && n.fillStyleId === '') {
      violations.push({
        nodeId: n.id,
        nodeName: n.name,
        layerPath: getLayerPath(n),
        message: 'Solid fill has no Color Style \u2014 apply a named color style',
        autoFixable: false
      });
    }
  }
  return { ruleId: 'RULE-05', ruleName: 'Fills Without Color Style', severity: 'ERROR', violations: violations };
}

function ruleExportSettings(nodes) {
  var violations = [];
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    if (!n.fills || !Array.isArray(n.fills)) continue;
    var hasImageFill = false;
    for (var j = 0; j < n.fills.length; j++) {
      if (n.fills[j].type === 'IMAGE') {
        hasImageFill = true;
        break;
      }
    }
    if (hasImageFill && (!n.exportSettings || n.exportSettings.length === 0)) {
      violations.push({
        nodeId: n.id,
        nodeName: n.name,
        layerPath: getLayerPath(n),
        message: 'Image has no export settings \u2014 set 2x PNG or SVG',
        autoFixable: true
      });
    }
  }
  return { ruleId: 'RULE-06', ruleName: 'Images Without Export Settings', severity: 'ERROR', violations: violations };
}

function ruleHiddenLayers(nodes) {
  var violations = [];
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    if (n.visible === false) {
      violations.push({
        nodeId: n.id,
        nodeName: n.name,
        layerPath: getLayerPath(n),
        message: 'Hidden layer \u2014 delete it or it will appear in the JSON output',
        autoFixable: true
      });
    }
  }
  return { ruleId: 'RULE-07', ruleName: 'Hidden Layers', severity: 'WARNING', violations: violations };
}

function ruleAbsolutePositioning(nodes) {
  var violations = [];
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    if (n.parent && n.parent.type === 'FRAME' && n.parent.layoutMode !== 'NONE' && n.layoutPositioning === 'ABSOLUTE') {
      violations.push({
        nodeId: n.id,
        nodeName: n.name,
        layerPath: getLayerPath(n),
        message: 'Element is absolutely positioned inside an Auto Layout frame \u2014 confirm this is intentional',
        autoFixable: false
      });
    }
  }
  return { ruleId: 'RULE-08', ruleName: 'Absolute Positioned Elements', severity: 'WARNING', violations: violations };
}

function ruleAnnotationsLayer(nodes) {
  var pattern = /annotation|note|\ud83d\udcdd/i;
  var found = false;
  for (var i = 0; i < nodes.length; i++) {
    if (pattern.test(nodes[i].name)) {
      found = true;
      break;
    }
  }
  var violations = [];
  if (!found) {
    violations.push({
      nodeId: '',
      nodeName: '',
      layerPath: '',
      message: 'No annotations layer found \u2014 add one for animations, interactions, and developer notes',
      autoFixable: false
    });
  }
  return { ruleId: 'RULE-09', ruleName: 'Missing Annotations Layer', severity: 'WARNING', violations: violations };
}

function ruleRepeatingElements(nodes) {
  var violations = [];
  // Build map of parent -> children that are FRAME (not INSTANCE)
  var parentMap = {};
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    if (n.type === 'FRAME' && n.parent && n.parent.type !== 'PAGE' && n.parent.type !== 'DOCUMENT') {
      var pid = n.parent.id;
      if (!parentMap[pid]) parentMap[pid] = [];
      parentMap[pid].push(n);
    }
  }
  // For each parent, group children by (name pattern stripped of trailing digits, childrenCount)
  for (var pid in parentMap) {
    var children = parentMap[pid];
    if (children.length < 3) continue;
    var groups = {};
    for (var j = 0; j < children.length; j++) {
      var c = children[j];
      var baseName = c.name.replace(/\s*\d+$/, '');
      var childCount = ('children' in c) ? c.children.length : 0;
      var key = baseName + '|' + childCount;
      if (!groups[key]) groups[key] = [];
      groups[key].push(c);
    }
    for (var key in groups) {
      if (groups[key].length >= 3) {
        var first = groups[key][0];
        violations.push({
          nodeId: first.parent.id,
          nodeName: first.parent.name,
          layerPath: getLayerPath(first.parent),
          message: 'Repeated frame structure found (' + groups[key].length + 'x "' + first.name.replace(/\s*\d+$/, '') + '") \u2014 consider converting to a Component',
          autoFixable: false
        });
      }
    }
  }
  return { ruleId: 'RULE-10', ruleName: 'Components Not Used For Repeating Elements', severity: 'WARNING', violations: violations };
}

// ─── Auto-Fix Handlers ─────────────────────────────────────

function getNodeDepth(node) {
  var depth = 0;
  var current = node.parent;
  while (current && current.type !== 'PAGE' && current.type !== 'DOCUMENT') {
    depth++;
    current = current.parent;
  }
  return depth;
}

function fixGroups(nodeIds) {
  // Sort deepest-first so nested groups convert before their parents
  var sorted = nodeIds.slice().sort(function(a, b) {
    var nodeA = figma.getNodeById(a);
    var nodeB = figma.getNodeById(b);
    if (!nodeA || !nodeB) return 0;
    return getNodeDepth(nodeB) - getNodeDepth(nodeA);
  });

  for (var i = 0; i < sorted.length; i++) {
    var group = figma.getNodeById(sorted[i]);
    if (!group || group.type !== 'GROUP') continue;

    var parent = group.parent;
    var index = parent.children.indexOf(group);
    var frame = figma.createFrame();

    frame.x = group.x;
    frame.y = group.y;
    frame.resize(group.width, group.height);
    frame.name = group.name;
    frame.layoutMode = 'VERTICAL';

    // Insert frame at correct index BEFORE moving children
    parent.insertChild(index, frame);

    // Move children from group to new frame
    var children = [];
    for (var j = 0; j < group.children.length; j++) {
      children.push(group.children[j]);
    }
    for (var j = 0; j < children.length; j++) {
      frame.appendChild(children[j]);
    }

    try {
      group.remove();
    } catch (e) {
      // Continue processing remaining groups
    }
  }

  figma.ui.postMessage({ type: 'FIX_COMPLETE', nodeIds: sorted });
}

function fixExportSettings(nodeIds) {
  for (var i = 0; i < nodeIds.length; i++) {
    var node = figma.getNodeById(nodeIds[i]);
    if (!node) continue;
    node.exportSettings = [{ format: 'PNG', constraint: { type: 'SCALE', value: 2 } }];
  }
  figma.ui.postMessage({ type: 'FIX_COMPLETE', nodeIds: nodeIds });
}

function fixDefaultNames(nodeIds) {
  for (var i = 0; i < nodeIds.length; i++) {
    var node = figma.getNodeById(nodeIds[i]);
    if (!node) continue;
    node.name = '\u26a0\ufe0f RENAME \u2014 ' + node.name;
  }
  figma.ui.postMessage({ type: 'FIX_COMPLETE', nodeIds: nodeIds });
}

function fixHiddenLayers(nodeIds) {
  for (var i = 0; i < nodeIds.length; i++) {
    var node = figma.getNodeById(nodeIds[i]);
    if (node) node.remove();
  }
  figma.ui.postMessage({ type: 'FIX_COMPLETE', nodeIds: nodeIds });
}

// ─── Main Audit Runner ─────────────────────────────────────

function runAudit(scope) {
  var nodes = getAllNodes(scope);
  if (nodes === null) return;
  var rules = [
    ruleGroups, ruleAutoLayout, ruleDefaultNames, ruleTextStyles,
    ruleFillStyles, ruleExportSettings, ruleHiddenLayers,
    ruleAbsolutePositioning, ruleAnnotationsLayer, ruleRepeatingElements
  ];
  var results = [];
  for (var i = 0; i < rules.length; i++) {
    results.push(rules[i](nodes));
  }

  // Include file/page metadata for handoff summary
  var meta = {
    fileName: figma.root.name,
    pageName: figma.currentPage.name,
    userName: figma.currentUser ? figma.currentUser.name : ''
  };

  figma.ui.postMessage({ type: 'AUDIT_RESULTS', data: results, meta: meta });
}

// ─── Focus Helper ───────────────────────────────────────────

function focusNode(nodeId) {
  var node = figma.getNodeById(nodeId);
  if (node) {
    var current = node;
    while (current.parent && current.type !== 'PAGE') {
      current = current.parent;
    }
    if (current.type === 'PAGE' && current !== figma.currentPage) {
      figma.currentPage = current;
    }
    figma.currentPage.selection = [node];
    figma.viewport.scrollAndZoomIntoView([node]);
  }
}

// ─── Message Handler ────────────────────────────────────────

figma.ui.onmessage = function(msg) {
  switch (msg.type) {
    case 'RUN_AUDIT':
      runAudit(msg.scope || 'page');
      break;
    case 'FOCUS_NODE':
      focusNode(msg.nodeId);
      break;
    case 'FIX_GROUPS':
      fixGroups(msg.nodeIds);
      break;
    case 'FIX_EXPORT':
      fixExportSettings(msg.nodeIds);
      break;
    case 'FIX_HIDDEN':
      fixHiddenLayers(msg.nodeIds);
      break;
    case 'FIX_DEFAULT_NAMES':
      fixDefaultNames(msg.nodeIds);
      break;
  }
};
