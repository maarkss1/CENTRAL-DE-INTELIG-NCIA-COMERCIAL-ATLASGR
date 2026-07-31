const fs = require('fs');

let content = fs.readFileSync('src/features/intelligence/services/DeepResearchService.ts', 'utf8');

content = content.replace(/catch \(_err: unknown\) \{/g, 'catch (err: unknown) {');
content = content.replace(/catch \(_err\) \{/g, 'catch (err) {');

fs.writeFileSync('src/features/intelligence/services/DeepResearchService.ts', content);
