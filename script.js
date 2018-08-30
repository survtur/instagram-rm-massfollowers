const DELAY_BETWEEN_REQUESTS = 1000;
const DELAY_AFTER_BLOCK = 60 * 1000;
const REQUESTS_TIMEOUT = 5000;

const usersToTest = [];
const userId = window.__initialData.data.entry_data.ProfilePage[0].graphql.user.id;

let end_cursor = '';
let hasNextPage = true;
let removedCounter = 0;
let checkedCounter = 0;

/**
Use like this:

Promise.resolve()
    .then(() => timeoutPromise(100))
    .then(action)

*/
function timeoutPromise(ms) {
    if (ms > 5000) {
        return timeoutPromiseLarge(ms);
    } else {
        return new Promise((resolve) => {setTimeout(resolve, ms)});
    }

}

function checkForStopPressed() {
    if (stop.stop) {
        throw new Error('Остановлено вручную');
    }
}

function timeoutPromiseLarge(ms) {
    // noinspection JSUnusedLocalSymbols
    return new Promise((resolve, reject) => {
        let secondsLeft = Math.ceil(ms / 1000);
        function timerTick() {
            secondsLeft -= 1;
            for (let el of document.getElementsByClassName('timerCounter')) {
                el.textContent = `${secondsLeft}`;
            }

            checkForStopPressed();

            if (secondsLeft <= 0) {
                clearInterval(intervalId);
                resolve();
            }
        }
        const intervalId = setInterval(timerTick, 1000);

    });
}


function httpGetAsync(url) {

    return new Promise(function(resolve, reject) {
        const xmlHttp = new XMLHttpRequest();
        xmlHttp.timeout = REQUESTS_TIMEOUT;
        xmlHttp.onreadystatechange = function() {
            if (xmlHttp.readyState === 4) {
                if (xmlHttp.status === 200) {
                    resolve(xmlHttp.responseText);
                } else {
                    reject('Не получилось');
                }
            }
        };
        xmlHttp.open('GET', url, true); // true for asynchronous
        xmlHttp.send(null);
    })
}


function httpPostAsync(url) {
    return new Promise(function(resolve, reject) {
        const xmlHttp = new XMLHttpRequest();
        xmlHttp.timeout = REQUESTS_TIMEOUT;
        xmlHttp.onreadystatechange = function() {
            if (xmlHttp.readyState === 4) {
                if (xmlHttp.status === 200) {
                    resolve(xmlHttp.responseText);
                } else {
                    reject('Не получилось');
                }
            }
        };
        xmlHttp.open('POST', url, true); // true for asynchronous
        xmlHttp.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        xmlHttp.setRequestHeader('X-CSRFToken', window.__initialData.data.config.csrf_token);
        xmlHttp.send("");
    });
}


function getMoreFollowers() {
    status('Подзагрузка данных о фолловерах');
    if (!hasNextPage) {
        throw new Error(`Всех посмотрели, кроме ${usersToTest}. Его надо проверить самостоятельно.`);
    }
    let getFollowersUrl;
    if (end_cursor === '') {
        getFollowersUrl = `https://www.instagram.com/graphql/query/?query_hash=56066f031e6239f35a904ac20c9f37d9&variables={"id":"${userId}","include_reel":true,"fetch_mutual":false,"first":24}`
    } else {
        getFollowersUrl = `https://www.instagram.com/graphql/query/?query_hash=56066f031e6239f35a904ac20c9f37d9&variables={"id":"${userId}","include_reel":true,"fetch_mutual":false,"first":24,"after":"${end_cursor}"}`
    }
    return httpGetAsync(getFollowersUrl)
        .then(updateFollowersFromData)
        .then(() => timeoutPromise(DELAY_BETWEEN_REQUESTS));
}


function updateFollowersFromData(txt) {
    const d = JSON.parse(txt);
    if (d.status !== 'ok') {
        throw new Error('Not OK!');
    }
    const followedBy = d.data.user.edge_followed_by.edges.map(n => n.node);
    hasNextPage = d.data.user.edge_followed_by.page_info.has_next_page;
    end_cursor = d.data.user.edge_followed_by.page_info.end_cursor;
    usersToTest.push(...followedBy)

}


function testOneUser() {
    checkForStopPressed();
    checkedCounter += 1;
    const user = usersToTest.shift();
    const userName = user.username;
    progress(`Подписчик #${checkedCounter}: ${userName}`);
    status('Загрузка данных о пользователе');
    console.log(`Проверяем пользователя #${checkedCounter} ${userName}`);
    return httpGetAsync(`https://www.instagram.com/${userName}/?__a=1`)
        .then(processFollowerInfo)
        .then(() => timeoutPromise(DELAY_BETWEEN_REQUESTS));
}

function userFromText(txt) {
    const d = JSON.parse(txt);
    const userName = d.graphql.user.username;
    const full_name = d.graphql.user.full_name;
    const userId = d.graphql.user.id;
    const followsCount = d.graphql.user.edge_follow.count;
    const followedByCount = d.graphql.user.edge_followed_by.count;
    const postsCount = d.graphql.user.edge_owner_to_timeline_media.count;
    const followed_by_viewer = d.graphql.user.followed_by_viewer;

    return {
        userName,
        userId,
        followsCount,
        followedByCount,
        postsCount,
        followed_by_viewer,
        full_name,
    }

}

function processFollowerInfo(txt) {
    const user = userFromText(txt);
    const blockThreshold = Number(document.getElementById('blockThreshold').value);
    const defollowThreshold = Number(document.getElementById('defollowThreshold').value);
    console.log(`У ${user.userName} подписок: ${user.followsCount}, постов: ${user.postsCount}`);

    if (user.followed_by_viewer) {
        status(`Вы фолловите ${user.userName}`);
        return;
    }

    if (user.full_name.indexOf('�%@') !== -1) {
        return blockUser(user, `имя как у бота: ${user.full_name}`);
    }

    if (user.followsCount > blockThreshold) {
        return blockUser(user, `подписок: ${user.followsCount}`);
    }

    if (user.followsCount > defollowThreshold) {
        return makeHimUnfollow(user, `подписок: ${user.followsCount}`);
    }

}


function makeHimUnfollow(user, reason) {

    let text = `Удаляем из подписчиков @${user.userName} — ${user.full_name} (id: ${user.userId})`;
    if (reason) {
        text = `${text} — ${reason}`;
    }
    status(text);

    const blockUrl = `https://www.instagram.com/web/friendships/${user.userId}/block/`;
    const unblockUrl = `https://www.instagram.com/web/friendships/${user.userId}/unblock/`;
    return httpPostAsync(blockUrl)
        .then(checkIsPostOk)
        .then(() => {timeoutPromise(DELAY_BETWEEN_REQUESTS);})
        .then(() => httpPostAsync(unblockUrl))
        .then(checkIsPostOk)
        .then(() => {
            let string = `${removedCounter} ${user.userName} — отписан`;
            if (reason) {
                string = `${string} — ${reason}`;
            }
            addRemovedUser(string);
            status(`Задержка после удаления <span class="timerCounter">${DELAY_AFTER_BLOCK / 1000}</span> сек...`, true);
        })
        .then(() => timeoutPromise(DELAY_AFTER_BLOCK));
}

function blockUser(user, reason) {

    let text = `Блокируем @${user.userName} — ${user.full_name} (id: ${user.userId})`;
    status(text);

    const url = `https://www.instagram.com/web/friendships/${user.userId}/block/`;
    return httpPostAsync(url)
        .then(checkIsPostOk)
        .then(() => {
            let string = `${removedCounter} ${user.userName} — блок`;
            if (reason) {
                string = `${string} — ${reason}`;
            }
            addRemovedUser(string);
            status(`Задержка после блокировки <span class="timerCounter">${DELAY_AFTER_BLOCK / 1000}</span> сек...`, true);
        })
        .then(() => timeoutPromise(DELAY_AFTER_BLOCK));
}

function checkIsPostOk(response) {
    let blockLimit = Number(document.getElementById('blockLimit').value);
    const data = JSON.parse(response);
    if (data.status !== 'ok') {
        throw new Error(response);
    }
    removedCounter += 1;
    console.log(`Просмотрено ${checkedCounter}, удалено ${removedCounter}`);
    if (removedCounter >= blockLimit) {
        throw new Error(`Достигнут лимит блокировки: ${blockLimit}`);
    }

}

function testNextUser() {
    let p = Promise.resolve();

    if (usersToTest.length < 2) {
        p = p.then(getMoreFollowers);
    }

    p = p.then(testOneUser);
    return p;
}





function progress(text) {
    document.getElementById("progress").textContent = text;
}

function status(text, isHtml=false) {
    if (isHtml) {
        document.getElementById("status").innerHTML = text;
    } else {
        document.getElementById("status").textContent = text;
    }
}

function addRemovedUser(string) {
    const element = document.getElementById("removed");
    element.innerHTML +=  string + '<br/>';
    element.scrollTop = element.scrollHeight;
}

function stop() {
    stop.stop = true;
}
stop.stop = false;

function doTest() {
    document.getElementById('stopButton').removeAttribute("disabled");
    document.getElementById('startButton').setAttribute("disabled", "disabled");
    document.getElementById('defollowThreshold').setAttribute("disabled", "disabled");
    document.getElementById('blockThreshold').setAttribute("disabled", "disabled");
    testNextUser()
        .then(doTest, alert)
}


function start() {
    document.getElementsByTagName('body')[0].innerHTML =
        '<div style="margin: 0.5em; font-family: monospace">'+
        '<p style="margin: 0.5em; padding-bottom: 0.5em; border-bottom: 1px solid #aaa">Отписывать тех, у кого больше <input type="number" max="7000" min="500" value="1500" id="defollowThreshold"> подписок.</p>'+
        '<p style="margin: 0.5em; padding-bottom: 0.5em; border-bottom: 1px solid #aaa">Блокировать тех, у кого больше <input type="number" max="7000" min="500" value="2000" id="blockThreshold"> подписок.</p>'+
        '<p style="margin: 0.5em; padding-bottom: 0.5em; border-bottom: 1px solid #aaa">Блокировать не более чем <input type="number" max="1000000" min="50" value="500" id="blockLimit"> пользователей.</p>'+
        '<div style="background-color: #aff; padding: 0.5em" id="progress">&gt;</div>' +
        '<div style="background-color: #faf; padding: 0.5em; display: block" id="status">&gt;</div>' +
        '<div style="background-color: #ffa; padding: 0.5em; height: 20em; overflow-y: scroll" id="removed">Удалённые пользователи<br/></div>' +
        '<button type="button" onClick="doTest()" id="startButton" style="margin-top: 3em;">Запустить</button>' +
        '<button type="button" onClick="stop()" id="stopButton" style="margin-top: 3em;" disabled="disabled">Остановить</button>' +
        '</div>';


}

start();
