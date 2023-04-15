# Scaffold Fixer
A simple tool to make Entity Framework scaffold output a little bit nicer

## What it does?
- Removes `virtual` from entity classes
- Removes the connection string from the DbContext
- Moves table configurations from DbContext to configuration classes that implements `IEntityTypeConfiguration`
- Changes the namespace to a specified one

## Use it
Steps:
- Clone the repo
- Install dependencies with a node package manager (I suggest [pnpm](https://pnpm.io/))
```
pnpm install
```
- Build the project
```
pnpm build
```
- See the available arguments with
```
pnpm start --help
```

## Assumptions
This script assumes:
- That the input files uses 4 spaces tabulation
- That inside the input path is present the `DbContext` file and the `Entities` folder
- The `DbContext` file name ends with `Context.cs`

The script does not copy other files from the input to the output folder, only the `DbContext` and the files inside the `Entities` folder

## TODO
- Make the rename of namespace optional
- Make the code less ugly
- Switch to TypeScript
- Make a npm executable (use the `bin` field of `package.json` as described [here](https://docs.npmjs.com/cli/v9/configuring-npm/package-json#bin))
