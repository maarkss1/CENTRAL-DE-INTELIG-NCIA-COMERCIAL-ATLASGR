const fs = require('fs');

function replaceFile(filepath, searchValue, replaceValue) {
    if(fs.existsSync(filepath)) {
        let code = fs.readFileSync(filepath, 'utf8');
        code = code.replace(searchValue, replaceValue);
        fs.writeFileSync(filepath, code);
    }
}

// Ensure the routes are using AIPendingAction again because the previous step reverted the schema fix
replaceFile('src/features/intelligence/routes/intelligence.routes.ts', /aIPendingAction/g, "AIPendingAction");
