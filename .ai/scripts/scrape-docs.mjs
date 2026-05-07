#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const API_REF_DIR = path.join(ROOT, 'api-reference');
const GUIDES_DIR = path.join(ROOT, 'guides');
const CONTRIBUTED_DIR = path.join(GUIDES_DIR, 'contributed');

// Ensure directories exist
[API_REF_DIR, GUIDES_DIR, CONTRIBUTED_DIR].forEach(dir => {
  fs.mkdirSync(dir, { recursive: true });
});

// List of API sections with their HTML IDs (mapped from names to anchor IDs)
const API_SECTIONS = [
  // Global objects
  { name: 'Game', id: 'Game' },
  { name: 'Game.cpu', id: 'Game-cpu' },
  { name: 'Game.map', id: 'Game-map' },
  { name: 'Game.map.visual', id: 'Game-map-visual' },
  { name: 'Game.market', id: 'Game-market' },
  { name: 'Game.shard', id: 'Game-shard' },
  { name: 'InterShardMemory', id: 'InterShardMemory' },
  { name: 'Memory', id: 'Memory' },
  { name: 'PathFinder', id: 'PathFinder' },
  { name: 'RawMemory', id: 'RawMemory' },
  { name: 'Constants', id: 'Constants' },
  // Core prototypes
  { name: 'ConstructionSite', id: 'ConstructionSite' },
  { name: 'Creep', id: 'Creep' },
  { name: 'Deposit', id: 'Deposit' },
  { name: 'Flag', id: 'Flag' },
  { name: 'Mineral', id: 'Mineral' },
  { name: 'Nuke', id: 'Nuke' },
  { name: 'OwnedStructure', id: 'OwnedStructure' },
  { name: 'PathFinder.CostMatrix', id: 'PathFinder-CostMatrix' },
  { name: 'PowerCreep', id: 'PowerCreep' },
  { name: 'Resource', id: 'Resource' },
  { name: 'Room', id: 'Room' },
  { name: 'Room.Terrain', id: 'Room-Terrain' },
  { name: 'RoomObject', id: 'RoomObject' },
  { name: 'RoomPosition', id: 'RoomPosition' },
  { name: 'RoomVisual', id: 'RoomVisual' },
  { name: 'Ruin', id: 'Ruin' },
  { name: 'Source', id: 'Source' },
  { name: 'Store', id: 'Store' },
  { name: 'Structure', id: 'Structure' },
  { name: 'Tombstone', id: 'Tombstone' },
  // Structure subtypes
  { name: 'StructureContainer', id: 'StructureContainer' },
  { name: 'StructureController', id: 'StructureController' },
  { name: 'StructureExtension', id: 'StructureExtension' },
  { name: 'StructureExtractor', id: 'StructureExtractor' },
  { name: 'StructureFactory', id: 'StructureFactory' },
  { name: 'StructureInvaderCore', id: 'StructureInvaderCore' },
  { name: 'StructureKeeperLair', id: 'StructureKeeperLair' },
  { name: 'StructureLab', id: 'StructureLab' },
  { name: 'StructureLink', id: 'StructureLink' },
  { name: 'StructureNuker', id: 'StructureNuker' },
  { name: 'StructureObserver', id: 'StructureObserver' },
  { name: 'StructurePowerBank', id: 'StructurePowerBank' },
  { name: 'StructurePowerSpawn', id: 'StructurePowerSpawn' },
  { name: 'StructurePortal', id: 'StructurePortal' },
  { name: 'StructureRampart', id: 'StructureRampart' },
  { name: 'StructureRoad', id: 'StructureRoad' },
  { name: 'StructureSpawn', id: 'StructureSpawn' },
  { name: 'StructureSpawn.Spawning', id: 'StructureSpawn-Spawning' },
  { name: 'StructureStorage', id: 'StructureStorage' },
  { name: 'StructureTerminal', id: 'StructureTerminal' },
  { name: 'StructureTower', id: 'StructureTower' },
  { name: 'StructureWall', id: 'StructureWall' }
];

// Guide pages: [url_path, filename, category?]
const GUIDE_PAGES = [
  // Gameplay
  ['/introduction.html', 'introduction.md'],
  ['/creeps.html', 'creeps.md'],
  ['/control.html', 'control.md'],
  ['/defense.html', 'defense.md'],
  ['/respawn.html', 'respawn.md'],
  ['/start-areas.html', 'start-areas.md'],
  ['/resources.html', 'resources.md'],
  ['/market.html', 'market.md'],
  ['/invaders.html', 'invaders.md'],
  ['/power.html', 'power.md'],
  // Scripting
  ['/scripting-basics.html', 'scripting-basics.md'],
  ['/global-objects.html', 'global-objects.md'],
  ['/modules.html', 'modules.md'],
  ['/debugging.html', 'debugging.md'],
  ['/game-loop.html', 'game-loop.md'],
  ['/commit.html', 'commit.md'],
  ['/simultaneous-actions.html', 'simultaneous-actions.md'],
  ['/cpu-limit.html', 'cpu-limit.md'],
  // Other
  ['/architecture.html', 'architecture.md'],
  ['/auth-tokens.html', 'auth-tokens.md'],
  ['/third-party.html', 'third-party.md'],
  // Contributed
  ['/contributed/advanced_grunt.html', 'contributed/advanced_grunt.md'],
  ['/contributed/modifying-prototypes.html', 'contributed/modifying-prototypes.md'],
  ['/contributed/caching-overview.html', 'contributed/caching-overview.md'],
];

async function fetchPage(url) {
  console.log(`Fetching ${url}...`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

function htmlToMarkdown(html) {
  let md = html;

  // Remove script, style, nav, footer, header tags and content
  md = md.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  md = md.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  md = md.replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '');
  md = md.replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '');
  md = md.replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '');

  // Handle <pre><code> blocks first (preserve formatting)
  md = md.replace(/<pre[^>]*>\s*<code[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi, (match, content) => {
    const lang = match.includes('class="language-js') ? 'js' : 'js'; // default to js
    return `\n\`\`\`${lang}\n${decodeHtml(content.trim())}\n\`\`\`\n`;
  });

  // Handle <table>
  md = md.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (match) => {
    const rows = match.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
    if (rows.length === 0) return '';
    return rows.map((row, idx) => {
      const cells = row.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) || [];
      const content = cells.map(cell => {
        return cell.replace(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/i, '$1').trim().replace(/\n/g, ' ');
      }).join(' | ');
      const line = '| ' + content + ' |';
      if (idx === 0) return line + '\n' + '| ' + cells.map(() => '---').join(' | ') + ' |';
      return line;
    }).join('\n') + '\n';
  });

  // Handle <h1>-<h6>
  md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n');
  md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n');
  md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n');
  md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n');
  md = md.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '\n##### $1\n');
  md = md.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '\n###### $1\n');

  // Handle <strong> and <b>
  md = md.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**');
  md = md.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**');

  // Handle <em> and <i>
  md = md.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*');
  md = md.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*');

  // Handle <code> (inline)
  md = md.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');

  // Handle <a href>
  md = md.replace(/<a[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');

  // Handle <ul> and <ol>
  md = md.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (match) => {
    const items = match.match(/<li[^>]*>([\s\S]*?)<\/li>/gi) || [];
    return items.map(item => {
      const content = item.replace(/<li[^>]*>([\s\S]*?)<\/li>/i, '$1').trim();
      return '- ' + content;
    }).join('\n') + '\n';
  });

  md = md.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (match) => {
    const items = match.match(/<li[^>]*>([\s\S]*?)<\/li>/gi) || [];
    return items.map((item, idx) => {
      const content = item.replace(/<li[^>]*>([\s\S]*?)<\/li>/i, '$1').trim();
      return `${idx + 1}. ${content}`;
    }).join('\n') + '\n';
  });

  // Handle <br>
  md = md.replace(/<br\s*\/?>/gi, '\n');

  // Remove remaining HTML tags
  md = md.replace(/<[^>]+>/g, '');

  // Decode HTML entities
  md = decodeHtml(md);

  // Collapse multiple blank lines into double newlines
  md = md.replace(/\n\n\n+/g, '\n\n');

  // Trim each line and remove trailing whitespace
  md = md.split('\n').map(line => line.trim()).join('\n');

  return md.trim();
}

function decodeHtml(html) {
  const entities = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&nbsp;': ' ',
  };
  let result = html;
  for (const [entity, char] of Object.entries(entities)) {
    result = result.replace(new RegExp(entity, 'g'), char);
  }
  // Decode numeric entities
  result = result.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(parseInt(dec, 10)));
  result = result.replace(/&#x([0-9a-f]+);/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16)));
  return result;
}

function extractSectionFromHtml(fullHtml, sectionId) {
  // Look for <h1 id="SectionId"> ... up to the next <h1>
  const escapedId = sectionId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `<h1[^>]*id="${escapedId}"[^>]*>[\\s\\S]*?<\\/h1>([\\s\\S]*?)(?=<h1|$)`
  );

  const match = fullHtml.match(pattern);
  if (match && match[1]) {
    return match[1];
  }

  return '';
}

async function scrapeApiReference() {
  console.log('\n=== Scraping API Reference ===');
  const fullHtml = await fetchPage('https://docs.screeps.com/api/');

  for (const section of API_SECTIONS) {
    const sectionHtml = extractSectionFromHtml(fullHtml, section.id);
    if (!sectionHtml.trim()) {
      console.warn(`Warning: Could not extract section ${section.name}`);
      continue;
    }

    const markdown = htmlToMarkdown(sectionHtml);
    const filename = section.name.replace(/\./g, '.') + '.md'; // Game.cpu.md etc
    const filepath = path.join(API_REF_DIR, filename);
    fs.writeFileSync(filepath, markdown, 'utf8');
    console.log(`✓ ${filename} (${markdown.length} bytes)`);
  }

  // Generate README
  const readmeContent = `# Screeps API Reference

Quick index of all ${API_SECTIONS.length} documented classes and objects:

## Global Objects
- [Game](Game.md)
- [Game.cpu](Game.cpu.md)
- [Game.map](Game.map.md)
- [Game.map.visual](Game.map.visual.md)
- [Game.market](Game.market.md)
- [Game.shard](Game.shard.md)
- [InterShardMemory](InterShardMemory.md)
- [Memory](Memory.md)
- [PathFinder](PathFinder.md)
- [RawMemory](RawMemory.md)
- [Constants](Constants.md)

## Core Prototypes
- [ConstructionSite](ConstructionSite.md)
- [Creep](Creep.md)
- [Deposit](Deposit.md)
- [Flag](Flag.md)
- [Mineral](Mineral.md)
- [Nuke](Nuke.md)
- [OwnedStructure](OwnedStructure.md)
- [PathFinder.CostMatrix](PathFinder.CostMatrix.md)
- [PowerCreep](PowerCreep.md)
- [Resource](Resource.md)
- [Room](Room.md)
- [Room.Terrain](Room.Terrain.md)
- [RoomObject](RoomObject.md)
- [RoomPosition](RoomPosition.md)
- [RoomVisual](RoomVisual.md)
- [Ruin](Ruin.md)
- [Source](Source.md)
- [Store](Store.md)
- [Structure](Structure.md)
- [Tombstone](Tombstone.md)

## Structures
- [StructureContainer](StructureContainer.md)
- [StructureController](StructureController.md)
- [StructureExtension](StructureExtension.md)
- [StructureExtractor](StructureExtractor.md)
- [StructureFactory](StructureFactory.md)
- [StructureInvaderCore](StructureInvaderCore.md)
- [StructureKeeperLair](StructureKeeperLair.md)
- [StructureLab](StructureLab.md)
- [StructureLink](StructureLink.md)
- [StructureNuker](StructureNuker.md)
- [StructureObserver](StructureObserver.md)
- [StructurePowerBank](StructurePowerBank.md)
- [StructurePowerSpawn](StructurePowerSpawn.md)
- [StructurePortal](StructurePortal.md)
- [StructureRampart](StructureRampart.md)
- [StructureRoad](StructureRoad.md)
- [StructureSpawn](StructureSpawn.md)
- [StructureSpawn.Spawning](StructureSpawn.Spawning.md)
- [StructureStorage](StructureStorage.md)
- [StructureTerminal](StructureTerminal.md)
- [StructureTower](StructureTower.md)
- [StructureWall](StructureWall.md)

---

*Last updated: ${new Date().toISOString().split('T')[0]}*
`;
  fs.writeFileSync(path.join(API_REF_DIR, 'README.md'), readmeContent, 'utf8');
  console.log(`✓ README.md created`);
}

async function scrapeGuides() {
  console.log('\n=== Scraping Guides ===');

  for (const [urlPath, filename] of GUIDE_PAGES) {
    const url = `https://docs.screeps.com${urlPath}`;
    const html = await fetchPage(url);
    const markdown = htmlToMarkdown(html);
    const filepath = path.join(GUIDES_DIR, filename);

    // Ensure subdirectory exists
    fs.mkdirSync(path.dirname(filepath), { recursive: true });
    fs.writeFileSync(filepath, markdown, 'utf8');
    console.log(`✓ ${filename} (${markdown.length} bytes)`);
  }

  // Generate README
  const readmeContent = `# Screeps Guides

Complete guides covering gameplay, scripting, and other topics.

## Gameplay
- [Introduction](introduction.md)
- [Creeps](creeps.md)
- [Control](control.md)
- [Defense](defense.md)
- [Respawning](respawn.md)
- [Start Areas](start-areas.md)
- [Resources](resources.md)
- [Market](market.md)
- [NPC Invaders](invaders.md)
- [Power](power.md)

## Scripting
- [Scripting Basics](scripting-basics.md)
- [Global Objects](global-objects.md)
- [Modules](modules.md)
- [Debugging](debugging.md)
- [Game Loop](game-loop.md)
- [External Commit](commit.md)
- [Simultaneous Actions](simultaneous-actions.md)
- [CPU Limit](cpu-limit.md)

## Other
- [Server-Side Architecture](architecture.md)
- [Auth Tokens](auth-tokens.md)
- [Third Party Tools](third-party.md)

## Contributed Articles
- [Advanced Grunt Usage](contributed/advanced_grunt.md)
- [Modifying Prototypes](contributed/modifying-prototypes.md)
- [Caching Overview](contributed/caching-overview.md)

---

*Last updated: ${new Date().toISOString().split('T')[0]}*
`;
  fs.writeFileSync(path.join(GUIDES_DIR, 'README.md'), readmeContent, 'utf8');
  console.log(`✓ README.md created`);
}

async function main() {
  try {
    console.log('Starting Screeps docs scraper...\n');
    await scrapeApiReference();
    await scrapeGuides();
    console.log('\n✓ Done! Documentation saved to:');
    console.log(`  - ${API_REF_DIR}`);
    console.log(`  - ${GUIDES_DIR}`);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
