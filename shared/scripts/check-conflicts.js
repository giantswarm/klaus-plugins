#!/usr/bin/env node

/**
 * Checks for command name conflicts across plugins
 * Usage: node check-conflicts.js
 */

const fs = require('fs');
const path = require('path');

function getCommandsFromPlugin(pluginPath) {
  const commandsDir = path.join(pluginPath, 'commands');
  const commands = [];

  if (!fs.existsSync(commandsDir)) {
    return commands;
  }

  const files = fs.readdirSync(commandsDir);
  for (const file of files) {
    if (file.endsWith('.md')) {
      const commandName = path.basename(file, '.md');
      commands.push(commandName);
    }
  }

  return commands;
}

function getPluginName(pluginPath) {
  const pluginJsonPath = path.join(pluginPath, '.claude-plugin', 'plugin.json');

  if (!fs.existsSync(pluginJsonPath)) {
    return path.basename(pluginPath);
  }

  try {
    const content = fs.readFileSync(pluginJsonPath, 'utf8');
    const data = JSON.parse(content);
    return data.name || path.basename(pluginPath);
  } catch (error) {
    return path.basename(pluginPath);
  }
}

function getAllPlugins(pluginsDir) {
  if (!fs.existsSync(pluginsDir)) {
    console.error(`❌ Error: Plugins directory not found: ${pluginsDir}`);
    process.exit(1);
  }

  const entries = fs.readdirSync(pluginsDir, { withFileTypes: true });
  return entries
    .filter(entry => entry.isDirectory())
    .filter(entry => !entry.name.startsWith('.')) // Exclude hidden directories
    .map(entry => ({
      path: path.join(pluginsDir, entry.name),
      dirName: entry.name
    }));
}

function main() {
  const pluginsDir = path.join(__dirname, '../../plugins');
  const plugins = getAllPlugins(pluginsDir);

  if (plugins.length === 0) {
    console.log('No plugins found to check');
    process.exit(0);
  }

  console.log(`Checking ${plugins.length} plugin(s) for command conflicts...\n`);

  // Build a map of command -> [plugins that define it]
  const commandMap = new Map();

  for (const plugin of plugins) {
    const pluginName = getPluginName(plugin.path);
    const commands = getCommandsFromPlugin(plugin.path);

    for (const command of commands) {
      if (!commandMap.has(command)) {
        commandMap.set(command, []);
      }
      commandMap.get(command).push({
        name: pluginName,
        path: plugin.dirName
      });
    }
  }

  // Check for conflicts
  let hasConflicts = false;
  const conflicts = [];

  for (const [command, pluginList] of commandMap.entries()) {
    if (pluginList.length > 1) {
      hasConflicts = true;
      conflicts.push({ command, plugins: pluginList });
    }
  }

  if (hasConflicts) {
    console.error('❌ Command name conflicts detected:\n');
    for (const conflict of conflicts) {
      console.error(`   Command: /${conflict.command}`);
      console.error(`   Defined in:`);
      for (const plugin of conflict.plugins) {
        console.error(`     - ${plugin.name} (plugins/${plugin.path})`);
      }
      console.error('');
    }
    console.error('Please rename commands to avoid conflicts.\n');
    process.exit(1);
  } else {
    console.log('✅ No command conflicts found!');

    // Print summary
    const totalCommands = Array.from(commandMap.keys()).length;
    console.log(`\nSummary:`);
    console.log(`  Plugins: ${plugins.length}`);
    console.log(`  Total commands: ${totalCommands}`);
    console.log(`\nCommands by plugin:`);
    for (const plugin of plugins) {
      const pluginName = getPluginName(plugin.path);
      const commands = getCommandsFromPlugin(plugin.path);
      console.log(`  ${pluginName}: ${commands.length} command(s) [${commands.map(c => `/${c}`).join(', ')}]`);
    }

    process.exit(0);
  }
}

main();
