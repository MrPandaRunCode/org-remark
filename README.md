# GitHub Organization User Notes

[中文说明 (Chinese)](./README.zh-CN.md)

A Chrome Manifest V3 extension that lets you add private remarks for GitHub users and display them inline on GitHub pages.

The UI supports English and Chinese. Default language is **English** (you can switch in the popup top-right).

## Supported Pages

- Organization members pages: `/orgs/<org>/people*`
- Organization projects pages: `/orgs/<org>/projects*`

The content script observes DOM updates, so it also works with GitHub's dynamic page rendering.

## Install (Developer Mode)

1. Open Chrome: `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this directory:
`/Users/apple/Dev/JXCQ/github-remark`

## Usage

1. Open the extension popup.
2. Enter a GitHub username and remark, then save.
3. On supported GitHub pages, remarks are shown next to usernames.
4. If a user has no remark, click `+Remark` to add one quickly.
5. Click an existing remark badge to edit it.
6. Use popup actions to export/import remark data in JSON format (import merges data).

Remarks are stored in `chrome.storage.sync` and sync with the same Chrome account.

## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE).
