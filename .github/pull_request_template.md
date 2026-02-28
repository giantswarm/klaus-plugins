<!-- Provide a brief description of the changes in this PR -->

## Checklist

- [ ] I have tested my changes
- [ ] I have updated the main README (using the `/update-plugin-list` claude command)
- [ ] When adding a plugin: I have updated the Marketplace config (using the `/update-plugin-list` claude command)
- [ ] **Plugin version bumped** (if commands or skills changed)
- [ ] My code follows the project's style guidelines

## Plugin Versioning

If you modified commands or skills, bump the plugin version so users receive updates.
A bot will comment on this PR with version bump suggestions.

**Slash commands** (comment on this PR):

- `/bump <plugin-name>` - bump minor version (recommended for most changes)
- `/bump <plugin-name> patch` - bump patch version (typo fixes only)
- `/bump all` - bump all plugins that have changes
