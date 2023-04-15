import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { program } from "commander";
import { fileURLToPath } from "node:url";
import z from "zod";

async function main(args: Args) {
  const [dbContext] = (
    await readdir(args.input, { withFileTypes: true })
  ).filter((dirent) => dirent.isFile() && dirent.name.endsWith("Context.cs"));

  const [oldNamespace, newNamespace] = args.namespace;

  const oldNamespaceRegex = new RegExp(
    `namespace ${oldNamespace.replaceAll(".", "\\.")}`,
    "g"
  );

  const contextPromise = processContext(
    path.join(args.input, dbContext.name),
    oldNamespaceRegex,
    newNamespace,
    args.output,
    args.template
  );

  const inputEntitiesPath = path.join(args.input, "Entities");
  const outputEntitiesPath = path.join(args.output, "Entities");

  if (!existsSync(outputEntitiesPath))
    await mkdir(outputEntitiesPath, { recursive: true });

  const files = await readdir(inputEntitiesPath);
  await Promise.all(
    files.map((file) =>
      processEntity(
        path.join(inputEntitiesPath, file),
        outputEntitiesPath,
        oldNamespaceRegex,
        newNamespace
      )
    )
  );

  await contextPromise;
}

async function processContext(
  dbContext: string,
  oldNamespaceRegex: RegExp,
  newNamespace: string,
  outputPath: string,
  templatePath: string
) {
  const content = (await readFile(dbContext)).toString();

  const intermediate = content
    .replace(oldNamespaceRegex, `namespace ${newNamespace}`)
    .replace(
      /protected override void OnConfiguring(.+)protected override void/gs,
      "protected override void"
    ); // Removes connection string

  const configurationTemplate = (await readFile(templatePath)).toString();

  const tableConfigurationRegex =
    /modelBuilder\.Entity<([a-zA-Z]+)>\(entity =>\s+{\s([^}]+)/gs;
  const matches = [...intermediate.matchAll(tableConfigurationRegex)];

  const dbContextName = path.basename(dbContext);
  const dbContextOutput = intermediate.replace(
    /\(ModelBuilder modelBuilder\).+partial void OnModelCreatingPartial\(ModelBuilder modelBuilder\);/gs,
    "(ModelBuilder modelBuilder)\n    {\n        modelBuilder.ApplyConfigurationsFromAssembly(Assembly.GetExecutingAssembly());\n    }"
  );

  await writeFile(path.join(outputPath, dbContextName), dbContextOutput, {
    flag: "w+",
  });

  const outputConfigurationsPath = path.join(outputPath, "Configurations");

  if (!existsSync(outputConfigurationsPath))
    await mkdir(outputConfigurationsPath, { recursive: true });

  await Promise.all(
    matches.map((match) =>
      processContextMatch(
        match,
        newNamespace,
        outputConfigurationsPath,
        configurationTemplate
      )
    )
  );
}

async function processContextMatch(
  match: RegExpMatchArray,
  newNamespace: string,
  outputConfigurationsPath: string,
  configurationTemplate: string
) {
  const [, entityType, configuration] = match;

  const filePath = path.join(
    outputConfigurationsPath,
    `${entityType}Configuration.cs`
  );

  const processedConfiguration = configuration
    .replace(/^\n/, "") // "trim" start
    .replace(/;\s*$/gs, ";") // "trim" end
    .replaceAll(/\s{4}entity\./gm, "builder.") // indentation + rename
    .replaceAll(/\s{4}\./gm, "."); // indentation stuff

  const output = configurationTemplate
    .replace("##namespace##", newNamespace)
    .replaceAll("##type##", entityType)
    .replace("##config##", processedConfiguration);

  await writeFile(filePath, output, {
    flag: "w+",
  });
}

async function processEntity(
  entity: string,
  outputPath: string,
  oldNamespaceRegex: RegExp,
  newNamespace: string
) {
  const content = (await readFile(entity)).toString();

  const fileName = path.basename(entity);
  const outputContent = content
    .replace(oldNamespaceRegex, `namespace ${newNamespace}`)
    .replace("public partial class", "public class");

  await writeFile(path.join(outputPath, fileName), outputContent, {
    flag: "w+",
  });
}

const __dirname = path.dirname(fileURLToPath(import.meta.url)); // dir of the current code file

program
  .requiredOption(
    "-n, --namespace <pair>",
    "Replaces the namespace used by scaffold, example: Old.Namespace,New.Namespace"
  )
  .requiredOption("-i, --input <path>", "Path to scaffold output")
  .requiredOption("-o, --output <path>", "Output path")
  .option(
    "-t, --template <pathToTemplate>",
    "Specity the path to TemplateConfiguration.cs",
    path.join(__dirname, "..", "TemplateConfiguration.cs")
  );

program.parse();

type Options = {
  namespace: string;
  input: string;
  output: string;
  template: string;
};
const options = program.opts<Options>();

const argsSchema = z.object({
  namespace: z.preprocess(
    (val) => String(val).split(","),
    z.tuple([z.string(), z.string()])
  ),
  input: z.string(),
  output: z.string(),
  template: z.string(),
});

type Args = z.infer<typeof argsSchema>;

try {
  const args = argsSchema.parse(options);

  main(args).catch((error) => console.error(error));
} catch (error) {
  console.error("Invalid arguments, use --help to se arguments format");
}
