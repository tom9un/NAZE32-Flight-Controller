# Cleanflight Configurator

Cleanflight Configurator is a crossplatform configuration tool for the [Cleanflight](http://cleanflight.com/) flight control system.

It allows you to configure the Cleanflight software running on any [supported Cleanflight target](https://github.com/cleanflight/cleanflight/blob/master/docs/Boards.md).

Various types of aircraft are supported by the tool and by Cleanflight, e.g. quadcopters, hexacopters, octocopters and fixed-wing aircraft.

There is also now a standalone version available.  The old Google Chrome Apps version of this software will be removed by Google on platforms other than Chrome OS. 

[Downloads are available in Releases page on GitHub.](https://github.com/cleanflight/cleanflight-configurator/releases)

## Project History

Cleanflight Configurator was originally a [fork](#credits) of Baseflight Configurator with support for Cleanflight instead of Baseflight.

This configurator is the only configurator with support for Cleanflight specific features. It will likely require that you run the latest firmware on the flight controller.
If you are experiencing any problems please make sure you are running the [latest firmware version](https://github.com/cleanflight/cleanflight/releases/latest).

## Installation

### Standalone

Download the installer from [Releases.](https://github.com/cleanflight/cleanflight-configurator/releases)

### Via Chrome Web Store

[![available in the Chrome web store](https://developer.chrome.com/webstore/images/ChromeWebStore_Badge_v2_206x58.png)](https://chrome.google.com/webstore/detail/cleanflight-configurator/enacoimjcgeinfnnnpajinjgmkahmfgb)

1. Visit [Chrome web store](https://chrome.google.com/webstore/detail/cleanflight-configurator/enacoimjcgeinfnnnpajinjgmkahmfgb)
2. Click **+ Add to Chrome**

Please note - the application will automatically update itself when new versions are released.  Please ensure you maintain configuration backups as described in the Cleanflight documentation.

### Alternative way, Chrome app:

1. Clone the configurator repository (from Github) to any local directory or download it as zip.
2. Extract to a folder and not the folder.
3. Start Google Chrome.
4. Click the 3-dots on the far right of the URL bar.
5. Select "More Tools"
6. Select "Extensions"
7. Check the Developer Mode checkbox.
8. Click on load unpacked extension.
9. Point it to the folder you extracted the zip to.

## How to use

You can find the Cleanflight Configurator icon in your application tab "Apps"

## Native app build via NW.js

Linux build is disabled currently because of unmet dependecies with some distros, it can be enabled in the `gulpfile.js`.

### Development

1. Install node.js
2. Change to project folder and run `npm install`.
3. Run `npm start`.

### Running tests

`npm test`

### App build and release

The tasks are defined in `gulpfile.js` and can be run either via `gulp <task-name>` (if the command is in PATH or via `../node_modules/gulp/bin/gulp.js <task-name>`:

1. Optional, install gulp `npm install --global gulp-cli`.
2. Run `gulp <taskname> [[platform] [platform] ...]`.

List of possible values of `<task-name>`:
* **dist** copies all the JS and CSS files in the `./dist` folder.
* **apps** builds the apps in the `./apps` folder [1].
* **debug** builds debug version of the apps in the `./debug` folder [1].
* **release** zips up the apps into individual archives in the `./release` folder [1]. 

[1] Running this task on macOS or Linux requires Wine, since it's needed to set the icon for the Windows app (build for specific platform to avoid errors).

#### Build or release app for one specific platform
To build or release only for one specific platform you can append the plaform after the `task-name`.
If no platform is provided, all the platforms will be done in sequence.

* **MacOS** use `gulp <task-name> --osx64`
* **Linux** use `gulp <task-name> --linux64`
* **Windows** use `gulp <task-name> --win32`

You can also use multiple platforms e.g. `gulp <taskname> --osx64 --linux64`.

## Languages

Cleanflight Configurator has been translated into several languages. The application will try to detect and use your system language if a translation into this language is available. You can help [translating the application into your language](https://crowdin.com/project/cleanflight-configurator).

If you prefer to have the application in English or any other language, you can select your desired language in the options menu of the application.

## Notes

### WebGL

Make sure Settings -> System -> "User hardware acceleration when available" is checked to achieve the best performance

### Linux users

If connecting Cleanflight Configurator to your flight controller's USB port does not work out-of-the box, follow this check-list:

1. After connecting, `sudo dmesg` should print a message similar to `usb 2-1.1: new full-speed USB device number 17 using ehci-pci`. If not, there may be a problem with your cable/FC.
2. FCs with USB Virtual Com Port (VCP) usually use USB CDC (Communications Device Class) ACM (Abstract Control Model) protocol. The driver `cdc_acm` (kernel option `CONFIG_USB_ACM`) should pick up the device, `cdc_acm 2-1.1:1.0: ttyACM0: USB ACM device` should appear in `sudo dmesg`.
3. The device file (usually `/dev/ttyACM0`) needs to be writeable by your user account. This is best achieved by creating a udev rule `/etc/udev/rules.d/90-ttyACM-group-plugdev.rules` that contains `KERNEL=="ttyACM[0-9]", GROUP="plugdev"` and ensuring you are in the `plugdev` group using `sudo usermod -aG plugdev YOUR_USERNAME`. Re-plug the device / logout & login for changes to take effect.

### Linux / MacOSX users

If you have 3D model animation problems, enable "Override software rendering list" in Chrome flags chrome://flags/#ignore-gpu-blacklist

## Support

If you need help please reach out on the [cleanflight](https://cleanflight.slack.com/) slack channel before raising issues on github. Register and [request slack access here](http://cleanflight.com/slack).

### Issue trackers

For Cleanflight configurator issues raise them here

https://github.com/cleanflight/cleanflight-configurator/issues

For Cleanflight firmware issues raise them here

https://github.com/cleanflight/cleanflight/issues

### IRC Channel

There is an IRC channel for Cleanflight, here: irc://irc.freenode.net/#cleanflight

## Technical details

The configurator is based on chrome.serial API running on Google Chrome/Chromium core.

## Developers

We accept clean and reasonable patches, submit them!

## Authors

Dominic Clifton/hydra - maintainer of the Cleanflight firmware and configurator. 
ctn - primary author and maintainer of Baseflight Configurator from which Cleanflight Configurator project was forked.


[![Crowdin](https://d322cqt584bo4o.cloudfront.net/cleanflight-configurator/localized.svg)](https://crowdin.com/project/cleanflight-configurator)
