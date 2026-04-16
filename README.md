# GitHub Organization User Notes

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

---

# Github 组织用户备注

一个 Chrome Manifest V3 插件，用于给 GitHub 用户打备注，并在页面中展示备注名。

界面支持中英文，默认英文（可在弹窗右上角切换语言）。

## 支持页面

- 组织成员页面：`/orgs/<org>/people*`
- 组织项目页面：`/orgs/<org>/projects*`

内容脚本会监听页面 DOM 变化，因此 GitHub 异步加载内容时也能正常显示。

## 安装（开发者模式）

1. 打开 Chrome：`chrome://extensions`
2. 开启右上角“开发者模式”
3. 点击“加载已解压的扩展程序”
4. 选择当前目录：
`/Users/apple/Dev/JXCQ/github-remark`

## 使用方法

1. 打开插件弹窗。
2. 输入 GitHub 用户名和备注名并保存。
3. 在支持页面中，用户名右侧会显示备注。
4. 无备注时可点击 `+备注` 快速新增。
5. 点击已有备注可快速编辑。
6. 在弹窗中可导出/导入 JSON 备注数据（导入为合并模式）。

备注存储在 `chrome.storage.sync`，同一 Chrome 账号下可同步。

## 开源协议

本项目使用 MIT 协议，详见 [LICENSE](./LICENSE)。
