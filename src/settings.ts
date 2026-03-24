import { App, PluginSettingTab, Setting } from "obsidian";
import type CloudflareImgBedPlugin from "./main";

export interface PluginSettings {
	baseUrl: string;
	apiToken: string;
	autoUploadOnPaste: boolean;
	deleteLocalAfterUpload: boolean;
	deleteRemoteWhenReferenceRemoved: boolean;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	baseUrl: "",
	apiToken: "",
	autoUploadOnPaste: false,
	deleteLocalAfterUpload: false,
	deleteRemoteWhenReferenceRemoved: false,
};

export class CloudflareImgBedSettingsTab extends PluginSettingTab {
	plugin: CloudflareImgBedPlugin;

	constructor(app: App, plugin: CloudflareImgBedPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName("Cloudflare image host").setHeading();

		new Setting(containerEl)
			.setName("Service address")
			.setDesc("Enter the service address.")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.baseUrl)
					.onChange(async (value) => {
						this.plugin.settings.baseUrl = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("API token")
			.setDesc("Bearer token used for upload and delete operations")
			.addText((text) => {
				text.inputEl.type = "password";
				return text
					.setValue(this.plugin.settings.apiToken)
					.onChange(async (value) => {
						this.plugin.settings.apiToken = value.trim();
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Auto upload after paste")
			.setDesc("Detect note changes, upload local images automatically, then replace with cloud links")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.autoUploadOnPaste).onChange(async (value) => {
					this.plugin.settings.autoUploadOnPaste = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Delete local source after upload")
			.setDesc("Delete local source files after upload if they are no longer referenced in Markdown files")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.deleteLocalAfterUpload).onChange(async (value) => {
					this.plugin.settings.deleteLocalAfterUpload = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Delete cloud file when references are removed")
			.setDesc("Automatically delete cloud files when cloud image links are no longer referenced in the vault")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.deleteRemoteWhenReferenceRemoved)
					.onChange(async (value) => {
						this.plugin.settings.deleteRemoteWhenReferenceRemoved = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl).setName("Command descriptions").setHeading();
		const commandList = containerEl.createEl("ul");
		const items = [
			"Upload local images in current file: scan the active note, upload local images, and replace links.",
			"Upload local images in current folder: scan all notes in the active note folder (including subfolders) and replace links.",
			"Upload and delete local images in current file: upload and replace, then delete unreferenced local images.",
			"Upload and delete local images in current folder: upload and replace in folder scope, then delete unreferenced local images.",
			"Download cloud images in current file: download to the attachment folder near the note and replace links with local paths.",
			"Download cloud images in current folder: download to the folder attachment directory and replace links with local paths.",
		];

		for (const item of items) {
			commandList.createEl("li", { text: item });
		}
	}
}
