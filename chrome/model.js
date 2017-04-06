var GmailToTrello = GmailToTrello || {};

GmailToTrello.Model = function(parent) {
    this.trello = {
        apiKey: 'c50413b23ee49ca49a5c75ccf32d0459',
        user: null,
        orgs: null,
        boards: null
    };
    this.parent = parent;
    this.settings = {};
    this.isInitialized = false;
    this.event = new EventTarget();
    this.newCard = null;
};

GmailToTrello.Model.prototype.init = function() {
    var self = this;

    this.isInitialized = true;

    // init Trello
    this.initTrello();

};

GmailToTrello.Model.prototype.initTrello = function() {
    log("GTT::initTrelloData()");

    var self = this;

    this.trello.user = null;
    this.trello.orgs = null;
    this.trello.boards = null;

    Trello.setKey(this.trello.apiKey);
    Trello.authorize({
        interactive: false,
        success: function() {
            self.event.fire('onAuthorized');
            self.loadTrelloData();
        }
    });

    if (!Trello.authorized()) {
        this.event.fire('onBeforeAuthorize');

        Trello.authorize({
            type: 'popup',
            name: "Gmail to Trello",
            persit: true,
            scope: {read: true, write: true},
            expiration: 'never',
            success: function(data) {
                log('Trello authorization successful');
                log(data);
                self.event.fire('onAuthorized');
                self.loadTrelloData();
            },
            error: function() {
                self.event.fire('onAuthenticateFailed');
            }
        });

    }
    else {
        //log(Trello);
        //log(Trello.token());
    }
};

GmailToTrello.Model.prototype.deauthorizeTrello = function() {
    log("GTT:deauthorizeTrello");

    Trello.deauthorize();
    this.isInitialized = false;
};

GmailToTrello.Model.prototype.makeAvatarUrl = function(avatarHash) {
    var retn = '';
    if (avatarHash && avatarHash.length > 0) {
        retn = 'https://trello-avatars.s3.amazonaws.com/' + avatarHash + '/30.png';
    }
    return retn;
}

GmailToTrello.Model.prototype.loadTrelloData = function() {
    log('loading trello data');

    this.event.fire('onBeforeLoadTrello');
    this.trello.user = null;


    var self = this;

    // get user's info
    log('Getting user info');
    Trello.get('members/me', {}, function(data) {
        if (!data || !data.hasOwnProperty('id')) {
            return false;
        }

        self.trello.user = data;

        // get user orgs
        self.trello.orgs = [{id: -1, displayName: 'My Boards'}];
        if (data && data.hasOwnProperty('idOrganizations') && data.idOrganizations && data.idOrganizations.length > 0) {
            log('Getting user orgs');
            Trello.get('members/me/organizations', {fields: "displayName"}, function(data) {
                log(data);
                for (var i = 0; i < data.length; i++) {
                    self.trello.orgs.push(data[i]);
                }
                self.checkTrelloDataReady();
            }, function failure(data) {
                self.event.fire('onAPIFailure', {data:data});
            });

        }

        // get boards list, including orgs
        if (data && data.hasOwnProperty('idBoards') && data.idBoards && data.idBoards.length > 0) {
            log('Getting user boards');
            self.trello.boards = null;
            Trello.get('members/me/boards', {fields: "closed,name,idOrganization"}, function(data) {
                var validData = Array();
                for (var i = 0; i < data.length; i++) {
                    if (data[i].idOrganization === null)
                        data[i].idOrganization = -1;

                    // Only accept opening boards
                    if (i==0) {
                        log(data[i]);
                    }
                    if (data[i].closed != true) {
                        validData.push(data[i]);
                    }
                }
                log('Boards data:');
                log(data);
                log(validData);
                self.trello.boards = validData;
                self.checkTrelloDataReady();
            }, function failure(data) {
                self.event.fire('onAPIFailure', {data:data});
            });
        }
        self.checkTrelloDataReady();
    }, function failure(data) {
        self.event.fire('onAPIFailure', {data:data});
    });
};

GmailToTrello.Model.prototype.checkTrelloDataReady = function() {
    if (this.trello.user !== null &&
            this.trello.orgs !== null &&
            this.trello.boards !== null) {
        // yeah! the data is ready
        //log('checkTrelloDataReady: YES');
        //log(this);
        this.event.fire('onTrelloDataReady');

    }
    //else log('checkTrelloDataReady: NO');
};


GmailToTrello.Model.prototype.loadTrelloLists = function(boardId) {
    log('loadTrelloLists');

    var self = this;
    this.trello.lists = null;

    Trello.get('boards/' + boardId, {lists: "open", list_fields: "name"}, function(data) {
        self.trello.lists = data.lists;
        self.event.fire('onLoadTrelloListSuccess');
    }, function failure(data) {
            self.event.fire('onAPIFailure', {data:data});
    });
};

GmailToTrello.Model.prototype.loadTrelloLabels = function(boardId) {
    log('loadTrelloLabels');

    var self = this;
    this.trello.labels = null;

    Trello.get('boards/' + boardId + '/labels', {fields: "color,name"}, function(data) {
        self.trello.labels = data;
        // If you want to add a "none" label, do:
        // self.trello.labels.unshift ({color:'gray', name:'none', id:'-1'});
        self.event.fire('onLoadTrelloLabelsSuccess');
    }, function failure(data) {
        self.event.fire('onAPIFailure', {data:data});
    });
};

GmailToTrello.Model.prototype.loadTrelloMembers = function(boardId) {
    log('loadTrelloMembers');

    var self = this;
    this.trello.members = null;

    Trello.get('boards/' + boardId + '/members', {fields: "fullName,username,initials,avatarHash"}, function(data) {
        var me = self.trello.user;
        // Remove this user from the members list:
        self.trello.members = $.map(data, function (item, iter) {
            return (item.id !== me.id ? item : null);
        });
        // And shove this user in the first position:
        self.trello.members.unshift({
            'id': me.id,
            'username': me.username,
            'initials': me.initials,
            'avatarHash': me.avatarHash,
            'fullName': me.fullName
        });
        self.event.fire('onLoadTrelloMembersSuccess');
    }, function failure(data) {
        self.event.fire('onAPIFailure', {data:data});
    });
};

GmailToTrello.Model.prototype.submit = function() {
    var self = this;
    if (this.newCard === null) {
        log('Submit data is empty');
        return false;
    }
    var data = this.newCard;

    this.parent.saveSettings();

    var idMembers = null;
    
    var desc = this.parent.truncate(data.description, this.parent.popupView.MAX_BODY_SIZE, '...');
    
    //submit data
    var trelloPostableData = {
        name: data.title, 
        desc: desc,
        idList: data.listId
    };

    if (data && data.membersId && data.membersId.length > 1) {
        trelloPostableData.idMembers = data.membersId;
    }

    // NOTE (Ace, 10-Jan-2017): Can only post valid labels, this can be a comma-delimited list of valid label ids, will err 400 if any label id unknown:
    if (data && data.labelsId && data.labelsId.length > 1 && data.labelsId.indexOf('-1') === -1) { // Will 400 if we post invalid ids (such as -1):
        trelloPostableData.idLabels = data.labelsId;
    }

    if (data && data.due_Date && data.due_Date.length > 1) { // Will 400 if not valid date:
        /* Workaround for quirk in Date object,
         * See: http://stackoverflow.com/questions/28234572/html5-datetime-local-chrome-how-to-input-datetime-in-current-time-zone
         * Was: dueDate.replace('T', ' ').replace('-','/')
         */
        var due = data.due_Date.replace('-', '/');

        if (data.due_Time && data.due_Time.length > 1) {
            due += ' ' + data.due_Time;
        } else {
            due += ' 00:00'; // Must provide time
        }
        trelloPostableData.due = new Date(due).toISOString();
        /* (NOTE (Ace, 27-Feb-2017): When we used datetime-local object, this was:
        trelloPostableData.due = new Date(data.dueDate.replace('T', ' ').replace('-','/')).toISOString();
        */
    }

    if (data && data.position && data.position == 'top') {
        trelloPostableData.pos = 'top'; // Bottom is default, only need to indicate top
    }

    Trello.post('cards', trelloPostableData, function success(data) {
        self.event.fire('onCardSubmitComplete', {data:data, images:self.newCard.images, attachments:self.newCard.attachments});
        log(data);
        //setTimeout(function() {self.popupNode.hide();}, 10000);
    }, function failure(data) {
        self.event.fire('onAPIFailure', {data:data});
    });
};

/**
 * Go get a URL and return it as a blob
 */
GmailToTrello.Model.prototype.urlToData = function(attach1, callback) {
    var self = this;

    var encodeForTransfer = function(args) {
        if (args && args.data) {
            const dataView = new DataView(args.data); // arrayBuffer
            const name = args.name || '?';
            const filename = args.filename || '?.txt';
            const mimeType = args.mimeType || 'text/plain';

            const BOUNDARY = 'BOUNDARY1234';
            const BOUNDARY_DASHES = '--';
            const NEWLINE = '\r\n';
            const ACTUAL_CONTENT_TYPE = 'Content-Type: ' + args.mimeType;
            const ACTUAL_CONTENT_DISPOSITION = 'Content-Disposition: form-data; name="' + name + '"; filename="' + filename + '"';

            const postDataStart = [
              NEWLINE, BOUNDARY_DASHES, BOUNDARY, NEWLINE,
              ACTUAL_CONTENT_DISPOSITION, NEWLINE, ACTUAL_CONTENT_TYPE, NEWLINE, NEWLINE
            ].join('');

            const postDataEnd = [NEWLINE, BOUNDARY_DASHES, BOUNDARY, BOUNDARY_DASHES, NEWLINE].join('');

            const size = postDataStart.length + dataView.byteLength + postDataEnd.length;
            const uint8Array = new Uint8Array(size);
            var str = postDataStart;

            let i = 0;

            for (; i < postDataStart.length; i++) {
              uint8Array[i] = postDataStart.charCodeAt(i) & 0xFF;
              // str += ('0' + (postDataStart.charCodeAt(i) & 0xFF).toString(16)).substr(1);
            }

            for (let j = 0; j < dataView.byteLength; i++, j++) {
              uint8Array[i] = dataView.getUint8(j);
              str += ('00' + dataView.getUint8(j).toString(16)).substr(-2);
              if ((1+j) % 2 === 0) {
                str += ' ';
              }
            }

            for (let j = 0; j < postDataEnd.length; i++, j++) {
              uint8Array[i] = postDataEnd.charCodeAt(j) & 0xFF;
              // str += ('0' + (postDataEnd.charCodeAt(j) & 0xFF).toString(16)).substr(1);
            }

            str += postDataEnd;

            const buffer_k = uint8Array.buffer;

            // var encoder = new TextDecoder('utf-8');
            // const payload = encoder.decode(uint8Array);

            return str; // payload;
        } else {
            return '';
        }
    };

    if (attach1 && attach1.url.length > 0) {
        var xhr = new XMLHttpRequest();
        xhr.open('get', attach1.url);
        xhr.responseType = 'blob'; // Use blob to get the mimetype
        xhr.onload = function() {
            var fileReader = new FileReader();
            fileReader.onload = function() {
                var result = this.result || '';
                var mimeType = xhr.response.type || attach1.mimeType || '?';
                var name = (attach1.name || '?') + ' [' + mimeType + ']';
                var filename = (attach1.url.split('/').pop().split('#')[0].split('?')[0]) || attach1.url || '?.txt'; // Removes # or ? after filename
                var data = encodeForTransfer({
                    'mimeType': mimeType,
                    'name': name,
                    'filename': filename,
                    'data': result
                });
                var hashRetn = {
                    'mimeType': mimeType,
                    'filename': filename,
                    'name': name,
                    'content-type': 'multipart/form-data; boundary=BOUNDARY1234',
                    'file': data
                };

                callback(hashRetn);
            };
            fileReader.readAsArrayBuffer(xhr.response); // Use filereader on blob to get content
        };
        xhr.send();        
    }
};

/*
   var xhr = new XMLHttpRequest();
    xhr.open('get', url);
    xhr.responseType = 'blob';
    xhr.onload = function() {
        var fileReader = new FileReader();
        fileReader.onload = function() {
            var result = this.result || '';
            var dataURL = result.split(',');
            var base64 = dataURL.pop(); // Grab last item
            callback(xhr.response.type, base64);
        };
        fileReader.readAsDataURL(xhr.response);
    };
    xhr.send();

        var blob = xhr.response;
        var file = new File([blob], name + ' [' + blob.type + ']');

        var fileReader = new FileReader();
        fileReader.onload = function() {
            callback(xhr.response.type, encodeURIComponent(this.result || ''));
        };
        fileReader.readAsText(xhr.response);

        var fr = new FileReader();
        fr.onload = function() {
            var base64 = this.result.split(',')[1];

            callback(this.result || ''); // (this.result.split(',')[1]) || ''); // Only sends base64 encoded part into callback
        };
        fr.readAsDataURL(xhr.response); // readAsDataURL(xhr.response); // Returns something like: "data:image/png;base64,iVBORw..."
    };
    xhr.send();
    var formData = new FormData();

    formData.append("token", TOKEN);
    formData.append("key", KEY);

    // HTML file input, chosen by user
    formData.append("file", document.getElementById('chooser').files[0]);

  var request = new XMLHttpRequest();
  request.open("POST", "https://api.trello.com/1/cards/" + CARD + "/attachments");
  request.send(formData);
  
https://miguelmota.com/bytes/xmlhttprequest-multipart-post:
const xhr = new XMLHttpRequest();
const url = 'https://example.com';

// (assume dataView contains binary audio data)
const dataView = new DataView(buffer);

xhr.open('POST', url, true);
xhr.responseType = 'arraybuffer';
xhr.onload = (event) => {
  console.log(xhr.response);
};

xhr.onerror = (error) => {
    console.error(error);
};

const BOUNDARY = 'BOUNDARY1234';
const BOUNDARY_DASHES = '--';
const NEWLINE = '\r\n';
const AUDIO_CONTENT_TYPE = 'Content-Type: audio/L16; rate=16000; channels=1';
const AUDIO_CONTENT_DISPOSITION = 'Content-Disposition: form-data; name="audio"';

const postDataStart = [
  NEWLINE, BOUNDARY_DASHES, BOUNDARY, NEWLINE,
  AUDIO_CONTENT_DISPOSITION, NEWLINE, AUDIO_CONTENT_TYPE, NEWLINE, NEWLINE
].join('');

const postDataEnd = [NEWLINE, BOUNDARY_DASHES, BOUNDARY, BOUNDARY_DASHES, NEWLINE].join('');

const size = postDataStart.length + dataView.byteLength + postDataEnd.length;
const uint8Array = new Uint8Array(size);
let i = 0;

for (; i < postDataStart.length; i++) {
  uint8Array[i] = postDataStart.charCodeAt(i) & 0xFF;
}

for (let j = 0; j < dataView.byteLength; i++, j++) {
  uint8Array[i] = dataView.getUint8(j);
}

for (let j = 0; j < postDataEnd.length; i++, j++) {
  uint8Array[i] = postDataEnd.charCodeAt(j) & 0xFF;
}

const payload = uint8Array.buffer;

xhr.setRequestHeader('Content-Type', 'multipart/form-data; boundary=' + BOUNDARY);
xhr.send(payload);
*/
