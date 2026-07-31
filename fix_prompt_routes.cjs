const fs = require('fs');

function regexReplaceInFile(filePath, regex, replace) {
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf8');
    content = content.replace(regex, replace);
    fs.writeFileSync(filePath, content);
}

regexReplaceInFile('src/features/intelligence/routes/prompt.routes.ts', /z\.record\(z\.unknown\(\)\)/g, 'z.record(z.string(), z.unknown())');

// DeepResearchService(112,89): Cannot find name 'err'. Did you mean '_err'?
regexReplaceInFile('src/features/intelligence/services/DeepResearchService.ts', /\{\s*err\s*\}/g, '{ err: _err }');
// Let's just fix it generally by replacing 'err' with '(err || _err)' or replacing catch (_err) with catch (err) if we can.
