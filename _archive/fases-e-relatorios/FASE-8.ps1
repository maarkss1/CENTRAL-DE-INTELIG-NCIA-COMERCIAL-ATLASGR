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

if (extractedScripts.length > 0) {
    // Usually the prompt is accumulated, so the last one is the largest.
    // Let's sort by length and take the longest one.
    extractedScripts.sort((a, b) => b.length - a.length);
    const contentToParse = extractedScripts[0];
    
    const parts = contentToParse.split('
