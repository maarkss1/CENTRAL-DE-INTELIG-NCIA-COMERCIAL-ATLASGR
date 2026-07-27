#Requires -Version 5.1' + parts[2];
    fs.writeFileSync('C:\\Users\\Mah\\Documents\\GitHub\\PROSPECTOR-ATLAS\\FASE-10-APPLICATION.ps1', script1);
    fs.writeFileSync('C:\\Users\\Mah\\Documents\\GitHub\\PROSPECTOR-ATLAS\\FASE-11-INFRASTRUCTURE.ps1', script2);
    console.log('Extracted scripts successfully.');
  } else {
    console.log('Found ' + parts.length + ' parts, expected at least 3.');
  }
});
