#!/usr/bin/env node

/**
 * Validates plugin metadata from marketplace.json against the expected schema,
 * and cross-checks that each plugin has a matching .claude-plugin/plugin.json.
 *
 * Usage: node validate-schema.js
 */

const fs = require('fs');
const path = require('path');

const REQUIRED_FIELDS = ['name', 'description', 'version'];
// Intentionally separate from REQUIRED_FIELDS: these may diverge as plugin.json
// gains fields that don't exist in marketplace.json or vice-versa.
const SYNCED_FIELDS = ['name', 'description', 'version'];
const ROOT = path.join(__dirname, '../..');
const MARKETPLACE_PATH = path.join(ROOT, '.claude-plugin/marketplace.json');

function loadMarketplace() {
  if (!fs.existsSync(MARKETPLACE_PATH)) {
    console.error('Error: marketplace.json not found');
    process.exit(1);
  }
  try {
    const content = fs.readFileSync(MARKETPLACE_PATH, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error('Error: Invalid JSON in marketplace.json');
    console.error(`   ${error.message}`);
    process.exit(1);
  }
}

function validatePluginData(pluginData) {
  let isValid = true;

  for (const field of REQUIRED_FIELDS) {
    if (!pluginData[field]) {
      console.error(`Error: Missing required field '${field}' for plugin '${pluginData.name || 'unknown'}'`);
      isValid = false;
    }
  }

  if (pluginData.version && !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(pluginData.version)) {
    console.error(`Warning: Version '${pluginData.version}' doesn't follow semantic versioning (x.y.z) for plugin '${pluginData.name}'`);
  }

  if (pluginData.name && !/^[a-z0-9-]+$/.test(pluginData.name)) {
    console.error(`Warning: Plugin name '${pluginData.name}' should only contain lowercase letters, numbers, and hyphens`);
  }

  if (isValid) {
    console.log(`  marketplace entry OK: ${pluginData.name}`);
  }

  return isValid;
}

function validatePluginJson(marketplaceEntry) {
  const pluginDir = path.resolve(ROOT, marketplaceEntry.source);
  const pluginJsonPath = path.join(pluginDir, '.claude-plugin', 'plugin.json');
  const name = marketplaceEntry.name;
  let isValid = true;

  if (!fs.existsSync(pluginJsonPath)) {
    console.error(`Error: ${name} is missing .claude-plugin/plugin.json`);
    return false;
  }

  let pluginJson;
  try {
    pluginJson = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
  } catch (error) {
    console.error(`Error: ${name} has invalid JSON in .claude-plugin/plugin.json: ${error.message}`);
    return false;
  }

  for (const field of SYNCED_FIELDS) {
    const expected = marketplaceEntry[field];
    const actual = pluginJson[field];
    if (expected !== actual) {
      console.error(`Error: ${name} plugin.json field '${field}' is '${actual}' but marketplace.json has '${expected}'`);
      isValid = false;
    }
  }

  if (isValid) {
    console.log(`  plugin.json OK: ${name}`);
  }

  return isValid;
}

function main() {
  const marketplace = loadMarketplace();

  if (!marketplace.plugins || marketplace.plugins.length === 0) {
    console.log('No plugins found in marketplace.json');
    process.exit(0);
  }

  console.log(`Validating ${marketplace.plugins.length} plugin(s)...\n`);

  let allValid = true;

  console.log('Marketplace entries:');
  for (const plugin of marketplace.plugins) {
    if (!validatePluginData(plugin)) {
      allValid = false;
    }
  }

  console.log('\nPlugin.json cross-check:');
  for (const plugin of marketplace.plugins) {
    if (!validatePluginJson(plugin)) {
      allValid = false;
    }
  }

  console.log('');
  if (allValid) {
    console.log('All plugins are valid!');
    process.exit(0);
  } else {
    console.error('Some plugins have validation errors');
    process.exit(1);
  }
}

main();
