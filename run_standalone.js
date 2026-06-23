const fs = require('fs');
const path = require('path');

// 1. Load and parse .env.local
const envPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    line = line.trim();
    if (line && !line.startsWith('#')) {
      const eqIdx = line.indexOf('=');
      if (eqIdx > 0) {
        const key = line.substring(0, eqIdx).trim();
        let val = line.substring(eqIdx + 1).trim();
        // Remove surrounding quotes if present
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.substring(1, val.length - 1);
        }
        process.env[key] = val;
      }
    }
  });
  console.log('.env.local environment variables loaded.');
} else {
  console.log('No .env.local found.');
}

// 2. Set default server variables
process.env.PORT = process.env.PORT || '3001';
process.env.HOSTNAME = process.env.HOSTNAME || '0.0.0.0';

console.log(`Starting Next.js standalone server on http://${process.env.HOSTNAME}:${process.env.PORT}...`);

// 3. Import and execute the Next.js standalone server
require('./.next/standalone/server.js');
