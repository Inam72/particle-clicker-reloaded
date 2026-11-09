'use strict';
(function() {
  Helpers.validateSaveVersion();

  var game = new Game.Game();
  game.load();

  var lab = game.lab;
  var research = game.research;
  var workers = game.workers;
  var upgrades = game.upgrades;
  var achievements = game.achievements;
  var allObjects = game.allObjects;
  var lastSaved;
  // Set just before a restart/import reloads the page, so the auto-save
  // timer can't write the old progress back over the cleared/imported save.
  var savingDisabled = false;

  // Dark mode. The initial class is already applied by the inline script in
  // <head> (to avoid a flash of the wrong theme); this just wires up the
  // toggle button and keeps its icon in sync.
  var THEME_KEY = 'pc-theme';
  var DETECTOR_DARK_BG = '#242424';
  var setTheme = function(dark) {
    document.documentElement.classList.toggle('dark-theme', dark);
    $('#theme-toggle i').attr('class', dark ? 'fa fa-sun-o' : 'fa fa-moon-o');
    $('#theme-toggle-label').text(dark ? 'Light mode' : 'Dark mode');
    $('#theme-toggle').attr('title', dark ? 'Switch to light mode' : 'Switch to dark mode');
    detector.setBackground(dark ? DETECTOR_DARK_BG : '#FFFFFF');
  };
  setTheme(document.documentElement.classList.contains('dark-theme'));
  $('#theme-toggle').on('click', function(e) {
    e.preventDefault();
    var dark = !document.documentElement.classList.contains('dark-theme');
    try {
      localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
    } catch (e) {}
    setTheme(dark);
  });

  // The detector's look changes as bigger colliders are unlocked.
  var computeDetectorTier = function() {
    var tier = 0;
    if (allObjects['upgrade-sps'] && allObjects['upgrade-sps'].state.used) {
      tier = 1;
    }
    if (allObjects['upgrade-tevatron'] && allObjects['upgrade-tevatron'].state.used) {
      tier = 2;
    }
    if (allObjects['upgrade-lhc'] && allObjects['upgrade-lhc'].state.used) {
      tier = 3;
    }
    if (allObjects['upgrade-lhcb'] && allObjects['upgrade-lhcb'].state.used) {
      tier = 4;
    }
    return tier;
  };
  detector.setTier(computeDetectorTier());

  // Let Research info pages link to other Research topics, e.g. "the bottom
  // quark" linking to the CP violation entry. Links to undiscovered topics
  // are greyed out and inert.
  $('#infoBox').on('shown.bs.modal', function() {
    $(this).find('[data-research-link]').each(function() {
      var target = allObjects[$(this).data('research-link')];
      if (!target || target.state.level <= 0) {
        $(this).addClass('research-link-undiscovered')
               .attr('title', "Sorry, you haven't made this discovery yet!");
      }
    });
  });
  $('#infoBox').on('click', '[data-research-link]', function(e) {
    e.preventDefault();
    var target = allObjects[$(this).data('research-link')];
    if (!target || target.state.level <= 0) {
      return;
    }
    UI.showModal(target.name, target.getInfo());
    UI.showLevels(target.state.level);
  });

  var app = angular.module('particleClicker', []);

  app.filter('niceNumber', ['$filter', function($filter) {
      return Helpers.formatNumberPostfix;
  }]);

  app.filter('niceTime', ['$filter', function($filter) {
      return Helpers.formatTime;
  }]);

  app.filter('currency', ['$filter', function($filter) {
    return function(input) {
      return 'JTN ' + $filter('niceNumber')(input);
    };
  }]);

  app.filter('reverse', ['$filter', function($filter) {
    return function(items) {
      return items.slice().reverse();
    };
  }]);

  app.controller('DetectorController', function() {
    this.click = function() {
      lab.clickDetector();
      detector.addEvent();
      UI.showUpdateValue("#update-data", lab.state.detector);
      return false;
    };
  });

  // Hack to prevent text highlighting
  document.getElementById('detector').addEventListener('mousedown', function(e) {
    e.preventDefault();
  });

  app.controller('LabController', ['$interval', function($interval) {
    this.lab = lab;
    this.showDetectorInfo = function() {
      if (!this._detectorInfo) {
        this._detectorInfo = Helpers.loadFile('html/detector.html');
      }
      UI.showModal('Detector', this._detectorInfo);
    };
    $interval(function() {  // one tick
      var grant = lab.getGrant();
      UI.showUpdateValue("#update-funding", grant);
      var sum = 0;
      for (var i = 0; i < workers.length; i++) {
        sum += workers[i].state.hired * workers[i].state.rate;
      }
      if (sum > 0) {
        lab.acquireData(sum);
        UI.showUpdateValue("#update-data", sum);
        detector.addEventExternal(workers.map(function(w) {
          return w.state.hired;
        }).reduce(function(a, b){return a + b}, 0));
      }
    }, 1000);
  }]);

  app.controller('ResearchController', ['$compile', function($compile) {
    this.research = research;
    this.isVisible = function(item) {
      return item.isVisible(lab);
    };
    this.isAvailable = function(item) {
      return item.isAvailable(lab);
    };
    this.doResearch = function(item) {
      var cost = item.research(lab);
      if (cost > 0) {
        UI.showUpdateValue("#update-data", -cost);
        UI.showUpdateValue("#update-reputation", item.state.reputation);
      }
    };
    this.showInfo = function(r) {
      UI.showModal(r.name, r.getInfo());
      UI.showLevels(r.state.level);
    };
  }]);

  app.controller('HRController', function() {
    this.workers = workers;
    this.isVisible = function(worker) {
      return worker.isVisible(lab);
    };
    this.isAvailable = function(worker) {
      return worker.isAvailable(lab);
    };
    this.hire = function(worker) {
      var cost = worker.hire(lab);
      if (cost > 0) {
        UI.showUpdateValue("#update-funding", -cost);
      }
    };
  });

  app.controller('UpgradesController', function() {
    this.upgrades = upgrades;
    this.isVisible = function(upgrade) {
      return upgrade.isVisible(lab, allObjects);
    };
    this.isAvailable = function(upgrade) {
      return upgrade.isAvailable(lab, allObjects);
    };
    this.upgrade = function(upgrade) {
      var cost = upgrade.buy(lab, allObjects);
      if (cost > 0) {
        UI.showUpdateValue("#update-funding", -cost);
        detector.setTier(computeDetectorTier());
      }
    };
    this.showInfo = function(u) {
      UI.showModal(u.name, u.info);
    };
  });

  app.controller('AchievementsController', function($scope) {
    $scope.achievements = achievements;
    $scope.progress = function() {
      return achievements.filter(function(a) { return a.validate(lab, allObjects, lastSaved); }).length;
    };
  });

  app.controller('SaveController',
      ['$scope', '$interval', function($scope, $interval) {
    lastSaved = new Date().getTime();
    $scope.lastSaved = lastSaved;
    $scope.saveNow = function() {
      if (savingDisabled) {
        return;
      }
      var saveTime = new Date().getTime();
      game.lab.state.time += saveTime - lastSaved;
      game.save();
      lastSaved = saveTime;
      $scope.lastSaved = lastSaved;
    };
    $scope.restart = function() {
      if (window.confirm(
        'Do you really want to restart the game? All progress will be lost.'
      )) {
        savingDisabled = true;
        ObjectStorage.clear();
        window.location.reload(true);
      }
    };
    $interval($scope.saveNow, 10000);
    $scope.exportSave = function() {
      $scope.saveNow();
      var data = { saveVersion: ObjectStorage.load('saveVersion') };
      for (var key in game.allObjects) {
        data[key] = game.allObjects[key].state;
      }
      var blob = new Blob([JSON.stringify(data, null, 2)],
                           { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'particle-clicker-save.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };
    $scope.importSave = function() {
      document.getElementById('import-save-input').click();
    };
  }]);

  // Handle the actual file reading for save imports. Lives outside Angular
  // since it only needs to write to localStorage and reload the page.
  document.getElementById('import-save-input')
      .addEventListener('change', function(e) {
    var file = e.target.files[0];
    e.target.value = '';
    if (!file) {
      return;
    }
    var reader = new FileReader();
    reader.onload = function() {
      var data;
      try {
        data = JSON.parse(reader.result);
      } catch (err) {
        data = null;
      }
      var isSafeSave = function(save) {
        if (!save || typeof save !== 'object' || Array.isArray(save) ||
            (save.saveVersion !== undefined && save.saveVersion !== '1.0')) {
          return false;
        }
        var objectKeys = Object.keys(save);
        for (var i = 0; i < objectKeys.length; i++) {
          var key = objectKeys[i];
          if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
            return false;
          }
          if (key === 'saveVersion') {
            continue;
          }
          if (!Object.prototype.hasOwnProperty.call(allObjects, key)) {
            return false;
          }
          var importedState = save[key];
          var currentState = allObjects[key].state;
          if (!importedState || typeof importedState !== 'object' ||
              Array.isArray(importedState)) {
            return false;
          }
          var stateKeys = Object.keys(importedState);
          for (var j = 0; j < stateKeys.length; j++) {
            var stateKey = stateKeys[j];
            if (stateKey === '__proto__' || stateKey === 'constructor' ||
                stateKey === 'prototype' ||
                !Object.prototype.hasOwnProperty.call(currentState, stateKey)) {
              return false;
            }
            var value = importedState[stateKey];
            var expected = currentState[stateKey];
            if (stateKey === 'info_levels') {
              if (!Array.isArray(value) || value.some(function(level) {
                return typeof level !== 'number' || !isFinite(level);
              })) {
                return false;
              }
            } else if (expected === null) {
              if (value !== null && (typeof value !== 'number' || !isFinite(value))) {
                return false;
              }
            } else if (typeof expected === 'number') {
              if (typeof value !== 'number' || !isFinite(value)) {
                return false;
              }
            } else if (typeof value !== typeof expected) {
              return false;
            }
          }
        }
        return Object.prototype.hasOwnProperty.call(save, 'lab');
      };
      if (!isSafeSave(data)) {
        window.alert('This is not a valid Particle Clicker save file.');
        return;
      }
      if (!window.confirm(
        'This will overwrite your current progress with the imported save. Continue?'
      )) {
        return;
      }
      savingDisabled = true;
      var importKeys = Object.keys(data);
      for (var i = 0; i < importKeys.length; i++) {
        var key = importKeys[i];
        if (key === 'saveVersion') {
          continue;
        }
        ObjectStorage.save(key, data[key]);
      }
      ObjectStorage.save('saveVersion', data.saveVersion || '1.0');
      window.location.reload(true);
    };
    reader.readAsText(file);
  });

  app.controller('StatsController', function($scope) {
    $scope.lab = lab;
  });

  app.controller('MultiplayerController', ['$scope', '$timeout', function($scope, $timeout) {
    var self = this;
    var slowJoinTimer = null;

    this.statLabels = {
      reputation: 'Reputation',
      dataCollected: 'Data collected',
      moneyCollected: 'Funding collected',
      clicks: 'Clicks'
    };
    this.name = '';
    this.localMode = !!window.__CLASSROOM_LOCAL__;
    this.isTeacher = !!window.__CLASSROOM_TEACHER__;
    this.hostStopped = false;
    this.stopError = '';
    this.statKey = 'reputation';
    this.goal = null;
    this.joinCode = window.__CLASSROOM_ROOM__ || '';
    this.error = '';
    this.inRoom = false;
    this.waitingForSettings = false;
    this.roomId = '';
    this.statLabel = '';
    this.players = [];

    var updateJoinQr = function() {
      if (!self.localMode || !self.inRoom || !self.roomId) {
        return;
      }

      var joinUrl = window.__CLASSROOM_HOST_URL__ + '#room=' +
          encodeURIComponent(self.roomId);
      self.joinUrl = joinUrl;
      $timeout(function() {
        var target = document.getElementById('classroom-qr');
        if (target && window.qrcode) {
          var qr = window.qrcode(0, 'M');
          qr.addData(joinUrl);
          qr.make();
          target.innerHTML = qr.createSvgTag(5, 8);
        }
      });
    };

    var refresh = function() {
      var settings = Multiplayer.getSettings();
      self.waitingForSettings = !settings;
      if (settings) {
        $timeout.cancel(slowJoinTimer);
        slowJoinTimer = null;
        self.slowJoin = false;
        self.statLabel = self.statLabels[settings.statKey] || settings.statKey;
        self.goal = settings.goal;
      }
      self.players = Multiplayer.getPlayers();
      // Trystero's callbacks fire outside Angular, so the view needs a
      // digest to notice the update above. Guard against calling $apply
      // while one is already running (e.g. when refresh() runs right after
      // createRoom()/joinRoom(), which are themselves inside a digest).
      if (!$scope.$root.$$phase) {
        $scope.$apply();
      }
      updateJoinQr();
    };
    Multiplayer.setOnUpdate(refresh);
    Multiplayer.setOnError(function(message) {
      self.error = message;
      if (message) {
        $timeout.cancel(slowJoinTimer);
        slowJoinTimer = null;
        self.inRoom = false;
        self.waitingForSettings = false;
        Multiplayer.leave();
      }
      if (!$scope.$root.$$phase) {
        $scope.$apply();
      }
    });

    this.createRoom = function() {
      this.error = '';
      if (!Multiplayer.create(this.name.trim(), this.statKey, this.goal, function() {
        return lab.state[self.statKey];
      })) {
        return;
      }
      this.inRoom = true;
      this.roomId = Multiplayer.getRoomId();
      refresh();
      updateJoinQr();
    };

    this.joinRoom = function() {
      this.error = '';
      if (!Multiplayer.join(this.name.trim(), this.joinCode.trim().toUpperCase(), function() {
        var settings = Multiplayer.getSettings();
        return settings ? lab.state[settings.statKey] : 0;
      })) {
        return;
      }
      this.inRoom = true;
      this.roomId = Multiplayer.getRoomId();
      this.slowJoin = false;
      slowJoinTimer = $timeout(function() {
        self.slowJoin = true;
      }, 20000);
      refresh();
    };

    this.leaveRoom = function() {
      $timeout.cancel(slowJoinTimer);
      this.slowJoin = false;
      Multiplayer.leave();
      this.inRoom = false;
      this.waitingForSettings = false;
      this.players = [];
    };

    this.stopClassroom = function() {
      if (!this.isTeacher || this.hostStopped) {
        return;
      }
      this.stopError = '';
      fetch('/classroom/stop', {
        method: 'POST',
        headers: {
          'X-Classroom-Token': window.__CLASSROOM_STOP_TOKEN__
        }
      }).then(function(response) {
        if (!response.ok) {
          throw new Error('The classroom could not be stopped. Close the host window instead.');
        }
        $timeout(function() {
          self.hostStopped = true;
          Multiplayer.leave();
          self.inRoom = false;
          self.players = [];
          self.waitingForSettings = false;
        });
      }).catch(function(error) {
        $timeout(function() {
          self.stopError = error.message;
        });
      });
    };
  }]);

  analytics.init();
  analytics.sendScreen(analytics.screens.main);
})();
