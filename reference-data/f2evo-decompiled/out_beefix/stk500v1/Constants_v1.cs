using System;
using stk500;

namespace stk500v1;

[Serializable]
public abstract class Constants_v1 : BootLoader
{
	public static byte STK_OK = 16;

	public static byte STK_FAILED = 17;

	public static byte STK_UNKNOWN = 18;

	public static byte STK_NODEVICE = 19;

	public static byte STK_INSYNC = 20;

	public static byte STK_NOSYNC = 21;

	public static byte ADC_CHANNEL_ERROR = 22;

	public static byte ADC_MEASURE_OK = 23;

	public static byte PWM_CHANNEL_ERROR = 24;

	public static byte PWM_ADJUST_OK = 25;

	public static byte CRC_EOP = 32;

	public static byte STK_GET_SYNC = 48;

	public static byte STK_GET_SIGN_ON = 49;

	public static byte STK_SET_PARAMETER = 64;

	public static byte STK_GET_PARAMETER = 65;

	public static byte STK_SET_DEVICE = 66;

	public static byte STK_SET_DEVICE_EXT = 69;

	public static byte STK_ENTER_PROGMODE = 80;

	public static byte STK_LEAVE_PROGMODE = 81;

	public static byte STK_CHIP_ERASE = 82;

	public static byte STK_CHECK_AUTOINC = 83;

	public static byte STK_LOAD_ADDRESS = 85;

	public static byte STK_UNIVERSAL = 86;

	public static byte STK_PROG_FLASH = 96;

	public static byte STK_PROG_DATA = 97;

	public static byte STK_PROG_FUSE = 98;

	public static byte STK_PROG_LOCK = 99;

	public static byte STK_PROG_PAGE = 100;

	public static byte STK_PROG_FUSE_EXT = 101;

	public static byte STK_READ_FLASH = 112;

	public static byte STK_READ_DATA = 113;

	public static byte STK_READ_FUSE = 114;

	public static byte STK_READ_LOCK = 115;

	public static byte STK_READ_PAGE = 116;

	public static byte STK_READ_SIGN = 117;

	public static byte STK_READ_OSCCAL = 118;

	public static byte STK_READ_FUSE_EXT = 119;

	public static byte STK_READ_OSCCAL_EXT = 120;
}
