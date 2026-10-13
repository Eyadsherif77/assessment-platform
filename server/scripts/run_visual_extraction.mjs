import { VisualAssetExtractor } from '../dist/services/ai/visualAssetExtractor.js';

async function main() {
  console.log('Resetting and extracting priority visual assets offline from authentic PDFs...');
  VisualAssetExtractor.saveManifest({
    version: '1.0.0',
    last_updated: new Date().toISOString(),
    total_assets: 0,
    assets: []
  });
  const result = await VisualAssetExtractor.extractPriorityAssets();
  console.log('Result:', result);
  const manifest = VisualAssetExtractor.loadManifest();
  console.log(`Manifest contains ${manifest.total_assets} visual assets:`);
  manifest.assets.forEach(a => {
    console.log(` - [${a.asset_type}] Book ${a.book_id.slice(0, 8)} p.${a.printed_page_number}: ${a.url_path} (${a.file_size} bytes)`);
  });
}

main().catch(console.error);
