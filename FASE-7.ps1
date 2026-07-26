#Requires -Version 5.1`, the script is embedded with literal \n instead of newlines if it's stringified!
  
  // So instead, let's just iterate over JSON lines and stringify them to see where the script is.
}

let extractedScripts = [];
fileContent.split('\n').forEach(line => {
  try {
    const data = JSON.parse(line);
    // Recursively search for the script in the JSON
    const searchObj = (obj) => {
      if (typeof obj === 'string') {
        if (obj.includes('
