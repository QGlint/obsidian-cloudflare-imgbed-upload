import { Notice, Plugin } from "obsidian";
import { ImageSyncService } from "./service";
import { DEFAULT_SETTINGS, CloudflareImgBedSettingTab, MyPluginSettings } from "./settings";

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;
	private imageSyncService: ImageSyncService;

	async onload() {
		await this.loadSettings();

		this.imageSyncService = new ImageSyncService(this, this.app);
		await this.imageSyncService.initializeSnapshots();
		this.imageSyncService.registerEvents();

		this.addSettingTab(new CloudflareImgBedSettingTab(this.app, this));
		this.registerCommands();
	}

	onunload() {
		// No manual cleanup required, all listeners are registered via registerEvent.
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) as Partial<MyPluginSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private registerCommands(): void {
		this.addCommand({
			id: "upload-images-current-file",
			name: "上传当前文件中的本地图片",
			callback: async () => {
				await this.runUpload("file", false);
			},
		});

		this.addCommand({
			id: "upload-images-current-folder",
			name: "上传当前文件夹中的本地图片",
			callback: async () => {
				await this.runUpload("folder", false);
			},
		});

		this.addCommand({
			id: "upload-and-delete-local-current-file",
			name: "上传并删除当前文件中的本地图片",
			callback: async () => {
				await this.runUpload("file", true);
			},
		});

		this.addCommand({
			id: "upload-and-delete-local-current-folder",
			name: "上传并删除当前文件夹中的本地图片",
			callback: async () => {
				await this.runUpload("folder", true);
			},
		});

		this.addCommand({
			id: "download-cloud-images-current-file",
			name: "下载当前文件中的云端图片到本地",
			callback: async () => {
				await this.runDownload("file");
			},
		});

		this.addCommand({
			id: "download-cloud-images-current-folder",
			name: "下载当前文件夹中的云端图片到本地",
			callback: async () => {
				await this.runDownload("folder");
			},
		});
	}

	private async runUpload(scope: "file" | "folder", deleteLocalAfterUpload: boolean): Promise<void> {
		try {
			const result = await this.imageSyncService.uploadByScope(scope, deleteLocalAfterUpload);
			new Notice(`上传完成：上传 ${result.uploadedCount} 个，删除本地 ${result.deletedLocalCount} 个`);
		} catch (error) {
			console.error(error);
			new Notice(`上传失败：${(error as Error).message}`);
		}
	}

	private async runDownload(scope: "file" | "folder"): Promise<void> {
		try {
			const result = await this.imageSyncService.downloadByScope(scope);
			new Notice(`下载完成：下载 ${result.downloadedCount} 个文件`);
		} catch (error) {
			console.error(error);
			new Notice(`下载失败：${(error as Error).message}`);
		}
	}
}
