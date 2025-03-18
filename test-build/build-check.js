// Simple script to check if the project can be built
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

try {
  // Record start time
  const startTime = Date.now();
  
  // Change to project directory
  process.chdir(path.resolve(__dirname, '..'));
  
  // Run the build command
  console.log('Running build command...');
  const stdout = execSync('npm run build', { encoding: 'utf8' });
  
  // Check if dist directory exists and has files
  const distDir = path.resolve(__dirname, '../dist');
  if (fs.existsSync(distDir)) {
    const files = fs.readdirSync(distDir);
    console.log(`Build successful! Generated ${files.length} files in ${Date.now() - startTime}ms`);
    console.log('Generated files:', files);
  } else {
    throw new Error('Build completed but dist directory does not exist');
  }
  
  console.log('Build output:');
  console.log(stdout);
  
} catch (error) {
  console.error('Build failed:', error.message);
  if (error.stdout) console.error('STDOUT:', error.stdout.toString());
  if (error.stderr) console.error('STDERR:', error.stderr.toString());
  process.exit(1);
}
