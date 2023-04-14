import { existsSync } from "node:fs"
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { program } from "commander"

async function main(args) {
  const [dbContext] = (await readdir(args.input, { withFileTypes: true }))
    .filter(dirent => dirent.isFile() && dirent.name.includes("Context.cs"));

  const oldNamespaceRegex = new RegExp(`namespace ${args.oldNamespace.replaceAll('.', '\\.')}`, "g");

  const contextPromise = processContext(path.join(args.input, dbContext.name), oldNamespaceRegex, args.newNamespace, args.output);

  const inputEntitiesPath = path.join(args.input, "Entities");
  const outputEntitiesPath = path.join(args.output, "Entities");

  if (!existsSync(outputEntitiesPath));
  await mkdir(outputEntitiesPath, { recursive: true });

  const files = (await readdir(inputEntitiesPath));
  await Promise.all(files.map(file => processEntity(path.join(inputEntitiesPath, file), outputEntitiesPath, oldNamespaceRegex, args.newNamespace)));

  await contextPromise;
}

async function processContext(dbContext, oldNamespaceRegex, newNamespace, outputPath) {
  const content = (await readFile(dbContext)).toString();

  const intermediate = content
    .replace(oldNamespaceRegex, `namespace ${newNamespace}`)
    .replace(/protected override void OnConfiguring(.+)protected override void/gs, "protected override void") // Removes connection string

  const __dirname = path.dirname(fileURLToPath(import.meta.url)); // dir of the current code file
  const configurationTemplate = (await readFile(path.join(__dirname, "TemplateConfiguration.cs"))).toString();

  const tableConfigurationRegex = /modelBuilder\.Entity<([a-zA-Z]+)>\(entity =>\s+{\s([^}]+)/gs
  const matches = [...intermediate.matchAll(tableConfigurationRegex)];

  const dbContextName = path.basename(dbContext);
  const dbContextOutput = intermediate
    .replace(/\(ModelBuilder modelBuilder\).+partial void OnModelCreatingPartial\(ModelBuilder modelBuilder\);/gs, "(ModelBuilder modelBuilder)\n    {\n        modelBuilder.ApplyConfigurationsFromAssembly(Assembly.GetExecutingAssembly());\n    }")

  await writeFile(path.join(outputPath, dbContextName), dbContextOutput, {
    flag: "w+",
  });

  const outputConfigurationsPath = path.join(outputPath, "Configurations");

  if (!existsSync(outputConfigurationsPath));
  await mkdir(outputConfigurationsPath, { recursive: true });

  await Promise.all(matches.map(match => processContextMatch(match, newNamespace, outputConfigurationsPath, configurationTemplate)));
}

async function processContextMatch(match, newNamespace, outputConfigurationsPath, configurationTemplate) {
  const [, entityType, configuration] = match;

  const filePath = path.join(outputConfigurationsPath, `${entityType}Configuration.cs`);

  const processedConfiguration = configuration
    .replace(/^\n/, "") // "trim" start
    .replace(/;\s*$/gs, ";") // "trim" end
    .replaceAll(/\s{4}entity\./gm, "builder.") // indentation + rename
    .replaceAll(/\s{4}\./gm, ".") // indentation stuff

  const output = configurationTemplate
    .replace("##namespace##", newNamespace)
    .replaceAll("##type##", entityType)
    .replace("##config##", processedConfiguration)

  await writeFile(filePath, output, {
    flag: "w+",
  });
}

async function processEntity(entity, outputPath, oldNamespaceRegex, newNamespace) {
  const content = (await readFile(entity)).toString();

  const fileName = path.basename(entity);
  const outputContent = content
    .replace(oldNamespaceRegex, `namespace ${newNamespace}`)
    .replace("public partial class", "public class");

  await writeFile(path.join(outputPath, fileName), outputContent, {
    flag: "w+",
  });
}

program
  .requiredOption("-n, --old-namespace <namespace>", "Base namespace used by scaffold")
  .requiredOption("-N, --new-namespace <namespace>", "Base namespace of output")
  .requiredOption("-i, --input <path>", "Path to scaffold output")
  .requiredOption("-o, --output <path>", "Output path")

program.parse();

const options = program.opts();

main(options)
  .catch(error => console.error(error));