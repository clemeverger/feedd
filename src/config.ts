import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CONFIG_PATH = path.join(process.cwd(), 'feedd.config.json')

export interface Source {
  id: string
  url: string
  addedAt: string
  lastUpdated?: string
  status: 'pending' | 'crawling' | 'indexing' | 'ready' | 'error'
  docCount?: number
  maxDepth?: number
  maxPages?: number
}

export interface Config {
  sources: Source[]
}

const DEFAULT_CONFIG: Config = {
  sources: [],
}

export async function loadConfig(): Promise<Config> {
  try {
    const data = await fs.readFile(CONFIG_PATH, 'utf-8')
    return JSON.parse(data)
  } catch (error) {
    // Si le fichier n'existe pas, créer la config par défaut
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      await saveConfig(DEFAULT_CONFIG)
      return DEFAULT_CONFIG
    }
    throw error
  }
}

export async function saveConfig(config: Config): Promise<void> {
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8')
}

export async function addSource(url: string, options: Partial<Source> = {}): Promise<Source> {
  const config = await loadConfig()

  // Générer un ID depuis l'URL
  const id = generateIdFromUrl(url)

  // Vérifier si la source existe déjà
  if (config.sources.find((s) => s.id === id)) {
    throw new Error(`Source with ID "${id}" already exists`)
  }

  // Construire la source avec fallbacks hardcodés
  const source: Source = {
    id,
    url,
    addedAt: new Date().toISOString(),
    status: 'pending',
    maxDepth: options.maxDepth ?? 2,
    maxPages: options.maxPages ?? 100,
  }

  config.sources.push(source)
  await saveConfig(config)

  return source
}

export async function removeSource(id: string): Promise<void> {
  const config = await loadConfig()
  const index = config.sources.findIndex((s) => s.id === id)

  if (index === -1) {
    throw new Error(`Source with ID "${id}" not found`)
  }

  config.sources.splice(index, 1)
  await saveConfig(config)
}

export async function updateSource(id: string, updates: Partial<Source>): Promise<Source> {
  const config = await loadConfig()
  const source = config.sources.find((s) => s.id === id)

  if (!source) {
    throw new Error(`Source with ID "${id}" not found`)
  }

  Object.assign(source, updates)
  await saveConfig(config)

  return source
}

export async function getSource(id: string): Promise<Source | undefined> {
  const config = await loadConfig()
  return config.sources.find((s) => s.id === id)
}

export async function listSources(): Promise<Source[]> {
  const config = await loadConfig()
  return config.sources
}

function generateIdFromUrl(url: string): string {
  try {
    const parsed = new URL(url)
    // Utiliser le hostname + premier path segment
    const hostname = parsed.hostname.replace(/^www\./, '')
    const pathPart = parsed.pathname.split('/').filter(Boolean)[0] || ''
    const id = `${hostname.replace(/\./g, '-')}${pathPart ? '-' + pathPart : ''}`
    return id
  } catch {
    // Si l'URL est invalide, utiliser un hash simple
    return url.replace(/[^a-z0-9]/gi, '-').toLowerCase()
  }
}

