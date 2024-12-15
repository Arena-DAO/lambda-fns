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

# Package individual functions
package-discord-identity: create-zip-dir
    cd dist/discord-identity && zip -r ../zip/discord-identity.zip index.js*

package-auth-login: create-zip-dir
    cd dist/auth-login && zip -r ../zip/auth-login.zip index.js*

package-auth-callback: create-zip-dir
    cd dist/auth-callback && zip -r ../zip/auth-callback.zip index.js*
# Package all functions
package: build
    just package-discord-identity
    just package-auth-login
    just package-auth-callback

# Test the Lambda locally
test function:
    node dist/{{function}}.js
