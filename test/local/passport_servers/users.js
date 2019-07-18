const userlist = [
    {
        username: 'user.a@localhost',
        password: 'secret_a',
        directory: '/a/',
        content: 'aaa',
    },
    {
        username: 'user.b@localhost',
        password: 'secret_b',
        directory: '/b/',
        content: 'bbb',
    },
];

function getUserdata(username) {
    return userlist.filter(userObj => userObj.username === username)[0];
}

function getContent(directory) {
    let content = '';
    for (let i = 0; i < userlist.length; i += 1) {
        if (userlist[i].directory === directory) {
            content = userlist[i].content; // eslint-disable-line prefer-destructuring
            break;
        }
    }
    return content;
}

module.exports = {
    userlist,
    getUserdata,
    getContent,
};
