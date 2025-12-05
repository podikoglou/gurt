#!/bin/bash

# Clean up any existing files
rm -f ./dist/cli.js ./dist/cli-temp.js

# Build the CLI without source map for cleaner output
bun build ./src/index.ts --outfile ./dist/cli-temp.js --target node --minify

# Remove the existing shebang from the built file if present
sed '1{/^#!/d;}' ./dist/cli-temp.js > ./dist/cli-temp-clean.js

# Add node shebang to the beginning
echo '#!/usr/bin/env node' > ./dist/cli.js
cat ./dist/cli-temp-clean.js >> ./dist/cli.js

# Clean up and make executable
rm ./dist/cli-temp.js ./dist/cli-temp-clean.js
chmod +x ./dist/cli.js

echo "CLI built successfully: ./dist/cli.js"