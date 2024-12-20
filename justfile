endpoints := "auth-login auth-callback auth-logout"

# Install dependencies for the project
install:
    yarn install

# Build the Lambda functions
build:
    yarn build

# Clean the output directory
clean:
    rm -rf dist/

# Create zip directory
create-zip-dir:
    mkdir -p dist/zip

# Package a single function
package-fn fn:
    cd dist/{{fn}} && zip -r ../zip/{{fn}}.zip index.js*

# Package all functions
package: build
    for fn in {{endpoints}}; do just package-fn ${fn}; done