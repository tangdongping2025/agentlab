import fs from 'fs';
import path from 'path';

const distElectron = 'dist-electron';

if (fs.existsSync(path.join(distElectron, 'main.cjs'))) {
  fs.copyFileSync(path.join(distElectron, 'main.cjs'), path.join(distElectron, 'main.js'));
  console.log('✓ main.cjs -> main.js');
}

if (fs.existsSync(path.join(distElectron, 'preload.cjs'))) {
  fs.copyFileSync(path.join(distElectron, 'preload.cjs'), path.join(distElectron, 'preload.js'));
  console.log('✓ preload.cjs -> preload.js');
}
