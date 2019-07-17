const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

const fixturesDir = path.resolve(__dirname, 'fixtures');
const stdoutFixturePath = path.join(fixturesDir, 'stdout');
const stderrFixturePath = path.join(fixturesDir, 'stderr');

console.log('SPECIAL_CHAR_TEST', process.env.SPECIAL_CHAR_TEST);

const cid = process.env.ONEDRIVE_CID;
const username = process.env.ONEDRIVE_USERNAME;
const password = process.env.ONEDRIVE_PASSWORD;

if (!cid || !username || !password) {
    throw new Error('To run the OneDrive litmus test, the environment variables ONEDRIVE_CID, ONEDRIVE_USERNAME and'
        + ' ONEDRIVE_PASSWORD must be set.');
}

const command = `docker run --link passport-proxy:proxy litmus http://proxy:3000/${cid}/ ${username} ${password}`;

exec(command, (error, stdout, stderr) => {
    if (process.argv[2] === '--write-fixtures') {
        fs.writeFileSync(stdoutFixturePath, stdout);
        fs.writeFileSync(stderrFixturePath, stderr);

        console.log('Fixtures written.');
    } else {
        const stdoutFixture = fs.readFileSync(stdoutFixturePath, 'utf8');
        const stderrFixture = fs.readFileSync(stderrFixturePath, 'utf8');

        assert.strictEqual(stdout, stdoutFixture);
        assert.strictEqual(stderr, stderrFixture);

        console.log('OneDrive litmus test passed.');
    }
});
