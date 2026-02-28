#!/usr/bin/env node

/**
 * Check if plugin versions need to be bumped based on changed files.
 *
 * Usage:
 *   node check-version-bump.js --check [--base <branch>]
 *   node check-version-bump.js --bump <plugin> <patch|minor|major>
 *   node check-version-bump.js --bump-all [--level <patch|minor|major>]
 *
 * Options:
 *   --check          Check which plugins need version bumps (default mode)
 *   --base <branch>  Base branch to compare against (default: origin/main)
 *   --bump <plugin> <level>  Bump a specific plugin's version
 *   --bump-all       Bump all plugins that have changes
 *   --level <level>  Version bump level for --bump-all (default: minor)
 *   --json           Output in JSON format (for CI)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const MARKETPLACE_PATH = path.join(__dirname, '../../.claude-plugin/marketplace.json');

// Files that trigger a version bump (relative to plugin root)
// See: https://code.claude.com/docs/en/plugins#plugin-structure-overview
const BUMP_TRIGGERS = [
  /^commands\/.+\.md$/,           // Skills as Markdown files
  /^skills\/.+\/SKILL\.md$/,      // Agent Skills
  /^agents\/.+/,                  // Custom agent definitions
  /^hooks\/hooks\.json$/,         // Event handlers
  /^\.mcp\.json$/,                // MCP server configurations
  /^\.lsp\.json$/,                // LSP server configurations
];

// Files that DON'T trigger a version bump
const BUMP_EXCLUDES = [
  /^README\.md$/,
  /^PLUGIN\.md$/,
  /^CHEATSHEET\.md$/,
];

const VALID_LEVELS = ['patch', 'minor', 'major'];

function loadMarketplace() {
  const content = fs.readFileSync(MARKETPLACE_PATH, 'utf8');
  return JSON.parse(content);
}

function saveMarketplace(marketplace) {
  const content = JSON.stringify(marketplace, null, 2) + '\n';
  fs.writeFileSync(MARKETPLACE_PATH, content);
}

/**
 * Get the merge base between a branch and HEAD.
 * Falls back to using the branch directly if merge-base fails.
 */
function getMergeBase(baseBranch) {
  try {
    return execSync(`git merge-base ${baseBranch} HEAD`, { encoding: 'utf8' }).trim();
  } catch {
    return baseBranch;
  }
}

function getChangedFiles(baseBranch) {
  try {
    const mergeBase = getMergeBase(baseBranch);
    const output = execSync(`git diff --name-only ${mergeBase}`, { encoding: 'utf8' });
    return output.trim().split('\n').filter(Boolean);
  } catch (error) {
    console.error(`Error getting changed files: ${error.message}`);
    process.exit(1);
  }
}

function getPluginFromPath(filePath) {
  const match = filePath.match(/^plugins\/([^/]+)\//);
  return match ? match[1] : null;
}

function shouldTriggerBump(filePath, pluginName) {
  // Get the path relative to the plugin directory
  const relativePath = filePath.replace(`plugins/${pluginName}/`, '');

  // Check if it's in the exclude list
  for (const pattern of BUMP_EXCLUDES) {
    if (pattern.test(relativePath)) {
      return false;
    }
  }

  // Check if it matches any trigger pattern
  for (const pattern of BUMP_TRIGGERS) {
    if (pattern.test(relativePath)) {
      return true;
    }
  }

  return false;
}

/**
 * Parse and validate a semantic version string.
 * Returns array of [major, minor, patch] numbers or throws an error.
 */
function parseVersion(version) {
  const trimmed = version.trim();
  const match = trimmed.match(/^(\d+)\.(\d+)\.(\d+)$/);

  if (!match) {
    throw new Error(`Invalid version format: "${version}". Expected semver format (x.y.z)`);
  }

  return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
}

function analyzeChanges(baseBranch) {
  const changedFiles = getChangedFiles(baseBranch);
  const marketplace = loadMarketplace();

  // Group changed files by plugin
  const pluginChanges = {};

  for (const file of changedFiles) {
    const pluginName = getPluginFromPath(file);
    if (!pluginName) continue;

    if (shouldTriggerBump(file, pluginName)) {
      if (!pluginChanges[pluginName]) {
        pluginChanges[pluginName] = [];
      }
      pluginChanges[pluginName].push(file);
    }
  }

  // Check which plugins need version bumps
  const results = [];

  for (const [pluginName, files] of Object.entries(pluginChanges)) {
    const plugin = marketplace.plugins.find(p => p.name === pluginName);
    if (!plugin) continue;

    // Check if version was already bumped by comparing with base branch
    let needsBump = true;
    try {
      const mergeBase = getMergeBase(baseBranch);
      const baseMarketplace = execSync(`git show ${mergeBase}:.claude-plugin/marketplace.json`, { encoding: 'utf8' });
      const baseData = JSON.parse(baseMarketplace);
      const basePlugin = baseData.plugins.find(p => p.name === pluginName);

      if (basePlugin && basePlugin.version.trim() !== plugin.version.trim()) {
        needsBump = false; // Version was already bumped
      }
    } catch {
      // If we can't get the base version, assume bump is needed
    }

    if (needsBump) {
      results.push({
        plugin: pluginName,
        currentVersion: plugin.version,
        suggestedVersion: bumpVersion(plugin.version, 'minor'),
        changedFiles: files,
      });
    }
  }

  return results;
}

function bumpVersion(version, level) {
  const [major, minor, patch] = parseVersion(version);

  switch (level) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      throw new Error(`Invalid bump level: ${level}. Use: ${VALID_LEVELS.join(', ')}`);
  }
}

function bumpPluginVersion(pluginName, level) {
  const marketplace = loadMarketplace();
  const plugin = marketplace.plugins.find(p => p.name === pluginName);

  if (!plugin) {
    return { success: false, error: `Plugin '${pluginName}' not found` };
  }

  try {
    const oldVersion = plugin.version;
    const newVersion = bumpVersion(oldVersion, level);
    plugin.version = newVersion;

    saveMarketplace(marketplace);

    return { success: true, plugin: pluginName, oldVersion, newVersion };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function validateLevel(level) {
  if (!VALID_LEVELS.includes(level)) {
    console.error(`Error: Invalid level '${level}'. Use: ${VALID_LEVELS.join(', ')}`);
    process.exit(1);
  }
}

function printUsage() {
  console.log(`
Usage:
  node check-version-bump.js --check [--base <branch>] [--json]
  node check-version-bump.js --bump <plugin> <patch|minor|major>
  node check-version-bump.js --bump-all [--level <patch|minor|major>]

Options:
  --check              Check which plugins need version bumps
  --base <branch>      Base branch to compare against (default: origin/main)
  --bump <plugin> <l>  Bump a specific plugin's version
  --bump-all           Bump all plugins that have changes
  --level <level>      Version bump level for --bump-all (default: minor)
  --json               Output in JSON format
`);
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const jsonOutput = args.includes('--json');
  const baseIndex = args.indexOf('--base');
  const baseBranch = baseIndex !== -1 ? args[baseIndex + 1] : 'origin/main';

  if (args.includes('--check') || (!args.includes('--bump') && !args.includes('--bump-all'))) {
    // Check mode
    const results = analyzeChanges(baseBranch);

    if (jsonOutput) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      if (results.length === 0) {
        console.log('✅ No plugins need version bumps.');
      } else {
        console.log('📦 Plugins that may need version bumps:\n');
        for (const r of results) {
          console.log(`  ${r.plugin}: ${r.currentVersion} → ${r.suggestedVersion}`);
          console.log(`    Changed files:`);
          for (const f of r.changedFiles) {
            console.log(`      - ${f}`);
          }
          console.log();
        }
      }
    }

    process.exit(0);
  }

  if (args.includes('--bump-all')) {
    // Bump all plugins that need it
    const levelIndex = args.indexOf('--level');
    const level = levelIndex !== -1 ? args[levelIndex + 1] : 'minor';

    validateLevel(level);

    const results = analyzeChanges(baseBranch);
    const bumped = [];

    for (const r of results) {
      const result = bumpPluginVersion(r.plugin, level);
      if (result.success) {
        bumped.push(result);
      }
    }

    if (jsonOutput) {
      console.log(JSON.stringify(bumped, null, 2));
    } else {
      if (bumped.length === 0) {
        console.log('✅ No plugins needed version bumps.');
      } else {
        console.log('✅ Bumped versions:\n');
        for (const b of bumped) {
          console.log(`  ${b.plugin}: ${b.oldVersion} → ${b.newVersion}`);
        }
      }
    }

    process.exit(0);
  }

  if (args.includes('--bump')) {
    // Bump specific plugin
    const bumpIndex = args.indexOf('--bump');
    const pluginName = args[bumpIndex + 1];
    const level = args[bumpIndex + 2] || 'minor';

    if (!pluginName) {
      console.error('Error: Plugin name required');
      printUsage();
      process.exit(1);
    }

    validateLevel(level);

    const result = bumpPluginVersion(pluginName, level);

    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      if (result.success) {
        console.log(`✅ Bumped ${result.plugin}: ${result.oldVersion} → ${result.newVersion}`);
      } else {
        console.error(`❌ ${result.error}`);
        process.exit(1);
      }
    }

    process.exit(0);
  }
}

main();
