import { PlaywrightCrawler } from 'crawlee';
import TurndownService from 'turndown';
import fs from 'fs/promises';
import path from 'path';
import type { Source } from '../config.js';

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
});

// Améliorer la conversion pour conserver plus de structure
turndown.addRule('removeScripts', {
  filter: ['script', 'style', 'noscript'],
  replacement: () => ''
});

export async function crawl(source: Source): Promise<number> {
  const outputDir = path.join(process.cwd(), 'data', 'raw', source.id);
  await fs.mkdir(outputDir, { recursive: true });

  let pageCount = 0;
  const startUrl = source.url;

  const crawler = new PlaywrightCrawler({
    maxRequestsPerCrawl: source.maxPages || 100,
    maxConcurrency: 1, // Politeness: 1 requête à la fois
    minConcurrency: 1,
    maxRequestRetries: 3,
    requestHandlerTimeoutSecs: 30,

    launchContext: {
      launchOptions: {
        headless: true,
      },
    },

    async requestHandler({ page, request, enqueueLinks, log }) {
      try {
        // Bloquer les ressources inutiles pour accélérer
        await page.route('**/*.{png,jpg,jpeg,gif,svg,woff,woff2,mp4,webp,ico,css}',
          route => route.abort()
        );

        // Attendre que le contenu principal soit chargé
        await page.waitForLoadState('domcontentloaded');

        // Extraire le contenu principal
        const content = await page.evaluate(() => {
          // Supprimer les éléments inutiles
          const toRemove = document.querySelectorAll(
            'nav, header, footer, aside, [role="navigation"], [role="banner"], [role="contentinfo"], .sidebar, .header, .footer, .navigation'
          );
          toRemove.forEach(el => el.remove());

          // Chercher le contenu principal avec plusieurs stratégies
          const main =
            document.querySelector('main') ||
            document.querySelector('article') ||
            document.querySelector('[role="main"]') ||
            document.querySelector('.content') ||
            document.querySelector('.docs-content') ||
            document.querySelector('.documentation') ||
            document.querySelector('#content') ||
            document.body;

          return {
            html: main?.innerHTML || '',
            title: document.title,
            url: window.location.href,
            h1: document.querySelector('h1')?.textContent || document.title
          };
        });

        // Convertir HTML → Markdown
        const markdown = turndown.turndown(content.html);

        // Créer le frontmatter avec metadata
        const frontmatter = `---
title: ${content.title.replace(/:/g, '-')}
url: ${content.url}
h1: ${content.h1.replace(/:/g, '-')}
crawled_at: ${new Date().toISOString()}
source_id: ${source.id}
---

`;

        const fullMarkdown = frontmatter + markdown;

        // Sauvegarder le fichier
        const filename = urlToFilename(request.url);
        const filepath = path.join(outputDir, filename);

        // Créer les sous-dossiers si nécessaire
        const dir = path.dirname(filepath);
        await fs.mkdir(dir, { recursive: true });

        await fs.writeFile(filepath, fullMarkdown, 'utf-8');

        pageCount++;

        // Enqueuer les liens pour continuer le crawl
        const currentDepth = (request.userData.depth as number) || 0;
        if (currentDepth < (source.maxDepth || 2)) {
          // Normaliser l'URL de base (enlever le / final pour cohérence)
          const normalizedBaseUrl = source.url.replace(/\/$/, '');

          await enqueueLinks({
            // Filtrage natif par pattern d'URL
            globs: [
              normalizedBaseUrl,           // L'URL exacte de base
              `${normalizedBaseUrl}/**`    // Tout sous cette URL
            ],

            // Transformer les URLs avant de les enqueuer
            transformRequestFunction: (req) => {
              // Enlever les ancres et query params inutiles
              const url = new URL(req.url);
              url.hash = '';
              url.searchParams.delete('ref');
              url.searchParams.delete('utm_source');
              url.searchParams.delete('utm_medium');
              url.searchParams.delete('utm_campaign');
              req.url = url.toString();

              // Passer la profondeur
              req.userData = {
                depth: currentDepth + 1
              };

              return req;
            }
          });
        }

      } catch (error: any) {
        log.error(`Error processing ${request.url}:`, error.message);
      }
    },

    failedRequestHandler({ request, log }) {
      log.error(`Failed to crawl: ${request.url}`);
    },
  });

  // Lancer le crawl
  await crawler.run([{
    url: startUrl,
    userData: { depth: 0 }
  }]);

  return pageCount;
}

function urlToFilename(url: string): string {
  try {
    const parsed = new URL(url);
    let filename = parsed.pathname
      .replace(/^\//, '')
      .replace(/\//g, '_')
      .replace(/\.html?$/, '');

    // Si pas de filename ou juste '_', utiliser 'index'
    if (!filename || filename === '_') {
      filename = 'index';
    }

    // Limiter la longueur du filename
    if (filename.length > 200) {
      filename = filename.substring(0, 200);
    }

    return `${filename}.md`;
  } catch {
    // Fallback en cas d'URL invalide
    return 'page.md';
  }
}
