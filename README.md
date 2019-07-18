# basic-to-passport-auth-http-proxy

[![Build Status](https://travis-ci.org/skleeschulte/basic-to-passport-auth-http-proxy.svg?branch=master)](https://travis-ci.org/skleeschulte/basic-to-passport-auth-http-proxy)

HTTP proxy server that can access resources which use the Passport SSI Version 1.4 Protocol for authorization with
credentials supplied by Basic HTTP authentication.

In other words: If you want to access an HTTP service that uses Passport SSI Version 1.4 for authorization, but your
preferred client only knows how to handle HTTP Basic authentication, then this proxy is for you.

This proxy was primarily built to access Microsoft OneDrive over WebDAV with WebDAV clients that can only do HTTP Basic
authentication.

## Running the proxy

The proxy server is written in Node.js. You can either run the Docker container or run it directly with node.

Options are set with environment variables:

- `PROXY_TARGET` *required* The proxy target URL, e.g.: `https://d.docs.live.net/`
- `PROXY_PORT` *optional* The port where the proxy listens for client requests. Defaults to `3000`.
- `DEBUG` *optional* See below.

### Running with Docker

- Find the latest Docker image tag at Docker Hub:  
  https://hub.docker.com/r/skleeschulte/basic-to-passport-auth-http-proxy
- Pull the image:  
  `docker pull skleeschulte/basic-to-passport-auth-http-proxy:TAG`  
  (Replace TAG with an actual tag from the Docker Hub.)
- Run the image:  
  `docker run --name passport-proxy -d -p 3000:3000 -e PROXY_TARGET=https://d.docs.live.net/ --restart always skleeschulte/basic-to-passport-auth-http-proxy:TAG`  
  (Again, replace TAG with the one you just pulled.)
- Check if it started successfully:  
  `docker logs passport-proxy`  
  (The output should be something like `proxy:info Proxy server listening: { address: '::', family: 'IPv6', port: 3000 }`.)

Or use your favourite Docker UI for these steps.

### Running with Node.js

Make sure you have a suitable Node.js installed (the proxy server was developed with Node.js version 10 (version
10.16.0, to be precise).

- Get a copy of this repository (choose a version tag on the top left, then choose "Clone or download" in the same
  line).
- Extract the files and change to the directory.
- Install the dependencies:  
  `npm ci --only=production`
- Set the environment variables (see above).  
  On Linux: `export PROXY_TARGET=https://d.docs.live.net/`  
  On Windows: `set PROXY_TARGET=https://d.docs.live.net/`
- Run the server:  
  `node lib/server.js`

## Usage

In your client software, configure hostname and port of the proxy server. If you can choose an authentication scheme,
choose HTTP Basic auth. You should be prompted for username and password.

### Accessing OneDrive

For OneDrive WebDAV access, the proxy server has to be configured with `PROXY_TARGET=https://d.docs.live.net/` as
mentioned above. In addition to the OneDrive username (= email address) and password, you also need your OneDrive CID
number. Find it in your browser's address bar when logged in to OneDrive, in Windows' Credential Manager when using the
Windows OneDrive client (here, the CID is named *User name*), or feed your favorite search engine with "onedrive cid" to
find more detailed instructions. The CID number is case insensitive.

If two-step verification is enabled for the OneDrive account, an app password needs to be generated and used instead of
the regular password.

Configure your client with the CID number appended to the proxy host, e.g.:  
`http://localhost:3000/CID_NUMBER`  
Depending on the client you might have to omit the `http://` part or append a trailing slash.

### Further instructions 

- [Backup to Microsoft OneDrive with Synology’s Hyper Backup](https://rays-blog.de/2019/07/17/310/backup-to-microsoft-onedrive-with-synologys-hyper-backup/)

## Security

Currently, the proxy only supports HTTP connections on the incoming side. In consequence, user credentials will be
transferred from the client to the proxy in clear-text for the majority of HTTP requests. The proxy should only be used
on trusted networks, e.g. localhost.

The proxy caches Passport authentication tokens in memory, but protects these with the same credentials used to sign-in
to Passport. It is safe to have multiple users access their resources over the same server instance in parallel.

## Logging / Debugging

The server uses the [debug](https://www.npmjs.com/package/debug) library for logging with the namespace `proxy` and the
following log levels:

- `proxy:error` *(logs to STDERR)* Log errors.
- `proxy:info` *(logs to STDOUT)* Log listening address and port.
- `proxy:debug` *(logs to STDOUT)* Log detailed information about request handling.
- `proxy:trace` *(logs to STDOUT)* Log the raw HTTP messages. This prints sensible authorization information to STDOUT.

By default, only `proxy:error` and `proxy:info` are enabled. This can be changed with the `DEBUG` environment variable.
To log everything from the proxy server use `DEBUG=proxy:*`, to log everything including messages from third party
libraries that also use the debug library use `DEBUG=*`.

## Tests

basic-to-passport-auth-http-proxy successfully completes 16 out of 18 tests of the litmus WebDAV test suite when
proxying to OneDrive. Two tests fail because the OneDrive WebDAV API does not comply with the specifications litmus
tests (see [test/onedrive_litmus/README.md](test/onedrive_litmus/README.md) for details).

In addition the proxy server is tested with local mock Passport servers.
