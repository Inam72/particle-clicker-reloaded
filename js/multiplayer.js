'use strict';

/** @module Multiplayer
 * Online rooms use Trystero and public Nostr relays to establish peer-to-peer
 * connections. The optional classroom mode sends room messages through the
 * teacher's local host instead. In both modes, saves stay in each browser.
 */
var Multiplayer = (function() {
  var APP_ID = 'particle-clicker-cern-webfest';
  var BROADCAST_INTERVAL_MS = 2000;
  var MAX_PLAYER_NAME_LENGTH = 20;
  var MAX_PLAYER_VALUE = 1e100;

  var room = null;
  var progressAction = null;
  var settingsAction = null;
  var intervalHandle = null;
  var localSocket = null;
  var localMessageQueue = [];
  var isClassroomLocal = !!window.__CLASSROOM_LOCAL__;

  var isHost = false;
  var settings = null; // { statKey, goal }
  var startTime = 0;
  var selfName = '';
  var roomId = '';
  var players = {}; // peerId (or 'self') -> { name, value, finishedAt, isSelf }
  var getValue = function() { return 0; };
  // In a race (goal set), progress is counted from when the player got the
  // room settings, so an existing save doesn't finish the race instantly.
  // Without a goal it's a plain leaderboard of each player's total.
  var baseline = null;
  var onUpdate = function() {};
  var onError = function() {};

  var sendLocal = function(message) {
    if (!localSocket) {
      return;
    }
    if (localSocket.readyState === WebSocket.OPEN) {
      localSocket.send(JSON.stringify(message));
    } else if (localSocket.readyState === WebSocket.CONNECTING) {
      localMessageQueue.push(message);
    }
  };

  var normalizeProgress = function(data) {
    if (!data || typeof data.name !== 'string' ||
        typeof data.value !== 'number' || !isFinite(data.value)) {
      return null;
    }
    return {
      name: data.name.slice(0, MAX_PLAYER_NAME_LENGTH),
      value: Math.max(0, Math.min(data.value, MAX_PLAYER_VALUE)),
      finishedAt: typeof data.finishedAt === 'number' &&
          isFinite(data.finishedAt) && data.finishedAt >= 0 ?
          Math.min(data.finishedAt, MAX_PLAYER_VALUE) : null
    };
  };

  var currentValue = function() {
    var value = getValue();
    if (!settings.goal) {
      return value;
    }
    if (baseline === null) {
      baseline = value;
    }
    return value - baseline;
  };

  var makeRoomId = function() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
  };

  var broadcast = function() {
    if (!settings) {
      return;
    }
    var value = currentValue();
    var finishedAt = players.self && players.self.finishedAt;
    if (!finishedAt && settings.goal && value >= settings.goal) {
      finishedAt = new Date().getTime() - startTime;
    }
    players.self = { name: selfName, value: value, finishedAt: finishedAt, isSelf: true };
    var progress = { name: selfName, value: value, finishedAt: finishedAt };
    if (isClassroomLocal) {
      sendLocal({ type: 'progress', data: progress });
    } else {
      progressAction.send(progress);
    }
    onUpdate();
  };

  var setup = function(code, name, valueGetter) {
    if (!isClassroomLocal &&
        (!window.__trystero ||
         typeof window.__trystero.joinRoom !== 'function')) {
      onError('Multiplayer could not load. Check your connection and reload the page.');
      return false;
    }
    roomId = code;
    selfName = name.slice(0, MAX_PLAYER_NAME_LENGTH);
    getValue = valueGetter;
    startTime = new Date().getTime();
    players = {};
    baseline = null;

    if (isClassroomLocal) {
      localMessageQueue = [];
      var protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      var socket;
      try {
        socket = new WebSocket(protocol + '//' + window.location.host + '/classroom');
      } catch (error) {
        onError('Could not connect to the classroom host. Check that the teacher’s game is still open and that both devices are on the same Wi-Fi.');
        return false;
      }
      localSocket = socket;
      room = {
        leave: function() {
          sendLocal({ type: 'leave' });
          socket.close();
          if (localSocket === socket) {
            localSocket = null;
          }
        }
      };
      socket.onopen = function() {
        if (localSocket !== socket) {
          return;
        }
        if (isHost) {
          sendLocal({ type: 'create', room: roomId, settings: settings });
        } else {
          sendLocal({ type: 'join', room: roomId });
        }
        while (localMessageQueue.length) {
          socket.send(JSON.stringify(localMessageQueue.shift()));
        }
      };
      socket.onmessage = function(event) {
        if (localSocket !== socket) {
          return;
        }
        var message;
        try {
          message = JSON.parse(event.data);
        } catch (error) {
          onError('Could not read a message from the classroom host.');
          return;
        }
        if (message.type === 'joined') {
          onError('');
          settings = message.settings;
          startTime = new Date().getTime();
          players = message.players || {};
          broadcast();
        } else if (message.type === 'progress') {
          var peerProgress = normalizeProgress(message.data);
          if (!peerProgress || typeof message.id !== 'string') {
            return;
          }
          players[message.id] = {
            name: peerProgress.name,
            value: peerProgress.value,
            finishedAt: peerProgress.finishedAt,
            isSelf: false
          };
          onUpdate();
        } else if (message.type === 'player-left') {
          delete players[message.id];
          onUpdate();
        } else if (message.type === 'room-closed') {
          onError('The teacher closed the classroom game.');
          if (intervalHandle) {
            window.clearInterval(intervalHandle);
            intervalHandle = null;
          }
          settings = null;
          players = {};
          onUpdate();
        } else if (message.type === 'error') {
          onError(message.message || 'Could not join that classroom game.');
        }
      };
      socket.onerror = function() {
        if (localSocket === socket) {
          onError('Could not connect to the classroom host. Check that the teacher’s game is still open and that both devices are on the same Wi-Fi.');
        }
      };
    } else {
      if (!window.__trystero ||
          typeof window.__trystero.joinRoom !== 'function') {
        onError('Multiplayer could not load. Check your connection and reload the page.');
        return false;
      }
      try {
        room = window.__trystero.joinRoom({ appId: APP_ID }, roomId);
      } catch (error) {
        room = null;
        onError('Could not start multiplayer. Please try again.');
        return false;
      }

      progressAction = room.makeAction('progress');
      progressAction.onMessage = function(data, meta) {
        var peerProgress = normalizeProgress(data);
        if (!peerProgress) {
          return;
        }
        players[meta.peerId] = {
          name: peerProgress.name,
          value: peerProgress.value,
          finishedAt: peerProgress.finishedAt,
          isSelf: false
        };
        onUpdate();
      };

      settingsAction = room.makeAction('settings');
      settingsAction.onMessage = function(data) {
        if (!isHost && !settings) {
          settings = data;
          startTime = new Date().getTime();
          broadcast();
        }
      };

      room.onPeerJoin = function(peerId) {
        if (isHost) {
          settingsAction.send(settings, { target: peerId });
        }
      };
      room.onPeerLeave = function(peerId) {
        delete players[peerId];
        onUpdate();
      };
    }

    intervalHandle = window.setInterval(broadcast, BROADCAST_INTERVAL_MS);
    return true;
  };

  var create = function(name, statKey, goal, valueGetter) {
    if (!isClassroomLocal &&
        (!window.__trystero ||
         typeof window.__trystero.joinRoom !== 'function')) {
      onError('Multiplayer could not load. Check your connection and reload the page.');
      return false;
    }
    isHost = true;
    settings = { statKey: statKey, goal: goal || null };
    if (setup(makeRoomId(), name, valueGetter)) {
      broadcast();
      return true;
    }
    settings = null;
    roomId = '';
    return false;
  };

  var join = function(name, code, valueGetter) {
    if (!isClassroomLocal &&
        (!window.__trystero ||
         typeof window.__trystero.joinRoom !== 'function')) {
      onError('Multiplayer could not load. Check your connection and reload the page.');
      return false;
    }
    isHost = false;
    settings = null;
    if (setup(code, name, valueGetter)) {
      return true;
    }
    roomId = '';
    return false;
  };

  var leave = function() {
    if (intervalHandle) {
      window.clearInterval(intervalHandle);
      intervalHandle = null;
    }
    localMessageQueue = [];
    if (room) {
      room.leave();
      room = null;
    }
    localSocket = null;
    isHost = false;
    settings = null;
    players = {};
    roomId = '';
  };

  var getPlayers = function() {
    var list = [];
    for (var id in players) {
      list.push(players[id]);
    }
    list.sort(function(a, b) {
      if (!!a.finishedAt !== !!b.finishedAt) {
        return a.finishedAt ? -1 : 1;
      }
      if (a.finishedAt && b.finishedAt) {
        return a.finishedAt - b.finishedAt;
      }
      return b.value - a.value;
    });
    return list;
  };

  return {
    create: create,
    join: join,
    leave: leave,
    getPlayers: getPlayers,
    getSettings: function() { return settings; },
    getRoomId: function() { return roomId; },
    isInRoom: function() { return !!room; },
    setOnUpdate: function(fn) { onUpdate = fn; },
    setOnError: function(fn) { onError = fn; }
  };
})();
