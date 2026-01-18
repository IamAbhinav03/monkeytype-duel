# CI/CD Test

This file is created to test the GitHub Actions workflows.

## Workflows that should trigger:
- Monkey CI (main CI pipeline)
- Check formatting
- Semantic PR title validation
- Auto-labeling (if API_TOKEN secret is set)
- Label management (waiting for review/update)

## Expected results:
- ✅ All lint checks pass
- ✅ All builds succeed
- ✅ All tests pass
- ✅ Formatting checks pass
- ✅ PR title follows convention
