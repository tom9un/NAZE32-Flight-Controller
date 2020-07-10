# Cleanflight

![Cleanflight](cleanflight-1.11.0/docs/assets/cleanflight/cleanflight-logo-light-wide-1-240px.jpg)

Repository hanya untuk NAZE32.


A. Modifikasi source di /src

B. Modifikasi compile, source apa saja yg mau di nonaktifkan ada di :

    /src/main/target/NAZE/target.h

   misal tidak mau menggunakan GPS :
   
    ...
    #define GPS ==> menjadi //#define GPS
    ...

C. Compile sendiri, caranya :

   1. Baca File README.md di folder Firmware sebelum melakukan compile
   2. Pada consule OS, didalam folder cleanflight-1.11.0-NAZE, ketik ==> make TARGET=NAZE
   3. Hasil compile ada di /obj/cleanflight_1.11.0_NAZE.hex

D. NOTES

   IMPORTANT: ** Requires >= v1.1.0 configurator **

   - NOTE: Upgrading from < v1.11.0 will erase your configuration, backup via GUI and CLI before flashing.
   - NOTE: Some defaults have changed. Do NOT blindly restore your backups using the CLI.
   - NOTE: CLI get/set commands have changed. some variables are now set using OFF/ON instead of 0/1.
   - NOTE: Experimental PID controllers have been removed. Only MW23, MWREWRITE and LUXFLOAT remain.
   - NOTE: G-Tune not available on NAZE target, it didn't fit - latest development builds have G-Tune on Naze Target.

   Changes:

   - Improved flight performance.
   - Replaced AUTOTUNE with G-TUNE.
   - More robust SBUS and Spektrum support.
   - Failsafe improvements.
   - Mixer output mapping fixes.
   - I2C overclock feature.
   - Sonar improvements.
   - CLI usabiity improvements.
   - Removed less popular PID controllers - experimentation time is over.
   - Blackbox logging improvements and fixes.
   - USART1 can be used for SerialRX on F3 boards.
   - HoTT Telemetry improvements and fixes.
   - Support Naze32 Rev6.
   - Support RMRC DoDo target.
   - Many other fixes and general improvements.
   - More unit tests.
   - Documentation improvements.
