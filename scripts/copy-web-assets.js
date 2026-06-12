// =============================================
// Copy web assets to Capacitor webDir
// Used by: npm run update:web (inside capacitor/)
// =============================================

const fs = require('fs');
const path = require('path');

const srcDir = path.resolve(__dirname, '..', 'public');
const destDir = path.resolve(__dirname, '..', 'build');

console.log('[copy-web-assets] Copying web assets...');
console.log('  From:', srcDir);
console.log('  To:  ', destDir);

// Ensure dest exists
fs.mkdirSync(destDir, { recursive: true });

// Copy all files
function copyRecursive(src, dest) {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copyRecursive(srcDir, destDir);

console.log('[copy-web-assets] Done!');
