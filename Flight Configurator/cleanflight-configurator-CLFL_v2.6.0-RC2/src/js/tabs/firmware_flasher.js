'use strict';

TABS.firmware_flasher = {
    releases: null,
    releaseChecker: new ReleaseChecker('firmware', 'https://api.github.com/repos/cleanflight/cleanflight/releases'),
    jenkinsLoader: new NullJenkinsLoader(), // jenkinsLoader: new JenkinsLoader('https://jenkins.example.com'),
    gitHubApi: new GitHubApi(),
    localFirmwareLoaded: false,
    selectedBoard: undefined,
    intel_hex: undefined, // standard intel hex in string format
    parsed_hex: undefined, // parsed raw hex in array format
    unifiedTarget: {}, // the Unified Target configuration to be spliced into the configuration
    isConfigLocal: false, // Set to true if the user loads one locally
    developmentFirmwareLoaded: false, // Is the firmware to be flashed from the development branch?
};

TABS.firmware_flasher.initialize = function (callback) {
    var self = this;

    if (GUI.active_tab != 'firmware_flasher') {
        GUI.active_tab = 'firmware_flasher';
    }

    self.selectedBoard = undefined;
    self.localFirmwareLoaded = false;
    self.isConfigLocal = false;
    self.intel_hex = undefined;
    self.parsed_hex = undefined;

    var unifiedSource = 'https://api.github.com/repos/cleanflight/unified-targets/contents/configs/default';

    function onFirmwareCacheUpdate(release) {
        $('select[name="firmware_version"] option').each(function () {
            const option_e = $(this);
            const optionRelease = option_e.data("summary");
            if (optionRelease && optionRelease.file === release.file) {
                option_e.toggleClass("cached", FirmwareCache.has(release));
            }
        });
    }

    function onDocumentLoad() {
        FirmwareCache.load();
        FirmwareCache.onPutToCache(onFirmwareCacheUpdate);
        FirmwareCache.onRemoveFromCache(onFirmwareCacheUpdate);

        function parse_hex(str, callback) {
            // parsing hex in different thread
            var worker = new Worker('./js/workers/hex_parser.js');

            // "callback"
            worker.onmessage = function (event) {
                callback(event.data);
            };

            // send data/string over for processing
            worker.postMessage(str);
        }

        function show_loaded_hex(summary) {
            self.flashingMessage('<a class="save_firmware" href="#" title="Save Firmware">' + i18n.getMessage('firmwareFlasherFirmwareOnlineLoaded', self.parsed_hex.bytes_total) + '</a>',
                     self.FLASH_MESSAGE_TYPES.NEUTRAL);

            self.enableFlashing(true);

            if (self.unifiedTarget.manufacturerId) {
                $('div.release_info #manufacturer').text(self.unifiedTarget.manufacturerId);
                $('div.release_info #manufacturerInfo').show();
            } else {
                $('div.release_info #manufacturerInfo').hide();
            }
            $('div.release_info .target').text(TABS.firmware_flasher.selectedBoard);
            $('div.release_info .name').text(summary.version).prop('href', summary.releaseUrl);
            $('div.release_info .date').text(summary.date);
            $('div.release_info .file').text(summary.file).prop('href', summary.url);

            if (Object.keys(self.unifiedTarget).length > 0) {
                $('div.release_info #unifiedTargetInfo').show();
                $('div.release_info #unifiedTargetFile').text(self.unifiedTarget.fileName).prop('href', self.unifiedTarget.fileUrl);
                $('div.release_info #unifiedTargetDate').text(self.unifiedTarget.date);
            } else {
                $('div.release_info #unifiedTargetInfo').hide();
            }

            var formattedNotes = summary.notes.replace(/#(\d+)/g, '[#$1](https://github.com/cleanflight/cleanflight/pull/$1)');
            formattedNotes = marked(formattedNotes);
            $('div.release_info .notes').html(formattedNotes);
            $('div.release_info .notes').find('a').each(function() {
                $(this).attr('target', '_blank');
            });

            $('div.release_info').slideDown();

            $('.tab-firmware_flasher .content_wrapper').animate({ scrollTop: $('div.release_info').position().top }, 1000);
        }

        function process_hex(data, summary) {
            self.intel_hex = data;

            parse_hex(self.intel_hex, function (data) {
                self.parsed_hex = data;

                if (self.parsed_hex) {
                    analytics.setFirmwareData(analytics.DATA.FIRMWARE_SIZE, self.parsed_hex.bytes_total);

                    if (!FirmwareCache.has(summary)) {
                        FirmwareCache.put(summary, self.intel_hex);
                    }
                    show_loaded_hex(summary);

                } else {
                    self.flashingMessage(i18n.getMessage('firmwareFlasherHexCorrupted'), self.FLASH_MESSAGE_TYPES.INVALID);
                }
            });
        }

        function onLoadSuccess(data, summary) {
            self.localFirmwareLoaded = false;
            // The path from getting a firmware doesn't fill in summary.
            summary = typeof summary === "object"
                ? summary
                : $('select[name="firmware_version"] option:selected').data('summary');
            process_hex(data, summary);
            $("a.load_remote_file").removeClass('disabled');
            $("a.load_remote_file").text(i18n.getMessage('firmwareFlasherButtonLoadOnline'));
        };

        function populateBoardOptions(builds) {
            if (!builds) {
                $('select[name="board"]').empty().append('<option value="0">Offline</option>');
                $('select[name="firmware_version"]').empty().append('<option value="0">Offline</option>');

                return;
            }

            var boards_e = $('select[name="board"]');
            boards_e.empty();
            boards_e.append($(`<option value='0'>${i18n.getMessage("firmwareFlasherOptionLabelSelectBoard")}</option>`));

            var versions_e = $('select[name="firmware_version"]');
            versions_e.empty();
            versions_e.append($(`<option value='0'>${i18n.getMessage("firmwareFlasherOptionLabelSelectFirmwareVersion")}</option>`));


            var selectTargets = [];
            Object.keys(builds)
                .sort()
                .forEach(function(target, i) {
                    var descriptors = builds[target];
                    descriptors.forEach(function(descriptor){
                        if($.inArray(target, selectTargets) == -1) {
                            selectTargets.push(target);
                            var select_e =
                                $("<option value='{0}'>{0}</option>".format(
                                        descriptor.target
                                ));
                            boards_e.append(select_e);
                        }
                    });
                });

            TABS.firmware_flasher.releases = builds;

            ConfigStorage.get('selected_board', function (result) {
                if (result.selected_board) {
                    var boardBuilds = builds[result.selected_board];
                    $('select[name="board"]').val(boardBuilds ? result.selected_board : 0).trigger('change');
                }
            });
        }

        function processBoardOptions(releaseData, showDevReleases) {
            var releases = {};
            var sortedTargets = [];
            var unsortedTargets = [];
            releaseData.forEach(function(release) {
                release.assets.forEach(function(asset) {
                    var targetFromFilenameExpression = /cleanflight_([\d.]+)?_?(\w+)(\-.*)?\.(.*)/;
                    var match = targetFromFilenameExpression.exec(asset.name);
                    if ((!showDevReleases && release.prerelease) || !match) {
                        return;
                    }
                    var target = match[2];
                    if($.inArray(target, unsortedTargets) == -1) {
                        unsortedTargets.push(target);
                    }
                });
                sortedTargets = unsortedTargets.sort();
            });
            sortedTargets.forEach(function(release) {
                releases[release] = [];
            });
            releaseData.forEach(function(release) {
                // Regular expression must match tags in these styles:
                // CLFL_v2.5.0-RC1 -> "CLFL" "2.5.0-RC1"
                // 2.5.0-RC1 -> "" "2.5.0-RC1"
                var versionFromTagExpression = /([^_\d]*)?([_v]*)?(.*)/;
                var matchVersionFromTag = versionFromTagExpression.exec(release.tag_name);
                var version = matchVersionFromTag[3];
                
                if (!semver.valid(version)) {
                    console.log("Invalid version, skipping", [$release, $version]);
                }

                release.assets.forEach(function(asset) {
                    var targetFromFilenameExpression = /cleanflight_([\d.]+)?_?(\w+)(\-.*)?\.(.*)/;
                    var match = targetFromFilenameExpression.exec(asset.name);
                    if ((!showDevReleases && release.prerelease) || !match) {
                        return;
                    }
                    var target = match[2];
                    var format = match[4];
                    if (format != 'hex') {
                        return;
                    }
                    var date = new Date(release.published_at);
                    var formattedDate = ("0" + date.getDate()).slice(-2) + "-" + ("0" + (date.getMonth() + 1)).slice(-2) + "-" + date.getFullYear() + " " + ("0" + date.getHours()).slice(-2) + ":" + ("0" + date.getMinutes()).slice(-2);
                    var descriptor = {
                        "releaseUrl": release.html_url,
                        "name"      : version,
                        "version"   : version,
                        "url"       : asset.browser_download_url,
                        "file"      : asset.name,
                        "target"    : target,
                        "date"      : formattedDate,
                        "notes"     : release.body
                    };
                    releases[target].push(descriptor);
                });
            });
            loadUnifiedBuilds(releases);
        };

        function supportsUnifiedTargets(version) {
            return semver.gte(version.split(' ')[0], '4.1.0-RC1');
        }

        function hasUnifiedTargetBuild(builds) {
            // Find a build that is newer than 4.1.0, return true if found
            return Object.keys(builds).some(function (key) {
                return builds[key].some(function(target) {
                    return supportsUnifiedTargets(target.version);
                });
            });
        }

        function loadUnifiedBuilds(builds) {
            var expirationPeriod = 3600 * 2; // Two of your earth hours.
            var checkTime = Math.floor(Date.now() / 1000); // Lets deal in seconds.
            if (builds && hasUnifiedTargetBuild(builds)) {
                console.log('loaded some builds for later');
                const storageTag = 'unifiedSourceCache';
                chrome.storage.local.get(storageTag, function (result) {
                    let storageObj = result[storageTag];
                    if(!storageObj || !storageObj.lastUpdate || checkTime - storageObj.lastUpdate > expirationPeriod) {
                        console.log('go get', unifiedSource);
                        $.get(unifiedSource, function(data, textStatus, jqXHR) {
                            // Cache the information for later use.
                            let newStorageObj = {};
                            let newDataObj = {};
                            newDataObj.lastUpdate = checkTime;
                            newDataObj.data = data;
                            newStorageObj[storageTag] = newDataObj;
                            chrome.storage.local.set(newStorageObj);

                            parseUnifiedBuilds(data, builds);
                        }).fail(xhr => {
                            console.log('failed to get new', unifiedSource, 'cached data', Math.floor((checkTime - storageObj.lastUpdate) / 60), 'mins old');
                            parseUnifiedBuilds(storageObj.data, builds);
                        });
                    } else {
                      // In the event that the cache is okay
                      console.log('unified config cached data', Math.floor((checkTime - storageObj.lastUpdate)/60), 'mins old');
                      parseUnifiedBuilds(storageObj.data, builds);
                    }
                });
            } else {
                populateBoardOptions(builds);
            }
        }

        function parseUnifiedBuilds(data, builds) {
            if (!data) {
                return;
            }
            let releases = {};
            let unifiedConfigs = {};
            let items = {};
            // Get the legacy builds
            Object.keys(builds).forEach(function (targetName) {
                items[targetName] = { };
                releases[targetName] = builds[targetName];
            });
            // Get the Unified Target configurations
            data.forEach(function(target) {
                const TARGET_REGEXP = /^([^-]{1,4})-(.*).config$/;
                let targetParts = target.name.match(TARGET_REGEXP);
                if (!targetParts) {
                    return;
                }
                const targetName = targetParts[2];
                const manufacturerId = targetParts[1];
                items[targetName] = { };
                unifiedConfigs[targetName] = (unifiedConfigs[targetName] || {});
                unifiedConfigs[targetName][manufacturerId] = target;
            });
            var boards_e = $('select[name="board"]');
            var versions_e = $('select[name="firmware_version"]');
            boards_e.empty()
                .append($(`<option value='0'>${i18n.getMessage("firmwareFlasherOptionLabelSelectBoard")}</option>`));

            versions_e.empty()
                .append($(`<option value='0'>${i18n.getMessage("firmwareFlasherOptionLabelSelectFirmwareVersion")}</option>`));
            var selectTargets = [];
            Object.keys(items)
                .sort()
                .forEach(function(target, i) {
                    let item = items[target];

                    const select_e = $(`<option value='${target}'>${target}</option>"`);
                    boards_e.append(select_e);
                });
            TABS.firmware_flasher.releases = releases;
            TABS.firmware_flasher.unifiedConfigs = unifiedConfigs;

            ConfigStorage.get('selected_board', function (result) {
                if (result.selected_board) {
                    var boardReleases = TABS.firmware_flasher.unifiedConfigs[result.selected_board]
                        || TABS.firmware_flasher.releases[result.selected_board];
                    $('select[name="board"]').val(boardReleases ? result.selected_board : 0).trigger('change');
                }
            });
        }

        var buildTypes = [
            {
                tag: 'firmwareFlasherOptionLabelBuildTypeRelease',
                loader: () => self.releaseChecker.loadReleaseData(releaseData => processBoardOptions(releaseData, false))
            },
            {
                tag: 'firmwareFlasherOptionLabelBuildTypeReleaseCandidate',
                loader: () => self.releaseChecker.loadReleaseData(releaseData => processBoardOptions(releaseData, true))
            }
        ];

        var ciBuildsTypes = self.jenkinsLoader._jobs.map(job => {
            if (job.title === "Development") {
                return {
                    tag: "firmwareFlasherOptionLabelBuildTypeDevelopment",
                    loader: () => self.jenkinsLoader.loadBuilds(job.name, loadUnifiedBuilds)
                };
            }
            return {
                title: job.title,
                loader: () => self.jenkinsLoader.loadBuilds(job.name, loadUnifiedBuilds)
            };
        })
        var buildTypesToShow;

        var buildType_e = $('select[name="build_type"]');
        function buildBuildTypeOptionsList() {
            buildType_e.empty();
            buildTypesToShow.forEach((build, index) => {
                buildType_e.append($("<option value='{0}'>{1}</option>".format(index, build.tag ? i18n.getMessage(build.tag) : build.title)))
            });
            buildType_e.val($('select[name="build_type"] option:first').val());
        }

        function showOrHideBuildTypes() {
            var showExtraReleases = $(this).is(':checked');

            if (showExtraReleases) {
                $('tr.build_type').show();
                $('tr.expert_mode').show();
            } else {
                $('tr.build_type').hide();
                $('tr.expert_mode').hide();
                buildType_e.val(0).trigger('change');
            }
        }

        var globalExpertMode_e = $('input[name="expertModeCheckbox"]');
        function showOrHideBuildTypeSelect() {
            var expertModeChecked = $(this).is(':checked');

            globalExpertMode_e.prop('checked', expertModeChecked);
            if (expertModeChecked) {
                buildTypesToShow = buildTypes.concat(ciBuildsTypes);
                buildBuildTypeOptionsList();
            } else {
                buildTypesToShow = buildTypes;
                buildBuildTypeOptionsList();
                buildType_e.val(0).trigger('change');
            }
        }

        var expertMode_e = $('.tab-firmware_flasher input.expert_mode');
        expertMode_e.prop('checked', globalExpertMode_e.is(':checked'));
        $('input.show_development_releases').change(showOrHideBuildTypes).change();
        expertMode_e.change(showOrHideBuildTypeSelect).change();

        // translate to user-selected language
        i18n.localizePage();

        buildType_e.change(function() {
            analytics.setFirmwareData(analytics.DATA.FIRMWARE_CHANNEL, $('option:selected', this).text());

            $("a.load_remote_file").addClass('disabled');
            var build_type = $(this).val();

            $('select[name="board"]').empty()
            .append($(`<option value='0'>${i18n.getMessage("firmwareFlasherOptionLoading")}</option>`));

            $('select[name="firmware_version"]').empty()
            .append($(`<option value='0'>${i18n.getMessage("firmwareFlasherOptionLoading")}</option>`));

            if (!GUI.connect_lock) {
                TABS.firmware_flasher.unifiedConfigs = {};
                buildTypesToShow[build_type].loader();
            }

            chrome.storage.local.set({'selected_build_type': build_type});
        });

        function populateBuilds(builds, target, manufacturerId, duplicateName, targetVersions, callback) {
            if (targetVersions) {
                targetVersions.forEach(function(descriptor) {
                    const versionRegex = /^(\d.\d.\d(?:-\w+)?)(?: #(\d+))?$/;
                    const versionParts = descriptor.version.match(versionRegex);
                    if (!versionParts) {
                        return;
                    }
                    let version = versionParts[1];
                    const buildNumber = versionParts[2] ? `${versionParts[2]}` : '';


                    const build = { descriptor };
                    
                    // cleanflight_2.5.0_SPRACINGF7DUAL.hex          -> ""
                    // cleanflight_2.5.0_SPRACINGF7DUAL-NO_VTX.hex   -> "NO_VTX"
                    var targetFromFilenameExpression = /cleanflight_([\d.]+)?_?(\w+)\-?(.*)?\.(.*)/;
                    var match = targetFromFilenameExpression.exec(descriptor.file);
                    build.buildOptions = match[3];

                    if (manufacturerId) {
                        if (!supportsUnifiedTargets(descriptor.version)) {
                            return;
                        }

                        version = `${version}+${buildNumber}${manufacturerId}`;
                        build.manufacturerId = manufacturerId;
                        build.duplicateName = duplicateName;
                    } else {
                        version = `${version}+${buildNumber}-legacy`;
                        build.isLegacy = true;
                    }
                    
                    build.version = version;
                    
                    builds.push(build);
                });
            }

            if (callback) {
                callback();
            }
        }

        function populateVersions(versions_element, builds, target) {
            const sortVersions = function (a, b) {
                return -semver.compareBuild(a.version, b.version);
            };

            versions_element.empty();
            
            if (builds.length > 0) {
                versions_element.append($("<option value='0'>{0} {1}</option>".format(i18n.getMessage('firmwareFlasherOptionLabelSelectFirmwareVersionFor'), target)));
                builds
                    .sort(sortVersions)
                    .forEach(function(build) {
                        if (!build.isLegacy && !supportsUnifiedTargets(build.descriptor.version)) {
                            return;
                        }

                        var versionAndBuildOptions = build.descriptor.version;
                        if (!(build.buildOptions === undefined)) {
                            versionAndBuildOptions += "-" + build.buildOptions;
                        }

                        let versionLabel;
                        if (build.isLegacy) {
                            versionLabel = i18n.getMessage("firmwareFlasherLegacyLabel", { target: versionAndBuildOptions });
                        } else if (build.manufacturerId) {
                            versionLabel = `${versionAndBuildOptions} (${build.manufacturerId})`;
                        } else {
                            versionLabel = versionAndBuildOptions;
                        }

                        var select_e =
                            $("<option value='{0}'>{2} - {1}</option>".format(
                                    build.version,
                                    build.descriptor.date,
                                    versionLabel
                            ));
                        if (FirmwareCache.has(build.descriptor)) {
                            select_e.addClass("cached");
                        }
                        select_e.data('summary', build.descriptor);
                        versions_element.append(select_e);
                    });
                    // Assume flashing latest, so default to it.
                versions_element.prop("selectedIndex", 1).change();
            }
        }

        function grabBuildNameFromConfig(config) {
            let bareBoard;
            try {
                bareBoard = config.split("\n")[0].split(' ')[3];
            } catch (e) {
                bareBoard = undefined;
                console.log('grabBuildNameFromConfig failed: ', e.message);
            }
            return bareBoard;
        }

        function setUnifiedConfig(target, bareBoard, targetConfig, manufacturerId, fileName, fileUrl, date) {
            // a target might request a firmware with the same name, remove configuration in this case.
            if (bareBoard == target) {
                self.unifiedTarget = {};
            } else {
                self.unifiedTarget.config = targetConfig;
                self.unifiedTarget.manufacturerId = manufacturerId;
                self.unifiedTarget.fileName = fileName;
                self.unifiedTarget.fileUrl = fileUrl;
                self.unifiedTarget.date = date;
                self.isConfigLocal = false;
            }
        }

        function clearBufferedFirmware() {
            self.isConfigLocal = false;
            self.unifiedTarget = {};
            self.intel_hex = undefined;
            self.parsed_hex = undefined;
            self.localFirmwareLoaded = false;
        }

        $('select[name="board"]').change(function() {
            $("a.load_remote_file").addClass('disabled');
            var target = $(this).val();

            if (!GUI.connect_lock) {
                if (TABS.firmware_flasher.selectedBoard != target) {
                    // We're sure the board actually changed
                    if (self.isConfigLocal) {
                        console.log('Board changed, unloading local config');
                        self.isConfigLocal = false;
                        self.unifiedTarget = {};
                    }
                }
                ConfigStorage.set({'selected_board': target});
                TABS.firmware_flasher.selectedBoard = target;
                TABS.firmware_flasher.bareBoard = undefined;
                console.log('board changed to', target);

                self.flashingMessage(i18n.getMessage('firmwareFlasherLoadFirmwareFile'), self.FLASH_MESSAGE_TYPES.NEUTRAL)
                    .flashProgress(0);

                $('div.git_info').slideUp();
                $('div.release_info').slideUp();

                if (!self.localFirmwareLoaded) {
                    self.enableFlashing(false);
                }

                var versions_e = $('select[name="firmware_version"]');
                if (target == 0) {
                    // target == 0 is the "Choose a Board" option. Throw out anything loaded
                    clearBufferedFirmware();

                    versions_e.empty();
                    versions_e.append($("<option value='0'>{0}</option>".format(i18n.getMessage('firmwareFlasherOptionLabelSelectFirmwareVersion'))));
                } else {
                    // Show a loading message as there is a delay in loading a configuration
                    versions_e.empty();
                    versions_e.append($("<option value='0'>{0}</option>".format(i18n.getMessage('firmwareFlasherOptionLoading'))));

                    let selecteBuild = buildTypesToShow[$('select[name="build_type"]').val()];
                    const builds = [];

                    const finishPopulatingBuilds = function () {
                        if (TABS.firmware_flasher.releases[target]) {
                            TABS.firmware_flasher.bareBoard = target;
                            populateBuilds(builds, target, undefined, false, TABS.firmware_flasher.releases[target]);
                        }

                        populateVersions(versions_e, builds, target);
                    };

                    if (TABS.firmware_flasher.unifiedConfigs[target]) {
                        const storageTag = 'unifiedConfigLast';
                        var expirationPeriod = 3600; // One of your earth hours.
                        var checkTime = Math.floor(Date.now() / 1000); // Lets deal in seconds.
                        chrome.storage.local.get(storageTag, function (result) {
                            let storageObj = result[storageTag];
                            const unifiedConfigList = TABS.firmware_flasher.unifiedConfigs[target];
                            const manufacturerIds = Object.keys(unifiedConfigList);
                            const duplicateName = manufacturerIds.length > 1;

                            const processManufacturer = function(index) {
                                const processNext = function () {
                                    if (index < manufacturerIds.length - 1) {
                                        processManufacturer(index + 1);
                                    } else {
                                        finishPopulatingBuilds();
                                    }
                                };

                                const manufacturerId = manufacturerIds[index];
                                const targetId = `${target}+${manufacturerId}`;
                                // Check to see if the cached configuration is the one we want.
                                if (!storageObj || !storageObj.targetId || storageObj.targetId !== targetId
                                    || !storageObj.lastUpdate || checkTime - storageObj.lastUpdate > expirationPeriod
                                    || !storageObj.unifiedTarget) {
                                    const unifiedConfig = unifiedConfigList[manufacturerId];
                                    // Have to go and try and get the unified config, and then do stuff
                                    $.get(unifiedConfig.download_url, function(targetConfig) {
                                        console.log('got unified config');

                                        const bareBoard = grabBuildNameFromConfig(targetConfig);
                                        TABS.firmware_flasher.bareBoard = bareBoard;

                                        self.gitHubApi.getFileLastCommitInfo('betaflight/unified-targets', 'master', unifiedConfig.path, function (commitInfo) {
                                            targetConfig = self.injectTargetInfo(targetConfig, target, manufacturerId, commitInfo);

                                            setUnifiedConfig(target, bareBoard, targetConfig, manufacturerId, unifiedConfig.name, unifiedConfig.download_url, commitInfo.date);

                                            // cache it for later
                                            let newStorageObj = {};
                                            newStorageObj[storageTag] = {
                                                unifiedTarget: self.unifiedTarget,
                                                targetId: targetId,
                                                lastUpdate: checkTime,
                                            };
                                            chrome.storage.local.set(newStorageObj);

                                            populateBuilds(builds, target, manufacturerId, duplicateName, TABS.firmware_flasher.releases[bareBoard], processNext);
                                        });
                                    }).fail(xhr => {
                                        //TODO error, populate nothing?
                                        self.unifiedTarget = {};
                                        self.isConfigLocal = false;
                                        const baseFileName = unifiedConfig.download_url;
                                        GUI.log(i18n.getMessage('firmwareFlasherFailedToLoadUnifiedConfig', { remote_file: baseFileName }));
                                    });
                                } else {
                                    console.log('We have the config cached for', targetId);
                                    const unifiedTarget = storageObj.unifiedTarget;

                                    const bareBoard = grabBuildNameFromConfig(unifiedTarget.config);
                                    TABS.firmware_flasher.bareBoard = bareBoard;

                                    if (target === bareBoard) {
                                        self.unifiedTarget = {};
                                    } else {
                                        self.unifiedTarget = unifiedTarget;
                                    }

                                    populateBuilds(builds, target, manufacturerId, duplicateName, TABS.firmware_flasher.releases[bareBoard], processNext);
                                }
                            };

                            processManufacturer(0);
                        });
                    } else {
                        self.unifiedTarget = {};
                        finishPopulatingBuilds();
                    }
                }
            }
        });

        function flashingMessageLocal() {
            // used by the a.load_file hook, evaluate the loaded information, and enable flashing if suitable
            if (self.isConfigLocal && !self.parsed_hex) {
                self.flashingMessage(i18n.getMessage('firmwareFlasherLoadedConfig'), self.FLASH_MESSAGE_TYPES.NEUTRAL);
            }
            if (self.isConfigLocal && self.parsed_hex && !self.localFirmwareLoaded) {
                self.enableFlashing(true);
                self.flashingMessage(i18n.getMessage('firmwareFlasherFirmwareLocalLoaded', self.parsed_hex.bytes_total), self.FLASH_MESSAGE_TYPES.NEUTRAL);
            }
            if (self.localFirmwareLoaded) {
                self.enableFlashing(true);
                self.flashingMessage(i18n.getMessage('firmwareFlasherFirmwareLocalLoaded', self.parsed_hex.bytes_total), self.FLASH_MESSAGE_TYPES.NEUTRAL);
            }
        }

        function cleanUnifiedConfigFile(input) {
            let output = [];
            let inComment = false;
            for (let i=0; i < input.length; i++) {
                if (input.charAt(i) == "\n" || input.charAt(i) == "\r") {
                    inComment = false;
                }
                if (input.charAt(i) == "#") {
                    inComment = true;
                }
                if (!inComment && input.charCodeAt(i) > 255) {
                    // Note: we're not showing this error in betaflight-configurator
                    throw new Error('commands are limited to characters 0-255, comments have no limitation');
                }
                if (input.charCodeAt(i) > 255) {
                    output.push('_');
                } else {
                    output.push(input.charAt(i));
                }
            }
            return output.join('');
        }

        const portPickerElement = $('div#port-picker #port');
        function flashFirmware(firmware) {
            var options = {};

            var eraseAll = false;
            if ($('input.erase_chip').is(':checked')) {
                options.erase_chip = true;

                eraseAll = true
            }
            analytics.setFirmwareData(analytics.DATA.FIRMWARE_ERASE_ALL, eraseAll.toString());

            if (!$('option:selected', portPickerElement).data().isDFU) {
                if (String(portPickerElement.val()) !== '0') {
                    const port = String(portPickerElement.val());

                    if ($('input.updating').is(':checked')) {
                        options.no_reboot = true;
                    } else {
                        options.reboot_baud = parseInt($('div#port-picker #baud').val());
                    }

                    let baud = 115200;
                    if ($('input.flash_manual_baud').is(':checked')) {
                        baud = parseInt($('#flash_manual_baud_rate').val());
                    }

                    analytics.sendEvent(analytics.EVENT_CATEGORIES.FLASHING, 'Flashing', self.unifiedTarget.fileName || null);

                    STM32.connect(port, baud, firmware, options);
                } else {
                    console.log('Please select valid serial port');
                    GUI.log(i18n.getMessage('firmwareFlasherNoValidPort'));
                }
            } else {
                analytics.sendEvent(analytics.EVENT_CATEGORIES.FLASHING, 'Flashing', self.unifiedTarget.fileName || null);

                STM32DFU.connect(usbDevices, firmware, options);
            }
        }

        ConfigStorage.get('erase_chip', function (result) {
            if (result.erase_chip) {
                $('input.erase_chip').prop('checked', true);
            } else {
                $('input.erase_chip').prop('checked', false);
            }

            $('input.erase_chip').change(function () {
                ConfigStorage.set({'erase_chip': $(this).is(':checked')});
            }).change();
        });

        chrome.storage.local.get('show_development_releases', function (result) {
            $('input.show_development_releases')
            .prop('checked', result.show_development_releases)
            .change(function () {
                chrome.storage.local.set({'show_development_releases': $(this).is(':checked')});
            }).change();

        });

        chrome.storage.local.get('selected_build_type', function (result) {
            // ensure default build type is selected
            buildType_e.val(result.selected_build_type || 0).trigger('change');
        });

        ConfigStorage.get('no_reboot_sequence', function (result) {
            if (result.no_reboot_sequence) {
                $('input.updating').prop('checked', true);
                $('.flash_on_connect_wrapper').show();
            } else {
                $('input.updating').prop('checked', false);
            }

            // bind UI hook so the status is saved on change
            $('input.updating').change(function() {
                var status = $(this).is(':checked');

                if (status) {
                    $('.flash_on_connect_wrapper').show();
                } else {
                    $('input.flash_on_connect').prop('checked', false).change();
                    $('.flash_on_connect_wrapper').hide();
                }

                ConfigStorage.set({'no_reboot_sequence': status});
            });

            $('input.updating').change();
        });

        ConfigStorage.get('flash_manual_baud', function (result) {
            if (result.flash_manual_baud) {
                $('input.flash_manual_baud').prop('checked', true);
            } else {
                $('input.flash_manual_baud').prop('checked', false);
            }

            // bind UI hook so the status is saved on change
            $('input.flash_manual_baud').change(function() {
                var status = $(this).is(':checked');
                ConfigStorage.set({'flash_manual_baud': status});
            });

            $('input.flash_manual_baud').change();
        });

        ConfigStorage.get('flash_manual_baud_rate', function (result) {
            $('#flash_manual_baud_rate').val(result.flash_manual_baud_rate);

            // bind UI hook so the status is saved on change
            $('#flash_manual_baud_rate').change(function() {
                var baud = parseInt($('#flash_manual_baud_rate').val());
                ConfigStorage.set({'flash_manual_baud_rate': baud});
            });

            $('input.flash_manual_baud_rate').change();
        });

        // UI Hooks
        $('a.load_file').click(function () {
            self.enableFlashing(false);
            self.developmentFirmwareLoaded = false;

            analytics.setFirmwareData(analytics.DATA.FIRMWARE_CHANNEL, undefined);
            analytics.setFirmwareData(analytics.DATA.FIRMWARE_SOURCE, 'file');

            chrome.fileSystem.chooseEntry({
                type: 'openFile',
                accepts: [
                    {
                        description: 'target files',
                        extensions: ['hex', 'config']
                    }
                ]
            }, function (fileEntry) {
                if (chrome.runtime.lastError) {
                    console.error(chrome.runtime.lastError.message);

                    return;
                }

                // hide github info (if it exists)
                $('div.git_info').slideUp();

                chrome.fileSystem.getDisplayPath(fileEntry, function (path) {
                    console.log('Loading file from: ' + path);

                    fileEntry.file(function (file) {
                        analytics.setFirmwareData(analytics.DATA.FIRMWARE_NAME, file.name);
                        var reader = new FileReader();

                        reader.onloadend = function(e) {
                            if (e.total != 0 && e.total == e.loaded) {
                                console.log('File loaded (' + e.loaded + ')');

                                if (file.name.split('.').pop() === "hex") {
                                    self.intel_hex = e.target.result;

                                    parse_hex(self.intel_hex, function (data) {
                                        self.parsed_hex = data;

                                        if (self.parsed_hex) {
                                            analytics.setFirmwareData(analytics.DATA.FIRMWARE_SIZE, self.parsed_hex.bytes_total);
                                            self.localFirmwareLoaded = true;

                                            flashingMessageLocal();
                                        } else {
                                            self.flashingMessage(i18n.getMessage('firmwareFlasherHexCorrupted'), self.FLASH_MESSAGE_TYPES.INVALID);
                                        }
                                    });
                                } else {
                                    clearBufferedFirmware();
                                    try {
                                        self.unifiedTarget.config = cleanUnifiedConfigFile(e.target.result);
                                        self.unifiedTarget.fileName = file.name;
                                        self.isConfigLocal = true;
                                        flashingMessageLocal();
                                    } catch(err) {
                                        self.flashingMessage(i18n.getMessage('firmwareFlasherConfigCorrupted'), self.FLASH_MESSAGE_TYPES.INVALID);
                                        GUI.log(i18n.getMessage('firmwareFlasherConfigCorruptedLogMessage'));
                                    }
                                }
                            }
                        };

                        reader.readAsText(file);
                    });
                });
            });
        });

        /**
         * Lock / Unlock the firmware download button according to the firmware selection dropdown.
         */
        $('select[name="firmware_version"]').change(function(evt){
            $('div.release_info').slideUp();

            if (!self.localFirmwareLoaded) {
                self.enableFlashing(false);
                self.flashingMessage(i18n.getMessage('firmwareFlasherLoadFirmwareFile'), self.FLASH_MESSAGE_TYPES.NEUTRAL);
                if(self.parsed_hex && self.parsed_hex.bytes_total) {
                    // Changing the board triggers a version change, so we need only dump it here.
                    console.log('throw out loaded hex');
                    self.intel_hex = undefined;
                    self.parsed_hex = undefined;
                }
            }

            let release = $("option:selected", evt.target).data("summary");
            let isCached = FirmwareCache.has(release);
            if (evt.target.value === "0" || isCached) {
                if (isCached) {
                    analytics.setFirmwareData(analytics.DATA.FIRMWARE_SOURCE, 'cache');

                    FirmwareCache.get(release, cached => {
                        analytics.setFirmwareData(analytics.DATA.FIRMWARE_NAME, release.file);
                        console.info("Release found in cache: " + release.file);

                        self.developmentFirmwareLoaded = buildTypesToShow[$('select[name="build_type"]').val()].tag === 'firmwareFlasherOptionLabelBuildTypeDevelopment';

                        onLoadSuccess(cached.hexdata, release);
                    });
                }
                $("a.load_remote_file").addClass('disabled');
            }
            else {
                $("a.load_remote_file").removeClass('disabled');
            }
        });

        $('a.load_remote_file').click(function (evt) {
            self.enableFlashing(false);
            self.localFirmwareLoaded = false;
            self.developmentFirmwareLoaded = buildTypesToShow[$('select[name="build_type"]').val()].tag === 'firmwareFlasherOptionLabelBuildTypeDevelopment';

            analytics.setFirmwareData(analytics.DATA.FIRMWARE_SOURCE, 'http');

            if ($('select[name="firmware_version"]').val() == "0") {
                GUI.log(i18n.getMessage('firmwareFlasherNoFirmwareSelected'));
                return;
            }

            function failed_to_load() {
                $('span.progressLabel').attr('i18n','firmwareFlasherFailedToLoadOnlineFirmware').removeClass('i18n-replaced');
                $("a.load_remote_file").removeClass('disabled');
                $("a.load_remote_file").text(i18n.getMessage('firmwareFlasherButtonLoadOnline'));
                i18n.localizePage();
            }

            var summary = $('select[name="firmware_version"] option:selected').data('summary');
            if (summary) { // undefined while list is loading or while running offline
                if (self.isConfigLocal && FirmwareCache.has(summary)) {
                    // Load the .hex from Cache if available when the user is providing their own config.
                    analytics.setFirmwareData(analytics.DATA.FIRMWARE_SOURCE, 'cache');
                    FirmwareCache.get(summary, cached => {
                        analytics.setFirmwareData(analytics.DATA.FIRMWARE_NAME, summary.file);
                        console.info("Release found in cache: " + summary.file);
                        onLoadSuccess(cached.hexdata, summary);
                    });
                    return;
                }
                analytics.setFirmwareData(analytics.DATA.FIRMWARE_NAME, summary.file);
                $("a.load_remote_file").text(i18n.getMessage('firmwareFlasherButtonDownloading'));
                $("a.load_remote_file").addClass('disabled');
                $.get(summary.url, onLoadSuccess).fail(failed_to_load);
            } else {
                $('span.progressLabel').attr('i18n','firmwareFlasherFailedToLoadOnlineFirmware').removeClass('i18n-replaced');
                i18n.localizePage();
            }
        });

        const exitDfuElement = $('a.exit_dfu');
        exitDfuElement.click(function () {
            if (!$(this).hasClass('disabled')) {
                if (!GUI.connect_lock) { // button disabled while flashing is in progress
                    analytics.sendEvent(analytics.EVENT_CATEGORIES.FLASHING, 'ExitDfu', null);
                    try {
                        STM32DFU.connect(usbDevices, self.parsed_hex, { exitDfu: true });
                    } catch (e) {
                        console.log(`Exiting DFU failed: ${e.message}`);
                    }
                }
            }
        });

        portPickerElement.change(function () {
            if ($('option:selected', this).data().isDFU) {
                exitDfuElement.removeClass('disabled');
            } else {
                exitDfuElement.addClass('disabled');
            }
        }).change();

        $('a.flash_firmware').click(function () {
            if (!$(this).hasClass('disabled')) {
                if (self.developmentFirmwareLoaded) {
                    checkShowAcknowledgementDialog();
                } else {
                    startFlashing();
                }
            }
        });

        function checkShowAcknowledgementDialog() {
            const DAY_MS = 86400 * 1000;
            const storageTag = 'lastDevelopmentWarningTimestamp';

            function setAcknowledgementTimestamp() {
                const storageObj = {};
                storageObj[storageTag] = Date.now();
                chrome.storage.local.set(storageObj);
            }

            chrome.storage.local.get(storageTag, function (result) {
                if (!result[storageTag] || Date.now() - result[storageTag] > DAY_MS) {

                    showAcknowledgementDialog(setAcknowledgementTimestamp);
                } else {
                    startFlashing();
                }
            });
        }

        function showAcknowledgementDialog(acknowledgementCallback) {
            const dialog = $('#dialogUnstableFirmwareAcknoledgement')[0];
            const flashButtonElement = $('#dialogUnstableFirmwareAcknoledgement-flashbtn');
            const acknowledgeCheckboxElement = $('input[name="dialogUnstableFirmwareAcknoledgement-acknowledge"]');

            acknowledgeCheckboxElement.change(function () {
                if ($(this).is(':checked')) {
                    flashButtonElement.removeClass('disabled');
                } else {
                    flashButtonElement.addClass('disabled');
                }
            });

            flashButtonElement.click(function() {
                dialog.close();

                if (acknowledgeCheckboxElement.is(':checked')) {
                    if (acknowledgementCallback) {
                        acknowledgementCallback();
                    }

                    startFlashing();
                }
            });

            $('#dialogUnstableFirmwareAcknoledgement-cancelbtn').click(function() {
                dialog.close();
            });

            dialog.addEventListener('close', function () {
                acknowledgeCheckboxElement.prop('checked', false).change();
            });

            dialog.showModal();
        }

        function startFlashing() {
            exitDfuElement.addClass('disabled');
            if (!GUI.connect_lock) { // button disabled while flashing is in progress
                if (self.parsed_hex) {
                    try {
                        if (self.unifiedTarget.config && !self.parsed_hex.configInserted) {
                            var configInserter = new ConfigInserter();

                            if (configInserter.insertConfig(self.parsed_hex, self.unifiedTarget.config)) {
                                self.parsed_hex.configInserted = true;
                            } else {
                                console.log('Firmware does not support custom defaults.');

                                self.unifiedTarget = {};
                            }
                        }

                        flashFirmware(self.parsed_hex);
                    } catch (e) {
                        console.log(`Flashing failed: ${e.message}`);
                    }
                } else {
                    $('span.progressLabel').attr('i18n','firmwareFlasherFirmwareNotLoaded').removeClass('i18n-replaced');
                    i18n.localizePage();
                }
            }
        }

        $('span.progressLabel a.save_firmware').click(function () {
            var summary = $('select[name="firmware_version"] option:selected').data('summary');
            chrome.fileSystem.chooseEntry({type: 'saveFile', suggestedName: summary.file, accepts: [{description: 'HEX files', extensions: ['hex']}]}, function (fileEntry) {
                if (chrome.runtime.lastError) {
                    console.error(chrome.runtime.lastError.message);
                    return;
                }

                chrome.fileSystem.getDisplayPath(fileEntry, function (path) {
                    console.log('Saving firmware to: ' + path);

                    // check if file is writable
                    chrome.fileSystem.isWritableEntry(fileEntry, function (isWritable) {
                        if (isWritable) {
                            var blob = new Blob([self.intel_hex], {type: 'text/plain'});

                            fileEntry.createWriter(function (writer) {
                                var truncated = false;

                                writer.onerror = function (e) {
                                    console.error(e);
                                };

                                writer.onwriteend = function() {
                                    if (!truncated) {
                                        // onwriteend will be fired again when truncation is finished
                                        truncated = true;
                                        writer.truncate(blob.size);

                                        return;
                                    }

                                    analytics.sendEvent(analytics.EVENT_CATEGORIES.FLASHING, 'SaveFirmware', path);
                                };

                                writer.write(blob);
                            }, function (e) {
                                console.error(e);
                            });
                        } else {
                            console.log('You don\'t have write permissions for this file, sorry.');
                            GUI.log(i18n.getMessage('firmwareFlasherWritePermissions'));
                        }
                    });
                });
            });
        });

        $('input.flash_on_connect').change(function () {
            var status = $(this).is(':checked');

            if (status) {
                var catch_new_port = function () {
                    PortHandler.port_detected('flash_detected_device', function (result) {
                        var port = result[0];

                        if (!GUI.connect_lock) {
                            GUI.log(i18n.getMessage('firmwareFlasherFlashTrigger', [port]));
                            console.log('Detected: ' + port + ' - triggering flash on connect');

                            // Trigger regular Flashing sequence
                            GUI.timeout_add('initialization_timeout', function () {
                                $('a.flash_firmware').click();
                            }, 100); // timeout so bus have time to initialize after being detected by the system
                        } else {
                            GUI.log(i18n.getMessage('firmwareFlasherPreviousDevice', [port]));
                        }

                        // Since current port_detected request was consumed, create new one
                        catch_new_port();
                    }, false, true);
                };

                catch_new_port();
            } else {
                PortHandler.flush_callbacks();
            }
        }).change();

        $(document).keypress(function (e) {
            if (e.which == 13) { // enter
                // Trigger regular Flashing sequence
                $('a.flash_firmware').click();
            }
        });

        self.flashingMessage(i18n.getMessage('firmwareFlasherLoadFirmwareFile'), self.FLASH_MESSAGE_TYPES.NEUTRAL);

        // Update Firmware button at top
        $('div#flashbutton a.flash_state').addClass('active');
        $('div#flashbutton a.flash').addClass('active');
        GUI.content_ready(callback);
    }

    self.jenkinsLoader.loadJobs('Firmware', () => {
       $('#content').load("./tabs/firmware_flasher.html", onDocumentLoad);
    });
};

TABS.firmware_flasher.cleanup = function (callback) {
    PortHandler.flush_callbacks();
    FirmwareCache.unload();

    // unbind "global" events
    $(document).unbind('keypress');
    $(document).off('click', 'span.progressLabel a');

    // Update Firmware button at top
    $('div#flashbutton a.flash_state').removeClass('active');
    $('div#flashbutton a.flash').removeClass('active');

    analytics.resetFirmwareData();

    if (callback) callback();
};

TABS.firmware_flasher.enableFlashing = function (enabled) {
    var self = this;

    if (enabled) {
        $('a.flash_firmware').removeClass('disabled');
    } else {
        $('a.flash_firmware').addClass('disabled');
    }
}

TABS.firmware_flasher.FLASH_MESSAGE_TYPES = {NEUTRAL : 'NEUTRAL',
                                             VALID   : 'VALID',
                                             INVALID : 'INVALID',
                                             ACTION  : 'ACTION'};

TABS.firmware_flasher.flashingMessage = function(message, type) {
    let self = this;

    let progressLabel_e = $('span.progressLabel');
    switch (type) {
        case self.FLASH_MESSAGE_TYPES.VALID:
            progressLabel_e.removeClass('invalid actionRequired')
                           .addClass('valid');
            break;
        case self.FLASH_MESSAGE_TYPES.INVALID:
            progressLabel_e.removeClass('valid actionRequired')
                           .addClass('invalid');
            break;
        case self.FLASH_MESSAGE_TYPES.ACTION:
            progressLabel_e.removeClass('valid invalid')
                           .addClass('actionRequired');
            break;
        case self.FLASH_MESSAGE_TYPES.NEUTRAL:
        default:
            progressLabel_e.removeClass('valid invalid actionRequired');
            break;
    }
    if (message != null) {
        progressLabel_e.html(message);
    }

    return self;
};

TABS.firmware_flasher.flashProgress = function(value) {
    $('.progress').val(value);

    return this;
};

TABS.firmware_flasher.injectTargetInfo = function (targetConfig, targetName, manufacturerId, commitInfo) {
    const targetInfoLineRegex = /^# config: manufacturer_id: .*, board_name: .*, version: .*$, date: .*\n/gm;

    const config = targetConfig.replace(targetInfoLineRegex, '');

    const targetInfo = `# config: manufacturer_id: ${manufacturerId}, board_name: ${targetName}, version: ${commitInfo.commitHash}, date: ${commitInfo.date}`;

    const lines = config.split('\n');
    lines.splice(1, 0, targetInfo);
    return lines.join('\n');
};
