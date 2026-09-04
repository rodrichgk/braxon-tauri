using System.Collections.Generic;
using stk500;

namespace stk500v2;

public class CMD_READ_FLASH_ISP : MESSAGE_CMD
{
	public CMD_READ_FLASH_ISP(byte len, int address)
	{
		base.address = address;
		responselen = (byte)(len + 9);
		CMD = new List<byte>
		{
			Constants_v2.CMD_READ_FLASH_ISP,
			0,
			len,
			0
		}.ToArray();
	}
}
