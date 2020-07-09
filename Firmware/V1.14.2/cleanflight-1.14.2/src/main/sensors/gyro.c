/*
 * This file is part of Cleanflight.
 *
 * Cleanflight is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Cleanflight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Cleanflight.  If not, see <http://www.gnu.org/licenses/>.
 */

#include <stdbool.h>
#include <stdint.h>
#include <string.h>
#include <math.h>

#include <platform.h>
#include "build/debug.h"

#include "common/axis.h"
#include "common/maths.h"
#include "common/filter.h"
#include "common/time.h"

#include "config/parameter_group.h"
#include "config/parameter_group_ids.h"
#include "config/config_reset.h"

#include "drivers/sensor.h"
#include "drivers/accgyro.h"
#include "drivers/gyro_sync.h"

#include "fc/fc_debug.h"

#include "sensors/sensors.h"

#include "io/beeper.h"
#include "io/statusindicator.h"

#include "sensors/boardalignment.h"

#include "sensors/gyro.h"

gyro_t gyro;                      // gyro access functions
sensor_align_e gyroAlign = 0;

int32_t gyroADC[XYZ_AXIS_COUNT];
float gyroADCf[XYZ_AXIS_COUNT];

static int16_t gyroADCRaw[XYZ_AXIS_COUNT];
static int32_t gyroZero[XYZ_AXIS_COUNT] = { 0, 0, 0 };

static uint16_t calibratingG = 0;

static biquadFilter_t gyroFilterLPF[XYZ_AXIS_COUNT];
static biquadFilter_t gyroFilterNotch[XYZ_AXIS_COUNT];
static pt1Filter_t gyroFilterPt1[XYZ_AXIS_COUNT];

#if !defined(DEFAULT_GYRO_SAMPLE_HZ) && !defined(DEFAULT_PID_PROCESS_DENOM)

#ifdef STM32F10X
#define DEFAULT_PID_PROCESS_DENOM   1
#define DEFAULT_GYRO_SAMPLE_HZ      1000
#else
#define DEFAULT_PID_PROCESS_DENOM   2
#define DEFAULT_GYRO_SAMPLE_HZ      4000
#endif
#endif

#if !defined(DEFAULT_GYRO_SYNC)
#define DEFAULT_GYRO_SYNC           1
#endif

PG_REGISTER_WITH_RESET_TEMPLATE(gyroConfig_t, gyroConfig, PG_GYRO_CONFIG, 0);

PG_RESET_TEMPLATE(gyroConfig_t, gyroConfig,
    .gyro_lpf = GYRO_LPF_256HZ,

    .gyro_soft_type = FILTER_PT1,

    .gyro_soft_lpf_hz = 90,    // software based lpf filter for gyro
    .gyro_soft_notch_hz = 0,
    .gyro_soft_notch_cutoff_hz = 130,

    .gyro_sync = DEFAULT_GYRO_SYNC,
    .pid_process_denom = DEFAULT_PID_PROCESS_DENOM,
    .gyro_sample_hz = DEFAULT_GYRO_SAMPLE_HZ,

    .gyroMovementCalibrationThreshold = 32,
);

void gyroInit(void)
{
    if (gyroConfig()->gyro_soft_lpf_hz) {  // Initialisation needs to happen once sampling rate is known
        const uint16_t gyroPeriodUs = US_FROM_HZ(gyro.sampleFrequencyHz);
        for (int axis = 0; axis < 3; axis++) {
            biquadFilterInitNotch(&gyroFilterNotch[axis], gyroPeriodUs, gyroConfig()->gyro_soft_notch_hz, gyroConfig()->gyro_soft_notch_cutoff_hz);
            if (gyroConfig()->gyro_soft_type == FILTER_BIQUAD) {
                biquadFilterInitLPF(&gyroFilterLPF[axis], gyroConfig()->gyro_soft_lpf_hz,  gyroPeriodUs);
            } else {
                const float gyroDt = (float)gyroPeriodUs * 0.000001f;
                pt1FilterInit(&gyroFilterPt1[axis], gyroConfig()->gyro_soft_lpf_hz, gyroDt);
            }
        }
    }
}

void gyroSetCalibrationCycles(uint16_t calibrationCyclesRequired)
{
    calibratingG = calibrationCyclesRequired;
}

bool isGyroCalibrationComplete(void)
{
    return calibratingG == 0;
}

static bool isOnFinalGyroCalibrationCycle(void)
{
    return calibratingG == 1;
}

static bool isOnFirstGyroCalibrationCycle(void)
{
    return calibratingG == CALIBRATING_GYRO_CYCLES;
}

static void performAcclerationCalibration(uint8_t gyroMovementCalibrationThreshold)
{
    static int32_t g[3];
    static stdev_t var[3];

    for (int axis = 0; axis < 3; axis++) {

        // Reset g[axis] at start of calibration
        if (isOnFirstGyroCalibrationCycle()) {
            g[axis] = 0;
            devClear(&var[axis]);
        }

        // Sum up CALIBRATING_GYRO_CYCLES readings
        g[axis] += gyroADC[axis];
        devPush(&var[axis], gyroADC[axis]);

        // Reset global variables to prevent other code from using un-calibrated data
        gyroADC[axis] = 0;
        gyroZero[axis] = 0;

        if (isOnFinalGyroCalibrationCycle()) {
            float dev = devStandardDeviation(&var[axis]);
            // check deviation and startover in case the model was moved
            if (gyroMovementCalibrationThreshold && dev > gyroMovementCalibrationThreshold) {
                gyroSetCalibrationCycles(CALIBRATING_GYRO_CYCLES);
                return;
            }
            gyroZero[axis] = (g[axis] + (CALIBRATING_GYRO_CYCLES / 2)) / CALIBRATING_GYRO_CYCLES;
        }
    }

    if (isOnFinalGyroCalibrationCycle()) {
        beeper(BEEPER_GYRO_CALIBRATED);
    }
    calibratingG--;
}

void gyroUpdate(void)
{
    // range: +/- 8192; +/- 2000 deg/sec
    if (!gyro.read(gyroADCRaw)) {
        return;
    }

    gyroADC[X] = gyroADCRaw[X];
    gyroADC[Y] = gyroADCRaw[Y];
    gyroADC[Z] = gyroADCRaw[Z];

    alignSensors(gyroADC, gyroADC, gyroAlign);

    if (!isGyroCalibrationComplete()) {
        performAcclerationCalibration(gyroConfig()->gyroMovementCalibrationThreshold);
    }

    gyroADC[X] -= gyroZero[X];
    gyroADC[Y] -= gyroZero[Y];
    gyroADC[Z] -= gyroZero[Z];

    if (gyroConfig()->gyro_soft_lpf_hz) {
        for (int axis = 0; axis < XYZ_AXIS_COUNT; axis++) {

            if (debugMode == DEBUG_GYRO)
                debug[axis] = gyroADC[axis];

            if (gyroConfig()->gyro_soft_type == FILTER_BIQUAD)
                gyroADCf[axis] = biquadFilterApply(&gyroFilterLPF[axis], (float) gyroADC[axis]);
            else
                gyroADCf[axis] = pt1FilterApply(&gyroFilterPt1[axis], (float) gyroADC[axis]);

            if (debugMode == DEBUG_NOTCH)
                debug[axis] = lrintf(gyroADCf[axis]);

            if (gyroConfig()->gyro_soft_notch_hz)
                gyroADCf[axis] = biquadFilterApply(&gyroFilterNotch[axis], gyroADCf[axis]);

            gyroADC[axis] = lrintf(gyroADCf[axis]);
        }
    } else {
        for (int axis = 0; axis < XYZ_AXIS_COUNT; axis++) {
            gyroADCf[axis] = gyroADC[axis];
        }
    }
}
