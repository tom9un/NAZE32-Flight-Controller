# Cleanflight

![Cleanflight](docs/assets/cleanflight/cleanflight-logo-light-wide-1-240px.jpg)

Repository hanya untuk NAZE32.


A. Modifikasi source di /src

B. Modifikasi compile, source apa saja yg mau di nonaktifkan ada di :

   /src/main/target/NAZE/target.h

   misal mau tidak menggunakan GPS :
   ...
   #define GPS ==> menjadi //#define GPS
   ...

C. Compile sendiri, caranya :

   1. Buka File BACA.md
   2. Didalam folder cleanflight-1.14.2-NAZE, ketik ==> make TARGET=NAZE
   3. Hasil ada di /obj/cleanflight_1.14.2_NAZE.hex

D. NOTES

  There are new defaults that improve flight performance, suggest flashing with 'FULL CHIP ERASE' selected and selectively restoring your settings so that you get the best performance possible.

  Cleanflight now supports OSD hardware and OSD configuration via the cleanflight configurator.
  Read more about this here: #2210

  Unlike other firmware the OSD support in Cleanflight is NOT based on the legacy MinimOSD codebase. It also works on OSD-ONLY hardware (SPRacingF3OSD) as well as FC-WITH-OSD hardware (SPRacingF3NEO).


  OSD-USERS :

  Suggest flashing with "full-chip erase" selected, when upgrading from factory firmware.
  Ensure OSD board is powered and camera and vtx/screen is connected when flashing so you can monitor the font-upload process which occurs after upgrading firmware or after resetting firmware configuration.

  FC Changes :

  Improved flight performance.
  Updated horizon mode, see docs.
  All-new gyro sync code.
  New gyro/pid task separation to allow gyro filtering.
  Notch filter from Betaflight. Proper usage of notch filter can improve flight performance.
  IBus telemetry.
  Various smartport/frsky telemetry changes and fixes.
  Various new target support and updates.

  FC/OSD changes :

  New voltage meter configuration.
  New current meter configuration.
  Updated MSP API - New Voltage/Amperage/Battery API. Older MSP commands deleted.
  Loads and loads of code-cleanups and minor-fixes.

  OSD Changes :

  New icons.
  New elements.

  NAZE :

  Dropped support for I2C display due to code size reasons. See #2472

  Changes since v1.14.0 :

  Fix heading hold functionality.
  Smartport telemetry ACC readings scaled correctly.

  Changes since v1.14.1 :

  Improve accelerometer filtering.
  Fix acc stabilized flight modes.
  Fix RSSI reading on OSD.
  Add support for SPRacingF3NEO FC/PDB/OSD/VTX FPV Stacking System
  Fix NAZE32 shared UART1/Telemetry crash on arm bug.
  Fix CPU load issue with legacy MW23/MWREWRITE pid controllers.
  Fix CC3D duplicate UART1 issue.
  Fix serial TX buffer overflow (sometimes occured when flashing ESCs)
  Other minor bug fixes.
