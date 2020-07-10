# Cleanflight

![Cleanflight](cleanflight-1.13.0/docs/assets/cleanflight/cleanflight-logo-light-wide-1-240px.jpg)

Repository hanya untuk NAZE32.


#### A. Modifikasi source di /src

#### B. Modifikasi compile, source apa saja yg mau di nonaktifkan ada di :

    /src/main/target/NAZE/target.h

   misal tidak mau menggunakan GPS :
   
    ...
    #define GPS ==> menjadi //#define GPS
    ...

#### C. Compile sendiri, caranya :

   1. Baca File README.md di folder Firmware sebelum melakukan compile
   2. Pada consule OS, didalam folder cleanflight-1.13.0, ketik ==> make TARGET=NAZE
   3. Hasil compile ada di /obj/cleanflight_1.13.0_NAZE.hex

#### D. NOTES

  - NOTE: Upgrading from < v1.13.0 will erase your configuration, backup via GUI and CLI before flashing.
  - NOTE: Some defaults have changed. Do NOT blindly restore your backups using the CLI.
  - IMPORTANT: Due to some new default settings you should retune your PIDs.

  Changes from v1.12.1 :

  - Enhanced flight performance.
  - Support BlHeli 4w interface for ESCs with BlHeli and Sk Bootloader.
  - BlHeli ESC configuration and flashing support via USB.
  - Mavlink telemetry.
  - Complete overhaul of configuration storage mechanism. Upgrading without loosing settings possible in future.
  - Configurable colors for LED strip modes.
  - New LED strip features for Beacon and GPS status.
  - New OLED display features (PIDs, tasks).
  - Updated task scheduler.
  - Many, many performance optimizations.
  - Substantial code cleanups and reorganization (MSP, Configuraton, PID, Mixer etc).
  - Many additional unit test to further enhance robustness.
  - Enhanced support for new hardware from various vendors (Motolab, Alienflight, SP Racing, TBS, Lumineer, ImmersionRC).
  - Many documentation updates.

  Changes from v1.13.0-RC1 :

  - Fix to baro and headfree modes.
  - Fix airmode not showing as active in configurator.
  - Bug fixes and cleanup of LED strip code for flash size reduction.

  Changes from v1.13.0-RC2 :

  - Documentation updates
  - Minor code cleanups
  - Support MSP_MODECOLOR to allow GUI to configure new LED strip features.
  - Fix to MSP RX.

  Full change log: v1.12.0...v1.13.0

  - NOTE: BlHeli 4w support requires latest BlHeliSuite.

  - NOTE: PID LUX_FLOAT has had its settings scaled to the same values as MWREWRITE so that users can change between LUX_FLOAT and MWREWRITE without changing their PID values.
  
  - NOTE: Your aircraft won't arm if the processor is overloaded. This normally only effects F1 boards (e.g. Naze, Flip and CC3D). If there is a problem with arming with one of these boards users should switch to the MWREWRITE PID or choose other features and settings to reduce CPU load.
