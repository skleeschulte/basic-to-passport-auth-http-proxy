# OneDrive litmus test

This is an end-to-end test that runs the [litmus WebDAV test suite](https://github.com/tolsen/litmus) against
basic-to-passport-auth-http-proxy connected to OneDrive.

To run the test, OneDrive credentials must be supplied to index.js in the environment variables `ONEDRIVE_CID`,
`ONEDRIVE_USERNAME` and `ONEDRIVE_PASSWORD`. In addition, a Docker proxy container named `passport-proxy` and configured
for OneDrive must be running and the litmus Docker image built and tagged `litmus`. See .travis.yml file for details.

**litmus deletes and then creates a folder named litmus in the root of the WebDAV resource (OneDrive).**

At the time of writing, test 8 outputs a warning:

     8. delete_fragment....... WARNING: DELETE removed collection resource with Request-URI including fragment; unsafe
        ...................... pass (with 1 warning)

This is due to a limitation in Node.js' native http(s) modules that are used by the proxy: They strip off the fragment
(= hash) part of the request url.

Tests 13 and 14 fail:

    13. mkcol_no_parent....... FAIL (MKCOL with missing intermediate succeeds)
    14. mkcol_with_body....... FAIL (MKCOL with weird body must fail (RFC2518:8.3.1))

This is because the OneDrive WebDAV API is more tolerant than the specification allows.
