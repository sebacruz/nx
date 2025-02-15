import {
  convertNxGenerator,
  formatFiles,
  generateFiles,
  getWorkspaceLayout,
  joinPathFragments,
  names,
  offsetFromRoot,
  readProjectConfiguration,
  toJS,
  Tree,
  updateProjectConfiguration,
  updateTsConfigsToJs,
} from '@nrwl/devkit';

import { Schema } from './schema';
import { libraryGenerator as workspaceLibraryGenerator } from '@nrwl/workspace/generators';
import { join } from 'path';

export interface NormalizedSchema extends Schema {
  name: string;
  prefix: string;
  fileName: string;
  projectRoot: string;
  projectDirectory: string;
  parsedTags: string[];
}

export async function libraryGenerator(tree: Tree, schema: Schema) {
  const options = normalizeOptions(tree, schema);

  if (options.publishable === true && !schema.importPath) {
    throw new Error(
      `For publishable libs you have to provide a proper "--importPath" which needs to be a valid npm package name (e.g. my-awesome-lib or @myorg/my-lib)`
    );
  }

  const libraryInstall = await workspaceLibraryGenerator(tree, {
    ...schema,
    importPath: options.importPath,
  });
  createFiles(tree, options);

  if (options.js) {
    updateTsConfigsToJs(tree, options);
  }
  updateProject(tree, options);
  await formatFiles(tree);

  return libraryInstall;
}

export default libraryGenerator;
export const librarySchematic = convertNxGenerator(libraryGenerator);

function normalizeOptions(tree: Tree, options: Schema): NormalizedSchema {
  const { npmScope, libsDir } = getWorkspaceLayout(tree);
  const defaultPrefix = npmScope;
  const name = names(options.name).fileName;
  const projectDirectory = options.directory
    ? `${names(options.directory).fileName}/${name}`
    : name;

  const projectName = projectDirectory.replace(new RegExp('/', 'g'), '-');
  const fileName = projectName;
  const projectRoot = joinPathFragments(libsDir, projectDirectory);

  const parsedTags = options.tags
    ? options.tags.split(',').map((s) => s.trim())
    : [];

  const importPath =
    options.importPath || `@${defaultPrefix}/${projectDirectory}`;

  return {
    ...options,
    prefix: defaultPrefix, // we could also allow customizing this
    fileName,
    name: projectName,
    projectRoot,
    projectDirectory,
    parsedTags,
    importPath,
  };
}

function createFiles(tree: Tree, options: NormalizedSchema) {
  const nameFormats = names(options.name);
  return generateFiles(
    tree,
    join(__dirname, './files/lib'),
    options.projectRoot,
    {
      ...options,
      ...nameFormats,
      tmpl: '',
      offsetFromRoot: offsetFromRoot(options.projectRoot),
    }
  );

  if (options.unitTestRunner === 'none') {
    tree.delete(
      join(options.projectRoot, `./src/lib/${nameFormats.fileName}.spec.ts`)
    );
  }
  if (!options.publishable && !options.buildable) {
    tree.delete(join(options.projectRoot, 'package.json'));
  }
  if (options.js) {
    toJS(tree);
  }
}

function updateProject(tree: Tree, options: NormalizedSchema) {
  if (!options.publishable && !options.buildable) {
    return;
  }

  const project = readProjectConfiguration(tree, options.name);
  const { libsDir } = getWorkspaceLayout(tree);

  project.targets = project.targets || {};
  project.targets.build = {
    executor: '@nrwl/node:package',
    outputs: ['{options.outputPath}'],
    options: {
      outputPath: `dist/${libsDir}/${options.projectDirectory}`,
      tsConfig: `${options.projectRoot}/tsconfig.lib.json`,
      packageJson: `${options.projectRoot}/package.json`,
      main: `${options.projectRoot}/src/index` + (options.js ? '.js' : '.ts'),
      assets: [`${options.projectRoot}/*.md`],
    },
  };

  if (options.rootDir) {
    project.targets.build.options.srcRootForCompilationRoot = options.rootDir;
  }

  updateProjectConfiguration(tree, options.name, project);
}
