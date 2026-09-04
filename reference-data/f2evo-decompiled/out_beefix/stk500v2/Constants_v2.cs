using System;
using stk500;

namespace stk500v2;

[Serializable]
public abstract class Constants_v2 : BootLoader
{
	public static byte MESSAGE_START = 27;

	public static byte TOKEN = 14;

	public static byte CMD_SIGN_ON = 1;

	public static byte CMD_SET_PARAMETER = 2;

	public static byte CMD_GET_PARAMETER = 3;

	public static byte CMD_SET_DEVICE_PARAMETERS = 4;

	public static byte CMD_OSCCAL = 5;

	public static byte CMD_LOAD_ADDRESS = 6;

	public static byte CMD_FIRMWARE_UPGRADE = 7;

	public static byte CMD_ENTER_PROGMODE_ISP = 16;

	public static byte CMD_LEAVE_PROGMODE_ISP = 17;

	public static byte CMD_CHIP_ERASE_ISP = 18;

	public static byte CMD_PROGRAM_FLASH_ISP = 19;

	public static byte CMD_READ_FLASH_ISP = 20;

	public static byte CMD_PROGRAM_EEPROM_ISP = 21;

	public static byte CMD_READ_EEPROM_ISP = 22;

	public static byte CMD_PROGRAM_FUSE_ISP = 23;

	public static byte CMD_READ_FUSE_ISP = 24;

	public static byte CMD_PROGRAM_LOCK_ISP = 25;

	public static byte CMD_READ_LOCK_ISP = 26;

	public static byte CMD_READ_SIGNATURE_ISP = 27;

	public static byte CMD_READ_OSCCAL_ISP = 28;

	public static byte CMD_SPI_MULTI = 29;

	public static byte CMD_ENTER_PROGMODE_PP = 32;

	public static byte CMD_LEAVE_PROGMODE_PP = 33;

	public static byte CMD_CHIP_ERASE_PP = 34;

	public static byte CMD_PROGRAM_FLASH_PP = 35;

	public static byte CMD_READ_FLASH_PP = 36;

	public static byte CMD_PROGRAM_EEPROM_PP = 37;

	public static byte CMD_READ_EEPROM_PP = 38;

	public static byte CMD_PROGRAM_FUSE_PP = 39;

	public static byte CMD_READ_FUSE_PP = 40;

	public static byte CMD_PROGRAM_LOCK_PP = 41;

	public static byte CMD_READ_LOCK_PP = 42;

	public static byte CMD_READ_SIGNATURE_PP = 43;

	public static byte CMD_READ_OSCCAL_PP = 44;

	public static byte CMD_SET_CONTROL_STACK = 45;

	public static byte CMD_ENTER_PROGMODE_HVSP = 48;

	public static byte CMD_LEAVE_PROGMODE_HVSP = 49;

	public static byte CMD_CHIP_ERASE_HVSP = 50;

	public static byte CMD_PROGRAM_FLASH_HVSP = 51;

	public static byte CMD_READ_FLASH_HVSP = 52;

	public static byte CMD_PROGRAM_EEPROM_HVSP = 53;

	public static byte CMD_READ_EEPROM_HVSP = 54;

	public static byte CMD_PROGRAM_FUSE_HVSP = 55;

	public static byte CMD_READ_FUSE_HVSP = 56;

	public static byte CMD_PROGRAM_LOCK_HVSP = 57;

	public static byte CMD_READ_LOCK_HVSP = 58;

	public static byte CMD_READ_SIGNATURE_HVSP = 59;

	public static byte CMD_READ_OSCCAL_HVSP = 60;

	public static byte STATUS_CMD_OK = 0;

	public static byte STATUS_CMD_TOUT = 128;

	public static byte STATUS_RDY_BSY_TOUT = 129;

	public static byte STATUS_SET_PARAM_MISSING = 130;

	public static byte STATUS_CMD_FAILED = 192;

	public static byte STATUS_CKSUM_ERROR = 193;

	public static byte STATUS_CMD_UNKNOWN = 201;

	public static byte PARAM_BUILD_NUMBER_LOW = 128;

	public static byte PARAM_BUILD_NUMBER_HIGH = 129;

	public static byte PARAM_HW_VER = 144;

	public static byte PARAM_SW_MAJOR = 145;

	public static byte PARAM_SW_MINOR = 146;

	public static byte PARAM_VTARGET = 148;

	public static byte PARAM_VADJUST = 149;

	public static byte PARAM_OSC_PSCALE = 150;

	public static byte PARAM_OSC_CMATCH = 151;

	public static byte PARAM_SCK_DURATION = 152;

	public static byte PARAM_TOPCARD_DETECT = 154;

	public static byte PARAM_STATUS = 156;

	public static byte PARAM_DATA = 157;

	public static byte PARAM_RESET_POLARITY = 158;

	public static byte PARAM_CONTROLLER_INIT = 159;

	public static byte ANSWER_CKSUM_ERROR = 176;
}
