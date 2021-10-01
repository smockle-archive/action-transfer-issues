# action-transfer-issues

Transfer issues from one repo to another, even across orgs.

## Usage

### Inputs

#### `source`

**Required** The full name of the repo (with owner) which contains issues to transfer. For example, `source: smockle-archive/sandbox`.

#### `destination`

**Required** The full name of the repo (with owner) to which issues will be transferred. For example, `destination: smockle/action-transfer-issues`.

#### `issue_numbers`

**Required** A space-delimited list of issue numbers indicating the issues to transfer. For example, `issue_numbers: "1 2 3"`.

### Environment Variables

#### `GH_TOKEN`

**Required** A [GitHub token](https://docs.github.com/en/github/authenticating-to-github/keeping-your-account-and-data-secure/creating-a-personal-access-token) with the `public_repo` (for use in public repos) or `repo` (for use in private repos) scope.

### Example workflow

```YAML
name: Transfer issues
on: workflow_dispatch

jobs:
  transfer_issues:
    name: Transfer issues
    runs-on: ubuntu-latest
    steps:
      - uses: smockle/action-transfer-issues@dist
        with:
          source: smockle-archive/sandbox
          destination: smockle/action-transfer-issues
          issue_numbers: "1"
        env:
          GH_TOKEN: ${{ secrets.GH_TOKEN }}
```

## Development

### Publishing

After every commit to [`main`](https://github.com/smockle/action-transfer-issues/tree/main), the [“Publish” workflow](https://github.com/smockle/action-transfer-issues/blob/main/.github/workflows/publish.yml) uses [smockle/action-release-branch](https://github.com/smockle/action-release-branch) to build and deploy to the [`dist` branch](https://github.com/smockle/action-transfer-issues/tree/dist) (which, as noted in [Example usage](#example-usage) above, is the branch users should specify in their workflows: `uses: smockle/action-transfer-issues@dist`).
