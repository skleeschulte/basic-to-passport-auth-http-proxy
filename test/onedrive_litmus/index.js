const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { assert } = require('chai');

const fixturesDir = path.resolve(__dirname, 'fixtures');
const stdoutFixturePath = path.join(fixturesDir, 'stdout');
const stderrFixturePath = path.join(fixturesDir, 'stderr');

const cid = process.env.ONEDRIVE_CID;
const username = process.env.ONEDRIVE_USERNAME;
const password = process.env.ONEDRIVE_PASSWORD;

if (!cid || !username || !password) {
    throw new Error('To run the OneDrive litmus test, the environment variables ONEDRIVE_CID, ONEDRIVE_USERNAME and'
        + ' ONEDRIVE_PASSWORD must be set.');
}

const command = `docker run --link passport-proxy:proxy litmus http://proxy:3000/${cid}/ ${username} ${password}`;

function run(callback) {
    exec(command, (error, stdout, stderr) => {
        if (error) throw error;
        callback(stdout, stderr);
    });
}

if (process.argv[2] === '--write-fixtures') {
    run((stdout, stderr) => {
        fs.writeFileSync(stdoutFixturePath, stdout);
        fs.writeFileSync(stderrFixturePath, stderr);

        console.log('Fixtures written.');
    });
} else {
    describe('run litmus WebDAV test suite against the passport proxy with OneDrive as target', () => {
        it('should produce the expected results', function (done) {
            this.timeout(60 * 1000); // 60 seconds

            run((stdout, stderr) => {
                const stdoutFixture = fs.readFileSync(stdoutFixturePath, 'utf8');
                const stderrFixture = fs.readFileSync(stderrFixturePath, 'utf8');

                assert.strictEqual(stdout, stdoutFixture);
                assert.strictEqual(stderr, stderrFixture);

                done();
            });
        });
    });
}
