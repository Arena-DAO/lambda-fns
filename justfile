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
package-auth-login: create-zip-dir
    cd dist/auth-login && zip -r ../zip/auth-login.zip index.js*

package-auth-callback: create-zip-dir
    cd dist/auth-callback && zip -r ../zip/auth-callback.zip index.js*
# Package all functions
package: build
    just package-auth-login
    just package-auth-callback
