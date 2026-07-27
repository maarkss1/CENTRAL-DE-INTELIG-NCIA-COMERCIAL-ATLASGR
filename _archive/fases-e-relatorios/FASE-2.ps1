#Requires -Version 5.1')) {
          extractedScripts.push(obj);
        }
      } else if (Array.isArray(obj)) {
        obj.forEach(searchObj);
      } else if (typeof obj === 'object' && obj !== null) {
        Object.values(obj).forEach(searchObj);
      }
    };
    searchObj(data);
  } catch (e) {}
});

console.log('Found strings with the script:', extractedScripts.length);

// Sort by length so we process the most complete accumulations first
extractedScripts.sort((a, b) => b.length - a.length);

let scriptCount = 0;
// We just need to extract ALL unique scripts.
// The string might contain one or multiple scripts.
const scriptSet = new Set();

extractedScripts.forEach(text => {
    const parts = text.split('
