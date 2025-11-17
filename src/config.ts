import fs from 'fs/promises';
import path from 'path';
import { generateRepoId } from './git/index.js';

const CONFIG_PATH = path.join(process.cwd(), 'feedd.config.json');

export interface Source {
  id: string;
  owner: string;
  repo: string;
  branch: string;
  addedAt: string;
  lastUpdated?: string;
  status: 'pending' | 'indexing' | 'ready' | 'error';
  docCount?: number;
}

export interface Config {
  sources: Source[];
  embeddings: {
    model: string;
    dimensions: number;
  };
}

const DEFAULT_CONFIG: Config = {
  sources: [],
  embeddings: {
    model: 'mxbai-embed-large',
    dimensions: 1024
  }
};

export async function loadConfig(): Promise<Config> {
  try {
    const data = await fs.readFile(CONFIG_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    // If config doesn't exist, create default
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      await saveConfig(DEFAULT_CONFIG);
      return DEFAULT_CONFIG;
    }
    throw error;
  }
}

export async function saveConfig(config: Config): Promise<void> {
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

export async function addSource(
  owner: string,
  repo: string,
  branch: string,
  options: Partial<Source> = {}
): Promise<Source> {
  const config = await loadConfig();
  const id = generateRepoId(owner, repo, branch);

  // Check if source already exists
  if (config.sources.find((s) => s.id === id)) {
    throw new Error(`Repository ${owner}/${repo}@${branch} is already indexed`);
  }

  const source: Source = {
    id,
    owner,
    repo,
    branch,
    addedAt: new Date().toISOString(),
    status: 'pending',
    ...options
  };

  config.sources.push(source);
  await saveConfig(config);

  return source;
}

export async function removeSource(id: string): Promise<void> {
  const config = await loadConfig();
  const index = config.sources.findIndex((s) => s.id === id);

  if (index === -1) {
    throw new Error(`Source with ID "${id}" not found`);
  }

  config.sources.splice(index, 1);
  await saveConfig(config);
}

export async function updateSource(id: string, updates: Partial<Source>): Promise<Source> {
  const config = await loadConfig();
  const source = config.sources.find((s) => s.id === id);

  if (!source) {
    throw new Error(`Source with ID "${id}" not found`);
  }

  Object.assign(source, updates);
  await saveConfig(config);

  return source;
}

export async function getSource(id: string): Promise<Source | undefined> {
  const config = await loadConfig();
  return config.sources.find((s) => s.id === id);
}

export async function getSourceByRepo(
  owner: string,
  repo: string,
  branch?: string
): Promise<Source[]> {
  const config = await loadConfig();
  return config.sources.filter(
    (s) => s.owner === owner && s.repo === repo && (!branch || s.branch === branch)
  );
}

export async function listSources(): Promise<Source[]> {
  const config = await loadConfig();
  return config.sources;
}

/**
 * Group sources by repository (combining different branches)
 */
export async function listRepos(): Promise<
  Array<{
    owner: string;
    repo: string;
    branches: Array<{ branch: string; docCount: number; lastUpdated?: string }>;
  }>
> {
  const sources = await listSources();
  const repoMap = new Map<string, any>();

  for (const source of sources) {
    const key = `${source.owner}/${source.repo}`;

    if (!repoMap.has(key)) {
      repoMap.set(key, {
        owner: source.owner,
        repo: source.repo,
        branches: []
      });
    }

    repoMap.get(key).branches.push({
      branch: source.branch,
      docCount: source.docCount || 0,
      lastUpdated: source.lastUpdated
    });
  }

  return Array.from(repoMap.values());
}
