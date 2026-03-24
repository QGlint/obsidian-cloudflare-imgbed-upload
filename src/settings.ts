import { App, PluginSettingTab, Setting } from "obsidian";
import type MyPlugin from "./main";

export interface MyPluginSettings {
	baseUrl: string;
	apiToken: string;
	autoUploadOnPaste: boolean;
	deleteLocalAfterUpload: boolean;
	deleteRemoteWhenReferenceRemoved: boolean;
}

export const DEFAULT_SETTINGS: MyPluginSettings = {
	baseUrl: "",
	apiToken: "",
	autoUploadOnPaste: false,
	deleteLocalAfterUpload: false,
	deleteRemoteWhenReferenceRemoved: false,
};

export class CloudflareImgBedSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h2", { text: "Cloudflare ImgBed 配置" });

		new Setting(containerEl)
			.setName("服务地址")
			.setDesc("Cloudflare ImgBed 服务地址，例如：https://your.domain")
			.addText((text) =>
				text
					.setPlaceholder("https://your.domain")
					.setValue(this.plugin.settings.baseUrl)
					.onChange(async (value) => {
						this.plugin.settings.baseUrl = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("API Token")
			.setDesc("用于上传和删除的 Bearer Token")
			.addText((text) => {
				text.inputEl.type = "password";
				return text
					.setPlaceholder("token")
					.setValue(this.plugin.settings.apiToken)
					.onChange(async (value) => {
						this.plugin.settings.apiToken = value.trim();
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("自动上传（粘贴图片后）")
			.setDesc("检测笔记变更并自动上传本地图片，随后替换为云端链接")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.autoUploadOnPaste).onChange(async (value) => {
					this.plugin.settings.autoUploadOnPaste = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("上传后删除本地源文件")
			.setDesc("开启后，若图片不再被任何 Markdown 文件引用，将删除本地源文件")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.deleteLocalAfterUpload).onChange(async (value) => {
					this.plugin.settings.deleteLocalAfterUpload = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("删除引用时删除云端文件")
			.setDesc("当云端图片链接在全库中不再被引用时，自动删除云端文件")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.deleteRemoteWhenReferenceRemoved)
					.onChange(async (value) => {
						this.plugin.settings.deleteRemoteWhenReferenceRemoved = value;
						await this.plugin.saveSettings();
					}),
			);

		containerEl.createEl("h3", { text: "命令说明" });
		const commandList = containerEl.createEl("ul");
		const items = [
			"上传当前文件中的本地图片：扫描当前笔记，上传本地图片并替换链接。",
			"上传当前文件夹中的本地图片：扫描当前笔记所在文件夹（含子目录）内所有笔记并替换链接。",
			"上传并删除当前文件中的本地图片：执行上传替换后，删除无引用的本地图片。",
			"上传并删除当前文件夹中的本地图片：执行文件夹范围上传替换后，删除无引用的本地图片。",
			"下载当前文件中的云端图片到本地：下载到对应目录下的 attachment 文件夹并替换为本地链接。",
			"下载当前文件夹中的云端图片到本地：下载到当前文件夹的 attachment 文件夹并替换为本地链接。",
		];

		for (const item of items) {
			commandList.createEl("li", { text: item });
		}
	}
}
