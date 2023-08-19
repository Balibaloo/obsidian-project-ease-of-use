import { Plugin, Notice, TFile } from 'obsidian';
import { DEFAULT_SETTINGS, PTSettingTab } from './config';
import { Intent, PTSettings } from './types/';
import { getFrontmatter, getIntentsFromFM } from './frontmatter';
import { runIntent } from './runIntent';


const PLUGIN_LONG_NAME = "Project Templater";
const PLUGIN_ACRONYM = "pt";

export default class PTPlugin extends Plugin {
	settings: PTSettings;

	async onload() {
		await this.loadSettings();
		this.settings.intents.forEach(i => this.createCommandForIntent(i));

		this.addSettingTab(new PTSettingTab(this.app, this));

		this.addCommand({
			id: `trigger-${PLUGIN_ACRONYM}`,
			name: `Trigger ${PLUGIN_LONG_NAME}`,
			callback: () => {
				new Notice("Hello World");
			}
		});

		this.addCommand({
			id: 'reload-config',
			name: 'Reload config',
			callback: async () => {
				const pluginConfigFile = this.app.vault.getAbstractFileByPath(this.settings.pluginConfigFile);
				if (!(pluginConfigFile instanceof TFile)) {
					new Notice(`Error: Please add a configuration file for ${PLUGIN_LONG_NAME}`);
					this.settings.pluginConfigured = false;
					return this.saveSettings();
				}

				const fm = await getFrontmatter(this.app, pluginConfigFile);

				this.settings.intents = getIntentsFromFM(fm);
				this.settings.intents.forEach((intent) => {
					this.createCommandForIntent(intent);
				});


				console.log("Loaded intents", this.settings.intents);
				this.settings.pluginConfigured = true;
				return this.saveSettings();
			}
		});		
	}

	createCommandForIntent(intent: Intent) {
		const commandID = `create-${intent.name.toLowerCase().replaceAll(/\s/g, "-")}`;

		this.addCommand({
			id: commandID,
			name: `Create a new ${intent.name} note`,
			callback: async () => {
				runIntent(this, intent);
			}
		})
	}


	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}