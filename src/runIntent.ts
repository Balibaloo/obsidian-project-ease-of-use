import { Notice, TFile, TFolder } from "obsidian";
import { join as joinPath } from "path";
import PTPlugin from "./main";
import { Intent, ReservedVariableName, TemplateVariable, TemplateVariableType } from "./types";
import { getIntentTemplate } from "./templates";
import { getVariableValues } from "./template_variables";
import { namedObjectDeepMerge } from "./frontmatter";


export async function runIntent(plugin:PTPlugin, intent: Intent, projectFile:TFile|TFolder) {
  console.log("Running", intent);

  let variablesToGather = intent.newNoteProperties.variables;

  const selection:string = plugin.app.workspace.activeEditor?.editor?.getSelection() ?? "";
  const selectionSplit = selection.split(new RegExp("[,|]","g")).map(v=>v.trim());
  const usingSelection:boolean = selection !== "";


  // If templates configured
  let newFileContents = "";
  if (intent.templates.length !== 0) {
    const chosenTemplate = await getIntentTemplate(intent);
    console.log("Chosen template", chosenTemplate);
    if (!chosenTemplate) {
      new Notice("Error: No template selected");
      return;
    }

    // get template
    const templatePath: string | void = resolvePathRelativeToProject(chosenTemplate.path, projectFile);
    if (!templatePath) {
      new Notice(`Error: Please configure a valid path for the ${intent.name} - ${chosenTemplate.name} template`);
      return;
    }

    const templateFile = this.app.vault.getAbstractFileByPath(templatePath);
    if (!(templateFile instanceof TFile)) {
      new Notice("Error: Template is not a file: " + templatePath);
      return;
    }

    newFileContents = await this.app.vault.cachedRead(templateFile);
    variablesToGather = namedObjectDeepMerge(variablesToGather, chosenTemplate.newNoteProperties.variables);
  }

  const variablesToSelect = variablesToGather.filter(v => v.use_selection);
  const selectionVariables = variablesToSelect.reduce((acc:any, variable:TemplateVariable, index) => {
    acc[variable.name] = selectionSplit[index] ?? "";
    return acc;
  }, {});
  console.log("section", selectionVariables);


  let gatheredValues;
  try {
    gatheredValues = await getVariableValues(plugin.app, variablesToGather, selectionVariables);
  } catch (e) {
    new Notice(e);
    return console.log("Failed to gather all variables");
  }
  

  newFileContents = getReplacedVariablesText(newFileContents, gatheredValues);

  const newFileName = getNewFileName(intent, gatheredValues);

  const newFileFolderPath = resolvePathRelativeToProject(intent.newNoteProperties.output_path, projectFile);
  if (!newFileFolderPath){
    new Notice(`Error: Failed to determine ${intent.name} output path`);
    return;
  }

  // create folder if not exists
  if (!(this.app.vault.getAbstractFileByPath(newFileFolderPath) instanceof TFolder)) {
    await this.app.vault.createFolder(newFileFolderPath);
  }

  const newFilePath = joinPath(newFileFolderPath, newFileName).replaceAll("\\", "/");

  const newFile = await this.app.vault.create(
    newFilePath.endsWith(".md") ? newFilePath : newFilePath + ".md",
    newFileContents
  );

  if (usingSelection)
    plugin.app.workspace.activeEditor?.editor?.replaceSelection(`[[${newFileName}]]`);

  // open new file in tab
  const newLeaf = this.app.workspace.getLeaf("tab");
  await newLeaf.openFile(newFile); // TODO Add toggle setting
  console.log("New file created");

}

function resolvePathRelativeToProject(path: string | void, projectFile: TFile|TFolder): string | void {
  if (!path)
    return;

  const parentFolder = projectFile instanceof TFile ? projectFile.parent : projectFile;
  const newFileFolderPath: string | void = path[0] === "." ?
    joinPath(parentFolder?.path as string, path).replaceAll("\\", "/") :
    path;
  if (!newFileFolderPath)
    return;

  // Remove directory trailing "/"
  if (newFileFolderPath.endsWith("/")) 
    return newFileFolderPath.slice(0, -1);

  return newFileFolderPath;
}

function getReplacedVariablesText(text: string, values:{[key: string]: string}): string{
  return Object.keys(values).reduce((text, varName)=>
    text.replaceAll(new RegExp(`\{\{\s*${varName}\s*\}\}`, "g"), values[varName])
    , text);
}

function getNewFileName(intent:Intent, values:{[key: string]: string}):string{
  if (intent.newNoteProperties.note_name_template)
    return getReplacedVariablesText(intent.newNoteProperties.note_name_template, values);

  if (values[ReservedVariableName.newNoteName])
    return values[ReservedVariableName.newNoteName];
  
  if (intent.newNoteProperties.note_name)
    return intent.newNoteProperties.note_name; 
  
  return intent.name;
}